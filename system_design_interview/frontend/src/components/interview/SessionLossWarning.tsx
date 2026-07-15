import { TriangleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert";

export function SessionLossWarning() {
  return (
    <Alert
      role="note"
      className="pointer-events-none fixed bottom-28 left-1/2 z-30 flex w-[min(42rem,calc(100vw-7rem))] -translate-x-1/2 items-start gap-2 border-amber-500/40 bg-card/95 px-3 py-2.5 text-card-foreground shadow-toolbar backdrop-blur-sm sm:bottom-4 [&>svg]:static [&>svg~*]:pl-0"
    >
      <TriangleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
        <AlertTitle className="mb-0 text-xs">Temporary session</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          Back or refresh will clear the canvas and end the interview.
        </AlertDescription>
      </div>
    </Alert>
  );
}
