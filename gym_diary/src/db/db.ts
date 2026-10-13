import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import type {
  BackupFile,
  BodyMeasurement,
  CardioEntry,
  CustomCardio,
  Exercise,
  Favorite,
  FitnessGoal,
  MuscleGroup,
  MuscleGroupInfo,
  PersonalRecord,
  Profile,
  Session,
  SessionKind,
  Settings,
  SetEntry,
  StrengthEntry,
  Template,
  WaterLog,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { EXERCISE_LIBRARY, MUSCLE_GROUP_INFO, exerciseId } from '../data/exercises';
import { cardioCategory } from '../data/cardio';
import { personalRecords } from '../lib/stats';

/* ============================================================================
 * IndexedDB schema "gym-diary" — version 2 (normalised)
 *
 *  users             keyPath id ("me")                     – profile (single row)
 *  muscleGroups      keyPath id                            – reference data
 *  exercises         keyPath id   idx by-group, by-name    – built-in + custom
 *  workoutSessions   keyPath id   idx by-date, by-kind     – session header
 *  workoutExercises  keyPath id   idx by-session, by-name  – exercise rows (+ sets)
 *  cardioSessions    keyPath id   idx by-session, by-date  – cardio rows
 *  fitnessGoals      keyPath id
 *  bodyMeasurements  keyPath id   idx by-date
 *  personalRecords   keyPath exercise                      – materialised, rebuilt on write
 *  customCardio, favorites, templates, kv (settings)
 *
 *  waterLogs        keyPath id   idx by-date              – hydration entries (v3)
 *
 *  v1 → v2 migration splits the old embedded `sessions` store into the rows above.
 * ==========================================================================*/

export interface WorkoutSessionRow {
  id: string;
  date: string;
  kind: SessionKind;
  name?: string;
  notes?: string;
  durationMin?: number;
  createdAt: number;
  updatedAt: number;
}
export interface WorkoutExerciseRow {
  id: string;
  sessionId: string;
  exerciseId?: string;
  exercise: string;
  muscleGroup: MuscleGroup;
  order: number;
  sets: SetEntry[];
  notes?: string;
  superset?: string;
  bw?: number;
  timed?: boolean;
}
export interface CardioRow extends CardioEntry {
  sessionId: string;
  date: string;
  order: number;
  category: string;
}

interface GymDB extends DBSchema {
  users: { key: string; value: Profile };
  muscleGroups: { key: string; value: MuscleGroupInfo };
  exercises: { key: string; value: Exercise; indexes: { 'by-group': string; 'by-name': string } };
  workoutSessions: { key: string; value: WorkoutSessionRow; indexes: { 'by-date': string; 'by-kind': string } };
  workoutExercises: { key: string; value: WorkoutExerciseRow; indexes: { 'by-session': string; 'by-name': string } };
  cardioSessions: { key: string; value: CardioRow; indexes: { 'by-session': string; 'by-date': string } };
  fitnessGoals: { key: string; value: FitnessGoal };
  bodyMeasurements: { key: string; value: BodyMeasurement; indexes: { 'by-date': string } };
  personalRecords: { key: string; value: PersonalRecord };
  customCardio: { key: string; value: CustomCardio };
  favorites: { key: string; value: Favorite };
  templates: { key: string; value: Template };
  kv: { key: string; value: unknown };
  waterLogs: { key: string; value: WaterLog; indexes: { 'by-date': string } };
}

const DB_NAME = 'gym-diary';
const DB_VERSION = 3;
type Store = StoreNames<GymDB>;
const SESSION_STORES = ['workoutSessions', 'workoutExercises', 'cardioSessions', 'personalRecords'] as const;

let dbPromise: Promise<IDBPDatabase<GymDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<GymDB>(DB_NAME, DB_VERSION, {
      async upgrade(d, oldVersion, _newVersion, tx) {
        const loose = d as unknown as IDBPDatabase;
        if (oldVersion < 1) {
          d.createObjectStore('customCardio', { keyPath: 'id' });
          d.createObjectStore('favorites', { keyPath: 'key' });
          d.createObjectStore('templates', { keyPath: 'id' });
          d.createObjectStore('kv');
        }
        if (oldVersion < 2) {
          d.createObjectStore('users', { keyPath: 'id' });
          d.createObjectStore('muscleGroups', { keyPath: 'id' });
          const ex = d.createObjectStore('exercises', { keyPath: 'id' });
          ex.createIndex('by-group', 'muscleGroup');
          ex.createIndex('by-name', 'name');
          const ws = d.createObjectStore('workoutSessions', { keyPath: 'id' });
          ws.createIndex('by-date', 'date');
          ws.createIndex('by-kind', 'kind');
          const we = d.createObjectStore('workoutExercises', { keyPath: 'id' });
          we.createIndex('by-session', 'sessionId');
          we.createIndex('by-name', 'exercise');
          const cs = d.createObjectStore('cardioSessions', { keyPath: 'id' });
          cs.createIndex('by-session', 'sessionId');
          cs.createIndex('by-date', 'date');
          d.createObjectStore('fitnessGoals', { keyPath: 'id' });
          const bm = d.createObjectStore('bodyMeasurements', { keyPath: 'id' });
          bm.createIndex('by-date', 'date');
          d.createObjectStore('personalRecords', { keyPath: 'exercise' });

          // Migrate v1 data (embedded sessions + customExercises) into the normalised stores.
          if (oldVersion === 1) {
            const ltx = tx as unknown as IDBPTransaction<unknown, string[], 'versionchange'>;
            const oldSessions = ((await ltx.objectStore('sessions').getAll()) ?? []) as Session[];
            const oldCustom = ((await ltx.objectStore('customExercises').getAll()) ?? []) as {
              id: string;
              name: string;
              muscleGroup: MuscleGroup;
            }[];
            for (const s of oldSessions) await writeSessionRows(tx as never, s);
            for (const c of oldCustom)
              await tx.objectStore('exercises').put({ id: c.id, name: c.name, muscleGroup: c.muscleGroup, isCustom: true });
            for (const pr of personalRecords(oldSessions)) await tx.objectStore('personalRecords').put(pr);
            loose.deleteObjectStore('sessions');
            loose.deleteObjectStore('customExercises');
          }
        }
        if (oldVersion < 3) {
          const w = d.createObjectStore('waterLogs', { keyPath: 'id' });
          w.createIndex('by-date', 'date');
        }
      },
    }).then(async (d) => {
      await seedReferenceData(d);
      return d;
    });
  }
  return dbPromise;
}

/** Upserts muscle groups and the built-in exercise library (idempotent, runs on every start). */
async function seedReferenceData(d: IDBPDatabase<GymDB>) {
  const tx = d.transaction(['muscleGroups', 'exercises'], 'readwrite');
  for (const m of MUSCLE_GROUP_INFO) tx.objectStore('muscleGroups').put(m);
  for (const [g, names] of Object.entries(EXERCISE_LIBRARY) as [MuscleGroup, string[]][])
    for (const name of names) tx.objectStore('exercises').put({ id: exerciseId(g, name), name, muscleGroup: g, isCustom: false });
  await tx.done;
}

// ---- change notification so React re-queries after writes ----
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function notify() {
  listeners.forEach((fn) => fn());
}

export function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ============================ Workout sessions ============================

type SessionTx = IDBPTransaction<GymDB, Store[], 'readwrite' | 'versionchange'>;

/** Writes a Session aggregate as one header row + child rows (replacing existing children). */
async function writeSessionRows(tx: SessionTx, s: Session) {
  const { strength, cardio, ...header } = s;
  await tx.objectStore('workoutSessions').put(header as WorkoutSessionRow);
  await deleteSessionChildren(tx, s.id);
  for (const [order, e] of strength.entries())
    await tx.objectStore('workoutExercises').put({
      id: e.id,
      sessionId: s.id,
      exerciseId: exerciseId(e.muscleGroup, e.exercise),
      exercise: e.exercise,
      muscleGroup: e.muscleGroup,
      order,
      sets: e.sets,
      notes: e.notes,
      superset: e.superset,
      bw: e.bw,
      timed: e.timed,
    });
  for (const [order, c] of cardio.entries())
    await tx.objectStore('cardioSessions').put({ ...c, sessionId: s.id, date: s.date, order, category: c.category ?? cardioCategory(c.activity) });
}

async function deleteSessionChildren(tx: SessionTx, sessionId: string) {
  for (const store of ['workoutExercises', 'cardioSessions'] as const) {
    const keys = await tx.objectStore(store).index('by-session').getAllKeys(sessionId);
    for (const k of keys) await tx.objectStore(store).delete(k);
  }
}

function assemble(headers: WorkoutSessionRow[], exRows: WorkoutExerciseRow[], cardioRows: CardioRow[]): Session[] {
  const exBy = new Map<string, StrengthEntry[]>();
  for (const r of [...exRows].sort((a, b) => a.order - b.order))
    exBy.set(r.sessionId, [
      ...(exBy.get(r.sessionId) ?? []),
      { id: r.id, exercise: r.exercise, muscleGroup: r.muscleGroup, sets: r.sets, notes: r.notes, superset: r.superset, bw: r.bw, timed: r.timed },
    ]);
  const cBy = new Map<string, CardioEntry[]>();
  for (const r of [...cardioRows].sort((a, b) => a.order - b.order)) {
    const { sessionId, date: _d, order: _o, ...entry } = r;
    cBy.set(sessionId, [...(cBy.get(sessionId) ?? []), entry]);
  }
  return headers.map((h) => ({ ...h, strength: exBy.get(h.id) ?? [], cardio: cBy.get(h.id) ?? [] }));
}

const sortSessions = (list: Session[]) =>
  list.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));

export async function getAllSessions(): Promise<Session[]> {
  const d = await db();
  const tx = d.transaction(['workoutSessions', 'workoutExercises', 'cardioSessions'], 'readonly');
  const [h, e, c] = await Promise.all([
    tx.objectStore('workoutSessions').getAll(),
    tx.objectStore('workoutExercises').getAll(),
    tx.objectStore('cardioSessions').getAll(),
  ]);
  return sortSessions(assemble(h, e, c));
}

/** Recomputes the materialised PersonalRecords table from all sessions. */
async function rebuildPersonalRecords(d: IDBPDatabase<GymDB>) {
  const prs = personalRecords(await getAllSessions());
  const tx = d.transaction('personalRecords', 'readwrite');
  await tx.store.clear();
  for (const p of prs) await tx.store.put(p);
  await tx.done;
}

export async function saveSession(s: Session) {
  await putSessions([{ ...s, updatedAt: Date.now() }]);
}

export async function putSessions(list: Session[]) {
  const d = await db();
  const tx = d.transaction([...SESSION_STORES], 'readwrite');
  for (const s of list) await writeSessionRows(tx as unknown as SessionTx, s);
  await tx.done;
  await rebuildPersonalRecords(d);
  notify();
}

export async function deleteSession(id: string) {
  const d = await db();
  const tx = d.transaction([...SESSION_STORES], 'readwrite');
  await tx.objectStore('workoutSessions').delete(id);
  await deleteSessionChildren(tx as unknown as SessionTx, id);
  await tx.done;
  await rebuildPersonalRecords(d);
  notify();
}

export async function getPersonalRecords() {
  return (await db()).getAll('personalRecords');
}

// ============================ Exercises & cardio ============================

export async function getExercises(): Promise<Exercise[]> {
  return (await db()).getAll('exercises');
}
export async function addCustomExercise(name: string, muscleGroup: MuscleGroup, muscles?: Pick<Exercise, 'primary' | 'secondary' | 'equipment'>) {
  await (await db()).put('exercises', { id: uid(), name, muscleGroup, isCustom: true, ...muscles });
  notify();
}
/** Update the muscles / equipment of a custom exercise. */
export async function updateCustomExercise(id: string, patch: Pick<Exercise, 'primary' | 'secondary' | 'equipment'>) {
  const d = await db();
  const row = await d.get('exercises', id);
  if (row?.isCustom) await d.put('exercises', { ...row, ...patch });
  notify();
}
export async function deleteCustomExercise(id: string) {
  const d = await db();
  const row = await d.get('exercises', id);
  if (row?.isCustom) await d.delete('exercises', id);
  notify();
}
export async function getCustomCardio() {
  return (await db()).getAll('customCardio');
}
export async function addCustomCardio(c: CustomCardio) {
  await (await db()).put('customCardio', c);
  notify();
}
export async function deleteCustomCardio(id: string) {
  await (await db()).delete('customCardio', id);
  notify();
}

// ============================ Favorites & templates ============================

export async function getFavorites() {
  return (await db()).getAll('favorites');
}
export async function toggleFavorite(key: string) {
  const d = await db();
  if (await d.get('favorites', key)) await d.delete('favorites', key);
  else await d.put('favorites', { key, addedAt: Date.now() });
  notify();
}
export async function getUserTemplates() {
  return (await db()).getAll('templates');
}
export async function saveTemplate(t: Template) {
  await (await db()).put('templates', t);
  notify();
}
export async function deleteTemplate(id: string) {
  await (await db()).delete('templates', id);
  notify();
}

// ============================ Profile, body, goals ============================

export async function getProfile(): Promise<Profile | null> {
  return (await (await db()).get('users', 'me')) ?? null;
}
export async function saveProfile(p: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'> & Partial<Profile>) {
  const d = await db();
  const prev = await d.get('users', 'me');
  const now = Date.now();
  await d.put('users', { ...prev, ...p, id: 'me', createdAt: prev?.createdAt ?? now, updatedAt: now } as Profile);
  notify();
}

export async function getMeasurements() {
  const all = await (await db()).getAll('bodyMeasurements');
  return all.sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
}
export async function saveMeasurement(m: BodyMeasurement) {
  await (await db()).put('bodyMeasurements', m);
  notify();
}
export async function deleteMeasurement(id: string) {
  await (await db()).delete('bodyMeasurements', id);
  notify();
}

export async function getGoals() {
  return (await db()).getAll('fitnessGoals');
}
export async function saveGoal(g: FitnessGoal) {
  await (await db()).put('fitnessGoals', g);
  notify();
}
export async function deleteGoal(id: string) {
  await (await db()).delete('fitnessGoals', id);
  notify();
}

// ============================ Water ============================

export async function getWaterLogs() {
  const all = await (await db()).getAll('waterLogs');
  return all.sort((a, b) => (a.date === b.date ? a.loggedAt - b.loggedAt : a.date < b.date ? -1 : 1));
}
export async function saveWaterLog(w: WaterLog) {
  await (await db()).put('waterLogs', w);
  notify();
}
export async function putWaterLogs(list: WaterLog[]) {
  const d = await db();
  const tx = d.transaction('waterLogs', 'readwrite');
  for (const w of list) await tx.store.put(w);
  await tx.done;
  notify();
}
export async function deleteWaterLog(id: string) {
  await (await db()).delete('waterLogs', id);
  notify();
}

// ============================ Settings ============================

export async function getSettings(): Promise<Settings> {
  const s = (await (await db()).get('kv', 'settings')) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}
export async function saveSettings(s: Settings) {
  await (await db()).put('kv', s, 'settings');
  notify();
}

// ============================ Backup / restore ============================

export async function exportBackup(): Promise<BackupFile> {
  const d = await db();
  return {
    app: 'gym-diary',
    version: 2,
    exportedAt: new Date().toISOString(),
    sessions: await getAllSessions(),
    customExercises: (await d.getAll('exercises')).filter((e) => e.isCustom),
    customCardio: await d.getAll('customCardio'),
    favorites: await d.getAll('favorites'),
    templates: await d.getAll('templates'),
    settings: await getSettings(),
    profile: (await d.get('users', 'me')) ?? null,
    measurements: await d.getAll('bodyMeasurements'),
    goals: await d.getAll('fitnessGoals'),
    water: await d.getAll('waterLogs'),
  };
}

const USER_STORES = [
  'users',
  'workoutSessions',
  'workoutExercises',
  'cardioSessions',
  'personalRecords',
  'fitnessGoals',
  'bodyMeasurements',
  'customCardio',
  'favorites',
  'templates',
  'kv',
  'waterLogs',
] as const;

/** Accepts v1 and v2 backups. "replace" wipes user data first; "merge" upserts by id. */
export async function importBackup(b: BackupFile, mode: 'replace' | 'merge') {
  const d = await db();
  const tx = d.transaction([...USER_STORES, 'exercises'], 'readwrite');
  if (mode === 'replace') {
    for (const s of USER_STORES) await tx.objectStore(s).clear();
    const customKeys = (await tx.objectStore('exercises').getAll()).filter((e) => e.isCustom).map((e) => e.id);
    for (const k of customKeys) await tx.objectStore('exercises').delete(k);
  }
  for (const s of b.sessions ?? []) await writeSessionRows(tx as unknown as SessionTx, s);
  for (const e of b.customExercises ?? [])
    await tx.objectStore('exercises').put({ ...e, isCustom: true });
  for (const c of b.customCardio ?? []) await tx.objectStore('customCardio').put(c);
  for (const f of b.favorites ?? []) await tx.objectStore('favorites').put(f);
  for (const t of b.templates ?? []) await tx.objectStore('templates').put(t);
  for (const m of b.measurements ?? []) await tx.objectStore('bodyMeasurements').put(m);
  for (const g of b.goals ?? []) await tx.objectStore('fitnessGoals').put(g);
  for (const w of b.water ?? []) await tx.objectStore('waterLogs').put(w);
  if (b.profile) await tx.objectStore('users').put({ ...b.profile, id: 'me' });
  if (b.settings) await tx.objectStore('kv').put({ ...DEFAULT_SETTINGS, ...b.settings }, 'settings');
  await tx.done;
  await rebuildPersonalRecords(d);
  notify();
}

export async function wipeAll() {
  const d = await db();
  const tx = d.transaction([...USER_STORES, 'exercises'], 'readwrite');
  for (const s of USER_STORES) await tx.objectStore(s).clear();
  const customKeys = (await tx.objectStore('exercises').getAll()).filter((e) => e.isCustom).map((e) => e.id);
  for (const k of customKeys) await tx.objectStore('exercises').delete(k);
  await tx.done;
  notify();
}

/** Ask the browser not to evict our data under storage pressure (important on iOS). */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
