import { Switch } from "@/components/ui/switch";
import { FREESTYLE_MODE, GUIDED_MODE, type ConversationModeId } from "@/lib/conversationMode";

export function ModeSwitch({
  id,
  mode,
  onChange
}: {
  id: string;
  mode: ConversationModeId;
  onChange: (mode: ConversationModeId) => void;
}) {
  return (
    <div className="flex min-h-9 shrink-0 items-center gap-2 rounded-md bg-secondary px-1 text-sm font-semibold text-foreground">
      <label htmlFor={id}>Guided</label>
      <Switch
        checked={mode === GUIDED_MODE}
        className={mode === GUIDED_MODE ? "!bg-primary" : ""}
        id={id}
        onCheckedChange={(guided) => onChange(guided ? GUIDED_MODE : FREESTYLE_MODE)}
      />
    </div>
  );
}
