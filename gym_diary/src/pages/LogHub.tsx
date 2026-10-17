import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Barbell, Drop, Heartbeat, Lightning, Star, ClockCounterClockwise, Fire, Trash, ArrowCounterClockwise, Books, Sparkle, SquaresFour, BookmarkSimple } from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { Card, Field, IconButton, PageHeader, SectionTitle, Tag, inputCls } from '../components/ui';
import { cardioUsage, exerciseUsage } from '../lib/stats';
import { formatLong, isValidKey, todayKey } from '../lib/date';
import { TemplateCard, TemplateSheet } from '../components/TemplateViews';
import { TEMPLATE_DEFS } from '../data/templateCatalog';
import { buildTemplate, favoriteKey, prefsFrom, recommend, type CatalogTemplate } from '../lib/templates';
import { deleteTemplate, saveTemplate } from '../db/db';
import { toast } from '../lib/dialog';
import { readDraft, clearDraft } from './Editor';
import type { MuscleGroup } from '../types';
import { MUSCLE_GROUPS } from '../types';

export default function LogHub() {
  const { sessions, userTemplates, favoriteSet, library, profile } = useData();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [date, setDate] = useState(() => {
    const d = params.get('date') ?? '';
    return isValidKey(d) && d <= todayKey() ? d : todayKey();
  });
  const [open, setOpen] = useState<CatalogTemplate | null>(null);
  const prefs = prefsFrom(profile);
  const recs = useMemo(() => recommend(sessions), [sessions]);
  const favTemplates = TEMPLATE_DEFS.filter((d) => favoriteSet.has(favoriteKey(d.id)));
  const quick = (favTemplates.length ? favTemplates : TEMPLATE_DEFS.filter((d) => d.category === 'classic')).map((d) =>
    buildTemplate(d, prefs.equipment, prefs.level, prefs.goal),
  );
  const [draft, setDraft] = useState(readDraft);

  const usage = useMemo(() => exerciseUsage(sessions), [sessions]);
  const frequent = [...usage].sort((a, b) => b.count - a.count).slice(0, 8);
  const recent = [...usage].sort((a, b) => (a.last < b.last ? 1 : -1)).slice(0, 8);
  const recentCardio = useMemo(() => cardioUsage(sessions).sort((a, b) => (a.last < b.last ? 1 : -1)).slice(0, 4), [sessions]);

  const groupOf = (name: string): MuscleGroup =>
    usage.find((u) => u.exercise === name)?.muscleGroup ?? MUSCLE_GROUPS.find((g) => library[g].includes(name)) ?? 'FULL BODY';
  const favs = [...favoriteSet].filter((k) => k.startsWith('strength:')).map((k) => k.slice(9));
  const favCardio = [...favoriteSet].filter((k) => k.startsWith('cardio:')).map((k) => k.slice(7));

  const q = (extra: Record<string, string>) => `/log/edit?${new URLSearchParams({ date, ...extra })}`;

  const QuickChip = ({ to, label, tone = 'str' }: { to: string; label: string; tone?: 'str' | 'car' }) => (
    <Link
      to={to}
      className={`flex h-10 shrink-0 items-center rounded-btn border px-3.5 text-sm transition-colors ${
        tone === 'car' ? 'border-car/20 bg-car-soft text-car' : 'border-line bg-surface hover:bg-raised'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Log a workout"
        sub={date === todayKey() ? 'Today' : 'Back-dating'}
        right={
          <IconButton label="Exercise library" to="/exercises">
            <Books size={20} weight="bold" />
          </IconButton>
        }
      />

      <Field label="Date" hint={date !== todayKey() ? `Logging a missed day: ${formatLong(date)}` : undefined}>
        <input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value || todayKey())} className={inputCls} />
      </Field>

      {draft && (
        <Card className="mt-4 border-gold/30 bg-gold-soft">
          <div className="flex items-center gap-3">
            <ArrowCounterClockwise className="text-gold" size={20} weight="bold" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Unsaved workout</div>
              <div className="truncate text-sm text-muted">
                {draft.name || (draft.kind === 'cardio' ? 'Cardio' : 'Strength')} · {formatLong(draft.date)}
              </div>
            </div>
            <button
              onClick={() => {
                clearDraft();
                setDraft(null);
              }}
              className="hit-44 grid h-10 w-10 place-items-center text-muted"
              aria-label="Discard draft"
            >
              <Trash size={18} weight="bold" />
            </button>
            <Link to="/log/edit?resume=1" className="rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-primary-ink">
              Resume
            </Link>
          </div>
        </Card>
      )}

      <div className="mt-5 grid grid-cols-3 gap-2">
        <button
          onClick={() => nav(q({ kind: 'strength' }))}
          className="flex h-28 flex-col items-start justify-between rounded-card border border-str/20 bg-str-soft p-4 text-left text-str transition-transform active:scale-[0.98]"
        >
          <Barbell size={26} weight="bold" />
          <span className="h-title text-xl leading-tight">Strength</span>
        </button>
        <button
          onClick={() => nav(q({ kind: 'cardio' }))}
          className="flex h-28 flex-col items-start justify-between rounded-card border border-car/20 bg-car-soft p-4 text-left text-car transition-transform active:scale-[0.98]"
        >
          <Heartbeat size={26} weight="bold" />
          <span className="h-title text-xl leading-tight">Cardio</span>
        </button>
        <button
          onClick={() => nav(`/water?date=${date}`)}
          className="flex h-28 flex-col items-start justify-between rounded-card border border-wat/20 bg-wat-soft p-4 text-left text-wat transition-transform active:scale-[0.98]"
        >
          <Drop size={26} weight="bold" />
          <span className="h-title text-xl leading-tight">Water</span>
        </button>
      </div>

      <SectionTitle
        action={
          <Link to={`/templates?date=${date}`} className="text-sm font-medium text-str">
            Browse all {TEMPLATE_DEFS.length * 3}
          </Link>
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <Sparkle size={12} weight="fill" /> Recommended for you
        </span>
      </SectionTitle>
      <div className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1">
        {recs.map((r) => {
          const t = buildTemplate(r.def, prefs.equipment, prefs.level, prefs.goal);
          return <TemplateCard key={t.id} t={t} reason={r.reason} onOpen={() => setOpen(t)} className="w-[290px] shrink-0 snap-start" />;
        })}
      </div>

      <SectionTitle>
        <span className="inline-flex items-center gap-1.5">
          <Lightning size={12} weight="fill" /> {favTemplates.length ? 'Favourite templates' : 'One-tap templates'}
        </span>
      </SectionTitle>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {quick.map((t) => (
          <TemplateCard key={t.id} t={t} onOpen={() => setOpen(t)} />
        ))}
      </div>
      <Link
        to={`/templates?date=${date}`}
        className="mt-2 flex h-12 items-center justify-center gap-2 rounded-btn border border-dashed border-line text-sm font-medium text-muted hover:bg-raised"
      >
        <SquaresFour size={16} weight="bold" /> Browse all templates · Machine, Free weights, Mixed
      </Link>

      {userTemplates.length > 0 && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <BookmarkSimple size={12} weight="fill" /> My templates
            </span>
          </SectionTitle>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {userTemplates.map((t) => (
              <div key={t.id} className="relative">
                <Link
                  to={q({ template: t.id })}
                  className="flex min-h-[72px] flex-col justify-center rounded-card border border-line bg-surface px-4 py-3 pr-9 transition-shadow hover:shadow-lift"
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="mt-0.5 truncate text-xs text-muted">
                    {t.kind === 'cardio' ? t.cardio.map((c) => c.activity).join(', ') : `${t.strength.length} exercises`}
                  </span>
                </Link>
                <button
                  onClick={async () => {
                    await deleteTemplate(t.id);
                    toast(`Template “${t.name}” deleted`, { undo: () => saveTemplate(t) });
                  }}
                  className="hit-44 absolute right-1 top-1 grid h-8 w-8 place-items-center text-muted"
                  aria-label={`Delete template ${t.name}`}
                >
                  <Trash size={14} weight="bold" />
                </button>
                {t.kind === 'cardio' && (
                  <span className="pointer-events-none absolute bottom-2 right-2">
                    <Tag tone="car">Cardio</Tag>
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {(favs.length > 0 || favCardio.length > 0) && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Star size={12} weight="fill" /> Favorites
            </span>
          </SectionTitle>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {favs.map((f) => (
              <QuickChip key={f} to={q({ kind: 'strength', exercise: f, group: groupOf(f) })} label={f} />
            ))}
            {favCardio.map((f) => (
              <QuickChip key={f} tone="car" to={q({ kind: 'cardio', activity: f })} label={f} />
            ))}
          </div>
        </>
      )}

      {frequent.length > 0 && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Fire size={12} weight="fill" /> Frequently used
            </span>
          </SectionTitle>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {frequent.map((u) => (
              <QuickChip key={u.exercise} to={q({ kind: 'strength', exercise: u.exercise, group: u.muscleGroup })} label={`${u.exercise} · ${u.count}x`} />
            ))}
          </div>
        </>
      )}

      {(recent.length > 0 || recentCardio.length > 0) && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <ClockCounterClockwise size={12} weight="bold" /> Recently used
            </span>
          </SectionTitle>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {recent.map((u) => (
              <QuickChip key={u.exercise} to={q({ kind: 'strength', exercise: u.exercise, group: u.muscleGroup })} label={u.exercise} />
            ))}
            {recentCardio.map((c) => (
              <QuickChip key={c.activity} tone="car" to={q({ kind: 'cardio', activity: c.activity })} label={c.activity} />
            ))}
          </div>
        </>
      )}

      <TemplateSheet t={open} onClose={() => setOpen(null)} date={date} />

      <p className="mt-10 text-center text-xs text-muted">
        Star any exercise to pin it here. Any workout can be saved as a template from the editor.
      </p>
    </div>
  );
}
