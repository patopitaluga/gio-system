import { styleText } from 'node:util';
import type { Usage } from '@openai/agents';
import { RequestUsage } from '@openai/agents';

export type OpenAiUsageSnapshot = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export function usageFromAgentsUsage(usage: Usage): OpenAiUsageSnapshot {
  return {
    requests: usage.requests,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

export function usageFromRequestUsage(entry: RequestUsage): OpenAiUsageSnapshot {
  return {
    requests: 1,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    totalTokens: entry.totalTokens,
  };
}

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

/** Logs that an OpenAI API request is about to run. */
export function logOpenAiRequest(contextLabel: string, agentName?: string): void {
  const agentSuffix = agentName ? ` (${agentName})` : '';

  console.log(
    styleText('magenta', `🤖 OpenAI request — ${contextLabel}${agentSuffix}`),
  );
}

/** Logs token usage after an OpenAI API request completes. */
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

export function formatOpenAiUsageLine(
  contextLabel: string,
  usage: OpenAiUsageSnapshot,
): string {
  return `${contextLabel}: ${formatTokenCount(usage.totalTokens)} tokens `
    + `(input: ${formatTokenCount(usage.inputTokens)} · `
    + `output: ${formatTokenCount(usage.outputTokens)})`;
}

export function logOpenAiThinking(): void {
  console.log(styleText('dim', '🧠 Thinking...'));
}

export function logOpenAiResponseReceived(requestNumber: number): void {
  console.log(
    styleText('dim', `  ← OpenAI response received (request ${requestNumber})`),
  );
}
