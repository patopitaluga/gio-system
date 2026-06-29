function formatDetails(details?: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) return '';

  return ` ${JSON.stringify(details)}`;
}

function summarizeToolArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (toolName) {
    case 'write_file':
    case 'append_file': {
      const content = typeof args.content === 'string' ? args.content : '';
      return {
        filePath: args.filePath,
        contentLength: content.length,
      };
    }
    case 'read_file':
      return { filePath: args.filePath };
    case 'delete_file':
      return { filePath: args.filePath };
    case 'rename_file':
      return { fromPath: args.fromPath, toPath: args.toPath };
    default:
      return args;
  }
}

export function logTurn(message: string, details?: Record<string, unknown>) {
  console.log(`[gio-system:turn] ${message}${formatDetails(details)}`);
}

/** Logs the full user prompt sent to an OpenAI agent or Realtime session (server console only). */
export function logUserPrompt(target: string, prompt: string, details?: Record<string, unknown>) {
  const trimmed = prompt.trim();
  if (!trimmed) return;

  const suffix = details && Object.keys(details).length > 0
    ? ` ${JSON.stringify(details)}`
    : '';

  console.log(`[gio-system:prompt] ${target}${suffix}`);
  console.log(trimmed);
}

export function logTurnError(message: string, error: unknown, details?: Record<string, unknown>) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  console.error(`[gio-system:turn] ${message}${formatDetails({ ...details, error: errorMessage })}`);
  if (errorStack) console.error(errorStack);
}

export function logToolStart(
  toolName: string,
  args: Record<string, unknown>,
  callId?: string,
) {
  logTurn(`tool start: ${toolName}`, {
    callId,
    ...summarizeToolArgs(toolName, args),
  });
}

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
      ...summarizeToolArgs(toolName, args),
      result: result.length > 200 ? `${result.slice(0, 200)}…` : result,
    })}`,
  );
}

export function logResponseDone(status: string | undefined, details?: Record<string, unknown>) {
  const level = status === 'completed' ? 'log' : 'error';
  console[level](`[gio-system:turn] response.done${formatDetails({ status, ...details })}`);
}
