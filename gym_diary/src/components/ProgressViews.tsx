import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { Card, Chip, SectionTitle } from './ui';
import { REGIONS } from '../data/muscles';
import { fromKey } from '../lib/date';
import { prefsFrom } from '../lib/templates';
import { WEEKLY_SET_MAX, WEEKLY_SET_TARGET, regionSets, weekRange, yearGrid } from '../lib/training';

const STR_LEVEL = ['', 'bg-str/25', 'bg-str/50', 'bg-str/75', 'bg-str'];
const CAR_LEVEL = ['', 'bg-car/25', 'bg-car/50', 'bg-car/75', 'bg-car'];

/** GitHub-style grid: one square per day for the last year, darker = a bigger training day. Tap a day to open it. */
export function YearGrid() {
  const { sessions, settings } = useData();
  const nav = useNavigate();
  const weeks = useMemo(() => yearGrid(sessions, settings.weekStartsOn), [sessions, settings.weekStartsOn]);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Start scrolled to the current week on narrow screens.
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [weeks]);
  const days = weeks.flat().filter((d) => d.sessions > 0 && !d.future).length;
  const dayNames = settings.weekStartsOn === 1 ? ['Mon', '', 'Wed', '', 'Fri', '', ''] : ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="h-title text-lg">Your training year</div>
          <div className="text-xs text-muted">Last 12 months · darker = bigger day · tap a day to open it</div>
        </div>
        <div className="num shrink-0 text-right">
          <span className="h-display text-2xl">{days}</span>
          <span className="text-sm text-muted"> days</span>
        </div>
      </div>
      <div ref={scroller} className="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
        <div className="inline-grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: 'auto repeat(7, 12px)' }}>
          <div />
          {dayNames.map((n, i) => (
            <div key={i} className="pr-1 font-mono text-[9px] leading-[12px] text-muted">
              {n}
            </div>
          ))}
          {weeks.map((col, w) => {
            const first = fromKey(col[0].date);
            const newMonth = w === 0 || fromKey(weeks[w - 1][0].date).getMonth() !== first.getMonth();
            return [
              <div key={`m${w}`} className="h-3 whitespace-nowrap font-mono text-[9px] leading-3 text-muted">
                {newMonth && w < weeks.length - 2 ? first.toLocaleDateString(undefined, { month: 'short' }) : ''}
              </div>,
              ...col.map((d) => {
                const tone = d.level ? (d.strength ? STR_LEVEL : CAR_LEVEL)[d.level] : 'bg-raised';
                const label = `${fromKey(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}: ${
                  d.sessions ? `${d.sessions} workout${d.sessions > 1 ? 's' : ''}` : 'rest day'
                }`;
                return d.future ? (
                  <div key={d.date} className="h-3 w-3" />
                ) : (
                  <button
                    key={d.date}
                    title={label}
                    aria-label={label}
                    onClick={() => nav(`/calendar?d=${d.date}`)}
                    className={`h-3 w-3 rounded-[3px] ${tone} ${d.strength && d.cardio ? 'ring-1 ring-car ring-offset-0' : ''}`}
                  />
                );
              }),
            ];
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-str" /> Strength
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-car" /> Cardio only
        </span>
        <span className="inline-flex items-center gap-1">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`h-3 w-3 rounded-[3px] ${l ? STR_LEVEL[l] : 'bg-raised'}`} />
          ))}
          More
        </span>
      </div>
    </Card>
  );
}

/** Working sets per muscle this week (or last) against a weekly target that depends on training level. */
export function WeeklyMuscleSets() {
  const { sessions, settings, profile } = useData();
  const [offset, setOffset] = useState<0 | 1>(0);
  const level = prefsFrom(profile).level;
  const target = WEEKLY_SET_TARGET[level];
  const rows = useMemo(() => {
    const { from, to } = weekRange(offset, settings.weekStartsOn);
    const sets = regionSets(sessions, from, to);
    return REGIONS.map((r) => ({ id: r.id, name: r.name, sets: sets[r.id] })).sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
  }, [sessions, settings.weekStartsOn, offset]);
  const hit = rows.filter((r) => r.sets >= target).length;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <>
      <SectionTitle
        action={
          <div className="flex gap-1">
            <Chip active={offset === 0} onClick={() => setOffset(0)}>
              This week
            </Chip>
            <Chip active={offset === 1} onClick={() => setOffset(1)}>
              Last week
            </Chip>
          </div>
        }
      >
        Weekly sets per muscle
      </SectionTitle>
      <Card>
        <p className="text-sm">
          <b className="num">{hit}</b> of {rows.length} muscles reached <b className="num">{target}</b> sets
        </p>
        <p className="mt-1 text-xs text-muted">
          Target for your level ({level}): {target}–{WEEKLY_SET_MAX} working sets a week. A set counts fully for the main muscle and half for helpers. Warm-ups don't count.
        </p>
        <ul className="mt-4 space-y-2.5">
          {rows.map((r) => {
            const tone = r.sets > WEEKLY_SET_MAX ? 'bg-danger' : r.sets >= target ? 'bg-str' : r.sets > 0 ? 'bg-gold' : 'bg-raised';
            const status = r.sets > WEEKLY_SET_MAX ? 'A lot' : r.sets >= target ? 'On target' : r.sets > 0 ? `${fmt(target - r.sets)} to go` : 'Not trained';
            return (
              <li key={r.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{r.name}</span>
                  <span className="num text-muted">
                    <span className="font-medium text-ink">{fmt(r.sets)}</span> / {target} · {status}
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
                  <div className={`h-full rounded-full ${tone} transition-[width] duration-700`} style={{ width: `${Math.min(100, (r.sets / WEEKLY_SET_MAX) * 100)}%` }} />
                  <div className="absolute inset-y-0 w-px bg-ink/50" style={{ left: `${(target / WEEKLY_SET_MAX) * 100}%` }} aria-hidden />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">The thin line marks your target. Bars fill up to {WEEKLY_SET_MAX} sets.</p>
      </Card>
    </>
  );
}
