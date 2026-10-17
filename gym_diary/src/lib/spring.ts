import { prefersReducedMotion } from './anim';

/**
 * Apple-style springs: described by damping ratio (1 = no overshoot, < 1 = bounce) and response
 * (seconds to reach the target, roughly). They start from the current value and velocity, so any
 * animation can be grabbed and redirected mid-flight.
 */
export interface SpringOptions {
  damping?: number;
  response?: number;
  /** Initial velocity in units per second (e.g. px/s from a gesture). */
  velocity?: number;
  onUpdate: (value: number) => void;
  onDone?: () => void;
}

export interface SpringHandle {
  stop: () => void;
  value: () => number;
  velocity: () => number;
}

export function spring(from: number, to: number, { damping = 1, response = 0.35, velocity = 0, onUpdate, onDone }: SpringOptions): SpringHandle {
  let x = from;
  let v = velocity;
  let raf = 0;
  let stopped = false;
  const handle: SpringHandle = {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
    },
    value: () => x,
    velocity: () => v,
  };
  if (prefersReducedMotion()) {
    x = to;
    v = 0;
    onUpdate(to);
    onDone?.();
    return handle;
  }
  const k = Math.pow((2 * Math.PI) / response, 2);
  const c = (4 * Math.PI * damping) / response;
  let last = performance.now();
  const tick = (now: number) => {
    if (stopped) return;
    let dt = Math.min(0.064, (now - last) / 1000);
    last = now;
    // Small fixed sub-steps keep the integration stable on slow frames.
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240);
      const a = -k * (x - to) - c * v;
      v += a * h;
      x += v * h;
      dt -= h;
    }
    if (Math.abs(x - to) < 0.3 && Math.abs(v) < 2) {
      x = to;
      v = 0;
      onUpdate(to);
      onDone?.();
      return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return handle;
}

/** Where a flick would come to rest (Apple's scroll-deceleration projection). */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Soft resistance past an edge: the further you pull, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Tracks recent pointer positions to measure release velocity (px/s). */
export function velocityTracker() {
  let pts: { t: number; p: number }[] = [];
  return {
    reset(p: number) {
      pts = [{ t: performance.now(), p }];
    },
    add(p: number) {
      const t = performance.now();
      pts.push({ t, p });
      pts = pts.filter((q) => t - q.t < 100);
    },
    velocity() {
      if (pts.length < 2) return 0;
      const a = pts[0];
      const b = pts[pts.length - 1];
      const dt = (b.t - a.t) / 1000;
      return dt > 0 ? (b.p - a.p) / dt : 0;
    },
  };
}

/** Plain timed tween, used for the gentle cross-fades that replace springs under reduced motion. */
export function tween(from: number, to: number, ms: number, onUpdate: (v: number) => void, onDone?: () => void): SpringHandle {
  let x = from;
  let raf = 0;
  let stopped = false;
  const start = performance.now();
  const tick = (now: number) => {
    if (stopped) return;
    const k = Math.min(1, (now - start) / ms);
    x = from + (to - from) * k;
    onUpdate(x);
    if (k < 1) raf = requestAnimationFrame(tick);
    else onDone?.();
  };
  raf = requestAnimationFrame(tick);
  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
    },
    value: () => x,
    velocity: () => 0,
  };
}
