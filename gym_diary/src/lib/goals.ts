import type { BodyMeasurement, FitnessGoal, GoalType, Profile, Session, Settings, WaterLog } from '../types';
import { baseTargetMl, daysMet } from './water';
import { inRange, summarize } from './stats';
import { startOfMonth, startOfWeek, toKey, todayKey } from './date';
import { currentWeight } from './body';

export const GOAL_TYPES: { type: GoalType; label: string; unit: (s: Settings) => string; hint: string }[] = [
  { type: 'weeklySessions', label: 'Workouts per week', unit: () => 'workouts', hint: 'e.g. 4' },
  { type: 'weeklyCardio', label: 'Cardio minutes per week', unit: () => 'min', hint: 'e.g. 150' },
  { type: 'monthlyDays', label: 'Active days this month', unit: () => 'days', hint: 'e.g. 16' },
  { type: 'bodyweight', label: 'Reach body weight', unit: (s) => s.weightUnit, hint: 'target weight' },
  { type: 'lift', label: 'Lift a weight', unit: (s) => s.weightUnit, hint: 'target for one set' },
  { type: 'totalVolume', label: 'Total volume lifted', unit: (s) => s.weightUnit, hint: 'e.g. 500000' },
  { type: 'weeklyWater', label: 'Water target days per week', unit: () => 'days', hint: 'e.g. 6' },
];

export interface GoalProgress {
  current: number;
  pct: number; // 0–100
  done: boolean;
  label: string; // e.g. "3 / 4 workouts"
}

/** Progress for a goal, computed live from sessions and body measurements. */
export function goalProgress(
  g: FitnessGoal,
  sessions: Session[],
  measurements: BodyMeasurement[],
  profile: Profile | null,
  settings: Settings,
  water: WaterLog[] = [],
): GoalProgress {
  const today = todayKey();
  const unit = GOAL_TYPES.find((t) => t.type === g.type)?.unit(settings) ?? '';
  const ratio = (cur: number) => Math.max(0, Math.min(100, g.target > 0 ? (cur / g.target) * 100 : 0));
  let current = 0;
  let pct = 0;
  switch (g.type) {
    case 'weeklySessions': {
      current = summarize(sessions.filter((s) => inRange(s.date, startOfWeek(today, settings.weekStartsOn), today))).sessions;
      pct = ratio(current);
      break;
    }
    case 'weeklyCardio': {
      current = summarize(sessions.filter((s) => inRange(s.date, startOfWeek(today, settings.weekStartsOn), today))).cardioMin;
      pct = ratio(current);
      break;
    }
    case 'monthlyDays': {
      current = summarize(sessions.filter((s) => inRange(s.date, startOfMonth(today), today))).days;
      pct = ratio(current);
      break;
    }
    case 'weeklyWater': {
      const base = baseTargetMl(profile, measurements, settings);
      current = daysMet(startOfWeek(today, settings.weekStartsOn), today, water, base, sessions, profile);
      pct = ratio(current);
      break;
    }
    case 'totalVolume': {
      current = summarize(sessions.filter((s) => s.date >= toKey(new Date(g.createdAt)))).volume;
      pct = ratio(current);
      break;
    }
    case 'lift': {
      for (const s of sessions)
        for (const e of s.strength)
          if (e.exercise === g.exercise) for (const set of e.sets) if (set.reps > 0 && set.type !== 'warmup') current = Math.max(current, set.weight);
      const start = g.start ?? 0;
      pct = g.target > start ? Math.max(0, Math.min(100, ((current - start) / (g.target - start)) * 100)) : ratio(current);
      break;
    }
    case 'bodyweight': {
      current = currentWeight(measurements, profile) ?? 0;
      const start = g.start ?? current;
      const total = g.target - start;
      pct = total === 0 ? (current === g.target ? 100 : 0) : Math.max(0, Math.min(100, ((current - start) / total) * 100));
      break;
    }
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    current,
    pct: Math.round(pct),
    done: pct >= 100,
    label: `${round(current).toLocaleString()} / ${round(g.target).toLocaleString()} ${unit}`,
  };
}

/** Average completion across active goals (0–100), or undefined if none. */
export function overallGoalCompletion(progress: GoalProgress[]) {
  if (!progress.length) return undefined;
  return Math.round(progress.reduce((a, p) => a + p.pct, 0) / progress.length);
}
