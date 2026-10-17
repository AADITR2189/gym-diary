import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash, CheckCircle, Target, Archive } from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { Button, Card, Empty, Field, NumberInput, Progress, SectionTitle, Sheet, Tag, inputCls } from '../components/ui';
import type { FitnessGoal, GoalType } from '../types';
import { deleteGoal, saveGoal, uid } from '../db/db';
import { toast } from '../lib/dialog';
import { GOAL_TYPES, goalProgress, overallGoalCompletion } from '../lib/goals';
import { currentWeight } from '../lib/body';
import { formatShort, todayKey } from '../lib/date';
import { exerciseUsage } from '../lib/stats';

export default function GoalsPage() {
  const nav = useNavigate();
  const { goals, sessions, measurements, profile, settings, records, water } = useData();
  const [open, setOpen] = useState(false);

  const rows = useMemo(
    () =>
      goals
        .filter((g) => !g.archived)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((g) => ({ g, p: goalProgress(g, sessions, measurements, profile, settings, water) })),
    [goals, sessions, measurements, profile, settings, water],
  );
  const archived = goals.filter((g) => g.archived);
  const overall = overallGoalCompletion(rows.map((r) => r.p));

  // Stamp achievement date the first time a goal reaches 100%.
  useEffect(() => {
    rows.forEach(({ g, p }) => {
      if (p.done && !g.achievedAt) saveGoal({ ...g, achievedAt: Date.now() });
    });
  }, [rows]);

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
        <h1 className="h-title flex-1 text-[2.375rem]">Goals</h1>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus size={16} weight="bold" /> New goal
        </Button>
      </div>

      {overall !== undefined && (
        <Card className="mt-6">
          <div className="flex items-end justify-between">
            <div>
              <div className="eyebrow">Overall completion</div>
              <div className="h-display num mt-1 text-5xl">{overall}%</div>
            </div>
            <div className="text-right text-sm text-muted">
              {rows.filter((r) => r.p.done).length} of {rows.length} goals met
            </div>
          </div>
          <div className="mt-4">
            <Progress pct={overall} />
          </div>
        </Card>
      )}

      <SectionTitle>Active goals</SectionTitle>
      {rows.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map(({ g, p }, i) => (
            <Card key={g.id} index={i}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{g.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Tag>{GOAL_TYPES.find((t) => t.type === g.type)?.label}</Tag>
                    {g.deadline && <Tag tone={g.deadline < todayKey() && !p.done ? 'danger' : 'default'}>by {formatShort(g.deadline)}</Tag>}
                    {p.done && <Tag tone="str">Achieved</Tag>}
                  </div>
                </div>
                <button onClick={() => saveGoal({ ...g, archived: true })} className="hit-44 grid h-9 w-9 place-items-center text-muted" aria-label="Archive goal">
                  <Archive size={16} weight="bold" />
                </button>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="num text-sm text-muted">{p.label}</span>
                <span className="h-display num text-2xl">{p.pct}%</span>
              </div>
              <div className="mt-2">
                <Progress pct={p.pct} tone={p.done ? 'str' : 'gold'} />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty icon={<Target size={32} weight="bold" />} title="No goals yet">
          Set a target like four workouts a week, 150 cardio minutes, or a 100 {settings.weightUnit} squat, and track it here.
        </Empty>
      )}

      {archived.length > 0 && (
        <>
          <SectionTitle>Archived</SectionTitle>
          <Card className="p-0">
            <ul className="divide-y divide-line">
              {archived.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                  {g.achievedAt ? <CheckCircle size={16} weight="fill" className="text-str" /> : <span className="w-4" />}
                  <span className="flex-1 text-sm">{g.title}</span>
                  <button onClick={() => saveGoal({ ...g, archived: false })} className="text-sm text-muted underline-offset-4 hover:underline">
                    Restore
                  </button>
                  <button
                    onClick={async () => {
                      await deleteGoal(g.id);
                      toast('Goal deleted', { undo: () => saveGoal(g) });
                    }}
                    className="hit-44 grid h-9 w-9 place-items-center text-muted"
                    aria-label="Delete goal"
                  >
                    <Trash size={16} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <NewGoalSheet
        open={open}
        onClose={() => setOpen(false)}
        exercises={exerciseUsage(sessions).map((u) => u.exercise)}
        startWeight={currentWeight(measurements, profile)}
        bestLift={(name) => records.find((r) => r.exercise === name)?.maxWeight}
      />
    </div>
  );
}

function NewGoalSheet({
  open,
  onClose,
  exercises,
  startWeight,
  bestLift,
}: {
  open: boolean;
  onClose: () => void;
  exercises: string[];
  startWeight?: number;
  bestLift: (name: string) => number | undefined;
}) {
  const { settings } = useData();
  const [type, setType] = useState<GoalType>('weeklySessions');
  const [target, setTarget] = useState<number | undefined>();
  const [exercise, setExercise] = useState('');
  const [deadline, setDeadline] = useState('');
  const def = GOAL_TYPES.find((t) => t.type === type)!;
  const unit = def.unit(settings);
  const ex = exercise || exercises[0] || '';

  async function create() {
    if (!target || target <= 0) return;
    if (type === 'lift' && !ex) return;
    const title =
      type === 'lift'
        ? `${ex}: ${target} ${unit}`
        : type === 'bodyweight'
          ? `Reach ${target} ${unit}`
          : `${def.label}: ${target.toLocaleString()} ${unit}`;
    const g: FitnessGoal = {
      id: uid(),
      type,
      title,
      target,
      exercise: type === 'lift' ? ex : undefined,
      start: type === 'bodyweight' ? startWeight : type === 'lift' ? bestLift(ex) ?? 0 : undefined,
      deadline: deadline || undefined,
      createdAt: Date.now(),
    };
    await saveGoal(g);
    setTarget(undefined);
    setDeadline('');
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="New goal">
      <div className="space-y-4">
        <Field label="Goal type" group>
          <div className="grid grid-cols-2 gap-2">
            {GOAL_TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => setType(t.type)}
                className={`min-h-[48px] rounded-btn border px-3 text-left text-sm ${
                  type === t.type ? 'border-primary bg-primary font-medium text-primary-ink' : 'border-line bg-bg hover:bg-raised'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Field>
        {type === 'lift' && (
          <Field label="Exercise" hint={exercises.length ? undefined : 'Log a strength workout first.'}>
            <select value={ex} onChange={(e) => setExercise(e.target.value)} className={inputCls}>
              {exercises.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label={`Target (${unit})`}
          hint={type === 'bodyweight' && startWeight ? `Current: ${startWeight} ${unit}` : type === 'lift' && bestLift(ex) ? `Current best: ${bestLift(ex)} ${unit}` : def.hint}
        >
          <NumberInput value={target} step={type === 'bodyweight' || type === 'lift' ? 0.5 : 1} onChange={setTarget} placeholder="—" label="Target" />
        </Field>
        <Field label="Deadline (optional)">
          <input type="date" value={deadline} min={todayKey()} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
        </Field>
        <Button variant="primary" size="lg" className="w-full" onClick={create} disabled={!target}>
          Create goal
        </Button>
      </div>
    </Sheet>
  );
}
