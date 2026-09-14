import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isNavPageHidden, type NavPageId } from "../lib/navConfig";
import { loadHiddenNavPages, saveHiddenNavPages } from "../lib/navPrefs";

type NavVisibilityContextValue = {
  hiddenPages: ReadonlySet<NavPageId>;
  isVisible: (id: NavPageId) => boolean;
  setPageVisible: (id: NavPageId, visible: boolean) => void;
};

const NavVisibilityContext = createContext<NavVisibilityContextValue | null>(null);

export function NavVisibilityProvider({ children }: { children: ReactNode }) {
  const [hiddenPages, setHiddenPages] = useState<Set<NavPageId>>(() => loadHiddenNavPages());

  useEffect(() => {
    function onChange() {
      setHiddenPages(loadHiddenNavPages());
    }
    window.addEventListener("homebot-nav-prefs-changed", onChange);
    return () => window.removeEventListener("homebot-nav-prefs-changed", onChange);
  }, []);

  const setPageVisible = useCallback((id: NavPageId, visible: boolean) => {
    setHiddenPages((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(id);
      else next.add(id);
      saveHiddenNavPages(next);
      return next;
    });
  }, []);

  const isVisible = useCallback((id: NavPageId) => !isNavPageHidden(hiddenPages, id), [hiddenPages]);

  const value = useMemo(
    () => ({ hiddenPages, isVisible, setPageVisible }),
    [hiddenPages, isVisible, setPageVisible]
  );

  return <NavVisibilityContext.Provider value={value}>{children}</NavVisibilityContext.Provider>;
}

export function useNavVisibility(): NavVisibilityContextValue {
  const ctx = useContext(NavVisibilityContext);
  if (!ctx) throw new Error("useNavVisibility must be used within NavVisibilityProvider");
  return ctx;
}
