import { Label } from "@/components/ui/label";
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
      <Label className="font-semibold leading-normal" htmlFor={id}>Guided</Label>
      <Switch
        checked={mode === GUIDED_MODE}
        className={mode === GUIDED_MODE ? "data-[state=checked]:bg-primary" : ""}
        id={id}
        onCheckedChange={(guided) => onChange(guided ? GUIDED_MODE : FREESTYLE_MODE)}
      />
    </div>
  );
}
