import type { ReactNode } from 'react';
import { useInView } from '../lib/anim';

/** Simple progress ring that fills (animated) once visible. */
export default function GoalRing({
  pct,
  size = 96,
  tone = 'str',
  children,
  label,
}: {
  pct: number; // 0–100
  size?: number;
  tone?: 'str' | 'car' | 'gold';
  children?: ReactNode;
  label: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const stroke = 9;
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct)) / 100;
  const track = { str: 'stroke-str-soft', car: 'stroke-car-soft', gold: 'stroke-gold-soft' }[tone];
  const arc = { str: 'stroke-str', car: 'stroke-car', gold: 'stroke-gold' }[tone];
  return (
    <div ref={ref} className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className={`motion-ring ${arc}`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={inView ? c * (1 - p) : c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">{children}</div>
    </div>
  );
}
