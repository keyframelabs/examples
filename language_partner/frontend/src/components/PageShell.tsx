import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PageShell({ children, className = "", contentClassName = "" }: Props) {
  return (
    <main className={`min-h-screen bg-secondary/55 px-3 text-foreground sm:px-6 lg:px-8 ${className}`}>
      <div
        className={`mx-auto min-h-screen w-full max-w-7xl border-x border-border/80 bg-background ${contentClassName}`}
        data-page-shell-content=""
      >
        {children}
      </div>
    </main>
  );
}
