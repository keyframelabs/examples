import { useRef, type ReactNode } from "react";

import { InterviewStoreContext } from "@/lib/interview-store-context";
import { createInterviewStore, type InterviewStoreApi } from "@/lib/interview-store";

export function InterviewStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<InterviewStoreApi | null>(null);

  if (!storeRef.current) {
    storeRef.current = createInterviewStore();
  }

  return (
    <InterviewStoreContext.Provider value={storeRef.current}>
      {children}
    </InterviewStoreContext.Provider>
  );
}
