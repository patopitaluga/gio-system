export interface TurnMetadata {
  question?: string;
  imageDataUrl?: string;
  hasAudio?: boolean;
}

export interface TurnResult {
  userPrompt: string;
  actions: string[];
  response: string;
}

export interface StreamingTurn {
  appendAudio: (pcm: Buffer) => void;
  commit: () => Promise<TurnResult>;
  cancel: () => void;
}

export type TurnStreamEvent =
  | { type: 'transcript.delta'; delta: string; transcript: string }
  | { type: 'transcript.completed'; transcript: string }
  | { type: 'response.delta'; delta: string; response: string };
