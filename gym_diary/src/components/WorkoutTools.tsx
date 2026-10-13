import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Timer, X, Check, Trash } from '@phosphor-icons/react';
import { Button, Chip, Field, NumberInput, Sheet } from './ui';
import type { SetType, Settings } from '../types';
import { SET_TYPES } from '../lib/stats';
import { BARS, PLATES, platesPerSide } from '../lib/training';

// ---------- Rest timer ----------

const REST_KEY = 'gym-diary-rest-sec';

export function savedRestSec(): number | null {
  try {
    const n = Number(localStorage.getItem(REST_KEY));
    return n >= 15 && n <= 600 ? n : null;
  } catch {
    return null;
  }
}
function saveRestSec(n: number) {
  try {
    localStorage.setItem(REST_KEY, String(n));
  } catch {
    /* storage unavailable */
  }
}

let audio: AudioContext | null = null;
/** Call from a tap so phones allow the sound later. */
export function primeSound() {
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}
export function beep() {
  if (!audio) return;
  const t = audio.currentTime;
  [0, 0.25, 0.5].forEach((d, i) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.frequency.value = i === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
    o.connect(g).connect(audio!.destination);
    o.start(t + d);
    o.stop(t + d + 0.2);
  });
}

export interface RestRun {
  endAt: number;
  total: number;
  /** Shown under the timer, e.g. "Next: set 3 of Squat". */
  next?: string;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

/** Countdown shown above the save bar. Based on an end time, so it stays right if the phone sleeps. */
export function RestTimerBar({ run, onChange, onStop }: { run: RestRun; onChange: (r: RestRun) => void; onStop: () => void }) {
  const [now, setNow] = useState(Date.now());
  const alerted = useRef(false);
  useEffect(() => {
    alerted.current = false;
  }, [run.endAt]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.ceil((run.endAt - now) / 1000);
  const over = left <= 0;
  useEffect(() => {
    if (!over || alerted.current) return;
    alerted.current = true;
    beep();
    try {
      navigator.vibrate?.([250, 120, 250, 120, 400]);
    } catch {
      /* not supported */
    }
    const t = window.setTimeout(onStop, 6000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);
  const adjust = (d: number) => {
    const total = Math.min(600, Math.max(15, run.total + d));
    saveRestSec(total);
    onChange({ ...run, total, endAt: run.endAt + (total - run.total) * 1000 });
  };
  const pct = over ? 100 : Math.min(100, ((run.total - left) / run.total) * 100);
  return (
    <div className={`anim-slide-in mb-3 overflow-hidden rounded-btn border ${over ? 'border-str/40 bg-str-soft' : 'border-line bg-surface'}`} role="timer" aria-live="polite">
      <div className="flex items-center gap-2 px-3 py-2">
        <Timer size={20} weight="bold" className={over ? 'text-str' : 'text-gold'} />
        <div className="min-w-0 flex-1">
          <div className={`h-display num text-2xl leading-none ${over ? 'text-str' : ''}`}>{over ? 'Rest over. Go!' : mmss(left)}</div>
          {run.next && <div className="truncate text-xs text-muted">{run.next}</div>}
        </div>
        {!over && (
          <>
            <Button size="sm" onClick={() => adjust(-15)} aria-label="15 seconds less">
              −15
            </Button>
            <Button size="sm" onClick={() => adjust(15)} aria-label="15 seconds more">
              +15
            </Button>
          </>
        )}
        <button onClick={onStop} className="grid h-9 w-9 place-items-center text-muted" aria-label={over ? 'Close' : 'Skip rest'}>
          <X size={18} weight="bold" />
        </button>
      </div>
      <div className="h-1 bg-raised">
        <div className={`h-full ${over ? 'bg-str' : 'bg-gold'} transition-[width] duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------- Set type picker ----------

export function SetTypeSheet({
  open,
  current,
  label,
  onPick,
  onDelete,
  onClose,
}: {
  open: boolean;
  current?: SetType;
  label: string;
  onPick: (t: SetType | undefined) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  // Portalled: the exercise card it is opened from animates with a transform, which would trap a fixed-position sheet.
  if (!open) return null;
  return createPortal(
    <Sheet open={open} onClose={onClose} title={label}>
      <div className="space-y-2">
        {SET_TYPES.map((t) => {
          const active = t.id === current;
          return (
            <button
              key={t.label}
              onClick={() => onPick(t.id)}
              className={`flex w-full items-center gap-3 rounded-btn border p-3 text-left ${active ? 'border-primary bg-raised' : 'border-line bg-bg'}`}
            >
              <span className={`num grid h-8 w-8 shrink-0 place-items-center rounded-full font-semibold ${setTypeTone(t.id)}`}>{t.short}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t.label}</span>
                <span className="block text-xs text-muted">{t.hint}</span>
              </span>
              {active && <Check size={18} weight="bold" />}
            </button>
          );
        })}
        <Button variant="danger" className="mt-2 w-full" onClick={onDelete}>
          <Trash size={18} weight="bold" /> Delete set
        </Button>
      </div>
    </Sheet>,
    document.body,
  );
}

export function setTypeTone(t: SetType | undefined) {
  return t === 'warmup' ? 'bg-gold-soft text-gold' : t === 'drop' ? 'bg-danger-soft text-danger' : t === 'failure' ? 'bg-car-soft text-car' : 'bg-raised text-muted';
}

// ---------- Plate calculator ----------

const PLATE_STYLE: Record<number, string> = {
  25: 'bg-danger h-24',
  20: 'bg-car h-24',
  15: 'bg-gold h-20',
  10: 'bg-str h-16',
  5: 'bg-ink h-12',
  2.5: 'bg-muted h-10',
  1.25: 'bg-muted h-8',
  45: 'bg-car h-24',
  35: 'bg-gold h-20',
};

export function PlateSheet({ open, onClose, initial, unit }: { open: boolean; onClose: () => void; initial: number; unit: Settings['weightUnit'] }) {
  const [target, setTarget] = useState<number | undefined>(initial || undefined);
  const [bar, setBar] = useState<number>(BARS[unit][0]);
  useEffect(() => {
    if (open) setTarget(initial || undefined);
  }, [open, initial]);
  const res = target ? platesPerSide(target, bar, PLATES[unit]) : null;
  return (
    <Sheet open={open} onClose={onClose} title="Plate calculator">
      <Field label={`Total weight (${unit})`}>
        <NumberInput value={target} step={unit === 'kg' ? 2.5 : 5} onChange={setTarget} label="Total weight on the bar" />
      </Field>
      <div className="mt-4">
        <span className="eyebrow mb-1.5 block">Bar</span>
        <div className="flex gap-1">
          {BARS[unit].map((b) => (
            <Chip key={b} active={bar === b} onClick={() => setBar(b)}>
              {b} {unit}
            </Chip>
          ))}
        </div>
      </div>
      {res && (
        <div className="mt-6">
          {target! < bar ? (
            <p className="text-sm text-muted">That's less than the bar alone.</p>
          ) : (
            <>
              <div className="flex h-28 items-center justify-center gap-0.5" aria-hidden>
                <div className="h-3 w-16 rounded-l bg-line" />
                <div className="h-6 w-2 rounded-sm bg-line" />
                {res.plates.map((p, i) => (
                  <div key={i} className={`w-3.5 rounded-sm ${PLATE_STYLE[p] ?? 'bg-muted h-10'}`} />
                ))}
                <div className="h-3 w-6 rounded-r bg-line" />
              </div>
              <div className="eyebrow mt-4">Each side</div>
              <div className="h-display num mt-1 text-2xl">{res.plates.length ? res.plates.join(' + ') : 'No plates'}</div>
              <p className="mt-2 text-sm text-muted">
                Bar {bar} {unit} + {res.plates.length ? `${res.plates.reduce((a, b) => a + b, 0)} ${unit} per side` : 'nothing'} = <b className="text-ink">{res.loaded} {unit}</b>
                {res.rest > 0 && <> · {res.rest} {unit} short: the closest you can load with standard plates.</>}
              </p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
