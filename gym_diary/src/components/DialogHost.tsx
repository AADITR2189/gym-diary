import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { closeDialog, dismissToast, store, subscribe, type DialogRequest, type ToastRequest } from '../lib/dialog';
import { usePresence } from '../lib/presence';
import { project, rubberband, velocityTracker } from '../lib/spring';
import { haptic } from '../lib/feedback';

/** Renders in-app dialogs (instead of confirm/prompt/alert) and the Undo toast. Mounted once in App. */
export default function DialogHost() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return (
    <>
      <AlertDialog req={store.dialog} />
      <Toast req={store.toast} />
    </>
  );
}

function AlertDialog({ req }: { req: DialogRequest | null }) {
  // Keep showing the last dialog while it animates out.
  const last = useRef<DialogRequest | null>(req);
  if (req) last.current = req;
  const d = last.current;
  const box = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  useEffect(() => {
    if (req) setText(req.input?.initial ?? '');
  }, [req]);
  const { mounted } = usePresence(
    !!req,
    (p, reduced) => {
      if (box.current) {
        box.current.style.opacity = String(p);
        // Alerts settle in from slightly larger, like iOS, and shrink away the same way.
        box.current.style.transform = reduced ? 'none' : `scale(${1.08 - 0.08 * p})`;
      }
      if (scrim.current) scrim.current.style.opacity = String(p);
    },
    { damping: 1, response: 0.3 },
  );
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDialog(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);
  if (!mounted || !d) return null;
  const primary = [...d.actions].reverse().find((a) => a.style === 'primary' || a.style === 'danger');
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-8" role="alertdialog" aria-modal aria-labelledby="dlg-title" aria-describedby="dlg-msg">
      <div ref={scrim} className="scrim absolute inset-0" style={{ opacity: 0 }} onClick={() => closeDialog(null)} />
      <div ref={box} className="material relative w-full max-w-[300px] overflow-hidden rounded-[18px] border border-line/60 text-center" style={{ opacity: 0 }}>
        <div className="px-5 pb-4 pt-5">
          <h2 id="dlg-title" className="text-[1.0625rem] font-semibold leading-snug">
            {d.title}
          </h2>
          {d.message && (
            <p id="dlg-msg" className="mt-1 whitespace-pre-line text-sm leading-snug text-muted">
              {d.message}
            </p>
          )}
          {d.input && (
            <input
              autoFocus
              value={text}
              aria-label={d.input.label}
              placeholder={d.input.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && primary && closeDialog(primary.value, text)}
              className="mt-3 h-11 w-full rounded-btn border border-line bg-bg px-3 text-base text-ink outline-none"
            />
          )}
        </div>
        <div className={`grid border-t border-line/70 ${d.actions.length === 2 ? 'grid-cols-2 divide-x divide-line/70' : 'divide-y divide-line/70'}`}>
          {d.actions.map((a) => (
            <button
              key={a.value}
              onClick={() => closeDialog(a.value, text)}
              className={`min-h-[48px] px-3 text-[1.0625rem] active:bg-raised ${
                a.style === 'danger' ? 'font-semibold text-danger' : a.style === 'primary' ? 'font-semibold text-ink' : a.style === 'cancel' ? 'text-muted' : 'text-ink'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Bottom toast. Rises from the bottom and leaves the same way; swipe it down to dismiss. */
function Toast({ req }: { req: ToastRequest | null }) {
  const last = useRef<ToastRequest | null>(req);
  if (req) last.current = req;
  const t = last.current;
  const el = useRef<HTMLDivElement>(null);
  const { mounted, progress, set, animateTo, stop } = usePresence(
    !!req,
    (p, reduced) => {
      if (!el.current) return;
      el.current.style.opacity = String(Math.max(0, Math.min(1, p * 1.5)));
      el.current.style.transform = reduced ? 'none' : `translate3d(0, ${(1 - p) * 90}px, 0)`;
    },
    { damping: 1, response: 0.35 },
  );
  const drag = useRef<{ y: number; p: number; tr: ReturnType<typeof velocityTracker> } | null>(null);
  if (!mounted || !t) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[65] flex justify-center px-4">
      <div
        ref={el}
        role="status"
        aria-live="polite"
        className="material pointer-events-auto flex w-full max-w-md touch-none items-center gap-3 rounded-[14px] border border-line/60 py-2 pl-4 pr-2 shadow-lg"
        style={{ opacity: 0 }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          stop();
          const tr = velocityTracker();
          tr.reset(e.clientY);
          drag.current = { y: e.clientY, p: progress.current, tr };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          d.tr.add(e.clientY);
          let dy = e.clientY - d.y;
          if (dy < 0) dy = -rubberband(-dy, 90);
          set(d.p - dy / 90);
        }}
        onPointerUp={() => {
          const d = drag.current;
          if (!d) return;
          drag.current = null;
          const v = d.tr.velocity();
          const y = (1 - progress.current) * 90;
          if (y + project(v) > 45) {
            animateTo(0, { velocity: -v / 90 });
            dismissToast();
          } else animateTo(1, { velocity: -v / 90, damping: 0.8, response: 0.3 });
        }}
      >
        <span className="min-w-0 flex-1 py-1.5 text-sm leading-snug">{t.message}</span>
        {t.undo && (
          <button
            onClick={async () => {
              haptic('light');
              const undo = t.undo!;
              dismissToast();
              await undo();
            }}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-btn px-3 text-sm font-semibold text-ink active:bg-raised"
          >
            <ArrowCounterClockwise size={16} weight="bold" /> Undo
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
