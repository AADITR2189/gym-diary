import { Link } from 'react-router-dom';
import { Barbell, Heartbeat, CaretRight } from '@phosphor-icons/react';
import type { Session } from '../types';
import { useData } from '../hooks/useData';
import { fmtMinutes, fmtNum, sessionCardioMin, sessionDistance, sessionDuration, sessionVolume, workSets } from '../lib/stats';
import { relativeLabel } from '../lib/date';
import { groupName } from '../data/exercises';
import { IconBadge } from './ui';

export function sessionTitle(s: Session) {
  if (s.name) return s.name;
  if (s.kind === 'cardio') return s.cardio.map((c) => c.activity).join(', ') || 'Cardio';
  const groups = [...new Set(s.strength.map((e) => e.muscleGroup))];
  return groups.length ? groups.map(groupName).join(' · ') : 'Strength';
}

export default function SessionCard({ s, showDate = true }: { s: Session; showDate?: boolean }) {
  const { settings } = useData();
  const isCardio = s.kind === 'cardio';
  const sets = s.strength.reduce((a, e) => a + workSets(e.sets).length, 0);
  const dist = sessionDistance(s);
  const dur = sessionDuration(s);
  return (
    <Link
      to={`/session?id=${s.id}`}
      className="flex min-w-0 items-center gap-3 rounded-card border border-line bg-surface p-3.5 transition-shadow hover:shadow-lift active:scale-[0.995]"
    >
      <IconBadge tone={isCardio ? 'car' : 'str'}>{isCardio ? <Heartbeat size={20} weight="bold" /> : <Barbell size={20} weight="bold" />}</IconBadge>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{sessionTitle(s)}</div>
        <div className="truncate text-sm text-muted">
          {showDate && <>{relativeLabel(s.date)} · </>}
          {isCardio ? (
            <>
              {fmtMinutes(sessionCardioMin(s))}
              {dist > 0 && ` · ${fmtNum(dist, 1)} ${settings.distanceUnit}`}
            </>
          ) : (
            <>
              {s.strength.length} exercises · {sets} sets · {fmtNum(sessionVolume(s))} {settings.weightUnit}
              {dur ? ` · ${fmtMinutes(dur)}` : ''}
            </>
          )}
        </div>
      </div>
      <CaretRight size={16} weight="bold" className="shrink-0 text-muted" />
    </Link>
  );
}
