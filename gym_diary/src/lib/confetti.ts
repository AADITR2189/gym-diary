import { prefersReducedMotion } from './anim';

/**
 * A short confetti burst in the app's colours, drawn on a throw-away canvas above everything.
 * `big` (a new record, a streak milestone) throws more pieces from both sides. Skipped under reduced motion.
 */
export function confetti({ big = false, originY = 0.35 }: { big?: boolean; originY?: number } = {}) {
  if (typeof document === 'undefined' || prefersReducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:80;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const css = getComputedStyle(document.documentElement);
  const colours = ['--str', '--gold', '--wat', '--car', '--primary']
    .map((v) => css.getPropertyValue(v).trim())
    .filter(Boolean)
    .map((v) => `rgb(${v})`);
  if (!colours.length) colours.push('#FFFE15', '#00A896');

  type P = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; round: boolean };
  const pieces: P[] = [];
  const add = (x: number, y: number, angle: number, spread: number, n: number, speed: number) => {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.55 + Math.random() * 0.6);
      pieces.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        w: 6 + Math.random() * 5,
        h: 4 + Math.random() * 4,
        c: colours[i % colours.length],
        round: Math.random() < 0.3,
      });
    }
  };
  // Upward fan from the middle; big bursts add two side cannons.
  add(W / 2, H * originY, -Math.PI / 2, Math.PI * 0.9, big ? 90 : 55, Math.min(W, 520) * 1.5);
  if (big) {
    add(0, H * 0.7, -Math.PI / 3, 0.6, 45, H * 1.5);
    add(W, H * 0.7, (-Math.PI * 2) / 3, 0.6, 45, H * 1.5);
  }

  const life = big ? 2600 : 1900;
  const start = performance.now();
  let last = start;
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = t > life - 500 ? Math.max(0, (life - t) / 500) : 1;
    for (const p of pieces) {
      p.vy += 900 * dt; // gravity
      p.vx *= 1 - 1.6 * dt; // air drag
      p.vy *= 1 - 1.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.h / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Flutter: the piece narrows as it turns over.
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w * Math.abs(Math.cos(p.r * 1.7)) + 1, p.h);
      }
      ctx.restore();
    }
    if (t < life) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
