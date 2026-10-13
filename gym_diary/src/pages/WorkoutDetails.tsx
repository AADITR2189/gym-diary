import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CaretDown, Heartbeat, PencilSimple, Trophy, NotePencil } from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { Card, Empty, IconButton, PageHeader, SectionTitle, Stat, Tag } from '../components/ui';
import BodyMap from '../components/BodyMap';
import { HeatLegend, MuscleList, RegionInfo } from '../components/HeatMapViews';
import { sessionTitle } from '../components/SessionCard';
import { groupName } from '../data/exercises';
import { EQUIPMENT_LABEL, exerciseMeta, regionInfo, type Region } from '../data/muscles';
import { formatLong } from '../lib/date';
import { entryVolume, fmtMinutes, fmtNum, personalRecords, sessionCardioMin, sessionDuration, sessionVolume, setLabels, workSets, fmtSec } from '../lib/stats';
import { bodyWeightFor, exerciseIntensity, intensities, regionStats, sessionsLoads, sessionsSetLoads } from '../lib/heatmap';
import type { StrengthEntry } from '../types';

/** Summary screen for one past workout: stats, PRs, muscle map and every exercise. */
export default function WorkoutDetails() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { ready, sessions, settings, measurements, profile } = useData();
  const s = sessions.find((x) => x.id === params.get('id'));
  const [selected, setSelected] = useState<Region | null>(null);
  const bw = bodyWeightFor(measurements, profile, settings);

  const { stats, values, bySets } = useMemo(() => {
    let loads = sessionsLoads(s ? [s] : [], bw);
    // No weights logged (e.g. all 0 kg): fall back to counting sets so the map still shows what was worked.
    const bySets = !Object.values(loads).some((v) => v > 0);
    if (bySets) loads = sessionsSetLoads(s ? [s] : []);
    return { stats: regionStats(loads), values: intensities(loads), bySets };
  }, [s, bw]);
  const fmtSets = bySets ? (n: number) => `${fmtNum(n, 1)} sets` : undefined;

  // PRs: best set beats everything logged before this workout.
  const prs = useMemo(() => {
    if (!s) return new Set<string>();
    const before = sessions.filter((x) => x.id !== s.id && (x.date < s.date || (x.date === s.date && x.createdAt < s.createdAt)));
    const best = new Map(personalRecords(before).map((p) => [p.exercise, p]));
    const out = new Set<string>();
    for (const e of s.strength) {
      const top = e.sets.reduce((m, x) => (x.reps > 0 && x.type !== 'warmup' && x.weight > m ? x.weight : m), 0);
      const prev = best.get(e.exercise);
      if (top > 0 && (!prev || top > prev.maxWeight)) out.add(e.exercise);
    }
    return out;
  }, [s, sessions]);

  const back = () => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav('/history'));

  if (!ready) return <div className="p-8 text-center text-muted">Loading…</div>;
  if (!s)
    return (
      <div className="pt-10">
        <Empty title="Workout not found">It may have been deleted.</Empty>
        <div className="mt-4 text-center">
          <Link to="/history" className="font-medium text-str">
            Go to history
          </Link>
        </div>
      </div>
    );

  const unit = settings.weightUnit;
  const isCardio = s.kind === 'cardio';
  const sets = s.strength.reduce((a, e) => a + workSets(e.sets).length, 0);
  const dur = sessionDuration(s);

  return (
    <div>
      <PageHeader
        title={sessionTitle(s)}
        sub={formatLong(s.date)}
        right={
          <>
            <IconButton label="Back" onClick={back}>
              <ArrowLeft size={20} weight="bold" />
            </IconButton>
            <IconButton label="Edit workout" to={`/log/edit?id=${s.id}`}>
              <PencilSimple size={20} weight="bold" />
            </IconButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isCardio ? (
          <>
            <Stat label="Time" value={fmtMinutes(sessionCardioMin(s))} tone="car" index={0} />
            <Stat label="Activities" value={s.cardio.length} index={1} />
          </>
        ) : (
          <>
            <Stat label="Volume" value={<>{fmtNum(sessionVolume(s))}</>} sub={unit} tone="str" index={0} />
            <Stat label="Sets" value={sets} sub={`${s.strength.length} exercises`} index={1} />
            <Stat label="PRs" value={prs.size} tone="gold" index={2} />
            <Stat label="Duration" value={dur ? fmtMinutes(dur) : '—'} index={3} />
          </>
        )}
      </div>

      {!isCardio && (
        <>
          <SectionTitle>Muscles worked</SectionTitle>
          <Card>
            <div className="grid items-start gap-5 sm:grid-cols-[auto_1fr]">
              <div className="flex flex-col items-center">
                <BodyMap values={values} mode="mono" view="auto" width={118} selected={selected} onSelect={(r) => setSelected((x) => (x === r ? null : r))} />
                <div className="mt-3 w-full max-w-[260px]">
                  <HeatLegend mode="mono" />
                </div>
              </div>
              <div className="min-w-0">
                <div className="mb-3 rounded-btn bg-raised px-3 py-2">
                  <RegionInfo stat={stats.find((x) => x.region === selected)} unit={unit} format={fmtSets} />
                </div>
                <MuscleList stats={stats} mode="mono" unit={unit} format={fmtSets} selected={selected} onSelect={(r) => setSelected((x) => (x === r ? null : r))} />
                {bySets && <p className="mt-2 px-2 text-[11px] text-muted">No weights logged, so this counts sets (helper muscles count as half).</p>}
              </div>
            </div>
          </Card>
        </>
      )}

      <SectionTitle>{isCardio ? 'Activities' : 'Exercises'}</SectionTitle>
      <div className="space-y-2">
        {s.strength.map((e) => (
          <ExerciseRow key={e.id} e={e} unit={unit} pr={prs.has(e.exercise)} />
        ))}
        {s.cardio.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-car-soft text-car">
              <Heartbeat size={20} weight="bold" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.activity}</div>
              <div className="num truncate text-sm text-muted">
                {fmtMinutes(c.durationMin)}
                {c.distance ? ` · ${fmtNum(c.distance, 1)} ${settings.distanceUnit}` : ''}
                {c.calories ? ` · ${c.calories} kcal` : ''}
                {c.avgHeartRate ? ` · ${c.avgHeartRate} bpm` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>

      {s.notes && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <NotePencil size={12} weight="bold" /> Notes
            </span>
          </SectionTitle>
          <Card className="whitespace-pre-wrap text-sm">{s.notes}</Card>
        </>
      )}

      <Link
        to={`/log/edit?id=${s.id}`}
        className="mt-8 flex h-12 items-center justify-center gap-2 rounded-btn border border-line bg-surface font-medium hover:bg-raised"
      >
        <PencilSimple size={18} weight="bold" /> Edit workout
      </Link>
    </div>
  );
}

function ExerciseRow({ e, unit, pr }: { e: StrengthEntry; unit: string; pr: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = exerciseMeta(e.exercise, e.muscleGroup);
  const top = Math.max(0, ...e.sets.filter((x) => x.type !== 'warmup').map((x) => x.weight));
  const labels = setLabels(e.sets);
  return (
    <div className="rounded-card border border-line bg-surface">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-3.5 text-left" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{e.exercise}</span>
            {pr && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-medium uppercase text-gold">
                <Trophy size={11} weight="fill" /> PR
              </span>
            )}
          </div>
          <div className="num truncate text-sm text-muted">
            {e.sets.length} sets
            {e.timed
              ? ` · longest ${fmtSec(Math.max(0, ...e.sets.map((x) => x.sec || 0)))}`
              : `${top > 0 ? ` · top ${e.bw !== undefined ? 'BW + ' : ''}${top} ${unit}` : ''} · ${fmtNum(entryVolume(e))} ${unit}`}
          </div>
        </div>
        <CaretDown size={16} weight="bold" className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="anim-fade flex gap-4 border-t border-line p-3.5">
          <BodyMap values={exerciseIntensity(e.exercise, e.muscleGroup)} mode="mono" view="auto" width={52} compact />
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex flex-wrap gap-1.5">
              <Tag>{groupName(e.muscleGroup)}</Tag>
              {meta.known && <Tag tone="str">{EQUIPMENT_LABEL[meta.equipment]}</Tag>}
              {e.superset && <Tag tone="car">Superset</Tag>}
            </div>
            <div className="mt-2 text-xs text-muted">
              Main: {meta.primary.map((r) => regionInfo(r).name).join(', ')}
              {meta.secondary.length > 0 && <> · Helpers: {meta.secondary.map((r) => regionInfo(r).name).join(', ')}</>}
            </div>
            <table className="num mt-2 w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 font-normal">Set</th>
                  <th className="py-1 font-normal">Weight</th>
                  <th className="py-1 font-normal">{e.timed ? 'Time' : 'Reps'}</th>
                </tr>
              </thead>
              <tbody>
                {e.sets.map((x, i) => (
                  <tr key={i} className={`border-t border-line ${x.type === 'warmup' ? 'text-muted' : ''}`}>
                    <td className="py-1">{labels[i]}</td>
                    <td className="py-1">
                      {e.bw !== undefined ? `BW${x.weight ? ` + ${x.weight} ${unit}` : ''}` : `${x.weight} ${unit}`}
                    </td>
                    <td className="py-1">{e.timed ? fmtSec(x.sec || 0) : x.reps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
