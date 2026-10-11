import { useMemo, useState } from 'react';
import { MuscleHeatCard } from '../components/HeatMapViews';
import { Link } from 'react-router-dom';
import { GearSix, UserCircle, CheckCircle, Circle, Barbell, Plus, Target, Drop, CaretRight, Fire, ChartLineUp } from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { Card, Empty, IconButton, PageHeader, Progress, SectionTitle, Stat } from '../components/ui';
import SessionCard from '../components/SessionCard';
import { fmtMinutes, fmtNum, inRange, streaks, summarize } from '../lib/stats';
import { formatLong, startOfMonth, startOfWeek, todayKey } from '../lib/date';
import { currentWeight, weightChange } from '../lib/body';
import { goalProgress, overallGoalCompletion } from '../lib/goals';
import WaterRing from '../components/WaterRing';
import GoalRing from '../components/GoalRing';
import CountUp from '../components/CountUp';
import { useHydration } from '../hooks/useHydration';
import { saveWaterLog, uid } from '../db/db';
import { fmtVolume } from '../lib/water';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const signed = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n), digits)}`;

export default function Dashboard() {
  const { ready, sessions, settings, profile, measurements, goals, water } = useData();
  const today = todayKey();
  const wu = settings.weightUnit;
  const du = settings.distanceUnit;

  const d = useMemo(() => {
    const todays = sessions.filter((s) => s.date === today);
    const week = summarize(sessions.filter((s) => inRange(s.date, startOfWeek(today, settings.weekStartsOn), today)));
    const month = summarize(sessions.filter((s) => inRange(s.date, startOfMonth(today), today)));
    const all = summarize(sessions);
    const active = goals.filter((g) => !g.archived);
    return {
      todays,
      week,
      month,
      all,
      streak: streaks(sessions),
      goalPct: overallGoalCompletion(active.map((g) => goalProgress(g, sessions, measurements, profile, settings, water))),
      goalCount: active.length,
      weekGoal: [...active].sort((a, b) => b.createdAt - a.createdAt).find((g) => g.type === 'weeklySessions')?.target,
    };
  }, [sessions, today, settings, goals, measurements, profile, water]);

  if (!ready) return <div className="p-8 text-center text-muted">Loading…</div>;

  const cw = currentWeight(measurements, profile);
  const wc = weightChange(measurements, profile);

  return (
    <div>
      <PageHeader
        sub={formatLong(today)}
        title={profile?.name ? `${greeting()}, ${profile.name.split(' ')[0]}` : 'Gym Diary'}
        right={
          <>
            <IconButton label="Profile" to="/profile">
              <UserCircle size={20} weight="bold" />
            </IconButton>
            <IconButton label="Settings and data" to="/settings">
              <GearSix size={20} weight="bold" />
            </IconButton>
          </>
        }
      />

      {/* Today */}
      <Card className={d.todays.length ? 'border-str/25 bg-str-soft' : ''}>
        <div className="flex items-center gap-3">
          {d.todays.length ? (
            <CheckCircle className="text-str" size={28} weight="fill" />
          ) : (
            <Circle className="text-muted" size={28} weight="bold" />
          )}
          <div className="flex-1">
            <div className="font-medium">{d.todays.length ? 'Trained today' : 'No workout logged today'}</div>
            <div className="text-sm text-muted">
              {d.todays.length
                ? `${d.todays.length} session${d.todays.length > 1 ? 's' : ''} logged`
                : d.streak.current
                  ? `Keep your ${d.streak.current}-day streak going`
                  : 'Rest day, or time to move?'}
            </div>
          </div>
          <Link to="/log" className="grid h-11 w-11 place-items-center rounded-btn bg-primary text-primary-ink" aria-label="Log workout">
            <Plus size={20} weight="bold" />
          </Link>
        </div>
        {d.todays.length > 0 && (
          <div className="mt-4 space-y-2">
            {d.todays.map((s) => (
              <SessionCard key={s.id} s={s} showDate={false} />
            ))}
          </div>
        )}
      </Card>

      {/* Weekly workout goal + water */}
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <WeekRingCard done={d.week.sessions} target={d.weekGoal ?? 4} hasGoal={d.weekGoal !== undefined} />
        <WaterCard />
      </div>

      {/* Muscle heat map */}
      <div className="mt-2">
        <MuscleHeatCard />
      </div>

      {/* Overview */}
      <SectionTitle>Overview</SectionTitle>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat index={0} label="Total workouts" value={d.all.sessions} sub={`${d.all.strength} strength · ${d.all.cardio} cardio`} />
        <Stat
          index={1}
          label="Streak"
          tone="gold"
          value={
            <span className="inline-flex items-center gap-1">
              {d.streak.current > 0 && <Fire size={24} weight="fill" className="anim-flicker" />}
              <CountUp value={d.streak.current} format={(n) => `${Math.round(n)}d`} />
            </span>
          }
          sub={`Longest ${d.streak.longest} days`}
        />
        <Stat index={2} label="Days this month" value={d.month.days} sub={`${d.month.sessions} sessions`} />
        <Stat index={3} label="Avg duration" value={d.all.avgDuration ? <CountUp value={d.all.avgDuration} format={fmtMinutes} /> : '—'} sub="per workout" />
        <Stat index={4} label="Total volume" tone="str" value={<CountUp value={d.all.volume} format={(n) => fmtNum(n)} />} sub={`${wu} lifted`} />
        <Stat
          index={5}
          label="Current weight"
          value={cw !== undefined ? fmtNum(cw, 1) : '—'}
          sub={cw !== undefined ? wu : <Link to="/profile" className="underline">Add weight</Link>}
        />
        <Stat
          index={6}
          label="Weight change"
          tone={wc === undefined || wc === 0 ? 'default' : 'gold'}
          value={wc !== undefined ? signed(wc) : '—'}
          sub={wc !== undefined ? `${wu} since start` : 'Log two weigh-ins'}
        />
        <Link to="/goals" className="contents">
          <Stat index={7} label="Goals" tone="str" value={d.goalPct !== undefined ? <CountUp value={d.goalPct} format={(n) => `${Math.round(n)}%`} /> : '—'} sub={d.goalCount ? `${d.goalCount} active goals` : 'Set a goal'} />
        </Link>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <Card index={1}>
          <div className="eyebrow">This week</div>
          <div className="num mt-3 grid grid-cols-3 gap-3">
            <Mini label="Sessions" value={<CountUp value={d.week.sessions} />} sub={`${d.week.days} days`} />
            <Mini label="Volume" value={<CountUp value={d.week.volume} format={(n) => fmtNum(n)} />} sub={wu} tone="text-str" />
            <Mini label="Cardio" value={fmtMinutes(d.week.cardioMin)} sub={d.week.distance ? `${fmtNum(d.week.distance, 1)} ${du}` : 'time'} tone="text-car" />
          </div>
        </Card>
        <Card index={2}>
          <div className="eyebrow">This month</div>
          <div className="num mt-3 grid grid-cols-3 gap-3">
            <Mini label="Sessions" value={<CountUp value={d.month.sessions} />} sub={`${d.month.strength} str · ${d.month.cardio} car`} />
            <Mini label="Volume" value={<CountUp value={d.month.volume} format={(n) => fmtNum(n)} />} sub={wu} tone="text-str" />
            <Mini label="Cardio" value={fmtMinutes(d.month.cardioMin)} sub={d.month.calories ? `${fmtNum(d.month.calories)} kcal` : 'time'} tone="text-car" />
          </div>
        </Card>
      </div>

      {sessions.length === 0 ? (
        <div className="mt-8">
          <Empty icon={<Barbell size={36} weight="bold" />} title="Your diary is empty">
            Tap the plus button to log your first workout. Forgot a day? You can pick any past date. Or load sample data from Settings to look around.
          </Empty>
        </div>
      ) : (
        <>
          <Link to="/progress" className="mt-2 block">
            <Card className="hover:bg-raised">
              <div className="flex items-center gap-3">
                <ChartLineUp size={22} weight="bold" className="text-str" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">All your stats</div>
                  <div className="text-sm text-muted">Yearly grid, weekly sets per muscle, strength and cardio charts, records</div>
                </div>
                <CaretRight size={16} weight="bold" className="text-muted" />
              </div>
            </Card>
          </Link>

          <SectionTitle
            action={
              <Link to="/history" className="text-sm text-muted underline-offset-4 hover:underline">
                See all
              </Link>
            }
          >
            Recent workouts
          </SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">
            {sessions.slice(0, 6).map((s) => (
              <SessionCard key={s.id} s={s} />
            ))}
          </div>
          {d.goalCount > 0 && d.goalPct !== undefined && (
            <Link to="/goals" className="mt-6 block">
              <Card>
                <div className="flex items-center gap-3">
                  <Target size={20} weight="bold" className="text-str" />
                  <span className="flex-1 font-medium">Goal completion</span>
                  <span className="num font-medium">{d.goalPct}%</span>
                </div>
                <div className="mt-3">
                  <Progress pct={d.goalPct} />
                </div>
              </Card>
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function Mini({ label, value, sub, tone = 'text-ink' }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className={`h-display truncate text-[28px] ${tone}`}>{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Home-screen water card: live ring + one-tap add of the smallest quick size. */
function WaterCard() {
  const { settings } = useData();
  const h = useHydration();
  const [flash, setFlash] = useState(false);
  const quick = h.sizes[0];
  return (
    <Card>
      <div className="flex items-center gap-4">
        <WaterRing ml={h.total} target={h.target} size={96} />
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Water today</div>
          <div className="num mt-1 font-medium">
            <span className="text-wat">{fmtVolume(h.total, settings.volumeUnit)}</span>
            <span className="text-muted"> / {fmtVolume(h.target, settings.volumeUnit)}</span>
          </div>
          <div className="text-xs text-muted">{h.remaining ? `${fmtVolume(h.remaining, settings.volumeUnit)} to go` : 'Target reached'}</div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                await saveWaterLog({ id: uid(), date: todayKey(), amountMl: quick, loggedAt: Date.now() });
                setFlash(true);
                setTimeout(() => setFlash(false), 1200);
              }}
              className="inline-flex h-9 items-center gap-1 rounded-btn bg-wat px-3 text-sm font-medium text-bg transition-transform active:scale-[0.96]"
              aria-label={`Add ${fmtVolume(quick, settings.volumeUnit)} of water`}
            >
              <Drop size={14} weight="fill" /> {flash ? 'Added' : `+${fmtVolume(quick, settings.volumeUnit, { short: true })}`}
            </button>
            <Link to="/water" className="inline-flex h-9 items-center gap-1 rounded-btn border border-line px-3 text-sm">
              More <CaretRight size={12} weight="bold" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Home-screen ring: workouts done this week vs the weekly goal (default 4 when no goal is set). */
function WeekRingCard({ done, target, hasGoal }: { done: number; target: number; hasGoal: boolean }) {
  const pct = target ? Math.round((done / target) * 100) : 0;
  const met = done >= target;
  return (
    <Card>
      <div className="flex items-center gap-4">
        <GoalRing pct={pct} size={96} tone={met ? 'gold' : 'str'} label={`${done} of ${target} workouts this week`}>
          <div className="leading-none">
            <div className="h-display text-[26px]">
              <CountUp value={done} />
              <span className="text-base text-muted">/{target}</span>
            </div>
          </div>
        </GoalRing>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Workouts this week</div>
          <div className="mt-1 font-medium">{met ? 'Weekly goal reached' : `${target - done} more to hit your goal`}</div>
          <div className="text-xs text-muted">{hasGoal ? 'From your weekly goal' : 'Default goal of 4 a week'}</div>
          <Link to="/goals" className="mt-2 inline-flex h-9 items-center gap-1 rounded-btn border border-line px-3 text-sm">
            {hasGoal ? 'Goals' : 'Set goal'} <CaretRight size={12} weight="bold" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
