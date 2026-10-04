import { useCallback, useRef, useState } from "react";

/** Ignores a second submit until the first finishes, even before React re-renders. */
export function useSubmitLock() {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(crypto.randomUUID());
  const payloadRef = useRef<string | null>(null);

  const run = useCallback(async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  /** Same payload keeps the same key so a lost response can be retried. A changed payload is a new save. */
  const key = useCallback((payload?: unknown) => {
    const serialized = payload === undefined ? payloadRef.current : JSON.stringify(payload);
    if (serialized !== payloadRef.current) {
      payloadRef.current = serialized;
      keyRef.current = crypto.randomUUID();
    }
    return keyRef.current;
  }, []);

  const rotate = useCallback(() => {
    keyRef.current = crypto.randomUUID();
  }, []);

  return { busy, run, key, rotate };
}
