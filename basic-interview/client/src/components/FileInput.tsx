import { FileText, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FileInputProps = {
  id: string;
  label: string;
  file?: File | null;
  onFileChange: (file: File | null) => void;
  required?: boolean;
  emptyDescription?: string;
};

export function FileInput({ id, label, file, onFileChange, required, emptyDescription = "Upload when available" }: FileInputProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <div
        className={cn(
          "flex min-h-[72px] items-center justify-between gap-3 rounded-lg border border-dashed bg-card px-4 py-3",
          file ? "border-primary/50 bg-accent/35" : "border-input"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
            {file ? <FileText className="size-5 text-primary" /> : <Upload className="size-5 text-muted-foreground" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{file ? file.name : ".txt, .pdf, or .docx"}</p>
            <p className="text-xs text-muted-foreground">{file ? `${Math.ceil(file.size / 1024)} KB` : emptyDescription}</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <label htmlFor={id} className="cursor-pointer">
            Choose
          </label>
        </Button>
      </div>
      <input
        id={id}
        className="sr-only"
        type="file"
        accept=".txt,.pdf,.docx"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}
