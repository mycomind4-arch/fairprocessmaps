"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface AutoSaveOptions {
  debounceMs?: number;
  onSave: (data: any) => Promise<Response>;
  enabled?: boolean;
}

interface AutoSaveState {
  saving: boolean;
  saved: boolean;
  error: string | null;
}

/**
 * Debounced auto-save hook.
 * Watches a data object and saves it after debounce delay when it changes.
 * All project work (CE cases, permits, timeline, evidence) auto-saves.
 */
export function useAutoSave<T extends Record<string, any>>(
  data: T,
  { debounceMs = 800, onSave, enabled = true }: AutoSaveOptions
): AutoSaveState & { triggerSave: () => void } {
  const [state, setState] = useState<AutoSaveState>({
    saving: false,
    saved: false,
    error: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  const firstRun = useRef(true);

  useEffect(() => {
    dataRef.current = data;

    if (!enabled || firstRun.current) {
      firstRun.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      setState({ saving: true, saved: false, error: null });
      try {
        await onSave(dataRef.current);
        setState({ saving: false, saved: true, error: null });
        // Clear "saved" indicator after 2s
        setTimeout(() => setState((s) => ({ ...s, saved: false })), 2000);
      } catch (err: any) {
        setState({ saving: false, saved: false, error: err.message || "Save failed" });
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [JSON.stringify(data), enabled, debounceMs]);

  const triggerSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ saving: true, saved: false, error: null });
    onSave(dataRef.current)
      .then(() => {
        setState({ saving: false, saved: true, error: null });
        setTimeout(() => setState((s) => ({ ...s, saved: false })), 2000);
      })
      .catch((err) =>
        setState({ saving: false, saved: false, error: err.message || "Save failed" })
      );
  }, [onSave]);

  return { ...state, triggerSave };
}
