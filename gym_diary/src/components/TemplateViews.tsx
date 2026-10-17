import { Link } from 'react-router-dom';
import { Clock, Heartbeat, Play, Star, Barbell } from '@phosphor-icons/react';
import BodyMap from './BodyMap';
import { Sheet, Tag } from './ui';
import { useData } from '../hooks/useData';
import { regionInfo } from '../data/muscles';
import { CATEGORY_LABEL, EQUIPMENT_CHOICES, levelLabel } from '../data/templateCatalog';
import { favoriteKey, type CatalogTemplate } from '../lib/templates';
import { lastSetsFor, fmtMinutes } from '../lib/stats';
import { toggleFavorite } from '../db/db';

export const equipLabel = (e: CatalogTemplate['equipment']) => EQUIPMENT_CHOICES.find((x) => x.id === e)!.label;

export function startLink(t: CatalogTemplate, date?: string) {
  const p = new URLSearchParams({ template: t.id, level: t.level });
  if (date) p.set('date', date);
  return `/log/edit?${p}`;
}

function summary(t: CatalogTemplate) {
  if (t.kind === 'cardio') return t.cardio.map((c) => c.activity).join(' + ');
  return `${t.strength.length} exercises · ${t.totalSets} sets`;
}

/** Card in the template grid / recommended row. */
export function TemplateCard({ t, reason, onOpen, className = '' }: { t: CatalogTemplate; reason?: string; onOpen: () => void; className?: string }) {
  const { favoriteSet } = useData();
  const fav = favoriteSet.has(favoriteKey(t.defId));
  return (
    <div className={`relative flex min-w-0 rounded-card border border-line bg-surface transition-shadow hover:shadow-lift ${className}`}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 p-3 pr-10 text-left">
        <span className="shrink-0" aria-hidden>
          {t.kind === 'cardio' ? (
            <span className="grid h-[72px] w-[60px] place-items-center rounded-lg bg-car-soft text-car">
              <Heartbeat size={26} weight="bold" />
            </span>
          ) : (
            <BodyMap values={t.map} mode="mono" view="both" width={30} compact />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-tight">{t.name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">{summary(t)}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="num inline-flex items-center gap-1">
              <Clock size={12} weight="bold" /> ~{t.durationMin} min
            </span>
            {t.thenCardio && <Tag tone="car">+ Cardio</Tag>}
          </span>
          {reason && <span className="mt-1.5 block text-xs font-medium text-str">{reason}</span>}
        </span>
      </button>
      <button
        onClick={() => toggleFavorite(favoriteKey(t.defId))}
        className={`hit-44 absolute right-1 top-1 grid h-9 w-9 place-items-center ${fav ? 'text-gold' : 'text-muted'}`}
        aria-label={fav ? `Remove ${t.name} from favourites` : `Add ${t.name} to favourites`}
        aria-pressed={fav}
      >
        <Star size={16} weight={fav ? 'fill' : 'bold'} />
      </button>
    </div>
  );
}

/** Full template details with a mini muscle map and Start button. */
export function TemplateSheet({ t, onClose, date }: { t: CatalogTemplate | null; onClose: () => void; date?: string }) {
  const { sessions, settings, favoriteSet } = useData();
  if (!t) return null;
  const fav = favoriteSet.has(favoriteKey(t.defId));
  const rows: [string, string][] = [
    ['Difficulty', levelLabel(t.level)],
    ['Duration', `~${fmtMinutes(t.durationMin)}`],
    ...(t.kind === 'strength'
      ? ([
          ['Sets', String(t.totalSets)],
          ['Rep range', t.repRange],
          ['Rest', `${t.restSec} s`],
        ] as [string, string][])
      : []),
    ['Equipment', equipLabel(t.equipment)],
  ];
  return (
    <Sheet open onClose={onClose} title={t.name}>
      <div className="flex flex-wrap gap-1.5">
        <Tag>{CATEGORY_LABEL[t.category]}</Tag>
        <Tag tone="str">{equipLabel(t.equipment)}</Tag>
        {t.thenCardio && <Tag tone="car">Ends with cardio</Tag>}
      </div>

      {t.kind === 'strength' && (
        <div className="mt-4 flex items-center gap-4">
          <BodyMap values={t.map} mode="mono" view="both" width={66} />
          <div className="min-w-0 flex-1 text-sm">
            <div className="eyebrow">Primary</div>
            <div className="mt-0.5 font-medium">{t.primary.map((r) => regionInfo(r).name).join(', ')}</div>
            {t.secondary.length > 0 && (
              <>
                <div className="eyebrow mt-3">Secondary</div>
                <div className="mt-0.5 text-muted">{t.secondary.map((r) => regionInfo(r).name).join(', ')}</div>
              </>
            )}
          </div>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-btn bg-raised px-3 py-2">
            <dt className="eyebrow text-[0.6875rem]">{k}</dt>
            <dd className="num mt-0.5 text-sm font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <h4 className="eyebrow mb-2 mt-5">Exercises</h4>
      <ol className="divide-y divide-line rounded-card border border-line">
        {t.strength.map((e, i) => {
          const last = lastSetsFor(sessions, e.exercise);
          const w = last ? Math.max(...last.map((x) => x.weight)) : 0;
          return (
            <li key={e.exercise} className="flex items-center gap-3 px-3 py-2.5">
              <span className="num w-5 text-center text-sm text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{e.exercise}</span>
                {w > 0 && (
                  <span className="num block text-xs text-muted">
                    Last: {w} {settings.weightUnit}
                  </span>
                )}
              </span>
              <span className="num shrink-0 text-sm">
                {e.sets} × {e.reps}
              </span>
            </li>
          );
        })}
        {[...t.cardio, ...(t.thenCardio ? [t.thenCardio] : [])].map((c) => (
          <li key={c.activity} className="flex items-center gap-3 px-3 py-2.5">
            <span className="w-5 text-car">
              <Heartbeat size={16} weight="bold" />
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium">{c.activity}</span>
            <span className="num shrink-0 text-sm">{c.durationMin} min</span>
          </li>
        ))}
      </ol>
      {t.kind === 'strength' && (
        <p className="mt-2 text-xs text-muted">
          <Barbell size={12} weight="bold" className="mr-1 inline" />
          Weights are filled in from your last session. Sets and reps match your level and goal (change them in Profile).
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => toggleFavorite(favoriteKey(t.defId))}
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-btn border border-line ${fav ? 'text-gold' : 'text-muted'}`}
          aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
          aria-pressed={fav}
        >
          <Star size={20} weight={fav ? 'fill' : 'bold'} />
        </button>
        <Link to={startLink(t, date)} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-btn bg-primary font-medium text-primary-ink hover:bg-primary-hover">
          <Play size={18} weight="fill" /> Start workout
        </Link>
      </div>
    </Sheet>
  );
}
