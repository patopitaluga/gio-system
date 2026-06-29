import { styleText } from 'node:util';
import type { Usage } from '@openai/agents';
import { RequestUsage } from '@openai/agents';

/** Used by logging helpers in this file. */
export type OpenAiUsageSnapshot = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

/** Used in `lib/agent-run-trace.ts`. Used in `test/study-output.test.ts`. */
export function usageFromAgentsUsage(usage: Usage): OpenAiUsageSnapshot {
  return {
    requests: usage.requests,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

/** Used in `lib/agent-run-trace.ts`. */
export function usageFromRequestUsage(entry: RequestUsage): OpenAiUsageSnapshot {
  return {
    requests: 1,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    totalTokens: entry.totalTokens,
  };
}

/** Imported in `conversation/session-manager.ts`. Used in `test/study-output.test.ts`. */
export function usageFromRealtimeResponse(usage: {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
} | null | undefined): OpenAiUsageSnapshot | null {
  if (!usage) return null;

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;

  if (totalTokens === 0 && inputTokens === 0 && outputTokens === 0) return null;

  return {
    requests: 1,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function formatTokenCount(count: number): string {
  return count.toLocaleString('en');
}

/** Imported in `conversation/session-manager.ts`. */
export function logOpenAiRequest(contextLabel: string, agentName?: string): void {
  const agentSuffix = agentName ? ` (${agentName})` : '';

  console.log(
    styleText('magenta', `🤖 OpenAI request — ${contextLabel}${agentSuffix}`),
  );
}

/** Imported in `conversation/session-manager.ts` and `lib/agent-run-trace.ts`. */
export function logOpenAiUsage(
  contextLabel: string,
  usage: OpenAiUsageSnapshot,
  options?: { prefix?: string; suffix?: string },
): void {
  const prefix = options?.prefix ?? '';
  const suffix = options?.suffix ?? '';
  const requestsSuffix = usage.requests > 1 ? ` · ${usage.requests} requests` : '';

  console.log(
    styleText(
      'yellow',
      `${prefix}📊 Total ${contextLabel}: ${formatTokenCount(usage.totalTokens)} tokens `
      + `(input: ${formatTokenCount(usage.inputTokens)} · `
      + `output: ${formatTokenCount(usage.outputTokens)}${requestsSuffix})${suffix}`,
    ),
  );
}

/** Used in `test/study-output.test.ts`. */
export function formatOpenAiUsageLine(
  contextLabel: string,
  usage: OpenAiUsageSnapshot,
): string {
  return `${contextLabel}: ${formatTokenCount(usage.totalTokens)} tokens `
    + `(input: ${formatTokenCount(usage.inputTokens)} · `
    + `output: ${formatTokenCount(usage.outputTokens)})`;
}

/** Imported in `conversation/session-manager.ts` and `lib/agent-run-trace.ts`. */
export function logOpenAiThinking(): void {
  console.log(styleText('dim', '🧠 Thinking...'));
}

/** Used in `lib/agent-run-trace.ts`. */
export function logOpenAiResponseReceived(requestNumber: number): void {
  console.log(
    styleText('dim', `  ← OpenAI response received (request ${requestNumber})`),
  );
}
