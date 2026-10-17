import type { Region } from './data/muscles';

// Core domain model. Persisted in IndexedDB as normalised stores (see src/db/db.ts);
// the UI works with the assembled `Session` aggregate.

export const MUSCLE_GROUPS = [
  'CHEST',
  'BACK',
  'SHOULDERS',
  'BICEPS',
  'TRICEPS',
  'FOREARMS',
  'QUADS',
  'HAMSTRINGS',
  'GLUTES',
  'CALVES',
  'ABS',
  'FULL BODY',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export type BodyRegion = 'Upper Body' | 'Legs' | 'Core' | 'Full Body';

export interface MuscleGroupInfo {
  id: MuscleGroup;
  name: string;
  region: BodyRegion;
  sortOrder: number;
}

export type SessionKind = 'strength' | 'cardio';

/** ISO calendar date, e.g. "2026-10-02" (local time, no timezone). */
export type DateKey = string;

/** Warm-ups don't count towards volume, records or weekly sets. Missing = a normal working set. */
export type SetType = 'warmup' | 'drop' | 'failure';

export interface SetEntry {
  reps: number;
  weight: number;
  type?: SetType;
  /** Timed sets (plank, wall sit…): seconds held. Reps stay 0. */
  sec?: number;
  /** Ticked off during the workout (starts the rest timer). Editor-only, not saved. */
  done?: boolean;
}

export interface StrengthEntry {
  id: string;
  exercise: string;
  muscleGroup: MuscleGroup;
  sets: SetEntry[];
  notes?: string;
  /** Exercises sharing an id are done back to back as a superset. */
  superset?: string;
  /** Body-weight mode: weight counted per rep from your body (body weight × share), saved when logged. `weight` is then extra load. */
  bw?: number;
  /** Sets are timed holds (seconds) instead of reps. */
  timed?: boolean;
  /**
   * True when `bw`/`timed` reflect a choice made in the editor (saved since those switches existed).
   * Older entries leave it unset, so new workouts fall back to the exercise's defaults instead of "off".
   */
  modeSet?: boolean;
}

export interface CardioEntry {
  id: string;
  activity: string;
  category?: string;
  durationMin: number; // mandatory
  distance?: number; // optional, in user's distance unit
  calories?: number; // optional
  avgHeartRate?: number; // optional, bpm
  notes?: string;
}

/** One workout on one date. Strength and cardio are kept as separate sessions. */
export interface Session {
  id: string;
  date: DateKey;
  kind: SessionKind;
  name?: string;
  notes?: string;
  /** Total workout time. Cardio sessions derive it from their entries when not set. */
  durationMin?: number;
  strength: StrengthEntry[];
  cardio: CardioEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  isCustom: boolean;
  /** Custom exercises: heat-map muscles chosen by the user (region ids from data/muscles.ts). */
  primary?: Region[];
  secondary?: Region[];
  equipment?: Equipment;
}

export interface CustomCardio {
  id: string;
  name: string;
  category?: string;
}

export interface Favorite {
  /** "strength:Bench Press" or "cardio:Outdoor Running" */
  key: string;
  addedAt: number;
}

export interface Template {
  id: string;
  name: string;
  kind: SessionKind;
  builtIn?: boolean;
  strength: { exercise: string; muscleGroup: MuscleGroup; sets: number; reps?: number }[];
  cardio: { activity: string; durationMin: number }[];
  /** Strength templates that end with a cardio block (e.g. Core + Cardio). */
  thenCardio?: { activity: string; durationMin: number };
}

export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Equipment = 'machine' | 'free' | 'bodyweight';
export type EquipmentChoice = 'machine' | 'free' | 'mixed';

// ---------- Profile, body measurements, goals ----------

export const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'] as const;
export type Gender = (typeof GENDERS)[number];

export const FITNESS_GOALS = [
  'Build Muscle',
  'Lose Fat',
  'Increase Strength',
  'Improve Endurance',
  'General Fitness',
  'Maintain',
] as const;
export type FitnessGoalFocus = (typeof FITNESS_GOALS)[number];

export const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Sedentary', hint: 'Desk job, little exercise', factor: 1.2 },
  { id: 'light', label: 'Lightly active', hint: '1–3 workouts a week', factor: 1.375 },
  { id: 'moderate', label: 'Moderately active', hint: '3–5 workouts a week', factor: 1.55 },
  { id: 'very', label: 'Very active', hint: '6–7 workouts a week', factor: 1.725 },
  { id: 'extra', label: 'Athlete', hint: 'Twice a day or physical job', factor: 1.9 },
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]['id'];

export interface Profile {
  id: 'me';
  name: string;
  heightCm?: number;
  /** Starting weight entered on the profile. Current weight comes from body measurements. */
  weight?: number;
  age?: number;
  gender?: Gender;
  goal?: FitnessGoalFocus;
  activityLevel?: ActivityLevel;
  /** Training level used to size templates (default intermediate). */
  experienceLevel?: Level;
  /** Preferred equipment for templates and recommendations ('any' = mixed). */
  equipmentPref?: EquipmentChoice | 'any';
  /** Daily hydration target in ml (manual). Falls back to the weight-based suggestion. */
  waterTargetMl?: number;
  /** Add extra water to the target on workout days (default on). */
  waterWorkoutBonus?: boolean;
  /** One-tap quick-add sizes in ml (default 250 / 500 / 750). */
  waterQuickSizes?: number[];
  createdAt: number;
  updatedAt: number;
}

export interface BodyMeasurement {
  id: string;
  date: DateKey;
  weight: number; // in settings.weightUnit
  bodyFatPct?: number;
  waistCm?: number;
  notes?: string;
  createdAt: number;
}

export type GoalType =
  | 'bodyweight' // reach a target body weight
  | 'lift' // lift X weight on an exercise (single set)
  | 'weeklySessions' // N workouts per week
  | 'weeklyCardio' // N cardio minutes per week
  | 'monthlyDays' // N active days this month
  | 'totalVolume' // lift a cumulative volume
  | 'weeklyWater'; // hit the water target N days per week

export interface FitnessGoal {
  id: string;
  type: GoalType;
  title: string;
  target: number;
  /** Baseline captured when the goal was created (body weight / lift). */
  start?: number;
  exercise?: string;
  deadline?: DateKey;
  createdAt: number;
  achievedAt?: number;
  archived?: boolean;
}

export interface PersonalRecord {
  exercise: string;
  muscleGroup: MuscleGroup;
  maxWeight: number;
  maxWeightReps: number;
  maxWeightDate: DateKey;
  best1rm: number;
  best1rmDate: DateKey;
  bestSetVolume: number;
  bestSessionVolume: number;
  /** Timed exercises: longest hold in seconds. */
  bestTimeSec?: number;
  bestTimeDate?: DateKey;
}

// ---------- Hydration ----------

/** One drink. Amount is always stored in ml; fl oz is display-only. */
export interface WaterLog {
  id: string;
  date: DateKey;
  amountMl: number;
  /** When it was logged (ms). Used for ordering and the time shown in the list. */
  loggedAt: number;
}

// ---------- Settings & backup ----------

export type ThemePref = 'dark' | 'light' | 'system';

export interface Settings {
  weightUnit: 'kg' | 'lb';
  distanceUnit: 'km' | 'mi';
  weekStartsOn: 0 | 1; // 0 = Sunday, 1 = Monday
  theme: ThemePref;
  volumeUnit: 'ml' | 'oz';
}

export const DEFAULT_SETTINGS: Settings = {
  weightUnit: 'kg',
  distanceUnit: 'km',
  weekStartsOn: 1,
  theme: 'dark',
  volumeUnit: 'ml',
};

export interface BackupFile {
  app: 'gym-diary';
  version: 1 | 2;
  exportedAt: string;
  sessions: Session[];
  customExercises?: { id: string; name: string; muscleGroup: MuscleGroup; primary?: Region[]; secondary?: Region[]; equipment?: Equipment }[];
  customCardio?: CustomCardio[];
  favorites?: Favorite[];
  templates?: Template[];
  settings?: Partial<Settings>;
  profile?: Profile | null;
  measurements?: BodyMeasurement[];
  goals?: FitnessGoal[];
  water?: WaterLog[];
}
