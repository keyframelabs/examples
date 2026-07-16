import { useCallback, useState } from "react";
import {
  canvasReducer,
  createEmptyCanvasState,
  type CanvasAction
} from "@/components/canvas/model/state";
import type { CanvasState } from "@/components/canvas/model/types";

interface CanvasHistory {
  past: CanvasState[];
  present: CanvasState;
  future: CanvasState[];
  isDirty: boolean;
}

export function useCanvasHistory(initialState?: CanvasState) {
  const [history, setHistory] = useState<CanvasHistory>({
    past: [],
    present: initialState ?? createEmptyCanvasState(),
    future: [],
    isDirty: false
  });

  const apply = useCallback((action: CanvasAction) => {
    setHistory((current) => {
      const next = canvasReducer(current.present, action);
      if (Object.is(next, current.present)) return current;
      return {
        past: [...current.past, current.present],
        present: next,
        future: [],
        isDirty: current.isDirty || isMeaningfulCanvasAction(action)
      };
    });
  }, []);

  const applyEphemeral = useCallback((action: CanvasAction) => {
    setHistory((current) => ({
      ...current,
      present: canvasReducer(current.present, action)
    }));
  }, []);

  const commitSnapshot = useCallback((snapshot: CanvasState) => {
    setHistory((current) => {
      if (JSON.stringify(snapshot) === JSON.stringify(current.present)) {
        return current;
      }
      return {
        past: [...current.past, snapshot],
        present: current.present,
        future: [],
        isDirty: true
      };
    });
  }, []);

  const markDirty = useCallback(() => {
    setHistory((current) =>
      current.isDirty ? current : { ...current, isDirty: true }
    );
  }, []);

  const replacePresent = useCallback((state: CanvasState) => {
    setHistory((current) => ({ ...current, present: state }));
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past[current.past.length - 1];
      if (!previous) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
        isDirty: current.isDirty
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
        isDirty: current.isDirty
      };
    });
  }, []);

  return {
    state: history.present,
    apply,
    applyEphemeral,
    commitSnapshot,
    markDirty,
    replacePresent,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    isDirty: history.isDirty
  };
}

export function isMeaningfulCanvasAction(action: CanvasAction): boolean {
  return !(
    action.type === "select" ||
    action.type === "clear-selection" ||
    action.type === "change-selection"
  );
}
