import type { MuscleGroup, Session, SetEntry } from '../types';
import { MUSCLE_GROUPS } from '../types';
import { isValidKey } from './date';
import { setVolume } from './stats';
import { uid } from '../db/db';
import { cardioCategory } from '../data/cardio';

/**
 * Flat CSV format — one row per strength set or per cardio entry, so it opens nicely in Excel.
 * Rows sharing a session_id are grouped back into one session on import.
 */
export const CSV_COLUMNS = [
  'session_id',
  'date',
  'type',
  'session_name',
  'session_notes',
  'session_duration_min',
  'exercise_or_activity',
  'muscle_group',
  'set_number',
  'reps',
  'weight',
  'set_volume',
  'duration_min',
  'distance',
  'calories',
  'avg_heart_rate',
  'cardio_type',
  'entry_notes',
  'set_type',
  'superset',
  'seconds',
  'bodyweight',
] as const;

type Row = Record<(typeof CSV_COLUMNS)[number], string>;

function esc(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sessionsToCsv(sessions: Session[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  for (const s of sorted) {
    const base = [s.id, s.date, s.kind, s.name ?? '', s.notes ?? '', s.durationMin ?? ''];
    if (s.kind === 'strength') {
      s.strength.forEach((e) => {
        const sets = e.sets.length ? e.sets : [{ reps: 0, weight: 0 }];
        sets.forEach((set, i) => {
          lines.push(
            [...base, e.exercise, e.muscleGroup, i + 1, set.reps, set.weight, setVolume(set, e.bw), '', '', '', '', '', i === 0 ? e.notes ?? '' : '', set.type ?? '', e.superset ?? '', set.sec ?? '', e.bw ?? '']
              .map(esc)
              .join(','),
          );
        });
      });
      if (!s.strength.length) lines.push([...base, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''].map(esc).join(','));
    } else {
      s.cardio.forEach((c) => {
        lines.push(
          [...base, c.activity, '', '', '', '', '', c.durationMin, c.distance ?? '', c.calories ?? '', c.avgHeartRate ?? '', c.category ?? '', c.notes ?? '', '', '', '', '']
            .map(esc)
            .join(','),
        );
      });
      if (!s.cardio.length) lines.push([...base, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''].map(esc).join(','));
    }
  }
  return lines.join('\r\n');
}

/** RFC-4180-ish parser: handles quoted fields, escaped quotes and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const num = (v: string) => {
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
};
const optNum = (v: string) => (v.trim() === '' ? undefined : num(v));

export interface CsvImportResult {
  sessions: Session[];
  errors: string[];
}

export function csvToSessions(text: string): CsvImportResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (!rows.length) return { sessions: [], errors: ['The file is empty.'] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col('date') < 0 || col('type') < 0 || col('exercise_or_activity') < 0) {
    return { sessions: [], errors: ['Missing required columns: date, type, exercise_or_activity.'] };
  }
  const byId = new Map<string, Session>();
  const now = Date.now();
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const r = Object.fromEntries(CSV_COLUMNS.map((c) => [c, (cells[col(c)] ?? '').trim()])) as Row;
    if (!isValidKey(r.date)) {
      errors.push(`Line ${line}: invalid date "${r.date}" (use YYYY-MM-DD).`);
      return;
    }
    const kind = r.type.toLowerCase() === 'cardio' ? 'cardio' : 'strength';
    const sid = r.session_id || `${r.date}-${kind}-${r.session_name}`;
    let s = byId.get(sid);
    if (!s) {
      s = {
        id: r.session_id || uid(),
        date: r.date,
        kind,
        name: r.session_name || undefined,
        notes: r.session_notes || undefined,
        durationMin: optNum(r.session_duration_min),
        strength: [],
        cardio: [],
        createdAt: now + line,
        updatedAt: now,
      };
      byId.set(sid, s);
    }
    if (!r.exercise_or_activity) return;
    if (kind === 'cardio') {
      const duration = num(r.duration_min);
      if (duration <= 0) errors.push(`Line ${line}: cardio "${r.exercise_or_activity}" has no duration — imported as 0.`);
      s.cardio.push({
        id: uid(),
        activity: r.exercise_or_activity,
        durationMin: duration,
        distance: optNum(r.distance),
        calories: optNum(r.calories),
        avgHeartRate: optNum(r.avg_heart_rate),
        category: r.cardio_type || cardioCategory(r.exercise_or_activity),
        notes: r.entry_notes || undefined,
      });
    } else {
      const mg = r.muscle_group.toUpperCase() as MuscleGroup;
      const muscleGroup: MuscleGroup = MUSCLE_GROUPS.includes(mg) ? mg : 'FULL BODY';
      const setNo = Math.max(1, Math.round(num(r.set_number)) || 1);
      let entry = s.strength[s.strength.length - 1];
      if (!entry || entry.exercise !== r.exercise_or_activity || setNo === 1) {
        entry = {
          id: uid(),
          exercise: r.exercise_or_activity,
          muscleGroup,
          sets: [],
          notes: r.entry_notes || undefined,
          superset: r.superset || undefined,
          bw: optNum(r.bodyweight),
          timed: r.seconds !== '' || undefined,
        };
        s.strength.push(entry);
      }
      const t = r.set_type.toLowerCase();
      const type = t === 'warmup' || t === 'drop' || t === 'failure' ? t : undefined;
      if (r.reps !== '' || r.weight !== '' || r.seconds !== '') {
        const set: SetEntry = { reps: num(r.reps), weight: num(r.weight) };
        if (type) set.type = type;
        if (r.seconds !== '') set.sec = num(r.seconds);
        entry.sets.push(set);
      }
    }
  });
  return { sessions: [...byId.values()], errors };
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([mime.includes('csv') ? '﻿' + text : text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
