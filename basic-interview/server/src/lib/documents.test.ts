import { describe, expect, it } from "vitest";

import { cleanText, extractTextFromUpload, isSupportedDocument } from "./documents";

describe("document parsing helpers", () => {
  it("accepts only supported extensions", () => {
    expect(isSupportedDocument("resume.txt")).toBe(true);
    expect(isSupportedDocument("resume.pdf")).toBe(true);
    expect(isSupportedDocument("resume.docx")).toBe(true);
    expect(isSupportedDocument("resume.png")).toBe(false);
  });

  it("extracts text files from memory uploads", async () => {
    const text = await extractTextFromUpload({
      originalname: "job.txt",
      mimetype: "text/plain",
      buffer: Buffer.from("Lead product work\n\n\nwith teams"),
      size: 29
    });

    expect(text).toBe("Lead product work\n\nwith teams");
  });

  it("cleans repeated whitespace without flattening paragraphs", () => {
    expect(cleanText("A  \n\n\nB\u0000")).toBe("A\n\nB");
  });
});

