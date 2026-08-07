import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useLiveSession } from "@/hooks/useLiveSession";
import type { LiveSessionResponse, SessionSummary } from "@/lib/api";
import { FREESTYLE_MODE, GUIDED_MODE, type ConversationModeId } from "@/lib/conversationMode";

const state = vi.hoisted(() => ({
  views: [] as Array<{
    disconnect: ReturnType<typeof vi.fn>;
    isMuted: boolean;
    options: Record<string, (...args: unknown[]) => void>;
    sendText: ReturnType<typeof vi.fn>;
    toggleMute: ReturnType<typeof vi.fn>;
  }>,
  end: vi.fn(),
  suggest: vi.fn(),
  submit: vi.fn(),
  translate: vi.fn()
}));

vi.mock("@keyframelabs/elements", () => ({
  PersonaView: class {
    isMuted = false;
    status = "disconnected";
    sendText = vi.fn();
    disconnect = vi.fn();
    toggleMute = vi.fn(() => { this.isMuted = !this.isMuted; });
    constructor(readonly options: Record<string, (...args: unknown[]) => void>) {
      state.views.push(this);
    }
    async connect() {
      this.status = "connected";
      this.options.onStateChange?.("connected");
    }
  }
}));

vi.mock("@/lib/api", async (original) => ({
  ...await original<typeof import("@/lib/api")>(),
  endSession: state.end,
  submitTurn: state.submit,
  suggestResponse: state.suggest,
  translateTranscript: state.translate
}));

class Recognition {
  static instance: Recognition;
  continuous = false;
  interimResults = false;
  lang = "";
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror = null;
  onend = null;
  start = vi.fn();
  abort = vi.fn();
  constructor() { Recognition.instance = this; }
}

const session: LiveSessionResponse = {
  sessionId: "session-1",
  persona: {
    sessionDetails: {
      server_url: "wss://example.test",
      participant_token: "token",
      agent_identity: "agent"
    },
    voiceAgentDetails: {
      type: "elevenlabs",
      agent_id: "voice-agent",
      signed_url: "wss://example.test/voice"
    },
    dynamicVariables: {
      scenario_prompt: "Help with a flat tire.",
      scenario_opening_message: "Buenas tardes."
    }
  }
};

function Harness({
  initialMode = GUIDED_MODE,
  onComplete = vi.fn()
}: {
  initialMode?: ConversationModeId;
  onComplete?: (summary: SessionSummary) => void;
}) {
  const live = useLiveSession({ initialMode, sessionRequest: Promise.resolve(session), onComplete });
  return (
    <button
      data-error={live.error ?? ""}
      data-complete={live.guidedCoach.speechComplete}
      data-matched={live.guidedCoach.matchedWordCount}
      data-status={live.guidedCoach.asrStatus}
      data-streak={live.streakProgress}
      onClick={() => live.setMode("freestyle")}
      ref={live.avatarRef}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  state.views.length = 0;
  Reflect.deleteProperty(window, "SpeechRecognition");
});

it("unmutes to send canonical guided speech and remutes on timeout", async () => {
  vi.useFakeTimers();
  state.suggest.mockResolvedValue({
    response: "Tengo una llanta plana. ¿Puede revisarla?",
    translation: "I have a flat tire. Can you check it?",
    segments: [],
    conversationMove: "answer",
    followUpMove: "ask"
  });
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: Recognition });
  const screen = render(<Harness />);
  await act(async () => { await Promise.resolve(); });
  const view = state.views[0];
  act(() => view.options.onTranscript({ role: "assistant", text: "¿Necesita ayuda?" }));
  await act(async () => { await Promise.resolve(); });
  act(() => vi.advanceTimersByTime(150));
  expect(Recognition.instance.start).toHaveBeenCalledOnce();
  act(() => Recognition.instance.onstart?.());
  act(() => Recognition.instance.onresult?.({
    resultIndex: 0,
    results: [{ 0: { transcript: "tengo una llanta plana puede revisarla" }, isFinal: true }]
  }));
  act(() => vi.advanceTimersByTime(350));
  expect(view.sendText).toHaveBeenCalledWith("Tengo una llanta plana. ¿Puede revisarla?");
  expect(view.isMuted).toBe(false);
  expect(screen.container.firstElementChild?.getAttribute("data-status")).toBe("waiting");
  act(() => vi.advanceTimersByTime(12_000));
  expect(view.isMuted).toBe(true);
  expect(screen.container.firstElementChild?.getAttribute("data-status")).toBe("error");
  expect(screen.container.firstElementChild?.getAttribute("data-error")).toBe("Caspian did not respond. Retry the guided response.");
});

it("keeps guided progress on the current word until it is retried", async () => {
  vi.useFakeTimers();
  state.suggest.mockResolvedValue({
    response: "Tengo una llanta.",
    translation: "I have a tire.",
    segments: [],
    conversationMove: "answer",
    followUpMove: null
  });
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: Recognition });
  const screen = render(<Harness />);
  await act(async () => { await Promise.resolve(); });
  const view = state.views[0];
  const control = screen.container.firstElementChild as HTMLButtonElement;
  act(() => view.options.onTranscript({ role: "assistant", text: "¿Necesita ayuda?" }));
  await act(async () => { await Promise.resolve(); });
  act(() => vi.advanceTimersByTime(150));
  act(() => Recognition.instance.onstart?.());

  act(() => Recognition.instance.onresult?.({
    resultIndex: 0,
    results: [{ 0: { transcript: "tengo" }, isFinal: false }]
  }));
  expect(control.getAttribute("data-matched")).toBe("1");
  expect(view.sendText).not.toHaveBeenCalled();

  act(() => Recognition.instance.onresult?.({
    resultIndex: 0,
    results: [{ 0: { transcript: "ruido" }, isFinal: false }]
  }));
  expect(control.getAttribute("data-matched")).toBe("1");

  act(() => Recognition.instance.onresult?.({
    resultIndex: 0,
    results: [{ 0: { transcript: "tengo" }, isFinal: true }]
  }));
  expect(control.getAttribute("data-matched")).toBe("1");

  act(() => Recognition.instance.onresult?.({
    resultIndex: 1,
    results: [
      { 0: { transcript: "tengo" }, isFinal: true },
      { 0: { transcript: "uno" }, isFinal: true }
    ]
  }));
  expect(control.getAttribute("data-matched")).toBe("1");

  act(() => Recognition.instance.onresult?.({
    resultIndex: 2,
    results: [
      { 0: { transcript: "tengo" }, isFinal: true },
      { 0: { transcript: "uno" }, isFinal: true },
      { 0: { transcript: "una" }, isFinal: true }
    ]
  }));
  expect(control.getAttribute("data-matched")).toBe("2");

  act(() => Recognition.instance.onresult?.({
    resultIndex: 3,
    results: [
      { 0: { transcript: "tengo" }, isFinal: true },
      { 0: { transcript: "uno" }, isFinal: true },
      { 0: { transcript: "una" }, isFinal: true },
      { 0: { transcript: "llanta" }, isFinal: false }
    ]
  }));
  expect(control.getAttribute("data-complete")).toBe("true");
  expect(view.sendText).not.toHaveBeenCalled();

  act(() => Recognition.instance.onresult?.({
    resultIndex: 3,
    results: [
      { 0: { transcript: "tengo" }, isFinal: true },
      { 0: { transcript: "uno" }, isFinal: true },
      { 0: { transcript: "una" }, isFinal: true },
      { 0: { transcript: "llanta" }, isFinal: true }
    ]
  }));
  act(() => vi.advanceTimersByTime(350));
  expect(view.sendText).toHaveBeenCalledWith("Tengo una llanta.");
});

it("rewards a successful freestyle evaluation with an empty reason", async () => {
  state.submit.mockResolvedValue({
    turnId: 1,
    feedback: "Great Job!",
    suggestionSpanish: null,
    suggestionEnglish: null,
    reason: ""
  });
  const screen = render(<Harness initialMode={FREESTYLE_MODE} />);
  await act(async () => { await Promise.resolve(); });
  const control = screen.container.firstElementChild as HTMLButtonElement;
  const view = state.views[0];
  expect(view.isMuted).toBe(false);
  act(() => {
    view.options.onTranscript({ role: "assistant", text: "¿Cómo se llama?" });
    view.options.onTranscript({ role: "user", text: "Me llamo William." });
  });

  await waitFor(() => expect(control.getAttribute("data-streak")).toBe("10"));
  expect(control.getAttribute("data-error")).toBe("");
});

it("waits for provider disconnect after a farewell", async () => {
  state.end.mockResolvedValue({ scenarioId: "order-food", scenarioTitle: "Order food", learnerTurns: [] });
  state.suggest.mockResolvedValue({
    response: "Gracias.",
    translation: "Thank you.",
    segments: [],
    conversationMove: "thank",
    followUpMove: null
  });
  state.translate.mockResolvedValue({ translation: "Anything else?", segments: [] });
  render(<Harness />);
  await act(async () => { await Promise.resolve(); });
  const view = state.views[0];
  act(() => view.options.onTranscript({ role: "assistant", text: "¿Algo más?" }));
  act(() => {
    view.options.onAgentStateChange("speaking");
    view.options.onTranscript({ role: "assistant", text: "Hasta luego." });
    view.options.onAgentStateChange("listening");
  });

  expect(state.end).not.toHaveBeenCalled();
  expect(view.disconnect).not.toHaveBeenCalled();

  act(() => view.options.onDisconnect());
  await waitFor(() => expect(state.end).toHaveBeenCalledOnce());
  expect(view.disconnect).not.toHaveBeenCalled();
  expect(state.end).toHaveBeenCalledWith("session-1", [
    { role: "assistant", text: "¿Algo más?" },
    { role: "assistant", text: "Hasta luego." }
  ]);
  expect(state.translate).toHaveBeenCalledTimes(2);
  expect(state.suggest).toHaveBeenCalledTimes(2);
});

it("ends the session when the five-minute timer expires", async () => {
  vi.useFakeTimers();
  const summary = { scenarioId: "order-food", scenarioTitle: "Order food", learnerTurns: [] };
  const onComplete = vi.fn();
  state.end.mockResolvedValue(summary);
  render(<Harness onComplete={onComplete} />);
  await act(async () => { await Promise.resolve(); });
  const view = state.views[0];

  await act(async () => {
    vi.advanceTimersByTime(5 * 60 * 1000);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(view.disconnect).toHaveBeenCalledOnce();
  expect(state.end).toHaveBeenCalledOnce();
  expect(state.end).toHaveBeenCalledWith("session-1", []);
  expect(onComplete).toHaveBeenCalledOnce();
  expect(onComplete).toHaveBeenCalledWith(summary);

  act(() => vi.advanceTimersByTime(1_000));
  expect(state.end).toHaveBeenCalledOnce();
});
