import { useEffect, useId, useRef, useState } from 'react';
import { useData } from '../hooks/useData';
import { fmtVolume } from '../lib/water';
import { useInView } from '../lib/anim';
import { confetti } from '../lib/confetti';
import { haptic } from '../lib/feedback';

/**
 * Progress ring with an animated "water level" inside.
 * The outer arc and the inner fill both track today's % of target; the wave drifts slowly
 * (disabled under prefers-reduced-motion via the .wave class in index.css).
 */
export default function WaterRing({ ml, target, size = 168 }: { ml: number; target: number; size?: number }) {
  const { settings } = useData();
  const id = useId().replace(/:/g, '');
  const real = target > 0 ? Math.min(1, ml / target) : 0;
  const done = ml >= target && target > 0;
  // Fills up from empty the first time it is seen.
  const [ref, inView] = useInView<HTMLDivElement>();
  const pct = inView ? real : 0;

  // Each add drops a drop into the glass; reaching the goal makes a splash (and confetti, once).
  const mountedAt = useRef(performance.now());
  const prev = useRef(ml);
  const [drops, setDrops] = useState<number[]>([]);
  const [splash, setSplash] = useState(false);
  useEffect(() => {
    const before = prev.current;
    prev.current = ml;
    // Ignore the first moments, while saved data is still arriving.
    if (performance.now() - mountedAt.current < 800 || ml <= before) return;
    const key = performance.now();
    setDrops((d) => [...d.slice(-2), key]);
    const t = window.setTimeout(() => setDrops((d) => d.filter((k) => k !== key)), 750);
    if (target > 0 && before < target && ml >= target) {
      const s = window.setTimeout(() => {
        setSplash(true);
        window.setTimeout(() => setSplash(false), 750);
        haptic('success');
        confetti({ originY: 0.3 });
      }, 550);
      return () => {
        window.clearTimeout(t);
        window.clearTimeout(s);
      };
    }
    return () => window.clearTimeout(t);
  }, [ml, target]);
  const stroke = 10;
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const inner = r - stroke - 4; // water disc radius
  // Water surface y (top of the fill) inside the inner disc.
  const surface = size / 2 + inner - pct * inner * 2;

  return (
    <div
      ref={ref}
      className={`relative shrink-0 ${splash ? 'anim-splash' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(real * 100)}% of daily water target`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <clipPath id={`clip-${id}`}>
            <circle cx={size / 2} cy={size / 2} r={inner} />
          </clipPath>
        </defs>
        {/* track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-wat-soft" strokeWidth={stroke} />
        {/* progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className={`motion-ring ${done ? 'stroke-str' : 'stroke-wat'}`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)' }}
        />
        {/* water fill with wave */}
        <g clipPath={`url(#clip-${id})`}>
          <circle cx={size / 2} cy={size / 2} r={inner} className="fill-wat-soft" />
          <g className="motion-ring" style={{ transform: `translateY(${surface}px)`, transition: 'transform 900ms cubic-bezier(0.16,1,0.3,1)' }}>
            <path
              className="wave fill-wat"
              fillOpacity={0.85}
              d={`M0 6 Q ${size / 8} 0 ${size / 4} 6 T ${size / 2} 6 T ${(size * 3) / 4} 6 T ${size} 6 T ${(size * 5) / 4} 6 T ${(size * 3) / 2} 6 T ${(size * 7) / 4} 6 T ${size * 2} 6 V ${size * 2} H 0 Z`}
            />
          </g>
        </g>
        {/* falling drops */}
        {drops.map((k) => (
          <path
            key={k}
            className="anim-drop fill-wat"
            style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
            d={`M ${size / 2} ${size / 2 - inner * 0.55} c -5 7 -7 10 -7 13 a 7 7 0 0 0 14 0 c 0 -3 -2 -6 -7 -13 z`}
          />
        ))}
      </svg>
      {/* Label sits on a solid chip so it stays readable whatever the water level is. */}
      <div className="absolute inset-0 flex items-center justify-center text-center">
        <div className="rounded-btn bg-surface/90 px-2 py-1 leading-none">
          <div className={`h-display num leading-none text-ink ${size >= 130 ? 'text-[1.75rem]' : 'text-xl'}`}>{Math.round(real * 100)}%</div>
          {size >= 110 && <div className="num mt-0.5 text-[0.6875rem] font-medium text-muted">{fmtVolume(ml, settings.volumeUnit, { short: true })}</div>}
        </div>
      </div>
    </div>
  );
}
