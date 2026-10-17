import { useRef, type ReactNode } from 'react';
import { Trash } from '@phosphor-icons/react';
import { project, rubberband, spring, velocityTracker, type SpringHandle } from '../lib/spring';
import { haptic } from '../lib/feedback';

const OPEN = 88; // width of the revealed Delete button

/**
 * Swipe a row left to delete, like iOS Mail. Follows the finger 1:1 after a 10 px dead zone (vertical
 * scrolling is left alone). A flick past half the row deletes it; a shorter swipe leaves the Delete
 * button showing; pulling right past closed resists. The row's own delete button still works too.
 */
export default function SwipeRow({ children, onDelete, label }: { children: ReactNode; onDelete: () => void; label: string }) {
  const row = useRef<HTMLDivElement>(null);
  const x = useRef(0);
  const anim = useRef<SpringHandle | null>(null);
  const g = useRef<{ x0: number; y0: number; start: number; axis: 'x' | 'y' | null; tr: ReturnType<typeof velocityTracker>; id: number } | null>(null);
  const moved = useRef(false);

  const apply = (v: number) => {
    x.current = v;
    if (row.current) row.current.style.transform = v ? `translate3d(${v}px, 0, 0)` : '';
  };
  const to = (target: number, velocity = 0, damping = 1, done?: () => void) => {
    anim.current?.stop();
    anim.current = spring(x.current, target, { damping, response: 0.3, velocity, onUpdate: apply, onDone: done });
  };
  const remove = (velocity = 0) => {
    haptic('light');
    const w = row.current?.offsetWidth ?? 360;
    to(-w, velocity, 1, onDelete);
  };

  return (
    <div className="relative overflow-hidden">
      <button
        onClick={() => remove()}
        className="absolute inset-y-0 right-0 flex items-center justify-end gap-1.5 bg-danger pl-4 pr-4 text-sm font-semibold text-bg"
        style={{ width: '100%' }}
        aria-label={label}
        tabIndex={-1}
      >
        <Trash size={16} weight="bold" /> Delete
      </button>
      <div
        ref={row}
        className="relative touch-pan-y bg-surface will-change-transform"
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return; // mouse users have the delete button
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
            if (Math.hypot(dx, dy) < 10) return;
            s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if (s.axis === 'y') {
              g.current = null;
              return;
            }
            moved.current = true;
            e.currentTarget.setPointerCapture(s.id);
          }
          s.tr.add(e.clientX);
          let v = s.start + dx - Math.sign(dx) * 10;
          if (v > 0) v = rubberband(v, 120);
          apply(v);
        }}
        onPointerUp={() => {
          const s = g.current;
          g.current = null;
          if (!s || s.axis !== 'x') return;
          const w = row.current?.offsetWidth ?? 360;
          const v = s.tr.velocity();
          const end = x.current + project(v);
          if (end < -w * 0.5) remove(v);
          else if (end < -OPEN / 2) to(-OPEN, v, 0.8);
          else to(0, v, 0.8);
        }}
        onPointerCancel={() => {
          g.current = null;
          to(0);
        }}
        onClickCapture={(e) => {
          if (moved.current) {
            e.stopPropagation();
            moved.current = false;
            return;
          }
          // Tapping an open row closes it.
          if (x.current < 0) {
            e.stopPropagation();
            to(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
