import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Toggle } from "@/components/ui/toggle";
import type { BilingualSegment } from "@/lib/api";

export type SegmentSelection = { ownerId: string; index: number };

export function useSegmentSelection(): [
  SegmentSelection | null,
  Dispatch<SetStateAction<SegmentSelection | null>>
] {
  const [selection, setSelection] = useState<SegmentSelection | null>(null);
  const selectionActive = selection !== null;

  useEffect(() => {
    if (!selectionActive) return;
    const dismissPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-bilingual-segment]")) {
        setSelection(null);
      }
    };
    const dismissKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
    };
    document.addEventListener("pointerdown", dismissPointer);
    document.addEventListener("keydown", dismissKey);
    return () => {
      document.removeEventListener("pointerdown", dismissPointer);
      document.removeEventListener("keydown", dismissKey);
    };
  }, [selectionActive]);

  return [selection, setSelection];
}

type Props = {
  englishClassName?: string;
  highlightedCharacters?: number;
  karaokeComplete?: boolean;
  karaokeVariant?: "highlight" | "guided-script";
  onSelectionChange: (selection: SegmentSelection | null) => void;
  ownerId: string;
  segments: BilingualSegment[];
  selection: SegmentSelection | null;
  showEnglish: boolean;
  spanishClassName?: string;
};

const segmentClass = "bilingual-segment -mx-0.5 inline h-auto min-w-0 max-w-full appearance-none whitespace-normal break-words rounded-sm border-0 bg-transparent px-0.5 py-0 text-left text-inherit hover:bg-transparent hover:text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-0 data-[state=on]:bg-transparent data-[state=on]:text-inherit";

export function BilingualText({
  englishClassName = "",
  highlightedCharacters,
  karaokeComplete = false,
  karaokeVariant = "highlight",
  onSelectionChange,
  ownerId,
  segments,
  selection,
  showEnglish,
  spanishClassName = ""
}: Props) {
  const [preview, setPreview] = useState<number | null>(null);
  const pinned = selection?.ownerId === ownerId ? selection.index : null;
  const showTranslation = showEnglish || pinned !== null;
  const active = preview ?? pinned;
  let offset = 0;
  const progress = segments.map((segment) => {
    const value = highlightedCharacters === undefined
      ? undefined
      : Math.min(segment.spanish.length, Math.max(0, highlightedCharacters - offset));
    offset += segment.spanish.length + 1;
    return value;
  });
  const lines = [
    { language: "spanish" as const, className: `${spanishClassName} break-words ${karaokeVariant === "guided-script" ? karaokeComplete ? "text-green-700 dark:text-green-400" : "text-foreground" : ""}` },
    ...(showTranslation ? [{ language: "english" as const, className: englishClassName }] : [])
  ];

  return (
    <div className="min-w-0" data-bilingual-owner={ownerId}>
      {lines.map(({ language, className }) => (
        <p className={className} key={language} lang={language === "spanish" ? "es" : "en"}>
          {segments.map((segment, index) => {
            const primary = segment[language];
            const other = segment[language === "spanish" ? "english" : "spanish"];
            return (
              <span key={`${language}-${index}`}>
                {index > 0 ? " " : null}
                <Toggle
                  aria-label={`${language === "spanish" ? "Spanish" : "English"}: ${primary}; ${language === "spanish" ? "English" : "Spanish"}: ${other}`}
                  className={segmentClass}
                  data-active={active === index}
                  data-bilingual-segment=""
                  onBlur={() => setPreview(null)}
                  onFocus={() => showTranslation && setPreview(index)}
                  onMouseEnter={() => showTranslation && setPreview(index)}
                  onMouseLeave={() => setPreview(null)}
                  onPressedChange={(pressed) => onSelectionChange(pressed ? { ownerId, index } : null)}
                  pressed={pinned === index}
                  variant="unstyled"
                >
                  {language === "spanish"
                    ? <KaraokeSegment complete={karaokeComplete} progress={progress[index]} text={primary} variant={karaokeVariant} />
                    : primary}
                </Toggle>
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

function KaraokeSegment({ complete, progress, text, variant }: {
  complete: boolean;
  progress: number | undefined;
  text: string;
  variant: "highlight" | "guided-script";
}) {
  if (variant === "guided-script") {
    if (complete || progress === undefined || progress <= 0) return text;
    if (progress >= text.length) return <span className="text-blue-600 dark:text-blue-400">{text}</span>;
    return <><span className="text-blue-600 dark:text-blue-400">{text.slice(0, progress)}</span>{text.slice(progress)}</>;
  }
  const range = currentWordHighlightRange(text, progress);
  if (!range) return text;
  return <>{text.slice(0, range.start)}<mark className="rounded-sm bg-primary/20 text-inherit">{text.slice(range.start, range.end)}</mark>{text.slice(range.end)}</>;
}

export function currentWordHighlightRange(text: string, progress: number | undefined): { start: number; end: number } | null {
  if (progress === undefined || progress <= 0 || progress >= text.length) return null;
  const words = Array.from(text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu));
  const active = [...words].reverse().find((word) => (word.index ?? 0) < progress);
  return active?.index === undefined ? null : { start: active.index, end: active.index + active[0].length };
}
