import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './anim';
import { spring, tween, type SpringHandle } from './spring';

export interface PresenceOptions {
  damping?: number;
  response?: number;
}

/**
 * Keeps an element mounted while it animates in and out. `apply(p, reduced)` is called every frame
 * with progress 0 (gone) → 1 (shown). The animation always starts from the current progress, so
 * opening something that is still closing reverses smoothly instead of jumping.
 * Under reduced motion the progress runs as a short linear fade; `reduced` tells `apply` to use opacity only.
 */
export function usePresence(open: boolean, apply: (p: number, reduced: boolean) => void, opts: PresenceOptions = {}) {
  const [mounted, setMounted] = useState(open);
  const p = useRef(0);
  const anim = useRef<SpringHandle | null>(null);
  const target = useRef<number | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  const set = (v: number) => {
    p.current = v;
    applyRef.current(v, prefersReducedMotion());
  };

  const animateTo = (to: number, o: PresenceOptions & { velocity?: number } = {}) => {
    anim.current?.stop();
    target.current = to;
    const done = () => {
      target.current = null;
      if (to === 0 && !openRef.current) setMounted(false);
    };
    if (prefersReducedMotion()) {
      anim.current = tween(p.current, to, 180, set, done);
      return;
    }
    anim.current = spring(p.current, to, {
      damping: o.damping ?? opts.damping ?? 1,
      response: o.response ?? opts.response ?? 0.35,
      velocity: o.velocity ?? 0,
      onUpdate: set,
      onDone: done,
    });
  };

  useLayoutEffect(() => {
    if (!mounted) return;
    set(p.current);
    const to = open ? 1 : 0;
    // A gesture may already be carrying it there with its own velocity; don't restart that.
    if (target.current === to) return;
    animateTo(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  useEffect(() => () => anim.current?.stop(), []);

  const stop = () => {
    anim.current?.stop();
    target.current = null;
  };
  return { mounted, progress: p, set, animateTo, stop };
}
