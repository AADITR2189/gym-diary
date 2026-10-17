import { useEffect, useRef, useState } from 'react';

// One shared IntersectionObserver: elements fade/rise in once as they enter the viewport.
const callbacks = new WeakMap<Element, () => void>();
let io: IntersectionObserver | null = null;
function observer() {
  if (!io && typeof IntersectionObserver !== 'undefined')
    io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            callbacks.get(e.target)?.();
            callbacks.delete(e.target);
            io?.unobserve(e.target);
          }
        }),
      // Extended upwards so content skipped by a fast scroll is revealed too.
      { rootMargin: '100000px 0px -24px 0px', threshold: 0 },
    );
  return io;
}

/**
 * Returns a ref and whether the element has been seen. Kept in React state (not added to classList
 * directly) so a re-render that changes the element's className can never hide it again.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const o = observer();
    if (!el) return;
    if (!o) {
      setShown(true);
      return;
    }
    callbacks.set(el, () => setShown(true));
    o.observe(el);
    return () => {
      callbacks.delete(el);
      o.unobserve(el);
    };
  }, []);
  return [ref, shown] as const;
}
