import {
  ArrowRight,
  Database,
  MousePointer2,
  Redo2,
  Square,
  Table2,
  Type,
  Undo2,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";

import type {
  CanvasConnectionCardinality,
  CanvasElement,
  CanvasTool
} from "@/components/canvas/model/types";
import { isConnection } from "@/components/canvas/model/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ToggleGroup,
  ToggleGroupItem
} from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

export interface CardinalityMenuState {
  connectionId: string;
  x: number;
  y: number;
}

const TOOL_ITEMS: Array<{
  id: CanvasTool;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "service", label: "Service", icon: Square },
  { id: "database", label: "Database", icon: Database },
  { id: "table", label: "Table", icon: Table2 },
  { id: "text", label: "Text", icon: Type },
  { id: "connector", label: "Connector", icon: ArrowRight }
];

const CARDINALITY_ITEMS: Array<{
  id: CanvasConnectionCardinality;
  label: string;
  shortLabel: string;
}> = [
  { id: "one-to-one", label: "One to one", shortLabel: "1:1" },
  { id: "one-to-many", label: "One to many", shortLabel: "1:N" },
  { id: "many-to-one", label: "Many to one", shortLabel: "N:1" },
  { id: "many-to-many", label: "Many to many", shortLabel: "N:N" }
];

export function CanvasToolbar({
  tool,
  canUndo,
  canRedo,
  connectionCardinality,
  onToolChange,
  onCardinalityChange,
  onUndo,
  onRedo,
  toolbarEnd
}: {
  tool: CanvasTool;
  canUndo: boolean;
  canRedo: boolean;
  connectionCardinality: CanvasConnectionCardinality;
  onToolChange: (tool: CanvasTool) => void;
  onCardinalityChange: (cardinality: CanvasConnectionCardinality) => void;
  onUndo: () => void;
  onRedo: () => void;
  toolbarEnd?: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={250}>
      <Card className="absolute left-4 top-4 z-20 flex items-center gap-2 bg-card/95 p-1 backdrop-blur-sm">
        <ToggleGroup
          type="single"
          value={tool}
          onValueChange={(nextTool) =>
            onToolChange((nextTool || "select") as CanvasTool)
          }
        >
          {TOOL_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <ToggleGroupItem
                      value={item.id}
                      aria-label={item.label}
                      size="icon"
                    >
                      <Icon size={18} />
                    </ToggleGroupItem>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
        <Separator orientation="vertical" className="mx-1 h-7" />
        <ToolbarButton
          label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
          icon={<Undo2 size={18} />}
        />
        <ToolbarButton
          label="Redo"
          disabled={!canRedo}
          onClick={onRedo}
          icon={<Redo2 size={18} />}
        />
        {toolbarEnd ? (
          <>
            <Separator orientation="vertical" className="mx-1 h-7" />
            {toolbarEnd}
          </>
        ) : null}
      </Card>

      {tool === "connector" ? (
        <Card className="absolute left-4 top-[72px] z-20 flex items-center gap-2 bg-card/95 p-1 backdrop-blur-sm">
          <ToggleGroup
            type="single"
            value={connectionCardinality}
            onValueChange={(nextCardinality) => {
              if (nextCardinality) {
                onCardinalityChange(
                  nextCardinality as CanvasConnectionCardinality
                );
              }
            }}
          >
            {CARDINALITY_ITEMS.map((item) => (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <ToggleGroupItem
                      value={item.id}
                      aria-label={item.label}
                      size="sm"
                      className="min-w-10 tabular-nums"
                    >
                      {item.shortLabel}
                    </ToggleGroupItem>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{item.label}</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
        </Card>
      ) : null}
    </TooltipProvider>
  );
}

function ToolbarButton({
  label,
  disabled,
  onClick,
  icon
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          disabled={disabled}
          variant="ghost"
          size="icon"
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function CardinalityMenu({
  menu,
  connection,
  onSelect,
  onClose
}: {
  menu: CardinalityMenuState;
  connection: CanvasElement | undefined;
  onSelect: (cardinality: CanvasConnectionCardinality) => void;
  onClose: () => void;
}) {
  if (!isConnection(connection)) return null;

  return (
    <Card
      className="fixed z-40 w-[232px] bg-card/95 p-2 backdrop-blur-sm"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="text-xs font-semibold uppercase text-muted-foreground">
          Relationship
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-xs"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      <ToggleGroup
        type="single"
        value={connection.cardinality ?? "one-to-one"}
        onValueChange={(nextCardinality) => {
          if (nextCardinality) {
            onSelect(nextCardinality as CanvasConnectionCardinality);
          }
        }}
        className="grid grid-cols-2 gap-1"
      >
        {CARDINALITY_ITEMS.map((item) => (
          <ToggleGroupItem
            key={item.id}
            value={item.id}
            size="sm"
            title={item.label}
            aria-label={item.label}
            className="justify-center tabular-nums"
          >
            {item.shortLabel}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Card>
  );
}
