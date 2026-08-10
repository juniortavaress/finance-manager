import { useEffect, useRef } from 'react';

export function useDragScroll() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;

    function handleMouseDown(e) {
      isDown = true;
      startX = e.pageX;
      startScrollLeft = el.scrollLeft;
      el.classList.add('dragging');
    }

    function handleMouseMove(e) {
      if (!isDown) return;
      e.preventDefault();
      el.scrollLeft = startScrollLeft - (e.pageX - startX);
    }

    function stopDragging() {
      isDown = false;
      el.classList.remove('dragging');
    }

    function handleWheel(e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }

    el.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDragging);
    el.addEventListener('mouseleave', stopDragging);
    el.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDragging);
      el.removeEventListener('mouseleave', stopDragging);
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return ref;
}
