import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import BodyMap from './BodyMap';
import { Button, inputCls } from './ui';
import { EQUIPMENT_LABEL, GROUP_REGIONS, REGIONS, type Region } from '../data/muscles';
import { MUSCLE_GROUP_INFO } from '../data/exercises';
import type { Equipment, MuscleGroup } from '../types';

export interface MuscleChoice {
  primary: Region[];
  secondary: Region[];
  equipment: Equipment;
}

/**
 * Pick the exact heat-map muscles an exercise works. Tap a muscle (on the body or in the list):
 * once = main muscle, twice = helper muscle, three times = off.
 */
export function MuscleEditor({ value, onChange }: { value: MuscleChoice; onChange: (v: MuscleChoice) => void }) {
  const state = (r: Region) => (value.primary.includes(r) ? 'main' : value.secondary.includes(r) ? 'helper' : 'off');
  const cycle = (r: Region) => {
    const s = state(r);
    const primary = value.primary.filter((x) => x !== r);
    const secondary = value.secondary.filter((x) => x !== r);
    if (s === 'off') primary.push(r);
    else if (s === 'main') secondary.push(r);
    onChange({ ...value, primary, secondary });
  };
  const values: Partial<Record<Region, number>> = {};
  for (const r of value.secondary) values[r] = 0.45;
  for (const r of value.primary) values[r] = 1;

  return (
    <div>
      <div className="eyebrow mb-1.5">Muscles worked</div>
      <p className="mb-2 text-xs text-muted">Tap a muscle once for main, twice for helper, three times to clear.</p>
      <div className="flex justify-center rounded-btn bg-surface py-2">
        <BodyMap values={values} mode="mono" view="both" width={84} onSelect={cycle} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Muscles">
        {REGIONS.map((r) => {
          const s = state(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => cycle(r.id)}
              aria-label={`${r.name}: ${s === 'off' ? 'not used' : s === 'main' ? 'main muscle' : 'helper muscle'}`}
              className={`h-8 rounded-full border px-2.5 text-xs transition-colors ${
                s === 'main'
                  ? 'border-str bg-str font-medium text-bg'
                  : s === 'helper'
                    ? 'border-str/50 bg-str-soft text-str'
                    : 'border-line bg-surface text-muted'
              }`}
            >
              {r.name}
              {s === 'helper' && ' · helper'}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-3 text-[0.6875rem] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-str" /> Main (100% of load)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-str/40" /> Helper (50%)
        </span>
      </div>

      <div className="eyebrow mb-1.5 mt-4">Equipment</div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Equipment">
        {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onChange({ ...value, equipment: e })}
            aria-pressed={value.equipment === e}
            className={`h-10 rounded-btn border px-2 text-sm ${
              value.equipment === e ? 'border-primary bg-primary font-medium text-primary-ink' : 'border-line bg-surface'
            }`}
          >
            {EQUIPMENT_LABEL[e]}
          </button>
        ))}
      </div>
    </div>
  );
}

export const defaultChoice = (g: MuscleGroup): MuscleChoice => ({ primary: [...GROUP_REGIONS[g]], secondary: [], equipment: 'free' });

/** "+ Add custom exercise" with name, muscle group and the exact muscles it works. */
export function CustomExerciseAdd({
  query,
  existing,
  defaultGroup,
  onAdd,
}: {
  query: string;
  existing: string[];
  defaultGroup: MuscleGroup;
  onAdd: (name: string, group: MuscleGroup, muscles: MuscleChoice) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [group, setGroup] = useState<MuscleGroup>(defaultGroup);
  const [muscles, setMuscles] = useState<MuscleChoice>(defaultChoice(defaultGroup));
  const [touched, setTouched] = useState(false);
  const q = query.trim();
  const qIsNew = !!q && !existing.some((e) => e.toLowerCase() === q.toLowerCase());
  const clean = name.trim();
  const dupe = !!clean && existing.some((e) => e.toLowerCase() === clean.toLowerCase());

  if (!open)
    return (
      <Button
        className="mt-3 w-full border-dashed"
        onClick={() => {
          setName(qIsNew ? q : '');
          setGroup(defaultGroup);
          setMuscles(defaultChoice(defaultGroup));
          setTouched(false);
          setOpen(true);
        }}
      >
        <Plus size={16} weight="bold" /> {qIsNew ? `Add “${q}” as custom exercise` : 'Add custom exercise'}
      </Button>
    );

  return (
    <div className="mt-3 rounded-card border border-line bg-bg p-4">
      <div className="eyebrow mb-2">New custom exercise</div>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Exercise name" aria-label="Custom exercise name" className={inputCls} />
      <select
        value={group}
        onChange={(e) => {
          const g = e.target.value as MuscleGroup;
          setGroup(g);
          // Until the user picks muscles themselves, follow the chosen group.
          if (!touched) setMuscles({ ...defaultChoice(g), equipment: muscles.equipment });
        }}
        className={`${inputCls} mt-2`}
        aria-label="Muscle group (for lists and filters)"
      >
        {MUSCLE_GROUP_INFO.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <div className="mt-4">
        <MuscleEditor
          value={muscles}
          onChange={(v) => {
            setMuscles(v);
            setTouched(true);
          }}
        />
      </div>
      {dupe && <p className="mt-2 text-sm text-danger">That exercise already exists. Pick it from the list instead.</p>}
      {!muscles.primary.length && <p className="mt-2 text-sm text-danger">Pick at least one main muscle.</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!clean || dupe || !muscles.primary.length}
          onClick={async () => {
            await onAdd(clean, group, muscles);
            setOpen(false);
            setName('');
          }}
        >
          <Plus size={16} weight="bold" /> Save
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">Saved permanently on this phone and included in backups. The heat map uses the muscles you pick.</p>
    </div>
  );
}
