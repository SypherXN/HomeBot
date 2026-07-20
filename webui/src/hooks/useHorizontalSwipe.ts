import { useRef } from "react";

type SwipeHandlers = {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
};

/**
 * Horizontal swipe → step calendar period.
 * Swipe left = next, swipe right = previous. Ignores mostly-vertical scrolls.
 */
export function useHorizontalSwipe(
  onSwipe: (direction: -1 | 1) => void,
  thresholdPx = 56
): SwipeHandlers {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  return {
    onTouchStart(e) {
      const t = e.touches[0];
      if (!t) return;
      startX.current = t.clientX;
      startY.current = t.clientY;
    },
    onTouchEnd(e) {
      if (startX.current == null || startY.current == null) return;
      const t = e.changedTouches[0];
      if (!t) {
        startX.current = null;
        startY.current = null;
        return;
      }
      const dx = t.clientX - startX.current;
      const dy = t.clientY - startY.current;
      startX.current = null;
      startY.current = null;
      if (Math.abs(dx) < thresholdPx) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
      onSwipe(dx < 0 ? 1 : -1);
    },
  };
}
