import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { Chip, SectionTitle, Stat } from './ui';
import { ChartCard, RankBars, TrendBars, TrendLine } from './charts';
import CountUp from './CountUp';
import {
  annualSummary,
  cardioByCategory,
  cardioUsage,
  dailyVolume,
  exerciseProgression,
  exerciseUsage,
  fmtMinutes,
  fmtNum,
  inRange,
  monthlyTrend,
  summarize,
  volumeByMuscle,
  weeklyTrend,
} from '../lib/stats';
import { formatShort, startOfMonth, startOfWeek, todayKey } from '../lib/date';
import { groupName } from '../data/exercises';

const signed = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n), digits)}`;

function useTrend() {
  const [trend, setTrend] = useState<'week' | 'month'>('week');
  const toggle = (
    <div className="flex gap-1">
      <Chip active={trend === 'week'} onClick={() => setTrend('week')}>
        Weekly
      </Chip>
      <Chip active={trend === 'month'} onClick={() => setTrend('month')}>
        Monthly
      </Chip>
    </div>
  );
  return { trend, toggle, label: trend === 'week' ? 'Last 12 weeks' : 'Last 12 months' };
}

/** Strength charts (moved here from Home): volume trends, volume by muscle, progression, top exercises, recent PRs. */
export function StrengthCharts() {
  const { sessions, settings, records } = useData();
  const wu = settings.weightUnit;
  const { trend, toggle, label } = useTrend();
  const d = useMemo(() => {
    const usage = exerciseUsage(sessions).sort((a, b) => b.count - a.count);
    const topExercise = usage[0]?.exercise;
    return {
      weekly: weeklyTrend(sessions, 12, settings.weekStartsOn),
      monthly: monthlyTrend(sessions, 12),
      daily: dailyVolume(sessions, 30),
      muscles: volumeByMuscle(sessions),
      topEx: usage.slice(0, 5),
      topExercise,
      topProg: topExercise ? exerciseProgression(sessions, topExercise).map((r) => ({ ...r, label: formatShort(r.date) })) : [],
      prs: [...records].sort((a, b) => (a.maxWeightDate < b.maxWeightDate ? 1 : -1)).slice(0, 4),
    };
  }, [sessions, settings.weekStartsOn, records]);
  const trendData = trend === 'week' ? d.weekly : d.monthly;

  return (
    <>
      <SectionTitle action={toggle}>Volume</SectionTitle>
      <div className="grid gap-2 md:grid-cols-2">
        <ChartCard index={0} title={trend === 'week' ? 'Weekly volume' : 'Monthly volume'} sub={`${label}, ${wu}`}>
          <TrendBars data={trendData} dataKey="volume" series="strength" unit={wu} />
        </ChartCard>
        <ChartCard index={1} title="Volume lifted by day" sub={`Last 30 days, ${wu}`}>
          <TrendBars data={d.daily} dataKey="volume" series="strength" unit={wu} />
        </ChartCard>
        {d.muscles.length > 0 && (
          <ChartCard index={2} title="Volume by muscle group" sub={`All time, ${wu}`}>
            <RankBars data={d.muscles.map((m) => ({ name: groupName(m.group), value: m.volume }))} series="strength" unit={wu} />
          </ChartCard>
        )}
        {d.topProg.length > 0 && (
          <ChartCard index={3} title="Weight progression" sub={`${d.topExercise}, top set per session`}>
            <TrendLine data={d.topProg} dataKey="maxWeight" series="strength" unit={wu} />
          </ChartCard>
        )}
        {d.topEx.length > 0 && (
          <ChartCard index={4} title="Most performed exercises">
            <ol className="divide-y divide-line">
              {d.topEx.map((e, i) => (
                <li key={e.exercise} className="flex items-center gap-3 py-2.5">
                  <span className="num w-5 text-right font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1 truncate">{e.exercise}</span>
                  <span className="num text-sm text-muted">
                    {e.count}x · {e.sets} sets
                  </span>
                </li>
              ))}
            </ol>
          </ChartCard>
        )}
        {d.prs.length > 0 && (
          <ChartCard index={5} title="Recent records" sub="Newest personal bests">
            <ul className="divide-y divide-line">
              {d.prs.map((p) => (
                <li key={p.exercise} className="flex items-center gap-3 py-2.5">
                  <Trophy size={16} weight="fill" className="text-gold" />
                  <span className="flex-1 truncate">{p.exercise}</span>
                  <span className="num font-medium">
                    {fmtNum(p.maxWeight, 1)} {wu} <span className="text-muted">× {p.maxWeightReps}</span>
                  </span>
                </li>
              ))}
            </ul>
          </ChartCard>
        )}
      </div>
    </>
  );
}

/** Totals per calendar year with the change in volume vs the year before. */
export function AnnualTable() {
  const { sessions } = useData();
  const annual = useMemo(() => annualSummary(sessions), [sessions]);
  if (!annual.length) return null;
  return (
    <ChartCard title="Annual progress" sub="Totals per calendar year">
      <div className="-mx-1 overflow-x-auto">
        <table className="num w-full text-sm">
          <thead>
            <tr className="eyebrow text-left">
              <th className="px-1 py-2 font-normal">Year</th>
              <th className="px-1 py-2 text-right font-normal">Workouts</th>
              <th className="px-1 py-2 text-right font-normal">Days</th>
              <th className="px-1 py-2 text-right font-normal">Volume</th>
              <th className="px-1 py-2 text-right font-normal">Cardio</th>
            </tr>
          </thead>
          <tbody>
            {annual.map((y) => (
              <tr key={y.year} className="border-t border-line">
                <td className="px-1 py-2.5 font-medium">{y.year}</td>
                <td className="px-1 py-2.5 text-right">{y.sessions}</td>
                <td className="px-1 py-2.5 text-right">{y.days}</td>
                <td className="px-1 py-2.5 text-right">
                  {fmtNum(y.volume)}
                  {y.volumeChange !== null && <span className={`ml-1 text-xs ${y.volumeChange >= 0 ? 'text-str' : 'text-danger'}`}>{signed(y.volumeChange, 0)}%</span>}
                </td>
                <td className="px-1 py-2.5 text-right">{fmtMinutes(y.cardioMin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

/** Cardio totals and charts (moved here from Home). */
export function CardioCharts() {
  const { sessions, settings, categoryOf } = useData();
  const du = settings.distanceUnit;
  const today = todayKey();
  const { trend, toggle, label } = useTrend();
  const d = useMemo(
    () => ({
      all: summarize(sessions),
      week: summarize(sessions.filter((s) => inRange(s.date, startOfWeek(today, settings.weekStartsOn), today))),
      month: summarize(sessions.filter((s) => inRange(s.date, startOfMonth(today), today))),
      weekly: weeklyTrend(sessions, 12, settings.weekStartsOn),
      monthly: monthlyTrend(sessions, 12),
      cardio: cardioUsage(sessions),
      types: cardioByCategory(sessions, categoryOf),
    }),
    [sessions, settings.weekStartsOn, categoryOf, today],
  );
  const trendData = trend === 'week' ? d.weekly : d.monthly;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat index={0} label="Total" tone="car" value={<CountUp value={d.all.cardioMin} format={fmtMinutes} />} sub={`${d.all.cardio} sessions`} />
        <Stat index={1} label="This week" value={fmtMinutes(d.week.cardioMin)} />
        <Stat index={2} label="This month" value={fmtMinutes(d.month.cardioMin)} />
      </div>
      {d.cardio.length > 0 ? (
        <>
          <SectionTitle action={toggle}>Trends</SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">
            <ChartCard index={0} title={trend === 'week' ? 'Weekly cardio' : 'Monthly cardio'} sub={`${label}, minutes`}>
              <TrendBars data={trendData} dataKey="cardioMin" series="cardio" unit="min" />
            </ChartCard>
            <ChartCard index={1} title="Cardio by type" sub="All time, minutes">
              <RankBars data={d.types.map((c) => ({ name: c.category, value: c.minutes }))} series="cardio" unit="min" />
            </ChartCard>
            <ChartCard index={2} title="Activity breakdown" sub="Top activities, minutes">
              <RankBars data={d.cardio.slice(0, 8).map((c) => ({ name: c.activity, value: c.minutes }))} series="cardio" unit="min" />
            </ChartCard>
            {d.all.distance > 0 && (
              <ChartCard index={3} title="Distance trend" sub={`${du} per ${trend}`}>
                <TrendLine data={trendData} dataKey="distance" series="cardio" unit={du} />
              </ChartCard>
            )}
            {d.all.calories > 0 && (
              <ChartCard index={4} title="Calories burned" sub={`kcal per ${trend}`}>
                <TrendBars data={trendData} dataKey="calories" series="rose" unit="kcal" />
              </ChartCard>
            )}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted">
          No cardio logged yet. <Link to="/log/edit?kind=cardio" className="underline">Log a cardio session</Link>
        </p>
      )}
    </>
  );
}
