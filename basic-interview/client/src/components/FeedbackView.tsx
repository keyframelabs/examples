import type { ReactNode } from "react";
import { ArrowLeft, Download, FilePenLine, Medal, RefreshCcw, TriangleAlert } from "lucide-react";

import { getFeedbackArtifactPdfUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeedbackArtifact } from "@kfl-interview/shared";

type FeedbackViewProps = {
  artifact: FeedbackArtifact;
  onRestart: () => void;
  onBackToInterview: () => void;
};

export function FeedbackView({ artifact, onRestart, onBackToInterview }: FeedbackViewProps) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Interview coaching summary</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onBackToInterview}>
            <ArrowLeft />
            Back
          </Button>
          <Button variant="outline" asChild>
            <a href={getFeedbackArtifactPdfUrl(artifact.interviewId)} download target="_blank" rel="noreferrer">
              <Download />
              Download PDF
            </a>
          </Button>
          <Button onClick={onRestart}>
            <RefreshCcw />
            New interview
          </Button>
        </div>
      </div>

      <section className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Overall summary</CardTitle>
            <CardDescription>Generated {new Date(artifact.generatedAt).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="leading-7">{artifact.overallSummary}</p>
          </CardContent>
        </Card>

        {!artifact.transcriptAvailable ? (
          <Card>
            <CardHeader>
              <CardTitle>Transcript unavailable</CardTitle>
              <CardDescription>No coaching improvements are shown without a transcript.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                End another call after transcript capture is active, then generate the summary again.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              <InsightCard
                icon={<Medal className="size-4 text-primary" />}
                title="Strengths"
                items={artifact.strengths.map((item) => ({
                  heading: item.title,
                  body: `${item.evidence} ${item.whyItMatters}`
                }))}
              />
              <InsightCard
                icon={<TriangleAlert className="size-4 text-destructive" />}
                title="Gaps"
                items={artifact.gaps.map((item) => ({
                  heading: item.title,
                  body: `${item.evidence} ${item.improvement}`
                }))}
              />
            </div>

            {artifact.resumeSuggestions.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FilePenLine className="size-4 text-primary" />
                    Tailor your resume to this role
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {artifact.resumeSuggestions.map((suggestion) => (
                    <div key={`${suggestion.title}-${suggestion.improvedBullet}`} className="py-4 first:pt-0 last:pb-0">
                      <p className="text-sm font-medium">{suggestion.title}</p>
                      <div className="mt-3 grid gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase text-muted-foreground">Replace or update</p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{suggestion.currentBullet}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase text-muted-foreground">Use this bullet</p>
                          <p className="mt-1 text-sm font-medium leading-6 text-foreground">{suggestion.improvedBullet}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">{suggestion.rationale}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function InsightCard({
  icon,
  title,
  items
}: {
  icon: ReactNode;
  title: string;
  items: Array<{ heading: string; body: string }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {items.map((item) => (
          <div key={item.heading} className="rounded-md border bg-background p-3">
            <p className="text-sm font-medium">{item.heading}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
