import { useState, type ReactNode } from "react";
import { useCoarsePointer } from "../lib/useCoarsePointer";

type Props = {
  children: (props: { hideTooltip: boolean }) => ReactNode;
  className?: string;
};

/**
 * On touch devices, Recharts tooltips otherwise stay visible after tap.
 * While the finger is down, allow the chart tooltip; hide it on release.
 *
 * Charts own their horizontal gesture (hold-drag to scrub), so the shell opts
 * out of page-level month swipes via `data-no-page-swipe`.
 */
export default function ChartTouchShell({ children, className = "" }: Props) {
  const coarse = useCoarsePointer();
  const [touching, setTouching] = useState(false);

  const hideTooltip = coarse && !touching;

  return (
    <div
      className={className}
      data-no-page-swipe=""
      onTouchStart={(e) => {
        e.stopPropagation();
        if (coarse) setTouching(true);
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        setTouching(false);
      }}
      onTouchCancel={(e) => {
        e.stopPropagation();
        setTouching(false);
      }}
    >
      {children({ hideTooltip })}
    </div>
  );
}
