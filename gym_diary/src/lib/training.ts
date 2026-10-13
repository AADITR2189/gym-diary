import type { DateKey, FitnessGoalFocus, Level, MuscleGroup, Session, SetEntry, Settings } from '../types';
import { COMPOUNDS } from '../data/templateCatalog';
import { REGIONS, exerciseMeta, type Region } from '../data/muscles';
import { addDays, startOfWeek, todayKey } from './date';
import { fmtSec, sessionCardioMin, workSets } from './stats';

// ---------- Progressive overload ----------

/** Target rep range for an exercise, from the profile goal (matches the template rep schemes). */
export function repRange(goal: FitnessGoalFocus | undefined, exercise: string): [number, number] {
  if (goal === 'Increase Strength') return COMPOUNDS.has(exercise) ? [4, 6] : [8, 10];
  if (goal === 'Lose Fat' || goal === 'Improve Endurance') return [12, 15];
  return [8, 12];
}

export interface Suggestion {
  weight: number;
  reps: number;
  /** Timed exercises: seconds to aim for. */
  sec?: number;
  /** Why: shown under the suggestion. */
  reason: string;
}

/**
 * Double progression: add reps until every working set reaches the top of the range,
 * then add weight and drop back to the bottom of the range.
 */
export function suggestNext(last: SetEntry[] | null, range: [number, number], unit: Settings['weightUnit'], timed?: boolean): Suggestion | null {
  if (timed) {
    // Holds: beat your longest hold by 5 seconds.
    const holds = workSets(last ?? []).filter((s) => (s.sec ?? 0) > 0);
    if (!holds.length) return null;
    const best = Math.max(...holds.map((s) => s.sec!));
    const w = Math.max(...holds.map((s) => s.weight || 0));
    return { weight: w, reps: 0, sec: best + 5, reason: `Your longest hold last time was ${fmtSec(best)}. Add 5 seconds.` };
  }
  const sets = workSets(last ?? []).filter((s) => s.reps > 0);
  if (!sets.length) return null;
  const [lo, hi] = range;
  const top = Math.max(...sets.map((s) => s.weight || 0));
  const atTop = sets.filter((s) => (s.weight || 0) === top);
  const minReps = Math.min(...atTop.map((s) => s.reps));
  if (top <= 0) {
    // Bodyweight: one more rep than the best set.
    const best = Math.max(...sets.map((s) => s.reps));
    return { weight: 0, reps: best + 1, reason: `Last time your best set was ${best} reps. Beat it by one.` };
  }
  if (minReps >= hi) {
    const step = unit === 'lb' ? 5 : 2.5;
    return { weight: top + step, reps: lo, reason: `You hit ${hi}+ reps on every set at ${top} ${unit}. Time to go heavier.` };
  }
  const reps = Math.min(hi, Math.max(lo, minReps + 1));
  return { weight: top, reps, reason: `Same weight, one more rep. At ${hi} reps on every set, add weight.` };
}

// ---------- Body-weight and timed exercises ----------

/** Exercises logged as holds (seconds) rather than reps, unless you switch them. */
export const TIMED_EXERCISES = new Set([
  'Plank',
  'Side Plank',
  'Copenhagen Plank',
  'Wall Sit',
  'Dead Hang',
  'Hollow Body Hold',
  'Suitcase Carry',
  'Farmer Walk',
  'L-Sit',
]);

// Only exact names plus anything called a "hold": "Hang Clean" and "Plank Shoulder Taps" are rep exercises.
export const isTimedByDefault = (exercise: string) => TIMED_EXERCISES.has(exercise) || /\bhold\b/i.test(exercise);

/** Share of body weight an exercise moves (push-ups ≈ 65 %). Bodyweight exercises without a known share count it all. */
export function bodyShare(exercise: string, group: MuscleGroup): number {
  const meta = exerciseMeta(exercise, group);
  return meta.bw ?? 1;
}

/** Body-weight mode is on by default for bodyweight exercises (push-ups, pull-ups, leg raises…). */
export const isBodyweightByDefault = (exercise: string, group: MuscleGroup) => exerciseMeta(exercise, group).equipment === 'bodyweight';

/** Body weight counted per rep, rounded to 0.1. */
export const bwPerRep = (bodyWeight: number, share: number) => Math.round(bodyWeight * share * 10) / 10;

// ---------- Plate calculator ----------

export const PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] } as const;
export const BARS = { kg: [20, 15, 10], lb: [45, 35, 25] } as const;

/** Plates for one side of the bar, heaviest first. `rest` is what could not be loaded. */
export function platesPerSide(target: number, bar: number, plates: readonly number[]) {
  let side = Math.max(0, (target - bar) / 2);
  const out: number[] = [];
  for (const p of plates)
    while (side + 1e-9 >= p) {
      out.push(p);
      side -= p;
    }
  const loaded = bar + out.reduce((a, b) => a + b, 0) * 2;
  return { plates: out, loaded: Math.round(loaded * 100) / 100, rest: Math.round(Math.max(0, target - loaded) * 100) / 100 };
}

/** Exercises loaded on a straight bar, where the plate calculator is useful. */
export function usesBarbell(exercise: string) {
  const name = exercise.toLowerCase();
  if (/dumbbell|kettlebell|machine|cable|smith|band|plate /.test(name)) return false;
  if (/barbell|ez[- ]bar|trap bar/.test(name)) return true;
  if (/^(back squat|front squat|squat|deadlift|romanian deadlift|sumo deadlift|bench press|overhead press|military press|good morning|hip thrust|pendlay row|bent[- ]over row|power clean|clean|snatch|rack pull)$/.test(name)) return true;
  return exerciseMeta(exercise, 'FULL BODY').equipment === 'free' && /squat|deadlift|bench|press|row|thrust|clean/.test(name) && !/push-up|pull-up|dip/.test(name);
}

// ---------- Weekly sets per muscle ----------

/** Weekly working sets per muscle (low end of the usual 10–20 hypertrophy range, by level). */
export const WEEKLY_SET_TARGET: Record<Level, number> = { beginner: 8, intermediate: 10, advanced: 12 };
export const WEEKLY_SET_MAX = 20;

/** Working sets per region in a date range: a set counts 1 for main muscles and ½ for helpers. */
export function regionSets(sessions: Session[], from: DateKey, to: DateKey) {
  const out = Object.fromEntries(REGIONS.map((r) => [r.id, 0])) as Record<Region, number>;
  for (const s of sessions) {
    if (s.date < from || s.date > to) continue;
    for (const e of s.strength) {
      const n = workSets(e.sets).filter((x) => x.reps > 0 || x.weight > 0 || (x.sec ?? 0) > 0).length;
      if (!n) continue;
      const meta = exerciseMeta(e.exercise, e.muscleGroup);
      for (const r of meta.primary) out[r] += n;
      for (const r of meta.secondary) out[r] += n / 2;
    }
  }
  return out;
}

export function weekRange(offset: number, weekStartsOn: 0 | 1): { from: DateKey; to: DateKey } {
  const from = addDays(startOfWeek(todayKey(), weekStartsOn), -7 * offset);
  return { from, to: addDays(from, 6) };
}

// ---------- Year activity grid ----------

export interface DayCell {
  date: DateKey;
  /** 0 = rest, 1–4 = how hard the day was, relative to your own busy days. */
  level: 0 | 1 | 2 | 3 | 4;
  strength: boolean;
  cardio: boolean;
  sessions: number;
  future: boolean;
}

/** One column per week, oldest first, covering the last 53 weeks up to the current one. */
export function yearGrid(sessions: Session[], weekStartsOn: 0 | 1): DayCell[][] {
  const today = todayKey();
  const first = addDays(startOfWeek(today, weekStartsOn), -52 * 7);
  const byDay = new Map<DateKey, { score: number; strength: boolean; cardio: boolean; sessions: number }>();
  for (const s of sessions) {
    if (s.date < first || s.date > today) continue;
    const d = byDay.get(s.date) ?? { score: 0, strength: false, cardio: false, sessions: 0 };
    // Score: working sets for strength, minutes for cardio, so both kinds of day can be "hard".
    const sets = s.strength.reduce((a, e) => a + workSets(e.sets).length, 0);
    d.score += sets * 3 + sessionCardioMin(s) + 1;
    d.strength ||= s.kind === 'strength';
    d.cardio ||= s.kind === 'cardio';
    d.sessions++;
    byDay.set(s.date, d);
  }
  const scores = [...byDay.values()].map((d) => d.score).sort((a, b) => a - b);
  const q = (p: number) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))] ?? 0;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  const weeks: DayCell[][] = [];
  for (let w = 0; w < 53; w++) {
    const col: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(first, w * 7 + i);
      const d = byDay.get(date);
      const level = !d ? 0 : d.score <= q1 ? 1 : d.score <= q2 ? 2 : d.score <= q3 ? 3 : 4;
      col.push({ date, level, strength: !!d?.strength, cardio: !!d?.cardio, sessions: d?.sessions ?? 0, future: date > today });
    }
    weeks.push(col);
  }
  return weeks;
}
