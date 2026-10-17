import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../lib/presence';
import { project, rubberband, velocityTracker } from '../lib/spring';
import { Link } from 'react-router-dom';
import { GearSix, UserCircle, X } from '@phosphor-icons/react';
import { useReveal } from '../lib/reveal';
import CountUp from './CountUp';

export type Tone = 'default' | 'str' | 'car' | 'gold' | 'danger' | 'wat';

export function Card({
  children,
  className = '',
  index = 0,
  style,
}: {
  children: ReactNode;
  className?: string;
  /** Stagger position for the entry animation. */
  index?: number;
  style?: CSSProperties;
}) {
  const [ref, shown] = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${Math.min(index, 4) * 30}ms`, ...style }}
      className={`reveal ${shown ? 'is-in' : ''} rounded-card border border-line bg-surface p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-10 flex items-end justify-between gap-3 px-0.5">
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

const toneText: Record<Tone, string> = {
  default: 'text-ink',
  str: 'text-str',
  car: 'text-car',
  gold: 'text-gold',
  danger: 'text-danger',
  wat: 'text-wat',
};

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  index,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  index?: number;
}) {
  return (
    <Card index={index} className="p-4">
      <div className="eyebrow leading-tight">{label}</div>
      <div className={`h-display num mt-2 text-[2.125rem] ${toneText[tone]}`}>{typeof value === 'number' ? <CountUp value={value} /> : value}</div>
      {sub !== undefined && <div className="mt-1 text-xs leading-snug text-muted">{sub}</div>}
    </Card>
  );
}

/** Small pill for statuses and categories. */
export function Tag({ tone = 'default', children }: { tone?: Tone; children: ReactNode }) {
  const t = {
    default: 'bg-raised text-muted',
    str: 'bg-str-soft text-str',
    car: 'bg-car-soft text-car',
    gold: 'bg-gold-soft text-gold',
    danger: 'bg-danger-soft text-danger',
    wat: 'bg-wat-soft text-wat',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${t}`}>{children}</span>;
}

/** Soft square icon badge. */
export function IconBadge({ tone = 'default', children, size = 'md' }: { tone?: Tone; children: ReactNode; size?: 'sm' | 'md' }) {
  const t = {
    default: 'bg-raised text-ink',
    str: 'bg-str-soft text-str',
    car: 'bg-car-soft text-car',
    gold: 'bg-gold-soft text-gold',
    danger: 'bg-danger-soft text-danger',
    wat: 'bg-wat-soft text-wat',
  }[tone];
  return <span className={`grid shrink-0 place-items-center rounded-lg ${size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'} ${t}`}>{children}</span>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'sm';
};

export function Button({ variant = 'secondary', size = 'md', className = '', ...p }: BtnProps) {
  const v = {
    primary: 'bg-primary text-primary-ink hover:bg-primary-hover font-medium',
    secondary: 'bg-surface text-ink border border-line hover:bg-raised',
    ghost: 'text-muted hover:bg-raised',
    danger: 'bg-danger-soft text-danger border border-danger/20',
  }[variant];
  const s = { sm: 'h-9 px-3 text-sm', md: 'h-12 px-4', lg: 'h-14 px-5 text-base' }[size];
  return (
    <button
      {...p}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-btn transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:opacity-40 ${v} ${s} ${className}`}
    />
  );
}

/** Segmented filter button. */
export function Chip({
  active,
  children,
  onClick,
  className = '',
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`hit-44 h-9 shrink-0 whitespace-nowrap rounded-btn border px-3 text-sm transition-colors active:scale-[0.98] ${
        active ? 'border-primary bg-primary font-medium text-primary-ink' : 'border-line bg-surface text-ink hover:bg-raised'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Bottom sheet — thumb-friendly on phones, centred dialog on desktop. Springs up from the bottom and
 * leaves the same way. Drag the handle or title bar down to dismiss: it follows your finger 1:1,
 * resists when pulled up, and a flick carries through (velocity is handed to the closing spring).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const height = () => panel.current?.offsetHeight || 600;
  // progress 1 = fully open, 0 = off-screen below.
  const { mounted, progress, set, animateTo, stop } = usePresence(
    open,
    (p, reduced) => {
      if (panel.current) {
        panel.current.style.transform = reduced ? 'none' : `translate3d(0, ${(1 - p) * height()}px, 0)`;
        panel.current.style.opacity = reduced ? String(p) : '1';
      }
      if (scrim.current) scrim.current.style.opacity = String(Math.max(0, Math.min(1, p)));
    },
    { damping: 1, response: 0.35 },
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Drag to dismiss.
  const drag = useRef<{ startY: number; startP: number; tracker: ReturnType<typeof velocityTracker> } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    stop();
    const tracker = velocityTracker();
    tracker.reset(e.clientY);
    drag.current = { startY: e.clientY, startP: progress.current, tracker };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.tracker.add(e.clientY);
    const h = height();
    let y = (1 - d.startP) * h + (e.clientY - d.startY);
    if (y < 0) y = -rubberband(-y, h);
    set(1 - y / h);
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const h = height();
    const v = d.tracker.velocity(); // px/s, positive = downwards
    const y = (1 - progress.current) * h;
    const projected = y + project(v);
    if (projected > h * 0.4 && v > -200) {
      // Close: hand the finger's speed to the spring (progress units per second).
      animateTo(0, { velocity: -v / h, damping: 1, response: 0.3 });
      onClose();
    } else animateTo(1, { velocity: -v / h, damping: 0.8, response: 0.3 });
  };

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-label={typeof title === 'string' ? title : undefined}>
      <div ref={scrim} className="scrim absolute inset-0" style={{ opacity: 0 }} onClick={onClose} />
      <div
        ref={panel}
        className="material relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-[20px] border border-line/60 pb-safe will-change-transform sm:rounded-card"
        style={{ transform: 'translate3d(0, 100%, 0)' }}
      >
        <div className="cursor-grab touch-none select-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted/40" aria-hidden />
          <div className="flex items-center justify-between px-5 pb-3 pt-1">
            <h3 className="h-title text-2xl">{title}</h3>
            <button onClick={onClose} className="hit-44 grid h-10 w-10 place-items-center rounded-full bg-raised/70" aria-label="Close">
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>
        <div className="edge-fade overflow-y-auto overscroll-contain p-5 pt-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <div className="h-title text-2xl">{title}</div>
      {children && <div className="mt-1 max-w-xs text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 pb-6 pt-8">
      <div className="min-w-0">
        {sub && <div className="eyebrow mb-1">{sub}</div>}
        <h1 className="h-title text-[2.125rem] [overflow-wrap:anywhere] sm:text-[2.625rem]">{title}</h1>
      </div>
      {right && <div className="flex shrink-0 gap-2">{right}</div>}
    </header>
  );
}

export function NumberInput({
  value,
  onChange,
  label,
  step = 1,
  min = 0,
  className = '',
  placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  label?: string;
  step?: number;
  min?: number;
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      min={min}
      step={step}
      value={value === undefined || Number.isNaN(value) ? '' : value}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      className={`num h-12 w-full rounded-btn border border-line bg-bg px-3 text-center text-lg font-medium outline-none transition-colors placeholder:text-muted/60 focus:border-ink/40 ${className}`}
    />
  );
}

export const inputCls =
  'h-12 w-full rounded-btn border border-line bg-bg px-3 text-base text-ink outline-none transition-colors focus:border-ink/40 placeholder:text-muted/70';

export function Field({ label, children, hint, group }: { label: string; children: ReactNode; hint?: ReactNode; group?: boolean }) {
  // A <label> may only wrap one control; groups of buttons get role="group" instead.
  const inner = (
    <>
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </>
  );
  return group ? (
    <div role="group" aria-label={label}>
      {inner}
    </div>
  ) : (
    <label className="block">{inner}</label>
  );
}

/** Thin horizontal progress bar. */
export function Progress({ pct, tone = 'str' }: { pct: number; tone?: Tone }) {
  const fill = { default: 'bg-ink', str: 'bg-str', car: 'bg-car', gold: 'bg-gold', danger: 'bg-danger', wat: 'bg-wat' }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <div className={`h-full rounded-full ${fill} transition-[width] duration-700`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** Profile and Settings, reachable from the header of every main page. */
export function HeaderActions() {
  return (
    <>
      <IconButton label="Profile" to="/profile">
        <UserCircle size={20} weight="bold" />
      </IconButton>
      <IconButton label="Settings and data" to="/settings">
        <GearSix size={20} weight="bold" />
      </IconButton>
    </>
  );
}

export function IconButton({ label, onClick, children, to }: { label: string; onClick?: () => void; children: ReactNode; to?: string }) {
  const cls = 'grid h-11 w-11 place-items-center rounded-btn border border-line bg-surface text-ink hover:bg-raised';
  if (to)
    return (
      <Link to={to} className={cls} aria-label={label}>
        {children}
      </Link>
    );
  return (
    <button onClick={onClick} className={cls} aria-label={label}>
      {children}
    </button>
  );
}
