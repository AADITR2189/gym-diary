import { useCountUp } from '../lib/anim';

/** Number that animates from its old value to the new one when it changes; `format` turns it into text. */
export default function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  duration,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const n = useCountUp(value, duration);
  return <span className="num">{format(n)}</span>;
}
