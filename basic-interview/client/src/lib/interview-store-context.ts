import { createContext, useContext } from "react";
import { useStore } from "zustand";

import type { InterviewStore, InterviewStoreApi } from "@/lib/interview-store";

export const InterviewStoreContext = createContext<InterviewStoreApi | null>(null);

export function useInterviewStore<T>(selector: (state: InterviewStore) => T): T {
  const store = useContext(InterviewStoreContext);
  if (!store) {
    throw new Error("useInterviewStore must be used within InterviewStoreProvider.");
  }

  return useStore(store, selector);
}
