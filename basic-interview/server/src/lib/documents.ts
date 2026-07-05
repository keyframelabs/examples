import mammoth from "mammoth";
import pdfParse from "pdf-parse";

type UploadLike = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

const supportedExtensions = [".txt", ".pdf", ".docx"];

export function isSupportedDocument(filename: string): boolean {
  const lower = filename.toLowerCase();
  return supportedExtensions.some((extension) => lower.endsWith(extension));
}

export async function extractTextFromUpload(file: UploadLike | undefined): Promise<string> {
  if (!file) {
    return "";
  }

  if (!isSupportedDocument(file.originalname)) {
    throw Object.assign(
      new Error(`Unsupported file type for ${file.originalname}. Use .txt, .pdf, or .docx.`),
      { status: 400 }
    );
  }

  const lower = file.originalname.toLowerCase();

  if (lower.endsWith(".txt")) {
    return cleanText(file.buffer.toString("utf8"));
  }

  if (lower.endsWith(".pdf")) {
    const parsed = await pdfParse(file.buffer);
    return cleanText(parsed.text ?? "");
  }

  const parsed = await mammoth.extractRawText({ buffer: file.buffer });
  return cleanText(parsed.value ?? "");
}

export function cleanText(value: string): string {
  return value
    .split("\u0000")
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
