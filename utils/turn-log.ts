/**
 * Server-side turn logging for the Node process (stdout / stderr only).
 *
 * Nothing here is sent to the Electron app or browser UI. Operators see these lines in the
 * terminal where `npm run server` (or the cron/CLI agents) runs. User-visible turn feedback
 * comes from HTTP/WebSocket responses (`response`, `actions` in `conversation/session-manager.ts`)
 * and from `lib/agent-run-trace.ts` — not from this module.
 *
 * **Exports** (all write to the server console):
 *
 * | Export | Stream | Prefix | Visible in app? |
 * |--------|--------|--------|-------------------|
 * | `logTurn` | `console.log` | `[gio-system:turn]` | No — turn lifecycle (start, complete, HTTP response metadata) |
 * | `logUserPrompt` | `console.log` | `[gio-system:prompt]` + prompt body | No — full user/agent prompts for debugging (also used by CLI agents via `lib/ask-agent.ts`) |
 * | `logTurnError` | `console.error` | `[gio-system:turn]` + stack | No — failures; the app may show a generic error from the controller, not these log lines |
 * | `logToolStart` | `console.log` (via `logTurn`) | `[gio-system:turn]` | No — Realtime tool-call start; app `actions` come from `formatToolAction` separately |
 * | `logToolEnd` | `console.log` or `console.error` | `[gio-system:turn]` | No — Realtime tool result; truncated to 200 chars in the log line |
 * | `logResponseDone` | `console.log` or `console.error` | `[gio-system:turn]` | No — OpenAI Realtime `response.done` status |
 *
 * **Importers**: `conversation/session-manager.ts`, `controllers/turn-http.ts`, `controllers/websocket.ts`,
 * `lib/ask-agent.ts`, `agents/agent-lessons.ts`, `agents/agent-exercises.ts`, `agents/agent-general-conversation.ts`,
 * `agents/agent-vocabulary.ts`.
 */
/** Used in `logTurn`, `logTurnError`, `logToolEnd`, and `logResponseDone`. */
function formatDetails(details?: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) return '';

  return ` ${JSON.stringify(details)}`;
}

/** Imported in `conversation/session-manager.ts`, `controllers/turn-http.ts`, and `controllers/websocket.ts`. */
export function logTurn(message: string, details?: Record<string, unknown>) {
  console.log(`[gio-system:turn] ${message}${formatDetails(details)}`);
}

/** Imported in `lib/ask-agent.ts`. */
export function logUserPrompt(target: string, prompt: string, details?: Record<string, unknown>) {
  const trimmed = prompt.trim();
  if (!trimmed) return;

  const suffix = details && Object.keys(details).length > 0
    ? ` ${JSON.stringify(details)}`
    : '';

  console.log(`[gio-system:prompt] ${target}${suffix}`);
  console.log(trimmed);
}

/** Imported in `conversation/session-manager.ts`, `agents/agent-lessons.ts`, and `agents/agent-exercises.ts`. */
export function logTurnError(message: string, error: unknown, details?: Record<string, unknown>) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  console.error(`[gio-system:turn] ${message}${formatDetails({ ...details, error: errorMessage })}`);
  if (errorStack) console.error(errorStack);
}

/** Imported in `conversation/session-manager.ts`. */
export function logToolStart(
  toolName: string,
  args: Record<string, unknown>,
  callId?: string,
) {
  logTurn(`tool start: ${toolName}`, {
    callId,
    ...args,
  });
}

/** Imported in `conversation/session-manager.ts`. */
export function logToolEnd(
  toolName: string,
  args: Record<string, unknown>,
  result: string,
  callId?: string,
) {
  const isError = result.startsWith('Error:');
  const logFn = isError ? console.error.bind(console) : console.log.bind(console);
  logFn(
    `[gio-system:turn] tool ${isError ? 'error' : 'end'}: ${toolName}${formatDetails({
      callId,
      ...args,
      result: result.length > 200 ? `${result.slice(0, 200)}…` : result,
    })}`,
  );
}

/** Imported in `conversation/session-manager.ts`. */
export function logResponseDone(status: string | undefined, details?: Record<string, unknown>) {
  const level = status === 'completed' ? 'log' : 'error';
  console[level](`[gio-system:turn] response.done${formatDetails({ status, ...details })}`);
}
