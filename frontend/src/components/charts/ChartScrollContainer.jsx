import { useDragScroll } from '../../hooks/useDragScroll';

export default function ChartScrollContainer({ width, height, children }) {
  const scrollRef = useDragScroll();

  return (
    <div className="chart-scroll" ref={scrollRef}>
      <div style={{ width, height }}>{children}</div>
    </div>
  );
}
