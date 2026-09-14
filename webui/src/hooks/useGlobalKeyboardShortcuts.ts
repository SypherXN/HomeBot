import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { KEYBOARD_SHORTCUTS, TOGGLEABLE_NAV_PAGES } from "../lib/navConfig";
import { useNavVisibility } from "../nav/NavVisibilityContext";

function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
  );
}

export function useGlobalKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isVisible } = useNavVisibility();
  const navMap = useMemo(() => {
    const map: Record<string, string> = { h: "/", s: "/settings" };
    for (const page of TOGGLEABLE_NAV_PAGES) {
      const key = KEYBOARD_SHORTCUTS[page.id];
      if (key && isVisible(page.id)) map[key] = page.to;
    }
    return map;
  }, [isVisible]);
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef(false);
  const gTimer = useRef<number | null>(null);

  useEffect(() => {
    function clearGTimer() {
      if (gTimer.current != null) {
        window.clearTimeout(gTimer.current);
        gTimer.current = null;
      }
      pendingG.current = false;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if (e.key === "Escape") {
        if (helpOpen) {
          e.preventDefault();
          setHelpOpen(false);
          return;
        }
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.id === "global-search-input") {
          active.blur();
        }
        return;
      }

      if (helpOpen) return;

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("global-search-input")?.focus();
        return;
      }

      if (pendingG.current && navMap[e.key]) {
        e.preventDefault();
        clearGTimer();
        navigate(navMap[e.key]);
        return;
      }

      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        pendingG.current = true;
        if (gTimer.current != null) window.clearTimeout(gTimer.current);
        gTimer.current = window.setTimeout(clearGTimer, 1200);
        return;
      }

      if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
        const path = location.pathname.replace(/\/$/, "") || "/";
        if (path === "/buy") {
          e.preventDefault();
          document.getElementById("buy-add-name")?.focus();
        } else if (path === "/wishlist") {
          e.preventDefault();
          document.getElementById("wl-add-name")?.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearGTimer();
    };
  }, [helpOpen, location.pathname, navigate, navMap]);

  return { helpOpen, setHelpOpen };
}
