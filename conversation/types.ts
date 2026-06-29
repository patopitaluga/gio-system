/** Used in `conversation/session-manager.ts`, `controllers/turn-http.ts`, and `conversation/turn-helpers.ts`. */
export interface TurnMetadata {
  question?: string;
  imageDataUrl?: string;
  hasAudio?: boolean;
}

/** Used in `conversation/session-manager.ts`. */
export interface TurnResult {
  userPrompt: string;
  actions: string[];
  response: string;
}

/** Used in `conversation/session-manager.ts` and `controllers/websocket.ts`. */
export interface StreamingTurn {
  appendAudio: (pcm: Buffer) => void;
  commit: () => Promise<TurnResult>;
  cancel: () => void;
}

/** Used in `conversation/session-manager.ts`. */
export type TurnStreamEvent =
  | { type: 'transcript.delta'; delta: string; transcript: string }
  | { type: 'transcript.completed'; transcript: string }
  | { type: 'response.delta'; delta: string; response: string };
