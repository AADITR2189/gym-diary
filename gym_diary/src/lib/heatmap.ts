import type { BodyMeasurement, DateKey, Profile, Session, SetEntry, Settings, StrengthEntry } from '../types';
import { REGIONS, exerciseMeta, type Region } from '../data/muscles';
import { addDays, todayKey } from './date';
import { currentWeight, toKg } from './body';

/** Primary muscles get the full load of a set; secondary muscles get half. */
export const PRIMARY_SHARE = 1;
export const SECONDARY_SHARE = 0.5;

export type HeatRange = 'last' | '7' | '30' | 'all';
export const HEAT_RANGES: { id: HeatRange; label: string }[] = [
  { id: 'last', label: 'Last workout' },
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: 'all', label: 'All time' },
];

export type RegionLoads = Record<Region, number>;
const emptyLoads = () => Object.fromEntries(REGIONS.map((r) => [r.id, 0])) as RegionLoads;

/**
 * Weight moved in one set, in the user's weight unit. Bodyweight exercises add a share of body weight
 * (e.g. push-ups ≈ 65 %), so they show up on the map even when logged with 0 extra weight.
 */
export function setLoad(set: SetEntry, bw: number | undefined, bodyWeight: number) {
  if (set.type === 'warmup') return 0;
  const reps = set.reps || 0;
  const extra = set.weight || 0;
  return reps * (extra + (bw ? bodyWeight * bw : 0));
}

export function entryLoads(e: StrengthEntry, bodyWeight: number, into: RegionLoads = emptyLoads()) {
  const meta = exerciseMeta(e.exercise, e.muscleGroup);
  const load = e.sets.reduce((a, s) => a + setLoad(s, meta.bw, bodyWeight), 0);
  for (const r of meta.primary) into[r] += load * PRIMARY_SHARE;
  for (const r of meta.secondary) into[r] += load * SECONDARY_SHARE;
  return into;
}

export function sessionsLoads(list: Session[], bodyWeight: number) {
  const loads = emptyLoads();
  for (const s of list) for (const e of s.strength) entryLoads(e, bodyWeight, loads);
  return loads;
}

/** Same as sessionsLoads but counting sets, not weight (used when nothing has a weight yet). */
export function sessionsSetLoads(list: Session[]) {
  const loads = emptyLoads();
  for (const s of list) for (const e of s.strength) entryLoads({ ...e, sets: e.sets.map((x) => ({ type: x.type, reps: 1, weight: 1 })) }, 0, loads);
  return loads;
}

/** Body weight used for bodyweight exercises: latest weigh-in / profile, else 70 kg. */
export function bodyWeightFor(measurements: BodyMeasurement[], profile: Profile | null, settings: Settings) {
  return currentWeight(measurements, profile) ?? (settings.weightUnit === 'lb' ? 154 : 70);
}

/** Strength sessions in a heat-map range (newest first input is fine). */
export function sessionsInRange(sessions: Session[], range: HeatRange): Session[] {
  const strength = sessions.filter((s) => s.kind === 'strength' && s.strength.length);
  if (range === 'all') return strength;
  if (range === 'last') {
    const latest = [...strength].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))[0];
    return latest ? [latest] : [];
  }
  const from: DateKey = addDays(todayKey(), -(Number(range) - 1));
  return strength.filter((s) => s.date >= from);
}

export interface RegionStat {
  region: Region;
  name: string;
  load: number;
  pct: number; // share of all regions' load, 0–100
  intensity: number; // load / max load, 0–1
}

/** Per-region load, % of total and intensity relative to the most-trained region. */
export function regionStats(loads: RegionLoads): RegionStat[] {
  const total = Object.values(loads).reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...Object.values(loads));
  return REGIONS.map((r) => ({
    region: r.id,
    name: r.name,
    load: loads[r.id],
    pct: total ? (loads[r.id] / total) * 100 : 0,
    intensity: max ? loads[r.id] / max : 0,
  })).sort((a, b) => b.load - a.load);
}

// ---------- Colour scales ----------

/**
 * Load gradient for the dashboard: blue (low) → yellow → orange → red (high).
 * Blue rather than green at the low end keeps the scale readable for red-green colour blindness.
 */
export const HEAT_STOPS: [number, [number, number, number]][] = [
  [0, [59, 125, 216]], // #3B7DD8 blue
  [0.45, [242, 193, 78]], // #F2C14E yellow
  [0.72, [240, 138, 53]], // #F08A35 orange
  [1, [215, 57, 43]], // #D7392B red
];

/** Smoothly interpolated colour for an intensity 0–1. */
export function heatColor(t: number) {
  const v = Math.max(0, Math.min(1, t));
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [p1, c1] = HEAT_STOPS[i];
    const [p0, c0] = HEAT_STOPS[i - 1];
    if (v <= p1) {
      const k = (v - p0) / (p1 - p0);
      const c = c0.map((x, j) => Math.round(x + (c1[j] - x) * k));
      return `rgb(${c[0]} ${c[1]} ${c[2]})`;
    }
  }
  const c = HEAT_STOPS[HEAT_STOPS.length - 1][1];
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

export const HEAT_GRADIENT_CSS = `linear-gradient(90deg, ${HEAT_STOPS.map(([p, c]) => `rgb(${c.join(' ')}) ${p * 100}%`).join(', ')})`;

/** Intensities for a single exercise: primary = 1, secondary = 0.45. */
export function exerciseIntensity(name: string, group: StrengthEntry['muscleGroup']) {
  const meta = exerciseMeta(name, group);
  const out: Partial<Record<Region, number>> = {};
  for (const r of meta.secondary) out[r] = 0.45;
  for (const r of meta.primary) out[r] = 1;
  return out;
}

/** Intensities from loads (0–1 relative to the max). */
export function intensities(loads: RegionLoads): Partial<Record<Region, number>> {
  const max = Math.max(0, ...Object.values(loads));
  const out: Partial<Record<Region, number>> = {};
  if (!max) return out;
  for (const r of REGIONS) if (loads[r.id] > 0) out[r.id] = loads[r.id] / max;
  return out;
}

/** Load converted to kg for internal comparisons (not used for display). */
export const loadKg = (load: number, settings: Settings) => toKg(load, settings.weightUnit);
