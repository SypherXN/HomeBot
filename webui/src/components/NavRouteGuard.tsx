import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { type NavPageId } from "../lib/navConfig";
import { useNavVisibility } from "../nav/NavVisibilityContext";

export default function NavRouteGuard({ pageId, children }: { pageId: NavPageId; children: ReactNode }) {
  const { isVisible } = useNavVisibility();
  if (!isVisible(pageId)) return <Navigate to="/" replace />;
  return children;
}
