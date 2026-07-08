import type {
  SessionDetails,
  VoiceAgentDetails as PersonaVoiceAgentDetails
} from "@keyframelabs/elements";

export type KeyframeSessionDetails = SessionDetails;

export type VoiceAgentDetails = PersonaVoiceAgentDetails & {
  type: "elevenlabs";
  agent_id?: string;
  signed_url?: string;
  dynamic_variables?: Record<string, string>;
  dynamicVariables?: Record<string, string>;
  overrides?: Record<string, unknown>;
  conversation_config_override?: Record<string, unknown>;
};

export type LiveSessionResponse = {
  sessionDetails: KeyframeSessionDetails;
  voiceAgentDetails: VoiceAgentDetails;
  conversationId?: string;
};
