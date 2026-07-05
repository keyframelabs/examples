import { FormEvent, useState } from "react";
import { BriefcaseBusiness, Loader2, Sparkles } from "lucide-react";

import { FileInput } from "@/components/FileInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createInterview, type CreateInterviewInput } from "@/lib/api";
import type { InterviewCreateResponse } from "@kfl-interview/shared";

type SetupViewProps = {
  onCreated: (input: CreateInterviewInput, response: InterviewCreateResponse) => void;
};

export function SetupView({ onCreated }: SetupViewProps) {
  const [candidateName, setCandidateName] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!jobDescriptionText.trim()) {
      setError("Add a job description before creating the interview.");
      return;
    }

    const input: CreateInterviewInput = {
      candidateName,
      jobDescriptionText,
      resumeFile
    };

    try {
      setIsSubmitting(true);
      const response = await createInterview(input);
      onCreated(input, response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the interview.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-6 lg:px-8">
      <section className="flex flex-col gap-5">
        <div className="max-w-3xl">
          <h1 className="balanced text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
            Mock interview workspace
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Add the role details and an optional resume file to create a tailored mock interview.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BriefcaseBusiness className="size-4 text-primary" />
                Interview context
              </CardTitle>
              <CardDescription>Job description is required. Resume upload is optional.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="candidate-name">Candidate name</Label>
                <Input
                  id="candidate-name"
                  placeholder="Alex"
                  value={candidateName}
                  onChange={(event) => setCandidateName(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="job-description">
                  Job description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="job-description"
                  value={jobDescriptionText}
                  onChange={(event) => setJobDescriptionText(event.target.value)}
                  placeholder="Paste a concise role description here..."
                  className="min-h-[180px]"
                />
              </div>

              <FileInput
                id="resume-file"
                label="Resume file"
                file={resumeFile}
                onFileChange={setResumeFile}
                emptyDescription="Optional"
              />

              {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button type="submit" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  Create interview
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </section>
    </main>
  );
}
