import { useEffect } from 'react';
import { useDragScroll } from '../../hooks/useDragScroll';

export default function ChartScrollContainer({ width, height, children }) {
  const scrollRef = useDragScroll();

  // Rola ate o fim (periodos mais recentes). O grafico do recharts mede a
  // largura depois do primeiro render, entao rolar so' uma vez deixava as
  // ultimas barras fora da area visivel - repete apos o layout assentar.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const toEnd = () => {
      el.scrollLeft = el.scrollWidth;
    };
    toEnd();
    const frame = requestAnimationFrame(toEnd);
    const timer = setTimeout(toEnd, 250);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [width, scrollRef]);

  return (
    <div className="chart-scroll" ref={scrollRef}>
      <div style={{ width, minWidth: '100%', height }}>{children}</div>
    </div>
  );
}
