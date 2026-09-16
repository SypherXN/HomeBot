import { useState, type ReactNode } from "react";
import { useCoarsePointer } from "../lib/useCoarsePointer";

type Props = {
  children: (props: { hideTooltip: boolean }) => ReactNode;
  className?: string;
};

/**
 * On touch devices, Recharts tooltips otherwise stay visible after tap.
 * While the finger is down, allow the chart tooltip; hide it on release.
 */
export default function ChartTouchShell({ children, className = "" }: Props) {
  const coarse = useCoarsePointer();
  const [touching, setTouching] = useState(false);

  const hideTooltip = coarse && !touching;

  return (
    <div
      className={className}
      onTouchStart={() => coarse && setTouching(true)}
      onTouchEnd={() => setTouching(false)}
      onTouchCancel={() => setTouching(false)}
    >
      {children({ hideTooltip })}
    </div>
  );
}
