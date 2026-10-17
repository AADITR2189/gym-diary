import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Drop, Fire, Trophy, CalendarCheck, ChartLineUp, Medal, Target, Scales, ArrowUpRight, ArrowDownRight } from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { Card, Chip, Empty, PageHeader, Progress as Bar, SectionTitle, Stat, inputCls, HeaderActions } from '../components/ui';
import { ChartCard, RankBars, TrendBars, TrendLine, WaterBars } from '../components/charts';
import WaterRing from '../components/WaterRing';
import CountUp from '../components/CountUp';
import { useHydration } from '../hooks/useHydration';
import { averageDaily, daysMet, fmtVolume, waterSeries, waterStreak } from '../lib/water';
import { exerciseProgression, exerciseUsage, fmtBest, fmtNum, inRange, monthlyTrend, streaks, strengthImprovement, summarize, volumeByMuscle } from '../lib/stats';
import { addDays, formatShort, startOfMonth, todayKey, fromKey } from '../lib/date';
import { currentWeight, weightChange } from '../lib/body';
import { goalProgress, overallGoalCompletion } from '../lib/goals';
import { groupName } from '../data/exercises';
import { AnnualTable, CardioCharts, StrengthCharts } from '../components/TrainingCharts';
import { WeeklyMuscleSets, YearGrid } from '../components/ProgressViews';

type Metric = 'maxWeight' | 'e1rm' | 'volume' | 'time';
type Tab = 'overview' | 'strength' | 'cardio';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'strength', label: 'Strength' },
  { id: 'cardio', label: 'Cardio' },
];

export default function Progress() {
  const { sessions, settings, records, measurements, profile, goals, water } = useData();
  const wu = settings.weightUnit;
  const today = todayKey();
  const [freqRange, setFreqRange] = useState<'30' | 'all'>('30');
  const [metric, setMetric] = useState<Metric>('maxWeight');
  const [prSort, setPrSort] = useState<'recent' | 'heaviest'>('heaviest');
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = tabParam === 'strength' || tabParam === 'cardio' ? tabParam : 'overview';
  // Content slides in from the side of the tab you moved to.
  const tabDir = useRef<1 | -1>(1);

  const usage = useMemo(() => exerciseUsage(sessions).sort((a, b) => b.count - a.count), [sessions]);
  const [exercise, setExercise] = useState<string>('');
  const ex = exercise || usage[0]?.exercise || '';

  const st = useMemo(() => streaks(sessions), [sessions]);
  const month = useMemo(() => summarize(sessions.filter((s) => inRange(s.date, startOfMonth(today), today))), [sessions, today]);
  const dayOfMonth = fromKey(today).getDate();
  const strongest = [...records].filter((p) => p.best1rm > 0).sort((a, b) => b.best1rm - a.best1rm).slice(0, 5);
  const prList = [...records].sort((a, b) => (prSort === 'heaviest' ? b.maxWeight - a.maxWeight : a.maxWeightDate < b.maxWeightDate ? 1 : -1));
  const freq = useMemo(
    () => volumeByMuscle(freqRange === '30' ? sessions.filter((s) => s.date >= addDays(today, -29)) : sessions),
    [sessions, freqRange, today],
  );
  const prog = useMemo(() => exerciseProgression(sessions, ex).map((r) => ({ ...r, label: formatShort(r.date) })), [sessions, ex]);
  const monthly = useMemo(() => monthlyTrend(sessions, 12), [sessions]);
  const improvement = useMemo(() => strengthImprovement(sessions).slice(0, 6), [sessions]);
  const bodyTrend = measurements.map((m) => ({ label: formatShort(m.date), weight: m.weight }));
  const cw = currentWeight(measurements, profile);
  const wc30 = weightChange(measurements, profile, 30);
  const active = goals.filter((g) => !g.archived);
  const goalRows = active.map((g) => ({ g, p: goalProgress(g, sessions, measurements, profile, settings, water) }));
  const goalPct = overallGoalCompletion(goalRows.map((r) => r.p));

  // Holds (plank, wall sit…) chart the longest hold instead of weight.
  const isHold = prog.some((r) => r.time > 0);
  const shown: Metric = isHold ? 'time' : metric === 'time' ? 'maxWeight' : metric;
  const first = prog[0]?.[shown] ?? 0;
  const last = prog[prog.length - 1]?.[shown] ?? 0;
  const change = first ? ((last - first) / first) * 100 : 0;

  if (!sessions.length && !measurements.length && !water.length)
    return (
      <div>
        <PageHeader title="Progress" right={<HeaderActions />} />
        <Empty icon={<ChartLineUp size={32} weight="bold" />} title="No data yet">
          Log a few workouts and your trends, streaks and records will show up here.
        </Empty>
      </div>
    );

  return (
    <div>
      <PageHeader title="Progress" sub="Consistency, records and trends" right={<HeaderActions />} />

      <div className="bar bar-top sticky top-0 z-20 -mx-4 mb-4 flex gap-1 px-4 py-2 pt-safe">
        {TABS.map((t) => (
          <Chip
            key={t.id}
            active={tab === t.id}
            onClick={() => {
              tabDir.current = TABS.findIndex((x) => x.id === t.id) >= TABS.findIndex((x) => x.id === tab) ? 1 : -1;
              setParams(t.id === 'overview' ? {} : { tab: t.id }, { replace: true });
            }}
            className="flex-1"
          >
            {t.label}
          </Chip>
        ))}
      </div>

      <div key={tab} className="anim-tab" style={{ ['--dir' as string]: tabDir.current }}>
      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat
              index={0}
              label="Consistency streak"
              tone="gold"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Fire size={22} weight="fill" className={st.current > 0 ? 'anim-flicker' : ''} />
                  <CountUp value={st.current} format={(n) => `${Math.round(n)}d`} />
                </span>
              }
              sub={`Longest ${st.longest} days`}
            />
            <Stat
              index={1}
              label="Days this month"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <CalendarCheck size={22} weight="bold" />
                  {month.days}
                </span>
              }
              sub={`of ${dayOfMonth} days so far`}
            />
            <Stat index={2} label="Body weight" value={cw !== undefined ? fmtNum(cw, 1) : '—'} sub={wc30 !== undefined ? `${wc30 >= 0 ? '+' : ''}${fmtNum(wc30, 1)} ${wu} in 30 days` : wu} />
            <Stat index={3} label="Goal completion" tone="str" value={goalPct !== undefined ? `${goalPct}%` : '—'} sub={`${active.length} active goals`} />
          </div>

          <div className="mt-2">
            <YearGrid />
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <ChartCard index={0} title="Active days per month" sub="Last 12 months">
              <TrendBars data={monthly} dataKey="activeDays" series="gold" unit="days" height={170} />
            </ChartCard>
            <ChartCard
              index={1}
              title="Body weight trend"
              sub={bodyTrend.length ? `${bodyTrend.length} weigh-ins, ${wu}` : 'No weigh-ins yet'}
              right={
                <Link to="/profile" className="text-sm text-muted underline-offset-4 hover:underline">
                  Log weight
                </Link>
              }
            >
              {bodyTrend.length > 1 ? (
                <TrendLine data={bodyTrend} dataKey="weight" series="ink" unit={wu} height={170} />
              ) : (
                <div className="flex h-[170px] flex-col items-center justify-center gap-2 text-center text-sm text-muted">
                  <Scales size={28} weight="bold" />
                  Log your weight on the Profile screen to see the trend.
                </div>
              )}
            </ChartCard>
          </div>

          {goalRows.length > 0 && (
            <>
              <SectionTitle
                action={
                  <Link to="/goals" className="text-sm text-muted underline-offset-4 hover:underline">
                    Manage
                  </Link>
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <Target size={12} weight="bold" /> Goals
                </span>
              </SectionTitle>
              <Card>
                <ul className="space-y-4">
                  {goalRows.map(({ g, p }) => (
                    <li key={g.id}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{g.title}</span>
                        <span className="num text-sm text-muted">{p.pct}%</span>
                      </div>
                      <div className="num mb-1.5 text-xs text-muted">{p.label}</div>
                      <Bar pct={p.pct} tone={p.done ? 'str' : 'gold'} />
                    </li>
                  ))}
                </ul>
              </Card>
        </>
      )}

      <HydrationProgress />

      <div className="mt-2">
        <AnnualTable />
      </div>
        </>
      )}

      {tab === 'cardio' && <CardioCharts />}

      {tab === 'strength' && (
        <>
          <WeeklyMuscleSets />

          <StrengthCharts />

          <SectionTitle>Exercise progression</SectionTitle>
          {usage.length ? (
            <ChartCard
              title={ex}
              sub={
                prog.length > 1 ? (
                  <span className={change >= 0 ? 'text-str' : 'text-danger'}>
                    {change >= 0 ? '+' : ''}
                    {change.toFixed(1)}% since {formatShort(prog[0].date)}
                  </span>
                ) : (
                  'Log this exercise again to see a trend'
                )
              }
            >
              <select value={ex} onChange={(e) => setExercise(e.target.value)} className={`${inputCls} mb-3`} aria-label="Exercise">
                {usage.map((u) => (
                  <option key={u.exercise} value={u.exercise}>
                    {u.exercise} ({u.count}x)
                  </option>
                ))}
              </select>
              {isHold ? (
                <p className="mb-3 text-xs text-muted">Longest hold per session, in seconds.</p>
              ) : (
                <div className="mb-3 flex gap-1">
                  <Chip active={shown === 'maxWeight'} onClick={() => setMetric('maxWeight')}>
                    Top weight
                  </Chip>
                  <Chip active={shown === 'e1rm'} onClick={() => setMetric('e1rm')}>
                    Est. 1RM
                  </Chip>
                  <Chip active={shown === 'volume'} onClick={() => setMetric('volume')}>
                    Volume
                  </Chip>
                </div>
              )}
              <TrendLine data={prog} dataKey={shown} series="strength" unit={isHold ? 's' : wu} />
            </ChartCard>
          ) : (
            <p className="text-sm text-muted">Log strength workouts to track progression.</p>
          )}

          {improvement.length > 0 && (
            <>
              <SectionTitle>Strength improvement</SectionTitle>
              <Card>
                <p className="mb-3 text-xs text-muted">Estimated 1RM: first session vs best of your last three.</p>
                <ul className="divide-y divide-line">
                  {improvement.map((r) => (
                    <li key={r.exercise} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate">{r.exercise}</span>
                      <span className="num text-sm text-muted">
                        {fmtNum(r.first, 1)} → {fmtNum(r.latest, 1)}
                      </span>
                      <span className={`num inline-flex w-20 items-center justify-end gap-0.5 font-medium ${r.change >= 0 ? 'text-str' : 'text-danger'}`}>
                        {r.change >= 0 ? <ArrowUpRight size={14} weight="bold" /> : <ArrowDownRight size={14} weight="bold" />}
                        {Math.abs(r.change).toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
        </>
      )}

      {strongest.length > 0 && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Medal size={12} weight="bold" /> Strongest lifts · estimated 1RM
            </span>
          </SectionTitle>
          <Card>
            <ol className="space-y-3">
              {strongest.map((p, i) => (
                <li key={p.exercise} className="flex items-center gap-3">
                  <span className={`num grid h-8 w-8 place-items-center rounded-btn font-mono text-xs ${i === 0 ? 'bg-gold-soft text-gold' : 'bg-raised text-muted'}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.exercise}</div>
                    <div className="text-xs text-muted">
                      {groupName(p.muscleGroup)} · {formatShort(p.best1rmDate)}
                    </div>
                  </div>
                  <span className="h-display num text-xl">
                    {fmtNum(p.best1rm, 1)} <span className="font-sans text-sm font-normal text-muted">{wu}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}

      <SectionTitle
        action={
          <div className="flex gap-1">
            <Chip active={freqRange === '30'} onClick={() => setFreqRange('30')}>
              30 days
            </Chip>
            <Chip active={freqRange === 'all'} onClick={() => setFreqRange('all')}>
              All
            </Chip>
          </div>
        }
      >
        Muscle group frequency
      </SectionTitle>
      <ChartCard title="Sessions per muscle group" sub="How often each group was trained">
        {freq.length ? (
          <RankBars data={[...freq].sort((a, b) => b.sessions - a.sessions).map((f) => ({ name: groupName(f.group), value: f.sessions }))} series="strength" unit="sessions" />
        ) : (
          <p className="text-sm text-muted">No strength sessions in this range.</p>
        )}
      </ChartCard>

      {prList.length > 0 && (
        <>
          <SectionTitle
            action={
              <div className="flex gap-1">
                <Chip active={prSort === 'heaviest'} onClick={() => setPrSort('heaviest')}>
                  Heaviest
                </Chip>
                <Chip active={prSort === 'recent'} onClick={() => setPrSort('recent')}>
                  Recent
                </Chip>
              </div>
            }
          >
            <span className="inline-flex items-center gap-1.5">
              <Trophy size={12} weight="bold" /> Personal bests
            </span>
          </SectionTitle>
          <Card className="p-0">
            <table className="num w-full text-sm">
              <thead>
                <tr className="eyebrow border-b border-line text-left">
                  <th className="px-4 py-3 font-normal">Exercise</th>
                  <th className="px-2 py-3 text-right font-normal">Best set</th>
                  <th className="px-4 py-3 text-right font-normal">e1RM</th>
                </tr>
              </thead>
              <tbody>
                {prList.map((p) => (
                  <tr key={p.exercise} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.exercise}</div>
                      <div className="text-xs text-muted">{formatShort(p.maxWeightDate || p.bestTimeDate || '')}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right">
                      {fmtBest(p, wu)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-str">{p.best1rm ? fmtNum(p.best1rm, 1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 px-1 text-xs text-muted">e1RM is the estimated one-rep max: weight × (1 + reps ÷ 30), the Epley formula.</p>
        </>
      )}
        </>
      )}
      </div>
    </div>
  );
}

function HydrationProgress() {
  const { water, sessions, profile, settings } = useData();
  const unit = settings.volumeUnit;
  const today = useHydration();
  const [range, setRange] = useState<7 | 30>(7);
  const todayK = todayKey();
  const series = useMemo(() => waterSeries(range, water, today.base, sessions, profile), [range, water, today.base, sessions, profile]);
  const streak = useMemo(() => waterStreak(water, today.base, sessions, profile), [water, today.base, sessions, profile]);
  const metMonth = useMemo(() => daysMet(startOfMonth(todayK), todayK, water, today.base, sessions, profile), [water, today.base, sessions, profile, todayK]);
  const avg = averageDaily(30, water);
  const dayOfMonth = fromKey(todayK).getDate();

  return (
    <>
      <SectionTitle
        action={
          <Link to="/water" className="text-sm text-muted underline-offset-4 hover:underline">
            Log water
          </Link>
        }
      >
        <span className="inline-flex items-center gap-1.5 text-wat">
          <Drop size={12} weight="fill" /> Hydration
        </span>
      </SectionTitle>
      <div className="grid gap-2 md:grid-cols-[auto_1fr]">
        <Card className="flex items-center gap-4">
          <WaterRing ml={today.total} target={today.target} size={110} />
          <div>
            <div className="eyebrow">Today</div>
            <div className="num mt-1 text-sm">
              <span className="font-medium text-wat">{fmtVolume(today.total, unit)}</span>
              <span className="text-muted"> of {fmtVolume(today.target, unit)}</span>
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-3 gap-2">
          <Stat index={0} label="Water streak" tone="wat" value={`${streak}d`} sub="target met" />
          <Stat index={1} label="Target met" value={metMonth} sub={`of ${dayOfMonth} days`} />
          <Stat
            index={2}
            label="Daily avg"
            value={avg ? (unit === 'oz' ? Math.round(avg / 29.5735) : (avg / 1000).toFixed(2)) : '—'}
            sub={`${unit === 'oz' ? 'fl oz' : 'litres'} a day, 30 days`}
          />
        </div>
      </div>
      <div className="mt-2">
        <ChartCard
          title="Daily water"
          sub="Bars: water drunk. Dashed line: that day's target"
          right={
            <div className="flex gap-1">
              <Chip active={range === 7} onClick={() => setRange(7)}>
                7 days
              </Chip>
              <Chip active={range === 30} onClick={() => setRange(30)}>
                30 days
              </Chip>
            </div>
          }
        >
          <WaterBars data={series} fmt={(ml) => fmtVolume(ml, unit)} />
        </ChartCard>
      </div>
    </>
  );
}
