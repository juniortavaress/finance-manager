import { useEffect } from 'react';
import { useDragScroll } from '../../hooks/useDragScroll';

export default function ChartScrollContainer({ width, height, children }) {
  const scrollRef = useDragScroll();

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [width]);

  return (
    <div className="chart-scroll" ref={scrollRef}>
      <div style={{ width, minWidth: '100%', height }}>{children}</div>
    </div>
  );
}
