import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SwipePager, { type SwipePagerHandle } from '../components/SwipePager';
import { CaretLeft, CaretRight, Plus, Barbell, Heartbeat, Drop } from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { baseTargetMl, fmtVolume, targetForDate, totalsByDate } from '../lib/water';
import { Card, Empty, PageHeader, Stat, HeaderActions } from '../components/ui';
import SessionCard, { sessionTitle } from '../components/SessionCard';
import { daysInMonth, formatLong, formatMonth, toKey, todayKey } from '../lib/date';
import { fmtMinutes, fmtNum, sessionCardioMin, sessionVolume, summarize } from '../lib/stats';
import type { Session } from '../types';

export default function CalendarPage() {
  const { sessions, settings, water, profile, measurements } = useData();
  const waterBase = baseTargetMl(profile, measurements, settings);
  const waterTotals = useMemo(() => totalsByDate(water), [water]);
  const waterMet = (k: string) => (waterTotals.get(k) ?? 0) >= targetForDate(k, waterBase, sessions, profile);
  const [params, setParams] = useSearchParams();
  const pager = useRef<SwipePagerHandle>(null);
  const today = todayKey();
  const selected = params.get('d') ?? today;
  const [cursor, setCursor] = useState(() => {
    const [y, m] = selected.split('-').map(Number);
    return { y, m: m - 1 };
  });

  const byDate = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of sessions) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [sessions]);

  const ws = settings.weekStartsOn;
  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() - ws + 7) % 7;
  const total = daysInMonth(cursor.y, cursor.m);
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: total }, (_, i) => toKey(new Date(cursor.y, cursor.m, i + 1))),
  ];
  while (cells.length % 7) cells.push(null);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const heads = [...dow.slice(ws), ...dow.slice(0, ws)];

  const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
  const monthSummary = summarize(sessions.filter((s) => s.date.startsWith(monthPrefix)));
  const pastDays = cells.filter((c): c is string => !!c && c <= today).length;

  const move = (n: number) => {
    const d = new Date(cursor.y, cursor.m + n, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  const daySessions = byDate.get(selected) ?? [];

  const tip = (k: string) =>
    (byDate.get(k) ?? [])
      .map((s) =>
        s.kind === 'cardio'
          ? `${sessionTitle(s)} — ${fmtMinutes(sessionCardioMin(s))}`
          : `${sessionTitle(s)} — ${fmtNum(sessionVolume(s))} ${settings.weightUnit}`,
      )
      .join('\n');

  return (
    <div>
      <PageHeader title="Calendar" sub="Tap a day, or swipe to change month" right={<HeaderActions />} />

      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <button onClick={() => pager.current?.slide(-1)} className="grid h-11 w-11 place-items-center rounded-btn bg-raised" aria-label="Previous month">
            <CaretLeft size={18} weight="bold" />
          </button>
          <div className="h-title text-2xl">{formatMonth(`${monthPrefix}-01`)}</div>
          <button onClick={() => pager.current?.slide(1)} className="grid h-11 w-11 place-items-center rounded-btn bg-raised" aria-label="Next month">
            <CaretRight size={18} weight="bold" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[0.6875rem] font-medium text-muted">
          {heads.map((h) => (
            <div key={h} className="py-1">
              {h}
            </div>
          ))}
        </div>
        {/* Swipe left/right to change month. */}
        <SwipePager ref={pager} onPage={(d) => move(d)}>
        <div className="grid grid-cols-7 gap-1">
          {(() => {
            return cells.map((k, i) => {
            if (!k) return <div key={i} />;
            const list = byDate.get(k) ?? [];
            const hasS = list.some((s) => s.kind === 'strength');
            const hasC = list.some((s) => s.kind === 'cardio');
            const hasW = waterMet(k);
            const isSel = k === selected;
            const isToday = k === today;
            const future = k > today;
            return (
              <button
                key={k}
                title={tip(k) || undefined}
                onClick={() => setParams({ d: k }, { replace: true })}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-btn text-sm transition-colors ${
                  isSel
                    ? 'bg-primary text-primary-ink font-semibold'
                    : list.length
                      ? hasS
                        ? 'bg-str-soft text-str font-semibold'
                        : 'bg-car-soft text-car font-semibold'
                      : future
                        ? 'text-muted/40'
                        : 'text-ink hover:bg-raised'
                } ${isToday && !isSel ? 'ring-1 ring-ink/50' : ''}`}
              >
                {Number(k.slice(8))}
                {(list.length > 0 || hasW) && (
                  <span className="absolute bottom-1 flex gap-0.5">
                    {hasS && <span className="h-1.5 w-1.5 rounded-full bg-str" />}
                    {hasC && <span className="h-1.5 w-1.5 rounded-full bg-car" />}
                    {hasW && <span className={`h-1.5 w-1.5 rounded-full ${isSel ? 'bg-primary-ink' : 'bg-wat'}`} />}
                  </span>
                )}
              </button>
            );
            });
          })()}
        </div>
        </SwipePager>
        <div className="mt-3 flex items-center justify-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-str" /> Strength</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-car" /> Cardio</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-wat" /> Water goal</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full ring-1 ring-ink/50" /> Today</span>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Days trained" value={`${monthSummary.days}`} sub={pastDays ? `of ${pastDays} so far` : undefined} />
        <Stat label="Strength" tone="str" value={monthSummary.strength} sub="sessions" />
        <Stat label="Cardio" tone="car" value={monthSummary.cardio} sub={fmtMinutes(monthSummary.cardioMin)} />
      </div>

      <div className="mb-2 mt-6 flex items-center justify-between px-1">
        <h2 className="h-title text-2xl">{formatLong(selected)}</h2>
      </div>
      {daySessions.length ? (
        <div className="space-y-2">
          {daySessions.map((s) => (
            <SessionCard key={s.id} s={s} showDate={false} />
          ))}
        </div>
      ) : (
        <Empty title={selected > today ? 'This day is in the future' : 'Nothing logged'}>
          {selected <= today && 'Missed logging this day? Add it now.'}
        </Empty>
      )}
      {selected <= today && (
        <Link
          to={`/water?date=${selected}`}
          className="mt-2 flex items-center gap-3 rounded-card border border-wat/20 bg-wat-soft px-4 py-3 text-wat"
        >
          <Drop size={18} weight="fill" />
          <span className="num flex-1 text-sm font-medium">
            Water: {fmtVolume(waterTotals.get(selected) ?? 0, settings.volumeUnit)} of{' '}
            {fmtVolume(targetForDate(selected, waterBase, sessions, profile), settings.volumeUnit)}
          </span>
          <span className="text-sm underline underline-offset-4">{(waterTotals.get(selected) ?? 0) ? 'Edit' : 'Add'}</span>
        </Link>
      )}
      {selected <= today && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link to={`/log/edit?kind=strength&date=${selected}`} className="flex h-12 items-center justify-center gap-2 rounded-btn border border-str/20 bg-str-soft font-medium text-str">
            <Plus size={16} weight="bold" /> <Barbell size={18} weight="bold" /> Strength
          </Link>
          <Link to={`/log/edit?kind=cardio&date=${selected}`} className="flex h-12 items-center justify-center gap-2 rounded-btn border border-car/20 bg-car-soft font-medium text-car">
            <Plus size={16} weight="bold" /> <Heartbeat size={18} weight="bold" /> Cardio
          </Link>
        </div>
      )}
    </div>
  );
}
