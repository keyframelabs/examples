import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { FeedbackArtifact } from "@kfl-interview/shared";

import { config } from "./config";

const execFile = promisify(execFileCallback);

const typstSourceFilename = "feedback-artifact.typ";
const artifactJsonFilename = "artifact.json";
const pdfFilename = "feedback-artifact.pdf";

export const FEEDBACK_ARTIFACT_TYPST_SOURCE = String.raw`#let accent = rgb("#2563eb")
#let accent-soft = rgb("#eaf1ff")
#let border = rgb("#d8dee9")
#let ink = rgb("#172033")
#let muted = rgb("#526071")
#let soft = rgb("#f7f9fc")
#let white = rgb("#ffffff")

#set page(
  paper: "us-letter",
  margin: (x: 0.68in, y: 0.72in),
  footer: align(center)[
    #text(size: 8pt, fill: muted)[Interview coaching summary]
  ],
)
#set text(font: "New Computer Modern", size: 10pt, fill: ink)
#set par(leading: 0.55em)

#let artifact = json("artifact.json")

#let pill(label, value) = box(
  fill: accent-soft,
  stroke: 0.4pt + border,
  radius: 3pt,
  inset: (x: 6pt, y: 3pt),
)[
  #text(size: 8pt, fill: muted)[#label: #strong[#value]]
]

#let section-heading(title) = [
  #v(9pt)
  #text(size: 12pt, weight: "semibold", fill: ink)[#title]
  #v(2pt)
  #line(length: 100%, stroke: 0.6pt + border)
  #v(5pt)
]

#let item-card(title, body, footer: none) = block(
  width: 100%,
  breakable: false,
  fill: soft,
  stroke: 0.55pt + border,
  radius: 4pt,
  inset: 8pt,
  below: 6pt,
)[
  #text(size: 9.7pt, weight: "semibold", fill: ink)[#title]
  #v(3pt)
  #text(size: 9pt, fill: muted)[#body]
  #if footer != none [
    #v(4pt)
    #text(size: 8.3pt, fill: accent)[#footer]
  ]
]

#align(center)[
  #text(size: 21pt, weight: "semibold", fill: ink)[Interview coaching summary]
  #v(5pt)
  #pill("Generated", artifact.at("generatedAt"))
  #h(4pt)
  #pill("Interview", artifact.at("interviewId"))
  #h(4pt)
  #pill("Transcript", if artifact.at("transcriptAvailable") { "included" } else { "not available" })
]

#section-heading("Overall summary")
#block(
  fill: accent-soft,
  stroke: 0.6pt + rgb("#bdd3ff"),
  radius: 5pt,
  inset: 10pt,
)[
  #artifact.at("overallSummary")
]

#if artifact.at("transcriptAvailable") [
  #grid(
    columns: (1fr, 1fr),
    gutter: 12pt,
    [
      #section-heading("Strengths")
      #for strength in artifact.at("strengths") [
        #item-card(
          strength.at("title"),
          strength.at("evidence") + " " + strength.at("whyItMatters"),
        )
      ]
    ],
    [
      #section-heading("Gaps")
      #for gap in artifact.at("gaps") [
        #item-card(
          gap.at("title"),
          gap.at("evidence") + " " + gap.at("improvement"),
        )
      ]
    ],
  )

  #if artifact.at("resumeSuggestions").len() > 0 [
    #section-heading("Tailor your resume to this role")
    #for suggestion in artifact.at("resumeSuggestions") [
      #item-card(
        suggestion.at("title"),
        "Replace or update: " + suggestion.at("currentBullet") + "\nUse this bullet: " + suggestion.at("improvedBullet"),
        footer: suggestion.at("rationale"),
      )
    ]
  ]
] else [
  #section-heading("Transcript unavailable")
  #block(
    fill: soft,
    stroke: 0.55pt + border,
    radius: 4pt,
    inset: 8pt,
  )[
    No coaching improvements are shown without a transcript.
  ]
]
`;

export type FeedbackPdfPayload = {
  typstSource: string;
  artifactJson: string;
  filename: string;
};

export type RenderedFeedbackPdf = {
  pdf: Buffer;
  filename: string;
};

export type RenderFeedbackArtifactPdfOptions = {
  typstBin?: string;
  timeoutMs?: number;
};

export function createFeedbackPdfPayload(artifact: FeedbackArtifact): FeedbackPdfPayload {
  return {
    typstSource: FEEDBACK_ARTIFACT_TYPST_SOURCE,
    artifactJson: `${JSON.stringify(artifact, null, 2)}\n`,
    filename: createFeedbackPdfFilename(artifact)
  };
}

export function createFeedbackPdfFilename(artifact: FeedbackArtifact): string {
  const safeInterviewId = artifact.interviewId.replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").slice(0, 80);
  return `interview-coaching-summary-${safeInterviewId || "artifact"}.pdf`;
}

export async function renderFeedbackArtifactPdf(
  artifact: FeedbackArtifact,
  options: RenderFeedbackArtifactPdfOptions = {}
): Promise<RenderedFeedbackPdf> {
  const payload = createFeedbackPdfPayload(artifact);
  const tempDir = await mkdtemp(join(tmpdir(), "kfl-feedback-pdf-"));
  const sourcePath = join(tempDir, typstSourceFilename);
  const artifactPath = join(tempDir, artifactJsonFilename);
  const outputPath = join(tempDir, pdfFilename);

  try {
    await Promise.all([
      writeFile(sourcePath, payload.typstSource, "utf8"),
      writeFile(artifactPath, payload.artifactJson, "utf8")
    ]);

    await execTypstCompile(tempDir, options);

    return {
      pdf: await readFile(outputPath),
      filename: payload.filename
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function execTypstCompile(cwd: string, options: RenderFeedbackArtifactPdfOptions): Promise<void> {
  const typstBin = options.typstBin ?? config.typstBin;

  try {
    await execFile(typstBin, ["compile", typstSourceFilename, pdfFilename], {
      cwd,
      timeout: options.timeoutMs ?? 30_000,
      windowsHide: true
    });
  } catch (error) {
    throw createTypstError(error, typstBin);
  }
}

function createTypstError(error: unknown, typstBin: string): Error & { status?: number } {
  const execError = error as Error & { code?: string | number; stderr?: string | Buffer };

  if (execError.code === "ENOENT") {
    const missing = new Error(
      `Typst is required to generate the PDF artifact. Install Typst or set TYPST_BIN to a Typst executable, then try again. Tried: ${typstBin}`
    ) as Error & { status?: number };
    missing.status = 503;
    return missing;
  }

  const details = execError.stderr ? String(execError.stderr).trim() : "";
  const message = details ? `Typst failed to generate the PDF artifact: ${details}` : "Typst failed to generate the PDF artifact.";
  const failed = new Error(message) as Error & { status?: number };
  failed.status = 500;
  return failed;
}
