import { createStore, type StoreApi } from "zustand/vanilla";

import type { CreateInterviewInput } from "@/lib/api";
import type { FeedbackArtifact, InterviewCreateResponse } from "@kfl-interview/shared";

export type InterviewFlowState =
  | { step: "setup" }
  | {
      step: "interview";
      input: CreateInterviewInput;
      interview: InterviewCreateResponse;
    }
  | {
      step: "feedback";
      input: CreateInterviewInput;
      interview: InterviewCreateResponse;
      artifact: FeedbackArtifact;
    };

export type InterviewStore = {
  flow: InterviewFlowState;
  showInterview: (input: CreateInterviewInput, interview: InterviewCreateResponse) => void;
  showFeedback: (artifact: FeedbackArtifact) => void;
  restart: () => void;
  backToInterview: () => void;
};

export type InterviewStoreApi = StoreApi<InterviewStore>;

export function createInterviewStore(): InterviewStoreApi {
  return createStore<InterviewStore>((set) => ({
    flow: { step: "setup" },
    showInterview: (input, interview) => {
      set({ flow: { step: "interview", input, interview } });
    },
    showFeedback: (artifact) => {
      set((state) => {
        if (state.flow.step !== "interview") {
          return state;
        }

        return {
          flow: {
            step: "feedback",
            input: state.flow.input,
            interview: state.flow.interview,
            artifact
          }
        };
      });
    },
    restart: () => {
      set({ flow: { step: "setup" } });
    },
    backToInterview: () => {
      set((state) => {
        if (state.flow.step !== "feedback") {
          return state;
        }

        return {
          flow: {
            step: "interview",
            input: state.flow.input,
            interview: state.flow.interview
          }
        };
      });
    }
  }));
}
