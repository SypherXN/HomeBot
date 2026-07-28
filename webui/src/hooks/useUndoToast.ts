import { useCallback } from "react";
import { postUndo } from "../api";
import { useAuth } from "../auth/AuthContext";
import { useToasts } from "../components/toastContext";
import { validActorId } from "../lib/validation";

/**
 * Show a success toast with an "Undo" action wired to the backend undo service.
 * Falls back to a plain toast when no valid actor id is configured.
 * Throws (so ToastProvider can surface an error) when undo finds nothing to revert.
 */
export function useUndoToast() {
  const { token, actorUserId } = useAuth();
  const { showToast } = useToasts();

  return useCallback(
    (message: string, onUndone?: () => void) => {
      const tok = token.trim();
      const actor = actorUserId.trim();
      if (!tok || !validActorId(actor)) {
        showToast({ message, kind: "success" });
        return;
      }
      showToast({
        message,
        kind: "success",
        action: {
          label: "Undo",
          onAction: async () => {
            const r = await postUndo(tok, actor);
            if (!r.undone) {
              throw new Error((r.message && r.message.trim()) || "Nothing to undo for this actor.");
            }
            onUndone?.();
          },
        },
      });
    },
    [token, actorUserId, showToast]
  );
}
