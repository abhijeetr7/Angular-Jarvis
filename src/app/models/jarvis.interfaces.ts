export interface VoiceConfig {
  sttProvider: 'web-speech' | 'whisper' | 'vosk';
  ttsProvider: 'web-speech' | 'coqui';
  language: string;
  voiceId?: string;
  rate: number;
  pitch: number;
  volume: number;
}

export interface DialogTurn {
  id: string;
  timestamp: Date;
  type: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
}

export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface Intent {
  name: string;
  confidence: number;
  parameters: Record<string, any>;
}

export interface JarvisAction {
  name: string;
  description: string;
  parameters: string[];
  handler: (params: Record<string, any>) => Promise<ActionResult>;
}

export interface VoiceState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  currentTranscript: string;
  confidence: number;
}

export interface LLMRequest {
  prompt: string;
  history: DialogTurn[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  response: string;
  intent?: Intent;
  actions?: string[];
  metadata?: any;
}