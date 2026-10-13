import type { DateKey, MuscleGroup, PersonalRecord, Session, SetEntry, SetType, StrengthEntry } from '../types';
import { addDays, monthKey, startOfWeek, todayKey, fromKey } from './date';

/** Warm-up sets are logged but left out of volume, records and set counts. */
export const isWorkSet = (s: SetEntry) => s.type !== 'warmup';
export const workSets = (sets: SetEntry[]) => sets.filter(isWorkSet);
export const SET_TYPES: { id: SetType | undefined; short: string; label: string; hint: string }[] = [
  { id: undefined, short: '1', label: 'Normal set', hint: 'Counts towards volume and records' },
  { id: 'warmup', short: 'W', label: 'Warm-up', hint: 'Left out of volume, records and weekly sets' },
  { id: 'drop', short: 'D', label: 'Drop set', hint: 'Lower the weight straight after the previous set' },
  { id: 'failure', short: 'F', label: 'To failure', hint: 'As many reps as possible' },
];

/** Label per set: W for warm-ups, D / F for drop and failure sets, else the working-set number. */
export function setLabels(sets: SetEntry[]): string[] {
  let n = 0;
  return sets.map((s) => {
    if (s.type === 'warmup') return 'W';
    n++;
    return s.type === 'drop' ? 'D' : s.type === 'failure' ? 'F' : String(n);
  });
}

/** Reps × weight. In body-weight mode `bw` (body weight counted per rep) is added to the weight. Timed sets have no reps, so no volume. */
export const setVolume = (s: SetEntry, bw = 0) => (isWorkSet(s) ? (s.reps || 0) * ((s.weight || 0) + bw) : 0);
export const entryVolume = (e: StrengthEntry) => e.sets.reduce((a, s) => a + setVolume(s, e.bw), 0);

/** 90 → "1:30". */
export const fmtSec = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** Short text for one set: "60×8", "BW+10×8", "BW×12", "1:30" or "+10 · 1:30". */
export function fmtSet(x: SetEntry, e?: Pick<StrengthEntry, 'bw' | 'timed'>) {
  const w = x.weight || 0;
  if (e?.timed || x.sec) return `${w ? `+${w} · ` : ''}${fmtSec(x.sec || 0)}`;
  const load = e?.bw !== undefined ? (w ? `BW+${w}` : 'BW') : String(w);
  return `${load}×${x.reps}`;
}

/** Best-set text for a record: "100 kg × 5", "12 reps", or "1:30 hold". */
export function fmtBest(p: PersonalRecord, unit: string) {
  if (p.bestTimeSec && !p.maxWeightReps) return `${fmtSec(p.bestTimeSec)} hold`;
  if (!p.maxWeight) return `${p.maxWeightReps} reps`;
  return `${fmtNum(p.maxWeight, 1)} ${unit} × ${p.maxWeightReps}`;
}
export const sessionVolume = (s: Session) => s.strength.reduce((a, e) => a + entryVolume(e), 0);
export const sessionCardioMin = (s: Session) => s.cardio.reduce((a, c) => a + (c.durationMin || 0), 0);
export const sessionDistance = (s: Session) => s.cardio.reduce((a, c) => a + (c.distance || 0), 0);
export const sessionCalories = (s: Session) => s.cardio.reduce((a, c) => a + (c.calories || 0), 0);
/** Workout length in minutes: explicit duration, else summed cardio time. Undefined if unknown. */
export const sessionDuration = (s: Session): number | undefined =>
  s.durationMin && s.durationMin > 0 ? s.durationMin : s.kind === 'cardio' ? sessionCardioMin(s) || undefined : undefined;

/** Epley estimated one-rep max. */
export const e1rm = (s: SetEntry) => (s.reps <= 1 ? s.weight : s.weight * (1 + s.reps / 30));

export function fmtNum(n: number, digits = 0) {
  if (!isFinite(n)) return '0';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 10_000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export const inRange = (d: DateKey, from?: DateKey, to?: DateKey) =>
  (!from || d >= from) && (!to || d <= to);

export interface PeriodSummary {
  sessions: number;
  strength: number;
  cardio: number;
  days: number;
  volume: number;
  cardioMin: number;
  distance: number;
  calories: number;
  /** Average duration of sessions that have one (minutes), 0 if none. */
  avgDuration: number;
}

export function summarize(list: Session[]): PeriodSummary {
  const days = new Set<string>();
  const r: PeriodSummary = { sessions: 0, strength: 0, cardio: 0, days: 0, volume: 0, cardioMin: 0, distance: 0, calories: 0, avgDuration: 0 };
  let durSum = 0;
  let durN = 0;
  for (const s of list) {
    r.sessions++;
    if (s.kind === 'strength') r.strength++;
    else r.cardio++;
    days.add(s.date);
    r.volume += sessionVolume(s);
    r.cardioMin += sessionCardioMin(s);
    r.distance += sessionDistance(s);
    r.calories += sessionCalories(s);
    const dur = sessionDuration(s);
    if (dur) {
      durSum += dur;
      durN++;
    }
  }
  r.days = days.size;
  r.avgDuration = durN ? durSum / durN : 0;
  return r;
}

export function streaks(list: Session[]) {
  const days = new Set(list.map((s) => s.date));
  const today = todayKey();
  // current streak may start today or yesterday (today not logged yet shouldn't break it)
  let cursor = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest };
}

export function volumeByMuscle(list: Session[]) {
  const m = new Map<MuscleGroup, { volume: number; sets: number; sessions: Set<string> }>();
  for (const s of list)
    for (const e of s.strength) {
      const cur = m.get(e.muscleGroup) ?? { volume: 0, sets: 0, sessions: new Set() };
      cur.volume += entryVolume(e);
      cur.sets += workSets(e.sets).length;
      cur.sessions.add(s.id);
      m.set(e.muscleGroup, cur);
    }
  return [...m.entries()]
    .map(([group, v]) => ({ group, volume: Math.round(v.volume), sets: v.sets, sessions: v.sessions.size }))
    .sort((a, b) => b.volume - a.volume || b.sets - a.sets);
}

export function exerciseUsage(list: Session[]) {
  const m = new Map<string, { exercise: string; muscleGroup: MuscleGroup; count: number; last: string; sets: number }>();
  for (const s of list)
    for (const e of s.strength) {
      const cur = m.get(e.exercise) ?? { exercise: e.exercise, muscleGroup: e.muscleGroup, count: 0, last: '', sets: 0 };
      cur.count++;
      cur.sets += e.sets.length;
      if (s.date >= cur.last) {
        cur.last = s.date;
        cur.muscleGroup = e.muscleGroup;
      }
      m.set(e.exercise, cur);
    }
  return [...m.values()];
}

export function cardioUsage(list: Session[]) {
  const m = new Map<string, { activity: string; count: number; minutes: number; distance: number; last: string }>();
  for (const s of list)
    for (const c of s.cardio) {
      const cur = m.get(c.activity) ?? { activity: c.activity, count: 0, minutes: 0, distance: 0, last: '' };
      cur.count++;
      cur.minutes += c.durationMin || 0;
      cur.distance += c.distance || 0;
      if (s.date > cur.last) cur.last = s.date;
      m.set(c.activity, cur);
    }
  return [...m.values()].sort((a, b) => b.minutes - a.minutes);
}

export type PR = PersonalRecord;


export function personalRecords(list: Session[]): PR[] {
  const m = new Map<string, PR>();
  for (const s of list)
    for (const e of s.strength) {
      const pr =
        m.get(e.exercise) ??
        ({
          exercise: e.exercise,
          muscleGroup: e.muscleGroup,
          maxWeight: 0,
          maxWeightReps: 0,
          maxWeightDate: '',
          best1rm: 0,
          best1rmDate: '',
          bestSetVolume: 0,
          bestSessionVolume: 0,
        } as PR);
      for (const set of e.sets) {
        if (!isWorkSet(set)) continue;
        if (set.sec) {
          if (set.sec > (pr.bestTimeSec ?? 0)) {
            pr.bestTimeSec = set.sec;
            pr.bestTimeDate = s.date;
          }
          continue;
        }
        if (!set.reps) continue;
        if (set.weight > pr.maxWeight || (set.weight === pr.maxWeight && set.reps > pr.maxWeightReps)) {
          pr.maxWeight = set.weight;
          pr.maxWeightReps = set.reps;
          pr.maxWeightDate = s.date;
        }
        const est = e1rm(set);
        if (est > pr.best1rm) {
          pr.best1rm = est;
          pr.best1rmDate = s.date;
        }
        pr.bestSetVolume = Math.max(pr.bestSetVolume, setVolume(set, e.bw));
      }
      pr.bestSessionVolume = Math.max(pr.bestSessionVolume, entryVolume(e));
      m.set(e.exercise, pr);
    }
  return [...m.values()].filter((p) => p.maxWeight > 0 || p.maxWeightReps > 0 || (p.bestTimeSec ?? 0) > 0);
}

/** Per-session best for one exercise, oldest first — for progression charts. */
export function exerciseProgression(list: Session[], exercise: string) {
  const rows: { date: string; maxWeight: number; e1rm: number; volume: number; time: number }[] = [];
  const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  for (const s of sorted)
    for (const e of s.strength) {
      const sets = workSets(e.sets);
      if (e.exercise !== exercise || !sets.length) continue;
      rows.push({
        date: s.date,
        maxWeight: Math.max(...sets.map((x) => x.weight || 0)),
        e1rm: Math.round(Math.max(...sets.map((x) => (x.sec ? 0 : e1rm(x)))) * 10) / 10,
        time: Math.max(0, ...sets.map((x) => x.sec || 0)),
        volume: Math.round(entryVolume(e)),
      });
    }
  return rows;
}

/** Last N weeks of totals, oldest first. */
export function weeklyTrend(list: Session[], weeks: number, weekStartsOn: 0 | 1) {
  const thisWeek = startOfWeek(todayKey(), weekStartsOn);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, -7 * (weeks - 1 - i));
    const d = fromKey(start);
    return {
      key: start,
      label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      volume: 0,
      cardioMin: 0,
      distance: 0,
      calories: 0,
      sessions: 0,
    };
  });
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const s of list) {
    const i = idx.get(startOfWeek(s.date, weekStartsOn));
    if (i === undefined) continue;
    const b = buckets[i];
    b.volume += sessionVolume(s);
    b.cardioMin += sessionCardioMin(s);
    b.distance += sessionDistance(s);
    b.calories += sessionCalories(s);
    b.sessions++;
  }
  return buckets.map((b) => ({ ...b, volume: Math.round(b.volume), distance: Math.round(b.distance * 10) / 10 }));
}

/** Last N months of totals, oldest first. */
export function monthlyTrend(list: Session[], months: number) {
  const now = new Date();
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      key,
      label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      volume: 0,
      cardioMin: 0,
      distance: 0,
      calories: 0,
      sessions: 0,
      days: new Set<string>(),
    };
  });
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const s of list) {
    const i = idx.get(monthKey(s.date));
    if (i === undefined) continue;
    const b = buckets[i];
    b.volume += sessionVolume(s);
    b.cardioMin += sessionCardioMin(s);
    b.distance += sessionDistance(s);
    b.calories += sessionCalories(s);
    b.sessions++;
    b.days.add(s.date);
  }
  return buckets.map(({ days, ...b }) => ({
    ...b,
    activeDays: days.size,
    volume: Math.round(b.volume),
    distance: Math.round(b.distance * 10) / 10,
  }));
}

/** Most recent entry for an exercise (sets, body-weight and timed mode) — used to pre-fill new entries. */
export function lastEntryFor(list: Session[], exercise: string): StrengthEntry | null {
  let best: { date: string; createdAt: number; e: StrengthEntry } | null = null;
  for (const s of list)
    for (const e of s.strength)
      if (e.exercise === exercise && e.sets.length) {
        if (!best || s.date > best.date || (s.date === best.date && s.createdAt > best.createdAt)) best = { date: s.date, createdAt: s.createdAt, e };
      }
  return best ? { ...best.e, sets: best.e.sets.map(({ done: _done, ...x }) => ({ ...x })) } : null;
}

/** Most recent sets logged for an exercise — used to pre-fill new entries. */
export function lastSetsFor(list: Session[], exercise: string): StrengthEntry['sets'] | null {
  return lastEntryFor(list, exercise)?.sets ?? null;
}

/** Volume per calendar day for the last N days, oldest first. */
export function dailyVolume(list: Session[], days: number) {
  const today = todayKey();
  const buckets = Array.from({ length: days }, (_, i) => {
    const key = addDays(today, -(days - 1 - i));
    return { key, label: fromKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), volume: 0 };
  });
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const s of list) {
    const i = idx.get(s.date);
    if (i !== undefined) buckets[i].volume += sessionVolume(s);
  }
  return buckets.map((b) => ({ ...b, volume: Math.round(b.volume) }));
}

/** Totals per calendar year, newest first, with change vs the previous year. */
export function annualSummary(list: Session[]) {
  const m = new Map<string, Session[]>();
  for (const s of list) m.set(s.date.slice(0, 4), [...(m.get(s.date.slice(0, 4)) ?? []), s]);
  const rows = [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, ss]) => ({ year, ...summarize(ss) }));
  return rows.map((r, i) => {
    const prev = rows[i + 1];
    return { ...r, volumeChange: prev && prev.volume ? ((r.volume - prev.volume) / prev.volume) * 100 : null };
  });
}

/** Cardio minutes / calories grouped by activity category. */
export function cardioByCategory(list: Session[], categoryOf: (activity: string) => string) {
  const m = new Map<string, { category: string; minutes: number; calories: number; count: number }>();
  for (const s of list)
    for (const c of s.cardio) {
      const cat = c.category ?? categoryOf(c.activity);
      const cur = m.get(cat) ?? { category: cat, minutes: 0, calories: 0, count: 0 };
      cur.minutes += c.durationMin || 0;
      cur.calories += c.calories || 0;
      cur.count++;
      m.set(cat, cur);
    }
  return [...m.values()].sort((a, b) => b.minutes - a.minutes);
}

/** Per-exercise strength change: first logged e1RM vs best of the latest 3 sessions. */
export function strengthImprovement(list: Session[]) {
  const names = new Set(list.flatMap((s) => s.strength.map((e) => e.exercise)));
  const rows: { exercise: string; first: number; latest: number; change: number; sessions: number }[] = [];
  for (const name of names) {
    const prog = exerciseProgression(list, name).filter((r) => r.e1rm > 0);
    if (prog.length < 2) continue;
    const first = prog[0].e1rm;
    const latest = Math.max(...prog.slice(-3).map((r) => r.e1rm));
    rows.push({ exercise: name, first, latest, change: ((latest - first) / first) * 100, sessions: prog.length });
  }
  return rows.sort((a, b) => b.sessions - a.sessions);
}
