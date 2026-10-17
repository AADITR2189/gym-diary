import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash, Plus, CheckCircle } from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { Button, Card, Field, NumberInput, SectionTitle, Stat, Tag, inputCls } from '../components/ui';
import { ChartCard, TrendLine } from '../components/charts';
import { ACTIVITY_LEVELS, FITNESS_GOALS, GENDERS, type ActivityLevel, type FitnessGoalFocus, type Gender, type Profile } from '../types';
import { deleteMeasurement, saveMeasurement, saveProfile, uid } from '../db/db';
import { toast } from '../lib/dialog';
import SwipeRow from '../components/SwipeRow';
import { bmi, bmiLabel, currentWeight, dailyCalories, weightChange } from '../lib/body';
import { formatShort, todayKey } from '../lib/date';
import { fmtNum } from '../lib/stats';
import { BONUS_ML_PER_HOUR, DEFAULT_QUICK_SIZES, DEFAULT_TARGET_ML, ML_PER_KG, fmtVolume, fromUnit, suggestedTargetMl, toUnit, unitLabel } from '../lib/water';
import { Drop, Barbell } from '@phosphor-icons/react';
import { EQUIPMENT_CHOICES, LEVELS } from '../data/templateCatalog';
import { LEVEL_RULES, repRangeLabel } from '../lib/templates';
import type { EquipmentChoice, Level } from '../types';

type Form = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>;

export default function ProfilePage() {
  const nav = useNavigate();
  const { ready, profile, measurements, settings } = useData();
  const wu = settings.weightUnit;
  const [f, setF] = useState<Form>({ name: '' });
  const [saved, setSaved] = useState(false);
  const [m, setM] = useState<{ date: string; weight?: number; bodyFatPct?: number; waistCm?: number }>({ date: todayKey() });

  useEffect(() => {
    if (ready && profile) {
      const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = profile;
      setF(rest);
    }
  }, [ready, profile]);

  const set = (patch: Partial<Form>) => {
    setF({ ...f, ...patch });
    setSaved(false);
  };

  async function onSave() {
    await saveProfile({ ...f, name: f.name.trim() });
    // First save with a weight also seeds the body-weight log, so trends start from day one.
    if (f.weight && !measurements.length) await saveMeasurement({ id: uid(), date: todayKey(), weight: f.weight, createdAt: Date.now() });
    setSaved(true);
  }

  async function addWeighIn() {
    if (!m.weight || m.weight <= 0) return;
    await saveMeasurement({ id: uid(), date: m.date, weight: m.weight, bodyFatPct: m.bodyFatPct, waistCm: m.waistCm, createdAt: Date.now() });
    setM({ date: todayKey() });
  }

  const cw = currentWeight(measurements, profile) ?? f.weight;
  const b = bmi(cw, f.heightCm, wu);
  const kcal = dailyCalories({ ...(profile ?? { id: 'me', createdAt: 0, updatedAt: 0 }), ...f }, cw, wu);
  const wc = weightChange(measurements, profile);

  return (
    <div className="pb-8">
      <div className="flex items-center gap-2 pt-6">
        <button
          onClick={() => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav('/'))}
          className="grid h-11 w-11 place-items-center rounded-btn border border-line bg-surface"
          aria-label="Back"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
        <h1 className="h-title text-[2.375rem]">Profile</h1>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat index={0} label="Current weight" value={cw ? fmtNum(cw, 1) : '—'} sub={wc !== undefined ? `${wc >= 0 ? '+' : ''}${fmtNum(wc, 1)} ${wu} since start` : wu} />
        <Stat index={1} label="BMI" value={b ? b.toFixed(1) : '—'} sub={b ? bmiLabel(b) : 'Needs height and weight'} />
        <Stat index={2} label="Maintenance" value={kcal ? fmtNum(kcal.maintenance) : '—'} sub={kcal ? 'kcal per day (est.)' : 'Needs age, height, gender'} />
        <Stat index={3} label="Focus" value={<span className="text-xl">{f.goal ?? '—'}</span>} sub={ACTIVITY_LEVELS.find((a) => a.id === f.activityLevel)?.label} />
      </div>

      <SectionTitle>About you</SectionTitle>
      <Card className="space-y-4">
        <Field label="Name">
          <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Your name" className={inputCls} autoComplete="name" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Height cm">
            <NumberInput value={f.heightCm} onChange={(v) => set({ heightCm: v })} placeholder="—" label="Height in centimetres" />
          </Field>
          <Field label={`Weight ${wu}`}>
            <NumberInput value={f.weight} step={0.1} onChange={(v) => set({ weight: v })} placeholder="—" label="Starting weight" />
          </Field>
          <Field label="Age">
            <NumberInput value={f.age} onChange={(v) => set({ age: v })} placeholder="—" label="Age" />
          </Field>
        </div>
        <Field label="Gender" group>
          <div className="grid grid-cols-2 gap-2">
            {GENDERS.map((g) => (
              <Choice key={g} active={f.gender === g} onClick={() => set({ gender: g as Gender })}>
                {g}
              </Choice>
            ))}
          </div>
        </Field>
        <Field label="Fitness goal" group>
          <div className="grid grid-cols-2 gap-2">
            {FITNESS_GOALS.map((g) => (
              <Choice key={g} active={f.goal === g} onClick={() => set({ goal: g as FitnessGoalFocus })}>
                {g}
              </Choice>
            ))}
          </div>
        </Field>
        <Field label="Activity level" group>
          <div className="space-y-2">
            {ACTIVITY_LEVELS.map((a) => (
              <Choice key={a.id} active={f.activityLevel === a.id} onClick={() => set({ activityLevel: a.id as ActivityLevel })}>
                <span className="flex w-full items-center justify-between gap-2">
                  <span>{a.label}</span>
                  <span className="text-xs text-muted">{a.hint}</span>
                </span>
              </Choice>
            ))}
          </div>
        </Field>
        <Button variant="primary" size="lg" className="w-full" onClick={onSave}>
          {saved ? (
            <>
              <CheckCircle size={18} weight="fill" /> Saved
            </>
          ) : (
            'Save profile'
          )}
        </Button>
        <p className="text-xs text-muted">
          The starting weight is your baseline for weight change. Log new weigh-ins below to track your current weight over time.
        </p>
      </Card>

      <TrainingSection />

      <HydrationSection />

      <SectionTitle>Body weight log</SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Date">
            <input type="date" value={m.date} max={todayKey()} onChange={(e) => setM({ ...m, date: e.target.value || todayKey() })} className={inputCls} />
          </Field>
          <Field label={`Weight ${wu}`}>
            <NumberInput value={m.weight} step={0.1} onChange={(v) => setM({ ...m, weight: v })} placeholder="—" label="Weigh-in weight" />
          </Field>
          <Field label="Body fat %">
            <NumberInput value={m.bodyFatPct} step={0.1} onChange={(v) => setM({ ...m, bodyFatPct: v })} placeholder="opt." label="Body fat percent" />
          </Field>
          <Field label="Waist cm">
            <NumberInput value={m.waistCm} step={0.5} onChange={(v) => setM({ ...m, waistCm: v })} placeholder="opt." label="Waist centimetres" />
          </Field>
        </div>
        <Button variant="primary" className="mt-3 w-full" onClick={addWeighIn} disabled={!m.weight}>
          <Plus size={16} weight="bold" /> Add weigh-in
        </Button>
      </Card>

      {measurements.length > 1 && (
        <div className="mt-2">
          <ChartCard title="Body weight trend" sub={wu}>
            <TrendLine data={measurements.map((x) => ({ label: formatShort(x.date), weight: x.weight }))} dataKey="weight" series="ink" unit={wu} />
          </ChartCard>
        </div>
      )}

      {measurements.length > 0 && (
        <Card className="mt-2 p-0">
          <ul className="divide-y divide-line">
            {[...measurements].reverse().map((x) => {
              const remove = async () => {
                await deleteMeasurement(x.id);
                toast('Weigh-in deleted', { undo: () => saveMeasurement(x) });
              };
              return (
              <li key={x.id}>
                <SwipeRow onDelete={remove} label={`Delete weigh-in from ${x.date}`}>
                <div className="num flex items-center gap-3 px-4 py-2.5">
                <span className="w-28 text-sm text-muted">{formatShort(x.date)}</span>
                <span className="flex-1 font-medium">
                  {fmtNum(x.weight, 1)} {wu}
                </span>
                {x.bodyFatPct !== undefined && <Tag>{x.bodyFatPct}% bf</Tag>}
                {x.waistCm !== undefined && <Tag>{x.waistCm} cm</Tag>}
                <button onClick={remove} className="hit-44 grid h-9 w-9 place-items-center text-muted" aria-label={`Delete weigh-in from ${x.date}`}>
                  <Trash size={16} weight="bold" />
                </button>
                </div>
                </SwipeRow>
              </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[48px] w-full items-center rounded-btn border px-3 text-left text-sm transition-colors ${
        active ? 'border-primary bg-primary font-medium text-primary-ink' : 'border-line bg-bg hover:bg-raised'
      }`}
    >
      {children}
    </button>
  );
}

/** Level + equipment used to size templates and pick recommendations. Saves on tap. */
function TrainingSection() {
  const { profile } = useData();
  const level: Level = profile?.experienceLevel ?? 'intermediate';
  const equip = profile?.equipmentPref ?? 'any';
  const rules = LEVEL_RULES[level];
  const save = (patch: { experienceLevel?: Level; equipmentPref?: EquipmentChoice | 'any' }) =>
    saveProfile({ ...(profile ?? { name: '' }), ...patch });
  const equipOptions: { id: EquipmentChoice | 'any'; label: string; hint: string }[] = [
    ...EQUIPMENT_CHOICES,
    { id: 'any', label: 'Any', hint: 'Show me everything (uses Mixed)' },
  ];
  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <Barbell size={12} weight="bold" /> Training preferences
        </span>
      </SectionTitle>
      <Card className="space-y-4">
        <Field label="Experience level" group>
          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map((l) => (
              <Choice key={l.id} active={level === l.id} onClick={() => save({ experienceLevel: l.id })}>
                <span>
                  <span className="block">{l.label}</span>
                  <span className="block text-[0.6875rem] leading-snug opacity-75">{l.hint}</span>
                </span>
              </Choice>
            ))}
          </div>
        </Field>
        <Field label="Equipment" group>
          <div className="grid grid-cols-2 gap-2">
            {equipOptions.map((e) => (
              <Choice key={e.id} active={equip === e.id} onClick={() => save({ equipmentPref: e.id })}>
                <span>
                  <span className="block">{e.label}</span>
                  <span className="block text-[0.6875rem] leading-snug opacity-75">{e.hint}</span>
                </span>
              </Choice>
            ))}
          </div>
        </Field>
        <div className="num rounded-btn bg-raised px-3 py-2.5 text-sm">
          Templates for you: <b>{rules.exercises[0]}–{rules.exercises[1]}</b> exercises · <b>{rules.sets}–{rules.topSets}</b> sets each ·{' '}
          <b>{repRangeLabel(profile?.goal)}</b> reps · <b>{rules.restSec} s</b> rest
          <span className="mt-0.5 block text-xs text-muted">Reps follow your goal above. You can still pick another level on any template.</span>
        </div>
      </Card>
    </>
  );
}

/** Hydration target + quick-add sizes. Saved independently of the "About you" form. */
function HydrationSection() {
  const { profile, measurements, settings } = useData();
  const unit = settings.volumeUnit;
  const suggestion = suggestedTargetMl(profile, measurements, settings);
  const [target, setTarget] = useState<number | undefined>();
  const [bonus, setBonus] = useState(true);
  const [sizes, setSizes] = useState<(number | undefined)[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTarget(profile?.waterTargetMl ? toUnit(profile.waterTargetMl, unit) : undefined);
    setBonus(profile?.waterWorkoutBonus !== false);
    setSizes((profile?.waterQuickSizes ?? DEFAULT_QUICK_SIZES).map((ml) => toUnit(ml, unit)));
  }, [profile, unit]);

  const effective = target ? fromUnit(target, unit) : suggestion ?? DEFAULT_TARGET_ML;

  async function save() {
    const quick = sizes.map((v) => fromUnit(v ?? 0, unit));
    await saveProfile({
      ...(profile ?? { name: '' }),
      waterTargetMl: target ? fromUnit(target, unit) : undefined,
      waterWorkoutBonus: bonus,
      waterQuickSizes: quick.every((n) => n > 0) ? quick : DEFAULT_QUICK_SIZES,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5 text-wat">
          <Drop size={12} weight="fill" /> Hydration
        </span>
      </SectionTitle>
      <Card className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Daily target</div>
            <div className="h-display num mt-1 text-[2.125rem] leading-none text-wat">{fmtVolume(effective, unit)}</div>
            <div className="mt-1 text-xs text-muted">{target ? 'Your own target' : suggestion ? 'Suggested from your weight' : 'Default target'}</div>
          </div>
        </div>
        <Field
          label={`Your target (${unitLabel(unit)})`}
          hint={
            suggestion
              ? `Suggested: ${fmtVolume(suggestion, unit)} (${ML_PER_KG} ml per kg of body weight). Leave empty to use it.`
              : `Add your weight above to get a suggestion. Leave empty for ${fmtVolume(DEFAULT_TARGET_ML, unit)}.`
          }
        >
          <div className="flex gap-2">
            <NumberInput value={target} onChange={setTarget} placeholder="—" label="Daily water target" step={unit === 'oz' ? 1 : 50} />
            {suggestion !== undefined && (
              <Button className="shrink-0" onClick={() => setTarget(toUnit(suggestion, unit))}>
                Use suggestion
              </Button>
            )}
          </div>
        </Field>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={bonus} onChange={(e) => setBonus(e.target.checked)} className="mt-1 h-5 w-5 accent-[rgb(var(--wat))]" />
          <span>
            <span className="font-medium">Extra water on workout days</span>
            <span className="block text-xs text-muted">
              Adds {fmtVolume(BONUS_ML_PER_HOUR, unit)} per hour of logged exercise to that day&apos;s target.
            </span>
          </span>
        </label>
        <Field label={`Quick-add buttons (${unitLabel(unit)})`} group>
          <div className="grid grid-cols-3 gap-2">
            {['Glass', 'Bottle', 'Large'].map((name, i) => (
              <div key={name}>
                <NumberInput
                  value={sizes[i]}
                  onChange={(v) => setSizes(sizes.map((x, j) => (j === i ? v : x)))}
                  label={`${name} size`}
                  step={unit === 'oz' ? 1 : 50}
                />
                <div className="mt-1 text-center text-xs text-muted">{name}</div>
              </div>
            ))}
          </div>
        </Field>
        <Button variant="primary" size="lg" className="w-full" onClick={save}>
          {saved ? (
            <>
              <CheckCircle size={18} weight="fill" /> Saved
            </>
          ) : (
            'Save hydration settings'
          )}
        </Button>
      </Card>
    </>
  );
}
