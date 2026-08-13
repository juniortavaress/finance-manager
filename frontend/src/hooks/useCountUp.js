import { useEffect, useRef, useState } from 'react';

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function useCountUp(target, duration = 600) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const currentRef = useRef(target);
  const frameRef = useRef(null);

  useEffect(() => {
    const from = currentRef.current;
    const to = Number(target) || 0;
    if (from === to) return;

    fromRef.current = from;
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(t);
      const next = fromRef.current + (to - fromRef.current) * eased;
      currentRef.current = next;
      setValue(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        currentRef.current = to;
      }
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}
