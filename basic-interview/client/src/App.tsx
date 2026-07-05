import { FeedbackView } from "@/components/FeedbackView";
import { InterviewView } from "@/components/InterviewView";
import { SetupView } from "@/components/SetupView";
import { useInterviewStore } from "@/lib/interview-store-context";

export function App() {
  const flow = useInterviewStore((state) => state.flow);
  const showInterview = useInterviewStore((state) => state.showInterview);
  const showFeedback = useInterviewStore((state) => state.showFeedback);
  const restart = useInterviewStore((state) => state.restart);
  const backToInterview = useInterviewStore((state) => state.backToInterview);

  if (flow.step === "setup") {
    return (
      <SetupView
        onCreated={(input, interview) => {
          showInterview(input, interview);
        }}
      />
    );
  }

  if (flow.step === "interview") {
    return (
      <InterviewView
        createdInput={flow.input}
        createdInterview={flow.interview}
        onBack={restart}
        onFeedback={showFeedback}
      />
    );
  }

  return (
    <FeedbackView
      artifact={flow.artifact}
      onRestart={restart}
      onBackToInterview={backToInterview}
    />
  );
}
