import { compactText, type InterviewPacket } from "@kfl-interview/shared";

type ExtractedJobContext = {
  company?: string;
  title?: string;
};

const FALLBACK_COMPANY = "the hiring company";
const PROVIDER_EMPLOYER_NAMES = [
  "Keyframe Labs",
  "KeyframeLabs"
];

const GENERIC_COMPANY_NAMES = new Set([
  "the company",
  "the employer",
  "the hiring company",
  "the hiring team",
  "not specified",
  "unknown"
]);

export function extractJobContext(jobDescriptionText: string): ExtractedJobContext {
  return {
    company: extractCompanyName(jobDescriptionText),
    title: extractJobTitle(jobDescriptionText)
  };
}

export function normalizeInterviewPacketForJobDescription(
  packet: InterviewPacket,
  jobDescriptionText: string
): InterviewPacket {
  const context = extractJobContext(jobDescriptionText);
  const company = resolveCompanyName(packet.role.company, jobDescriptionText, context.company);
  const title = context.title ?? packet.role.title;
  const replacementCompany = company || FALLBACK_COMPANY;
  const allowProviderEmployer = PROVIDER_EMPLOYER_NAMES.some((name) => containsText(jobDescriptionText, name));
  const disallowedEmployerNames = [
    ...(allowProviderEmployer ? [] : PROVIDER_EMPLOYER_NAMES),
    ...(shouldReplaceGeneratedCompany(packet.role.company, replacementCompany, jobDescriptionText)
      ? [packet.role.company]
      : [])
  ];
  const sanitized = disallowedEmployerNames.length === 0
    ? packet
    : replaceEmployerMentions(packet, replacementCompany, disallowedEmployerNames);

  return {
    ...sanitized,
    role: {
      ...sanitized.role,
      title,
      company: replacementCompany
    }
  };
}

function resolveCompanyName(packetCompany: string, jobDescriptionText: string, extractedCompany?: string): string {
  if (extractedCompany) {
    return extractedCompany;
  }

  if (isSpecificCompany(packetCompany) && containsText(jobDescriptionText, packetCompany)) {
    return packetCompany.trim();
  }

  return FALLBACK_COMPANY;
}

function extractCompanyName(jobDescriptionText: string): string | undefined {
  const patterns = [
    /(?:^|\n)\s*(?:company|organization|employer|client)\s*[:-]\s*([^\n\r]+)/i,
    /(?:^|\n)\s*about\s+([A-Z][A-Za-z0-9&.'’\- ]{1,80})\s*[:\n]/i,
    /(?:^|\n)\s*([A-Z][A-Za-z0-9&.'’\- ]{1,80})\s+(?:is\s+)?(?:hiring|seeking|looking\s+for|building|developing)\b/i,
    /\b(?:join|at|with|for)\s+([A-Z][A-Za-z0-9&.'’\- ]{1,80})(?=\s+(?:as|to|and|where|who|that)|[.,;\n\r]|$)/i
  ];

  for (const pattern of patterns) {
    const match = jobDescriptionText.match(pattern);
    const company = match?.[1] ? cleanCompanyName(match[1]) : undefined;
    if (company && isSpecificCompany(company)) {
      return company;
    }
  }

  return undefined;
}

function extractJobTitle(jobDescriptionText: string): string | undefined {
  const patterns = [
    /(?:^|\n)\s*(?:job\s+title|position|role)\s*[:-]\s*([^\n\r]+)/i,
    /\b(?:hiring|seeking|looking\s+for)\s+(?:an?|the)?\s*([A-Z][A-Za-z0-9+/#,&.'’()\- ]{3,100})(?=\s+(?:to|who|with|for)|[.\n\r]|$)/i
  ];

  for (const pattern of patterns) {
    const match = jobDescriptionText.match(pattern);
    const title = match?.[1] ? cleanTitle(match[1]) : undefined;
    if (title) {
      return title;
    }
  }

  return undefined;
}

function shouldReplaceGeneratedCompany(
  packetCompany: string,
  replacementCompany: string,
  jobDescriptionText: string
): boolean {
  return isSpecificCompany(packetCompany)
    && packetCompany.trim().toLowerCase() !== replacementCompany.trim().toLowerCase()
    && !containsText(jobDescriptionText, packetCompany);
}

function replaceEmployerMentions(
  packet: InterviewPacket,
  replacementCompany: string,
  disallowedEmployerNames: string[]
): InterviewPacket {
  return mapPacketStrings(packet, (value) => (
    sanitizeEmployerMentions(value, replacementCompany, disallowedEmployerNames)
  ));
}

function mapPacketStrings<T>(value: T, mapString: (value: string) => string): T {
  if (typeof value === "string") {
    return mapString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => mapPacketStrings(item, mapString)) as T;
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, mapPacketStrings(item, mapString)])
    ) as T;
  }

  return value;
}

function sanitizeEmployerMentions(
  value: string,
  replacementCompany: string,
  disallowedEmployerNames: string[]
): string {
  return disallowedEmployerNames.reduce(
    (next, name) => next.replace(new RegExp(escapeRegExp(name), "gi"), replacementCompany),
    value
  );
}

function cleanCompanyName(value: string): string {
  const firstSegment = value.split(/[|]/)[0] ?? "";

  return firstSegment
    .replace(/\s+(?:is\s+)?(?:hiring|seeking|looking\s+for|building|developing)\b.*$/i, "")
    .replace(/\s+(?:job\s+title|position|role|location)\s*[:-].*$/i, "")
    .replace(/[.,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function cleanTitle(value: string): string {
  const firstSegment = value.split(/[|]/)[0] ?? "";

  return firstSegment
    .replace(/\s+at\s+.*$/i, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/[.,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function isSpecificCompany(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 1 && !GENERIC_COMPANY_NAMES.has(normalized);
}

function containsText(source: string, value: string): boolean {
  return compactText(source, 20_000).toLowerCase().includes(value.trim().toLowerCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
