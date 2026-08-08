import { useCallback, useState } from "react";

import {
  EMPTY_CANVAS_SNAPSHOT,
  type CanvasEdge,
  type CanvasNode,
  type CanvasSnapshot
} from "@/components/canvas/types";

const MAX_HISTORY_DEPTH = 100;

interface CanvasHistory {
  past: CanvasSnapshot[];
  present: CanvasSnapshot;
  future: CanvasSnapshot[];
  isDirty: boolean;
}

export type SnapshotUpdater = (snapshot: CanvasSnapshot) => CanvasSnapshot;

/**
 * Undo/redo over canvas snapshots. `update` records a history entry when the
 * result meaningfully differs (selection-only changes never do). Interactions
 * that stream intermediate states (drag, resize, text editing) use
 * `updateEphemeral` while active and `commitFrom` with the pre-interaction
 * snapshot when they finish, producing a single undo entry.
 */
export function useCanvasHistory() {
  const [history, setHistory] = useState<CanvasHistory>({
    past: [],
    present: EMPTY_CANVAS_SNAPSHOT,
    future: [],
    isDirty: false
  });

  const update = useCallback((updater: SnapshotUpdater) => {
    setHistory((current) => {
      const next = updater(current.present);
      if (snapshotsEqual(next, current.present)) {
        return next === current.present
          ? current
          : { ...current, present: next };
      }
      return {
        past: pushEntry(current.past, current.present),
        present: next,
        future: [],
        isDirty: true
      };
    });
  }, []);

  const updateEphemeral = useCallback((updater: SnapshotUpdater) => {
    setHistory((current) => {
      const next = updater(current.present);
      return next === current.present ? current : { ...current, present: next };
    });
  }, []);

  const commitFrom = useCallback((base: CanvasSnapshot) => {
    setHistory((current) => {
      if (snapshotsEqual(base, current.present)) return current;
      return {
        past: pushEntry(current.past, base),
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
      const [next, ...future] = current.future;
      if (!next) return current;
      return {
        past: pushEntry(current.past, current.present),
        present: next,
        future,
        isDirty: current.isDirty
      };
    });
  }, []);

  return {
    snapshot: history.present,
    update,
    updateEphemeral,
    commitFrom,
    markDirty,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    isDirty: history.isDirty
  };
}

function pushEntry(
  past: CanvasSnapshot[],
  entry: CanvasSnapshot
): CanvasSnapshot[] {
  const next = [...past, entry];
  return next.length > MAX_HISTORY_DEPTH
    ? next.slice(next.length - MAX_HISTORY_DEPTH)
    : next;
}

/**
 * Structural equality over everything that matters for undo: identity,
 * geometry, and domain data. Selection state is deliberately ignored.
 */
export function snapshotsEqual(
  a: CanvasSnapshot,
  b: CanvasSnapshot
): boolean {
  if (a === b) return true;
  return (
    a.nodes.length === b.nodes.length &&
    a.edges.length === b.edges.length &&
    a.nodes.every((node, index) => nodesEqual(node, b.nodes[index])) &&
    a.edges.every((edge, index) => edgesEqual(edge, b.edges[index]))
  );
}

function nodesEqual(a: CanvasNode, b: CanvasNode): boolean {
  return (
    a.id === b.id &&
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.data === b.data
  );
}

function edgesEqual(a: CanvasEdge, b: CanvasEdge): boolean {
  return (
    a.id === b.id &&
    a.source === b.source &&
    a.target === b.target &&
    a.sourceHandle === b.sourceHandle &&
    a.targetHandle === b.targetHandle &&
    a.data === b.data
  );
}
