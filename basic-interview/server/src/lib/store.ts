import type { FeedbackArtifact, InterviewPacket } from "@kfl-interview/shared";
import type { LlmMode } from "./llm";

export type InterviewRecord = {
  id: string;
  candidateName: string;
  jobDescriptionText: string;
  resumeText?: string;
  hasResume: boolean;
  packet: InterviewPacket;
  mode: LlmMode;
  createdAt: string;
  sessionStartedAtUnix?: number;
  conversationId?: string;
  feedbackArtifact?: FeedbackArtifact;
};

const records = new Map<string, InterviewRecord>();

export const interviewStore = {
  set(record: InterviewRecord): InterviewRecord {
    records.set(record.id, record);
    return record;
  },

  get(id: string): InterviewRecord {
    const record = records.get(id);
    if (!record) {
      throw Object.assign(new Error("Interview not found. Start a new interview."), { status: 404 });
    }

    return record;
  },

  update(id: string, patch: Partial<InterviewRecord>): InterviewRecord {
    const record = this.get(id);
    const next = { ...record, ...patch };
    records.set(id, next);
    return next;
  }
};
