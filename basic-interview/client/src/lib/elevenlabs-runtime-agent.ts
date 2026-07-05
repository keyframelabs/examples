import {
  base64ToBytes,
  bytesToBase64,
  createEventEmitter,
  resamplePcm,
  SAMPLE_RATE
} from "@keyframelabs/elements";

import type { VoiceAgentDetails } from "@kfl-interview/shared";

type AgentState = "idle" | "listening" | "thinking" | "speaking";
type Emotion = "neutral" | "angry" | "sad" | "happy";

export type RuntimeAgentEventMap = {
  audio: Uint8Array;
  turnEnd: void;
  interrupted: void;
  stateChange: AgentState;
  transcript: {
    role: "user" | "assistant";
    text: string;
    isFinal: boolean;
  };
  emotion: Emotion;
  closed: {
    code?: number;
    reason?: string;
  };
};

type RuntimeAgentConfig = {
  agentId: string;
  signedUrl: string;
  inputSampleRate: number;
  voiceAgentDetails: VoiceAgentDetails;
};

export class ElevenLabsRuntimeAgent {
  private readonly events = createEventEmitter<RuntimeAgentEventMap>();
  private ws: WebSocket | null = null;
  private initialized = false;
  private outputSampleRate = SAMPLE_RATE;
  private expectedInputSampleRate = 16_000;
  private sourceInputSampleRate = 16_000;
  private turnStartTime = 0;
  private accumulatedDurationMs = 0;
  private agentResponseReceived = false;
  private turnEndTimer: number | null = null;
  private state: AgentState = "idle";

  async connect(config: RuntimeAgentConfig): Promise<void> {
    if (this.ws) {
      throw new Error("Voice connection is already active.");
    }

    if (!config.agentId && !config.signedUrl) {
      throw new Error("Voice connection credentials are required.");
    }

    this.sourceInputSampleRate = config.inputSampleRate;
    const url = config.signedUrl || `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${config.agentId}`;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify(buildInitiationPayload(config.voiceAgentDetails)));
        this.setState("listening");
        resolve();
      };

      ws.onerror = () => {
        reject(new Error("Failed to connect the voice interviewer."));
      };

      ws.onclose = (event) => {
        this.ws = null;
        this.initialized = false;
        this.resetTurnState();
        this.setState("idle");
        this.events.emit("closed", {
          code: event.code,
          reason: event.reason
        });
      };

      ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  sendAudio(pcmData: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.initialized) {
      return;
    }

    const audio = this.sourceInputSampleRate === this.expectedInputSampleRate
      ? pcmData
      : resamplePcm(pcmData, this.sourceInputSampleRate, this.expectedInputSampleRate);

    this.ws.send(JSON.stringify({
      user_audio_chunk: bytesToBase64(audio)
    }));
  }

  sendContextUpdate(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !text.trim()) {
      return;
    }

    this.ws.send(JSON.stringify({
      type: "contextual_update",
      text: text.trim()
    }));
  }

  close(): void {
    this.initialized = false;
    this.resetTurnState();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.events.removeAllListeners();
    this.setState("idle");
  }

  on<K extends keyof RuntimeAgentEventMap>(event: K, handler: (data: RuntimeAgentEventMap[K]) => void): void {
    this.events.on(event, handler);
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") {
      return;
    }

    try {
      this.handleParsedMessage(JSON.parse(data));
    } catch {
      console.warn("[ElevenLabsRuntimeAgent] Failed to parse message:", data.slice(0, 200));
    }
  }

  private handleParsedMessage(message: unknown): void {
    if (!isRecord(message) || typeof message.type !== "string") {
      return;
    }

    switch (message.type) {
      case "conversation_initiation_metadata":
        this.handleInitMetadata(message);
        break;
      case "ping":
        this.handlePing(message);
        break;
      case "audio":
        this.handleAudio(message);
        break;
      case "user_transcript":
        this.handleUserTranscript(message);
        break;
      case "agent_response":
        this.handleAgentResponse(message);
        break;
      case "agent_response_correction":
        this.setState("listening");
        break;
      case "interruption":
        this.handleInterruption(message);
        break;
      case "client_tool_call":
        this.handleClientToolCall(message);
        break;
    }
  }

  private handleInitMetadata(message: Record<string, unknown>): void {
    const event = isRecord(message.conversation_initiation_metadata_event)
      ? message.conversation_initiation_metadata_event
      : undefined;

    const outputFormat = typeof event?.agent_output_audio_format === "string"
      ? event.agent_output_audio_format.match(/pcm_(\d+)/)
      : undefined;
    if (outputFormat?.[1]) {
      this.outputSampleRate = Number(outputFormat[1]);
    }

    const inputFormat = typeof event?.user_input_audio_format === "string"
      ? event.user_input_audio_format.match(/pcm_(\d+)/)
      : undefined;
    if (inputFormat?.[1]) {
      this.expectedInputSampleRate = Number(inputFormat[1]);
    }

    this.initialized = true;
  }

  private handlePing(message: Record<string, unknown>): void {
    const event = isRecord(message.ping_event) ? message.ping_event : undefined;
    const eventId = event?.event_id;
    const delay = typeof event?.ping_ms === "number" ? event.ping_ms : 0;

    window.setTimeout(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: "pong",
          event_id: eventId
        }));
      }
    }, delay);
  }

  private handleAudio(message: Record<string, unknown>): void {
    const event = isRecord(message.audio_event) ? message.audio_event : undefined;
    if (typeof event?.audio_base_64 !== "string") {
      return;
    }

    this.setState("speaking");
    const decoded = base64ToBytes(event.audio_base_64);
    const audio = this.outputSampleRate === SAMPLE_RATE
      ? decoded
      : resamplePcm(decoded, this.outputSampleRate, SAMPLE_RATE);

    this.events.emit("audio", audio);

    const durationMs = (audio.length / 2 / SAMPLE_RATE) * 1000;
    if (this.turnStartTime === 0) {
      this.turnStartTime = Date.now();
    }
    this.accumulatedDurationMs += durationMs;
    this.scheduleTurnEnd();
  }

  private handleUserTranscript(message: Record<string, unknown>): void {
    const event = isRecord(message.user_transcription_event) ? message.user_transcription_event : undefined;
    if (typeof event?.user_transcript === "string") {
      this.events.emit("transcript", {
        role: "user",
        text: event.user_transcript,
        isFinal: true
      });
    }
  }

  private handleAgentResponse(message: Record<string, unknown>): void {
    const event = isRecord(message.agent_response_event) ? message.agent_response_event : undefined;
    if (typeof event?.agent_response === "string") {
      this.events.emit("transcript", {
        role: "assistant",
        text: event.agent_response,
        isFinal: true
      });
      this.agentResponseReceived = true;
      this.scheduleTurnEnd();
    }
  }

  private handleInterruption(message: Record<string, unknown>): void {
    const event = isRecord(message.interruption_event) ? message.interruption_event : undefined;
    const eventId = typeof event?.event_id === "number" ? event.event_id : undefined;
    if (eventId) {
      this.resetTurnState();
    }
    this.events.emit("interrupted", undefined);
    this.setState("listening");
  }

  private handleClientToolCall(message: Record<string, unknown>): void {
    const toolCall = isRecord(message.client_tool_call) ? message.client_tool_call : undefined;
    const toolName = typeof toolCall?.tool_name === "string" ? toolCall.tool_name : undefined;
    const emotion = isRecord(toolCall?.parameters) && typeof toolCall.parameters.emotion === "string"
      ? toolCall.parameters.emotion.toLowerCase()
      : undefined;

    if (emotion === "neutral" || emotion === "angry" || emotion === "sad" || emotion === "happy") {
      this.events.emit("emotion", emotion);
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "client_tool_result",
        tool_call_id: toolCall?.tool_call_id,
        result: "ok",
        is_error: false
      }));
    }

    if (toolName === "end_call" && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close(1000, "end_call");
    }
  }

  private scheduleTurnEnd(): void {
    if (!this.agentResponseReceived || this.turnStartTime === 0) {
      return;
    }

    if (this.turnEndTimer !== null) {
      window.clearTimeout(this.turnEndTimer);
    }

    const elapsedMs = Date.now() - this.turnStartTime;
    const remainingMs = Math.max(0, this.accumulatedDurationMs - elapsedMs);
    this.turnEndTimer = window.setTimeout(() => {
      this.turnEndTimer = null;
      this.resetTurnState();
      this.events.emit("turnEnd", undefined);
      this.setState("listening");
    }, remainingMs);
  }

  private resetTurnState(): void {
    this.agentResponseReceived = false;
    this.turnStartTime = 0;
    this.accumulatedDurationMs = 0;
    if (this.turnEndTimer !== null) {
      window.clearTimeout(this.turnEndTimer);
      this.turnEndTimer = null;
    }
  }

  private setState(nextState: AgentState): void {
    if (this.state !== nextState) {
      this.state = nextState;
      this.events.emit("stateChange", nextState);
    }
  }
}

function buildInitiationPayload(details: VoiceAgentDetails): Record<string, unknown> {
  const override = sanitizeConversationOverride(
    details.conversation_config_override ?? normalizeOverrideShape(details.overrides)
  );

  return {
    type: "conversation_initiation_client_data",
    dynamic_variables: details.dynamic_variables ?? details.dynamicVariables ?? {},
    ...(override ? { conversation_config_override: override } : {})
  };
}

function normalizeOverrideShape(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const agent = isRecord(value.agent) ? { ...value.agent } : undefined;
  if (agent && typeof agent.firstMessage === "string") {
    agent.first_message = agent.firstMessage;
    delete agent.firstMessage;
  }

  return agent ? { ...value, agent } : { ...value };
}

function sanitizeConversationOverride(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const next = deepCloneRecord(value);
  const agent = isRecord(next.agent) ? next.agent : undefined;

  if (agent && !allowPromptOverride()) {
    delete agent.prompt;
  }

  if (!allowFirstMessageOverride()) {
    if (agent) {
      delete agent.first_message;
      delete agent.firstMessage;
    }
  }

  return pruneEmpty(next);
}

function allowPromptOverride(): boolean {
  return import.meta.env.VITE_ELEVENLABS_ALLOW_PROMPT_OVERRIDE === "true";
}

function allowFirstMessageOverride(): boolean {
  return import.meta.env.VITE_ELEVENLABS_ALLOW_FIRST_MESSAGE_OVERRIDE === "true";
}

function deepCloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isRecord(entry) ? deepCloneRecord(entry) : Array.isArray(entry) ? [...entry] : entry
    ])
  );
}

function pruneEmpty(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(value)
    .map(([key, entry]) => {
      if (isRecord(entry)) {
        return [key, pruneEmpty(entry)] as const;
      }

      return [key, entry] as const;
    })
    .filter(([, entry]) => entry !== undefined);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
