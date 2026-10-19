import { createContext, useContext, useEffect, useMemo, useState, createElement, type ReactNode } from 'react';
import * as db from '../db/db';
import { EXERCISE_LIBRARY } from '../data/exercises';
import { CARDIO_CATEGORIES, cardioCategory } from '../data/cardio';
import type {
  BodyMeasurement,
  CustomCardio,
  Exercise,
  Favorite,
  FitnessGoal,
  MuscleGroup,
  PersonalRecord,
  Profile,
  Session,
  Settings,
  Template,
  WaterLog,
} from '../types';
import { DEFAULT_SETTINGS, MUSCLE_GROUPS } from '../types';
import { applyTheme } from '../lib/theme';
import { setCustomMeta } from '../data/muscles';

interface DataState {
  ready: boolean;
  sessions: Session[];
  exercises: Exercise[];
  customCardio: CustomCardio[];
  favorites: Favorite[];
  userTemplates: Template[];
  settings: Settings;
  profile: Profile | null;
  measurements: BodyMeasurement[];
  goals: FitnessGoal[];
  records: PersonalRecord[];
  water: WaterLog[];
}

interface DataCtx extends DataState {
  /** Built-in + custom exercise names per muscle group. */
  library: Record<MuscleGroup, string[]>;
  customExercises: Exercise[];
  /** Cardio activities grouped by category (built-in + custom). */
  cardioGroups: { category: string; activities: string[] }[];
  cardioActivities: string[];
  categoryOf: (activity: string) => string;
  favoriteSet: Set<string>;
}

const Ctx = createContext<DataCtx | null>(null);

/** Loads everything from IndexedDB once and re-loads after every write (single user, small data). */
export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({
    ready: false,
    sessions: [],
    exercises: [],
    customCardio: [],
    favorites: [],
    userTemplates: [],
    settings: DEFAULT_SETTINGS,
    profile: null,
    measurements: [],
    goals: [],
    records: [],
    water: [],
  });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [sessions, exercises, customCardio, favorites, userTemplates, settings, profile, measurements, goals, records, water] =
        await Promise.all([
          db.getAllSessions(),
          db.getExercises(),
          db.getCustomCardio(),
          db.getFavorites(),
          db.getUserTemplates(),
          db.getSettings(),
          db.getProfile(),
          db.getMeasurements(),
          db.getGoals(),
          db.getPersonalRecords(),
          db.getWaterLogs(),
        ]);
      if (alive)
        setState({ ready: true, sessions, exercises, customCardio, favorites, userTemplates, settings, profile, measurements, goals, records, water });
    };
    load();
    db.requestPersistentStorage();
    const unsub = db.subscribe(load);
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  // Apply the theme only once the saved settings have loaded. Before that the defaults (dark) are in
  // state, and applying them caused a flash of the dark theme on every launch in light mode. The
  // inline script in index.html has already set the right theme for the first paint.
  useEffect(() => {
    if (state.ready) return applyTheme(state.settings.theme);
  }, [state.ready, state.settings.theme]);

  const value = useMemo<DataCtx>(() => {
    setCustomMeta(state.exercises.filter((e) => e.isCustom));
    const library = {} as Record<MuscleGroup, string[]>;
    for (const g of MUSCLE_GROUPS) {
      const fromDb = state.exercises.filter((e) => e.muscleGroup === g).map((e) => e.name);
      // Keep the curated order for built-ins, then append customs alphabetically.
      library[g] = [...new Set([...EXERCISE_LIBRARY[g], ...fromDb.sort()])];
    }
    const customCat = new Map(state.customCardio.map((c) => [c.name, c.category ?? 'Other Cardio']));
    const cardioGroups = CARDIO_CATEGORIES.map((c) => ({
      category: c.category,
      activities: [...c.activities, ...state.customCardio.filter((x) => (x.category ?? 'Other Cardio') === c.category).map((x) => x.name)],
    }));
    return {
      ...state,
      library,
      customExercises: state.exercises.filter((e) => e.isCustom),
      cardioGroups,
      cardioActivities: cardioGroups.flatMap((g) => g.activities),
      categoryOf: (a: string) => cardioCategory(a, customCat.get(a)),
      favoriteSet: new Set(state.favorites.map((f) => f.key)),
    };
  }, [state]);

  return createElement(Ctx.Provider, { value }, children);
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside DataProvider');
  return v;
}
