import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { effectiveTimeZone } from "./calendarZoned";

const STORAGE_KEY = "homebot.webui.viewerTimeZone";

type CalendarZoneContextValue = {
  /** Raw stored value: empty string means “use browser zone”. */
  viewerTimeZone: string;
  effectiveViewerZone: string;
  setViewerTimeZone: (zoneId: string) => void;
};

const CalendarZoneContext = createContext<CalendarZoneContextValue | null>(null);

export function CalendarZoneProvider({ children }: { children: ReactNode }) {
  const [viewerTimeZone, setViewerTimeZoneState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const setViewerTimeZone = useCallback((zoneId: string) => {
    const v = zoneId.trim();
    setViewerTimeZoneState(v);
    try {
      if (v) localStorage.setItem(STORAGE_KEY, v);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const effectiveViewerZone = useMemo(() => effectiveTimeZone(viewerTimeZone), [viewerTimeZone]);

  const value = useMemo(
    () => ({
      viewerTimeZone,
      effectiveViewerZone,
      setViewerTimeZone,
    }),
    [viewerTimeZone, effectiveViewerZone, setViewerTimeZone]
  );

  return <CalendarZoneContext.Provider value={value}>{children}</CalendarZoneContext.Provider>;
}

export function useCalendarZone(): CalendarZoneContextValue {
  const v = useContext(CalendarZoneContext);
  if (!v) {
    throw new Error("useCalendarZone must be used within CalendarZoneProvider");
  }
  return v;
}
