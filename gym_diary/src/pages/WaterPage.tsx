import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Drop, PencilSimple, Trash, Check, X, Plus } from '@phosphor-icons/react';
import { useData } from '../hooks/useData';
import { useHydration } from '../hooks/useHydration';
import { Button, Card, Field, NumberInput, SectionTitle, Tag, inputCls } from '../components/ui';
import WaterRing from '../components/WaterRing';
import { deleteWaterLog, saveWaterLog, uid } from '../db/db';
import { toast } from '../lib/dialog';
import SwipeRow from '../components/SwipeRow';
import { formatLong, isValidKey, todayKey } from '../lib/date';
import { fmtVolume, fromUnit, toUnit, unitLabel } from '../lib/water';
import type { WaterLog } from '../types';

export default function WaterPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { settings } = useData();
  const unit = settings.volumeUnit;
  const d = params.get('date') ?? '';
  const date = isValidKey(d) && d <= todayKey() ? d : todayKey();
  const h = useHydration(date);
  const [custom, setCustom] = useState<number | undefined>();
  const [undo, setUndo] = useState<WaterLog | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<number | undefined>();
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function add(ml: number) {
    if (!ml || ml <= 0) return;
    const now = new Date();
    // Back-dated entries keep the current clock time so the list still reads naturally.
    const loggedAt = date === todayKey() ? now.getTime() : new Date(`${date}T${now.toTimeString().slice(0, 8)}`).getTime();
    const w: WaterLog = { id: uid(), date, amountMl: Math.round(ml), loggedAt };
    await saveWaterLog(w);
    setUndo(w);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUndo(null), 5000);
  }

  async function saveEdit(w: WaterLog) {
    const ml = fromUnit(editVal ?? 0, unit);
    if (ml > 0) await saveWaterLog({ ...w, amountMl: ml });
    setEditing(null);
  }

  const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="pb-24">
      <div className="flex items-center gap-2 pt-6">
        <button
          onClick={() => ((window.history.state?.idx ?? 0) > 0 ? nav(-1) : nav('/'))}
          className="grid h-11 w-11 place-items-center rounded-btn border border-line bg-surface"
          aria-label="Back"
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
        <h1 className="h-title text-[2.375rem]">Water</h1>
      </div>

      <div className="mt-5">
        <Field label="Date">
          <input
            type="date"
            value={date}
            max={todayKey()}
            onChange={(e) => setParams({ date: e.target.value || todayKey() }, { replace: true })}
            className={inputCls}
          />
        </Field>
        {date !== todayKey() && (
          <div className="mt-2">
            <Tag tone="gold">Back-dated · {formatLong(date)}</Tag>
          </div>
        )}
      </div>

      <Card className="mt-4">
        <div className="flex items-center gap-5">
          <WaterRing ml={h.total} target={h.target} size={150} />
          <div className="min-w-0">
            <div className="eyebrow">{date === todayKey() ? 'Today' : 'This day'}</div>
            <div className="h-display num mt-1 text-[1.875rem] leading-none text-wat">{fmtVolume(h.total, unit)}</div>
            <div className="num mt-1 text-sm text-muted">of {fmtVolume(h.target, unit)} target</div>
            {h.bonus > 0 && <div className="mt-1 text-xs text-muted">includes +{fmtVolume(h.bonus, unit)} for your workout</div>}
            <div className={`mt-2 text-sm font-medium ${h.remaining ? 'text-ink' : 'text-str'}`}>
              {h.remaining ? `${fmtVolume(h.remaining, unit)} to go` : 'Target reached'}
            </div>
          </div>
        </div>
      </Card>

      <SectionTitle>Quick add</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {h.sizes.map((ml, i) => (
          <button
            key={i}
            onClick={() => add(ml)}
            className="flex h-24 flex-col items-center justify-center gap-1 rounded-card border border-wat/25 bg-wat-soft text-wat transition-transform active:scale-[0.96]"
            aria-label={`Add ${fmtVolume(ml, unit)}`}
          >
            <Drop size={18 + i * 4} weight="fill" />
            <span className="h-display num text-xl">{fmtVolume(ml, unit, { short: true })}</span>
            <span className="text-[0.6875rem] opacity-80">{['Glass', 'Bottle', 'Large'][i]}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <NumberInput value={custom} onChange={setCustom} placeholder={`Custom ${unitLabel(unit)}`} label="Custom amount" />
        <Button
          variant="primary"
          className="shrink-0"
          disabled={!custom}
          onClick={() => {
            add(fromUnit(custom ?? 0, unit));
            setCustom(undefined);
          }}
        >
          <Plus size={16} weight="bold" /> Add
        </Button>
      </div>

      <SectionTitle>Entries</SectionTitle>
      {h.logs.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {[...h.logs].reverse().map((w) => {
              const remove = async () => {
                await deleteWaterLog(w.id);
                toast(`${fmtVolume(w.amountMl, unit)} deleted`, { undo: () => saveWaterLog(w) });
              };
              return (
              <li key={w.id}>
                <SwipeRow onDelete={remove} label={`Delete ${fmtVolume(w.amountMl, unit)} entry`}>
                <div className="flex items-center gap-3 px-4 py-2">
                <Drop size={16} weight="fill" className="shrink-0 text-wat" />
                <span className="num w-20 shrink-0 text-sm text-muted">{time(w.loggedAt)}</span>
                {editing === w.id ? (
                  <>
                    <NumberInput value={editVal} onChange={setEditVal} label="Edit amount" className="h-10 text-base" />
                    <button onClick={() => saveEdit(w)} className="hit-44 grid h-10 w-10 shrink-0 place-items-center text-str" aria-label="Save amount">
                      <Check size={18} weight="bold" />
                    </button>
                    <button onClick={() => setEditing(null)} className="hit-44 grid h-10 w-10 shrink-0 place-items-center text-muted" aria-label="Cancel edit">
                      <X size={18} weight="bold" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="num flex-1 font-medium">{fmtVolume(w.amountMl, unit)}</span>
                    <button
                      onClick={() => {
                        setEditing(w.id);
                        setEditVal(toUnit(w.amountMl, unit));
                      }}
                      className="hit-44 grid h-10 w-10 place-items-center text-muted"
                      aria-label={`Edit ${fmtVolume(w.amountMl, unit)} entry`}
                    >
                      <PencilSimple size={16} weight="bold" />
                    </button>
                    <button
                      onClick={remove}
                      className="hit-44 grid h-10 w-10 place-items-center text-muted"
                      aria-label={`Delete ${fmtVolume(w.amountMl, unit)} entry`}
                    >
                      <Trash size={16} weight="bold" />
                    </button>
                  </>
                )}
                </div>
                </SwipeRow>
              </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <p className="px-1 text-sm text-muted">Nothing logged for this day yet. Tap a size above.</p>
      )}

      <p className="mt-8 text-center text-xs text-muted">
        Change your daily target and button sizes in{' '}
        <Link to="/profile" className="underline underline-offset-4">
          Profile
        </Link>
        .
      </p>

      {undo && (
        <div role="status" className="fixed inset-x-0 bottom-20 z-40 px-4">
          <div className="mx-auto flex max-w-lg items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-lift">
            <Drop size={18} weight="fill" className="text-wat" />
            <span className="flex-1 text-sm">Added {fmtVolume(undo.amountMl, unit)}</span>
            <button
              onClick={async () => {
                await deleteWaterLog(undo.id);
                setUndo(null);
              }}
              className="rounded-btn px-3 py-1.5 text-sm font-medium underline underline-offset-4"
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
