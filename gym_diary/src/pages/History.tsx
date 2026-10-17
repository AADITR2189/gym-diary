import { useMemo, useState } from 'react';
import { MagnifyingGlass, ListChecks } from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { Chip, Empty, PageHeader, Stat, inputCls, HeaderActions } from '../components/ui';
import SessionCard from '../components/SessionCard';
import { addDays, formatLong, startOfMonth, todayKey } from '../lib/date';
import { fmtMinutes, fmtNum, inRange, summarize } from '../lib/stats';
import { MUSCLE_GROUPS, type MuscleGroup } from '../types';

type Preset = '7d' | '30d' | 'month' | '90d' | 'all' | 'custom';

export default function History() {
  const { sessions, settings } = useData();
  const today = todayKey();
  const [preset, setPreset] = useState<Preset>('all');
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState<'all' | 'strength' | 'cardio'>('all');
  const [group, setGroup] = useState<MuscleGroup | ''>('');
  const [q, setQ] = useState('');

  const range = useMemo((): [string | undefined, string | undefined] => {
    switch (preset) {
      case '7d': return [addDays(today, -6), today];
      case '30d': return [addDays(today, -29), today];
      case '90d': return [addDays(today, -89), today];
      case 'month': return [startOfMonth(today), today];
      case 'custom': return [from, to];
      default: return [undefined, undefined];
    }
  }, [preset, from, to, today]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return sessions.filter((s) => {
      if (!inRange(s.date, range[0], range[1])) return false;
      if (kind !== 'all' && s.kind !== kind) return false;
      if (group && !s.strength.some((e) => e.muscleGroup === group)) return false;
      if (query) {
        const hay = [s.name, s.notes, ...s.strength.map((e) => `${e.exercise} ${e.notes ?? ''}`), ...s.cardio.map((c) => `${c.activity} ${c.notes ?? ''}`)]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [sessions, range, kind, group, q]);

  const sum = summarize(filtered);
  const grouped = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const s of filtered) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return [...m.entries()];
  }, [filtered]);

  const presets: { id: Preset; label: string }[] = [
    { id: 'all', label: 'All time' },
    { id: '7d', label: '7 days' },
    { id: '30d', label: '30 days' },
    { id: 'month', label: 'This month' },
    { id: '90d', label: '90 days' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div>
      <PageHeader title="History" sub={`${sessions.length} workouts logged`} right={<HeaderActions />} />
      <div className="relative">
        <MagnifyingGlass size={18} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercise, activity or notes" className={`${inputCls} pl-10`} />
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {presets.map((p) => (
          <Chip key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</Chip>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} mt-1`} /></label>
          <label className="text-xs text-muted">To<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-1`} /></label>
        </div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputCls}>
          <option value="all">All types</option>
          <option value="strength">Strength only</option>
          <option value="cardio">Cardio only</option>
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value as MuscleGroup | '')} className={inputCls}>
          <option value="">All muscles</option>
          {MUSCLE_GROUPS.map((g) => <option key={g} value={g}>{g[0] + g.slice(1).toLowerCase()}</option>)}
        </select>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Sessions" value={sum.sessions} sub={`${sum.days} days`} />
        <Stat label="Volume" tone="str" value={fmtNum(sum.volume)} sub={settings.weightUnit} />
        <Stat label="Cardio" tone="car" value={fmtMinutes(sum.cardioMin)} />
      </div>

      <div className="mt-4 space-y-4">
        {grouped.map(([date, list]) => (
          <div key={date}>
            <div className="mb-2 px-1 eyebrow">{formatLong(date)}</div>
            <div className="space-y-2">{list.map((s) => <SessionCard key={s.id} s={s} showDate={false} />)}</div>
          </div>
        ))}
        {!grouped.length && <Empty icon={<ListChecks size={32} weight="bold" />} title="No workouts match">Try a wider date range or clear the filters.</Empty>}
      </div>
    </div>
  );
}
