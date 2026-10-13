import type { DateKey, EquipmentChoice, FitnessGoalFocus, Level, MuscleGroup, Profile, Session, Template } from '../types';
import { EXERCISE_LIBRARY } from '../data/exercises';
import { REGIONS, exerciseMeta, type Region } from '../data/muscles';
import {
  CARDIO_POOL,
  COMPOUNDS,
  POOLS,
  TEMPLATE_DEFS,
  type PoolId,
  type TemplateCategory,
  type TemplateDef,
} from '../data/templateCatalog';
import { entryLoads, intensities, type RegionLoads } from './heatmap';
import { addDays, fromKey, todayKey } from './date';

/** Rest between sets and sets per exercise, by level. */
export const LEVEL_RULES: Record<Level, { exercises: [number, number]; topSets: number; sets: number; restSec: number; cardioMin: number }> = {
  beginner: { exercises: [3, 4], topSets: 3, sets: 2, restSec: 60, cardioMin: 15 },
  intermediate: { exercises: [4, 5], topSets: 4, sets: 3, restSec: 90, cardioMin: 20 },
  advanced: { exercises: [5, 6], topSets: 5, sets: 4, restSec: 120, cardioMin: 25 },
};

export interface RepScheme {
  /** Reps written into each set. */
  reps: number;
  label: string;
}

/** Rep range by goal. Strength: heavy 4–6 on big lifts, 8–10 on the rest. */
export function repScheme(goal: FitnessGoalFocus | undefined, exercise: string): RepScheme {
  switch (goal) {
    case 'Increase Strength':
      return COMPOUNDS.has(exercise) ? { reps: 5, label: '4–6' } : { reps: 8, label: '8–10' };
    case 'Lose Fat':
    case 'Improve Endurance':
      return { reps: 12, label: '12–15' };
    default:
      return { reps: 10, label: '8–12' };
  }
}

export function repRangeLabel(goal: FitnessGoalFocus | undefined) {
  if (goal === 'Increase Strength') return '4–6 big lifts · 8–10 others';
  if (goal === 'Lose Fat' || goal === 'Improve Endurance') return '12–15';
  return '8–12';
}

/** Library group for an exercise, preferring the pool's own group. */
function groupFor(name: string, preferred: MuscleGroup): MuscleGroup {
  if (EXERCISE_LIBRARY[preferred].includes(name)) return preferred;
  return (Object.keys(EXERCISE_LIBRARY) as MuscleGroup[]).find((g) => EXERCISE_LIBRARY[g].includes(name)) ?? preferred;
}

export interface CatalogTemplate extends Template {
  defId: string;
  category: TemplateCategory;
  equipment: EquipmentChoice;
  level: Level;
  /** Region intensities 0–1 for the mini heat map. */
  map: Partial<Record<Region, number>>;
  primary: Region[];
  secondary: Region[];
  totalSets: number;
  restSec: number;
  repRange: string;
  durationMin: number;
}

export const catalogId = (defId: string, equipment: EquipmentChoice) => `cat-${defId}-${equipment}`;

/** Parse "cat-push-mixed" (or an old "tpl-push" id) into a definition + equipment. */
export function parseCatalogId(id: string): { def: TemplateDef; equipment: EquipmentChoice } | null {
  const legacy = TEMPLATE_DEFS.find((x) => x.legacyId === id);
  if (legacy) return { def: legacy, equipment: 'mixed' };
  const m = /^cat-(.+)-(machine|free|mixed)$/.exec(id);
  const def = m && TEMPLATE_DEFS.find((x) => x.id === m[1]);
  return def ? { def, equipment: m![2] as EquipmentChoice } : null;
}

/** How many exercises each part gets: everyone gets one, the rest go to the heaviest parts (D'Hondt). */
function allocate(parts: [PoolId, number][], total: number, equipment: EquipmentChoice) {
  const seats = parts.map(() => 1);
  const cap = parts.map(([p]) => POOLS[p][equipment].length);
  let left = total - parts.length;
  while (left > 0) {
    let best = -1;
    let bestQ = -1;
    parts.forEach(([, w], i) => {
      if (seats[i] >= cap[i]) return;
      const q = w / (seats[i] + 1);
      if (q > bestQ) {
        bestQ = q;
        best = i;
      }
    });
    if (best < 0) break;
    seats[best]++;
    left--;
  }
  return seats;
}

/** Build one concrete template from a definition. */
export function buildTemplate(def: TemplateDef, equipment: EquipmentChoice, level: Level, goal?: FitnessGoalFocus): CatalogTemplate {
  const rules = LEVEL_RULES[level];
  const base = {
    id: catalogId(def.id, equipment),
    defId: def.id,
    name: def.name,
    builtIn: true,
    category: def.category,
    equipment,
    level,
    restSec: rules.restSec,
  };

  if (def.cardioOnly) {
    const [a, b] = CARDIO_POOL[equipment];
    const cardio = [
      { activity: a, durationMin: rules.cardioMin },
      { activity: b, durationMin: rules.cardioMin - 5 },
    ];
    return {
      ...base,
      kind: 'cardio',
      strength: [],
      cardio,
      map: {},
      primary: [],
      secondary: [],
      totalSets: 0,
      repRange: '—',
      durationMin: cardio.reduce((s, c) => s + c.durationMin, 0),
    };
  }

  // Exercise count: single muscle 3/4/5, otherwise 4/5/6 (never fewer than the parts, max 7).
  const single = def.parts.length === 1;
  let count = single ? rules.exercises[0] : rules.exercises[1];
  if (def.cardio) count -= 1;
  count = Math.min(7, Math.max(def.parts.length, count));

  const seats = allocate(def.parts, count, equipment);
  const used = new Set<string>();
  const strength: Template['strength'] = [];
  def.parts.forEach(([p], i) => {
    const pool = POOLS[p];
    const picks = pool[equipment].filter((x) => !used.has(x)).slice(0, seats[i]);
    picks.forEach((exercise, j) => {
      used.add(exercise);
      strength.push({
        exercise,
        muscleGroup: groupFor(exercise, pool.group),
        sets: j === 0 ? rules.topSets : rules.sets,
        reps: repScheme(goal, exercise).reps,
      });
    });
  });
  // Pool ran out (e.g. free-weight calves): add the volume back as extra sets.
  let missing = count - strength.length;
  for (let i = 0; missing > 0 && strength.length; i = (i + 1) % strength.length, missing--) strength[i].sets++;

  const thenCardio = def.cardio ? { activity: CARDIO_POOL[equipment][0], durationMin: rules.cardioMin } : undefined;
  const totalSets = strength.reduce((s, e) => s + e.sets, 0);

  // Mini heat map from the sets in the template (primary = full, secondary = half).
  const loads = Object.fromEntries(REGIONS.map((r) => [r.id, 0])) as RegionLoads;
  for (const e of strength)
    entryLoads({ id: '', exercise: e.exercise, muscleGroup: e.muscleGroup, sets: Array.from({ length: e.sets }, () => ({ reps: 1, weight: 1 })) }, 0, loads);
  const map = intensities(loads);
  const ranked = (Object.keys(map) as Region[]).sort((a, b) => (map[b] ?? 0) - (map[a] ?? 0));
  // Primary = the muscles the template is built for, plus anything else hit about as hard.
  const target = new Set<Region>(def.parts.flatMap(([p]) => POOLS[p].regions));
  const isPrimary = (r: Region) => target.has(r) || (map[r] ?? 0) >= 0.6;

  return {
    ...base,
    kind: 'strength',
    strength,
    cardio: [],
    thenCardio,
    map,
    primary: ranked.filter(isPrimary),
    secondary: ranked.filter((r) => !isPrimary(r)),
    totalSets,
    repRange: repRangeLabel(goal),
    durationMin: Math.round((totalSets * (45 + rules.restSec)) / 60 + 5 + (thenCardio?.durationMin ?? 0)),
  };
}

export interface TemplatePrefs {
  level: Level;
  equipment: EquipmentChoice;
  goal?: FitnessGoalFocus;
}

export function prefsFrom(profile: Profile | null): TemplatePrefs {
  const pref = profile?.equipmentPref;
  return {
    level: profile?.experienceLevel ?? 'intermediate',
    equipment: !pref || pref === 'any' ? 'mixed' : pref,
    goal: profile?.goal,
  };
}

/** Every catalog template (36 definitions × 3 equipment versions) for one level / goal. */
export function buildCatalog(level: Level, goal?: FitnessGoalFocus): CatalogTemplate[] {
  return TEMPLATE_DEFS.flatMap((def) => (['machine', 'free', 'mixed'] as const).map((eq) => buildTemplate(def, eq, level, goal)));
}

/** Resolve a template id from a URL: catalog ids are rebuilt for the chosen level; user templates come from the store. */
export function resolveTemplate(id: string | null, level: Level, goal: FitnessGoalFocus | undefined, userTemplates: Template[]): Template | null {
  if (!id) return null;
  const parsed = parseCatalogId(id);
  if (parsed) return buildTemplate(parsed.def, parsed.equipment, level, goal);
  return userTemplates.find((t) => t.id === id) ?? null;
}

export const favoriteKey = (defId: string) => `template:${defId}`;

// ---------- Recommendations ----------

export interface Recommendation {
  def: TemplateDef;
  reason: string;
  score: number;
}

/** Days since each pool was last trained (as a main muscle), and its 7-day load share. */
function poolStatus(sessions: Session[], today: DateKey) {
  const last = new Map<Region, DateKey>();
  const week = Object.fromEntries(REGIONS.map((r) => [r.id, 0])) as RegionLoads;
  const from = addDays(today, -6);
  for (const s of sessions) {
    if (s.kind !== 'strength') continue;
    for (const e of s.strength) {
      if (s.date > today || !e.sets.length) continue;
      for (const r of exerciseMeta(e.exercise, e.muscleGroup).primary) if (!last.has(r) || s.date > last.get(r)!) last.set(r, s.date);
      // Count sets (not weight) so heavy leg days don't drown out small muscles.
      if (s.date >= from) entryLoads({ ...e, bw: undefined, sets: e.sets.map((x) => ({ type: x.type, reps: 1, weight: 1 })) }, 0, week);
    }
  }
  const maxWeek = Math.max(1, ...Object.values(week));
  const days = (p: PoolId) => {
    const dates = POOLS[p].regions.map((r) => last.get(r)).filter(Boolean) as DateKey[];
    if (!dates.length) return Infinity;
    const latest = dates.sort().at(-1)!;
    return Math.round((fromKey(today).getTime() - fromKey(latest).getTime()) / 86_400_000);
  };
  const weekShare = (p: PoolId) => Math.max(...POOLS[p].regions.map((r) => week[r])) / maxWeek;
  return { days, weekShare };
}

const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} & ${xs.at(-1)}`);

/**
 * Suggest templates for muscles that are under-trained this week and have rested 48 h+.
 */
export function recommend(sessions: Session[], limit = 4, today: DateKey = todayKey()): Recommendation[] {
  const hasStrength = sessions.some((s) => s.kind === 'strength' && s.strength.length);
  if (!hasStrength) {
    return ['full', 'push', 'pull', 'legs'].map((id, i) => ({
      def: TEMPLATE_DEFS.find((x) => x.id === id)!,
      reason: i === 0 ? 'A great first workout: every major muscle' : 'Classic split to get started',
      score: 1 - i * 0.1,
    }));
  }
  const { days, weekShare } = poolStatus(sessions, today);
  const out: Recommendation[] = [];
  for (const def of TEMPLATE_DEFS) {
    if (def.cardioOnly || def.category === 'three' || def.parts.length === 0) continue;
    const pools = def.parts.map(([p]) => p).filter((p) => p !== 'forearms' && p !== 'calves' && p !== 'core' && p !== 'rear');
    if (!pools.length || def.id === 'core-cardio') continue;
    if (pools.some((p) => days(p) < 2)) continue; // not rested yet
    const need = pools.map((p) => Math.min(days(p), 10) / 10 * 0.5 + (1 - weekShare(p)) * 0.5);
    let score = need.reduce((a, b) => a + b, 0) / need.length;
    // Prefer covering more muscles when they all need work.
    score += Math.min(pools.length, 4) * 0.04;
    const stale = [...pools].sort((a, b) => days(b) - days(a));
    const d0 = days(stale[0]);
    const names = and(stale.slice(0, 2).map((p) => POOLS[p].label.toLowerCase()));
    const reason =
      d0 === Infinity
        ? `You haven't logged ${names} yet`
        : weekShare(stale[0]) === 0
          ? `No ${names} this week · rested ${d0} day${d0 === 1 ? '' : 's'}`
          : `Light on ${names} this week · rested ${d0} days`;
    out.push({ def, reason: reason.charAt(0).toUpperCase() + reason.slice(1), score });
  }
  out.sort((a, b) => b.score - a.score);
  // Avoid suggesting four templates for the same muscle.
  const picked: Recommendation[] = [];
  const lead = new Set<PoolId>();
  for (const r of out) {
    const first = r.def.parts[0][0];
    if (lead.has(first)) continue;
    lead.add(first);
    picked.push(r);
    if (picked.length >= limit) break;
  }
  return picked;
}
