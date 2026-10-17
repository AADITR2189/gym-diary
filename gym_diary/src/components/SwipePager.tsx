import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';
import { project, spring, velocityTracker, type SpringHandle } from '../lib/spring';
import { prefersReducedMotion } from '../lib/anim';
import { haptic } from '../lib/feedback';

export interface SwipePagerHandle {
  /** Animate to the next (1) or previous (-1) page, the same way a swipe does. */
  slide: (dir: 1 | -1) => void;
}

/**
 * Swipe left/right between pages (e.g. calendar months). The content follows the finger 1:1 after a
 * 10 px dead zone; vertical scrolling is left to the browser. On release the flick is projected
 * forward: far enough and the page leaves in that direction while the new one arrives from the
 * opposite side, carrying the finger's speed. Otherwise it springs back.
 */
const SwipePager = forwardRef<SwipePagerHandle, { onPage: (dir: 1 | -1) => void; children: ReactNode; className?: string }>(function SwipePager(
  { onPage, children, className = '' },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const x = useRef(0);
  const anim = useRef<SpringHandle | null>(null);
  const g = useRef<{ x0: number; y0: number; start: number; axis: 'x' | 'y' | null; tr: ReturnType<typeof velocityTracker>; id: number } | null>(null);
  const moved = useRef(false);

  const apply = (v: number) => {
    x.current = v;
    if (el.current) {
      el.current.style.transform = v ? `translate3d(${v}px, 0, 0)` : '';
      el.current.style.opacity = String(1 - Math.min(0.5, Math.abs(v) / (el.current.offsetWidth * 2)));
    }
  };
  const to = (target: number, velocity: number, opts: { damping?: number; response?: number } = {}, done?: () => void) => {
    anim.current?.stop();
    anim.current = spring(x.current, target, { damping: opts.damping ?? 1, response: opts.response ?? 0.3, velocity, onUpdate: apply, onDone: done });
  };
  const turn = (dir: 1 | -1, velocity = 0) => {
    const w = el.current?.offsetWidth ?? 320;
    if (prefersReducedMotion()) {
      onPage(dir);
      return;
    }
    haptic('light');
    // Leave towards the swipe, then arrive from the other side.
    to(-dir * w, velocity, { response: 0.22 }, () => {
      onPage(dir);
      apply(dir * w);
      to(0, velocity, { response: 0.3 });
    });
  };
  useImperativeHandle(ref, () => ({ slide: (dir) => turn(dir) }));

  return (
    <div
      className="touch-pan-y overflow-hidden"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        anim.current?.stop();
        const tr = velocityTracker();
        tr.reset(e.clientX);
        g.current = { x0: e.clientX, y0: e.clientY, start: x.current, axis: null, tr, id: e.pointerId };
        moved.current = false;
      }}
      onPointerMove={(e) => {
        const s = g.current;
        if (!s) return;
        const dx = e.clientX - s.x0;
        const dy = e.clientY - s.y0;
        if (!s.axis) {
          if (Math.hypot(dx, dy) < 10) return; // hysteresis before committing to a direction
          s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          if (s.axis === 'y') {
            g.current = null;
            return;
          }
          moved.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(s.id);
        }
        s.tr.add(e.clientX);
        apply(s.start + dx - Math.sign(dx) * 10);
      }}
      onPointerUp={() => {
        const s = g.current;
        g.current = null;
        if (!s || s.axis !== 'x') return;
        const w = el.current?.offsetWidth ?? 320;
        const v = s.tr.velocity();
        const end = x.current + project(v);
        if (Math.abs(end) > w * 0.35) turn(end < 0 ? 1 : -1, v);
        else to(0, v, { damping: 0.8 });
      }}
      onPointerCancel={() => {
        g.current = null;
        to(0, 0);
      }}
      onClickCapture={(e) => {
        // A swipe isn't a tap on the day underneath.
        if (moved.current) {
          e.stopPropagation();
          e.preventDefault();
          moved.current = false;
        }
      }}
    >
      <div ref={el} className={`will-change-transform ${className}`}>
        {children}
      </div>
    </div>
  );
});

export default SwipePager;
