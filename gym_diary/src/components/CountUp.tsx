import { useRef } from 'react';
import { useCountUp, useInView } from '../lib/anim';

/**
 * Number that counts up from 0 the first time it scrolls into view, then animates from its old value
 * to the new one when it changes; `format` turns it into text. Screen readers get the final value.
 */
export default function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  duration,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const arrived = useRef(false);
  // The first count from 0 takes a little longer (bigger numbers), later changes are quick.
  const first = inView && !arrived.current;
  const n = useCountUp(inView ? value : 0, first ? 750 : duration, 0);
  if (inView && n === value) arrived.current = true;
  return (
    <span ref={ref} className="num">
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden>{format(n)}</span>
    </span>
  );
}
