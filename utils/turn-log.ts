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

/** Imported in `conversation/session-manager.ts`, `agent-lessons.ts`, and `agent-exercises.ts`. */
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
