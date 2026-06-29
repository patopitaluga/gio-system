import { styleText } from 'node:util';
import { Runner, type Agent, type RunResult, type Tool } from '@openai/agents';
import { getToolName } from './tools.ts';
import { parseToolArguments } from './parse-tool-arguments.ts';
import {
  logOpenAiResponseReceived,
  logOpenAiThinking,
  logOpenAiUsage,
  usageFromAgentsUsage,
  usageFromRequestUsage,
} from './log-openai-usage.ts';

const MAX_PREVIEW_CHARS = 180;

type TracedToolCall = {
  name: string;
  args: Record<string, unknown>;
  result: string;
  callId?: string;
};

type TracedRequest = {
  number: number;
  agentName: string;
  reason: string;
  tools: TracedToolCall[];
  responseLogged: boolean;
};

function truncate(text: string, max = MAX_PREVIEW_CHARS): string {
  if (text.length <= max) return text;

  return `${text.slice(0, max)}…`;
}

function getToolCallId(toolCall: { callId?: string; call_id?: string; id?: string }): string | undefined {
  return toolCall.callId ?? toolCall.call_id ?? toolCall.id;
}

function getToolCallArguments(toolCall: { arguments?: string }): string | undefined {
  return toolCall.arguments;
}

function isToolErrorResult(result: string): boolean {
  return result.startsWith('Error:')
    || result.includes('An error occurred while running the tool');
}

/** Used in `lib/agent-run-trace.ts`. Used in `test/study-output.test.ts`. */
export function summarizeToolArgsForLog(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  switch (toolName) {
    case 'generate_new_lesson':
    case 'generate_new_exercises':
      return {
        userPrompt: typeof args.userPrompt === 'string'
          ? truncate(args.userPrompt, 120)
          : args.userPrompt,
      };
    case 'retrieve_existing_lesson':
    case 'retrieve_existing_exercises':
      return { dateIso: args.dateIso };
    case 'mark_study_plan_items':
      return {
        planDateLabel: args.planDateLabel,
        itemTexts: Array.isArray(args.itemTexts)
          ? args.itemTexts.map((item) => truncate(String(item), 80))
          : args.itemTexts,
      };
    case 'send_email':
      return {
        subject: args.subject,
        textLength: typeof args.text === 'string' ? args.text.length : undefined,
      };
    case 'save_interest':
      return {
        topic: args.topic,
        note: typeof args.note === 'string' ? truncate(args.note, 120) : args.note,
      };
    default:
      return args;
  }
}

/** Used in `lib/agent-run-trace.ts`. Used in `test/study-output.test.ts`. */
export function summarizeToolResultForLog(toolName: string, result: string): string {
  if (isToolErrorResult(result)) return truncate(result, 240);

  if (
    toolName === 'generate_new_lesson'
    || toolName === 'generate_new_exercises'
    || toolName === 'retrieve_existing_lesson'
    || toolName === 'retrieve_existing_exercises'
  ) {
    try {
      const parsed = JSON.parse(result) as {
        savedPath?: string;
        found?: boolean;
        dateIso?: string;
        markdown?: string;
      };

      if (typeof parsed.found === 'boolean') {
        return parsed.found
          ? `found:true · ${parsed.dateIso ?? '?'} · ${parsed.markdown?.length ?? 0} chars`
          : `found:false · ${parsed.dateIso ?? '?'}`;
      }

      return `savedPath:${parsed.savedPath ?? '?'} · ${parsed.markdown?.length ?? 0} chars`;
    } catch {
      return truncate(result, 240);
    }
  }

  return truncate(result, 240);
}

function describeRequestReason(number: number, previousTools: TracedToolCall[]): string {
  if (number === 1) return 'user prompt';

  if (previousTools.length === 0) return 'agent continuation';

  const toolNames = [...new Set(previousTools.map((tool) => tool.name))];

  return `after tool ${toolNames.join(', ')}`;
}

function logLiveRequestStart(contextLabel: string, request: TracedRequest): void {
  console.log(
    styleText(
      'magenta',
      `🤖 Request ${request.number} — ${contextLabel} (${request.agentName}) · ${request.reason}`,
    ),
  );
  logOpenAiThinking();
}

function markModelResponseReceived(request: TracedRequest | null): void {
  if (!request || request.responseLogged) return;

  request.responseLogged = true;
  logOpenAiResponseReceived(request.number);
}

function logLiveToolStart(requestNumber: number, toolName: string, args: Record<string, unknown>): void {
  console.log(
    styleText(
      'cyan',
      `  🔧 Tool call [request ${requestNumber}]: ${toolName} ${JSON.stringify(summarizeToolArgsForLog(toolName, args))}`,
    ),
  );
}

function logLiveToolEnd(requestNumber: number, toolName: string, result: string): void {
  const isError = isToolErrorResult(result);
  const line = `  ${isError ? '✗' : '✓'} Tool result [request ${requestNumber}]: ${toolName} → ${summarizeToolResultForLog(toolName, result)}`;

  console.log(styleText(isError ? 'red' : 'dim', line));
}

function logRunTraceSummary(contextLabel: string, requests: TracedRequest[], result?: RunResult<any, any>): void {
  console.log(
    styleText('blue', `📋 Trace — ${contextLabel} — ${requests.length} API request(s)`),
  );

  const usageEntries = result?.state.usage.requestUsageEntries ?? [];

  for (const request of requests) {
    const usageEntry = usageEntries[request.number - 1];
    const usageLine = usageEntry
      ? usageFromRequestUsage(usageEntry)
      : null;

    console.log(
      styleText(
        'magenta',
        `\n  ${request.number}. ${request.agentName} · ${request.reason}`,
      ),
    );

    if (usageLine) {
      console.log(
        styleText(
          'yellow',
          `     📊 ${usageLine.totalTokens} tokens (input: ${usageLine.inputTokens} · output: ${usageLine.outputTokens})`,
        ),
      );
    }

    if (request.tools.length === 0) {
      console.log(styleText('dim', '     (no tools in this turn)'));
      continue;
    }

    for (const tool of request.tools) {
      console.log(
        styleText(
          'cyan',
          `     🔧 ${tool.name} ${JSON.stringify(summarizeToolArgsForLog(tool.name, tool.args))}`,
        ),
      );
      console.log(
        styleText(
          isToolErrorResult(tool.result) ? 'red' : 'dim',
          `        → ${summarizeToolResultForLog(tool.name, tool.result)}`,
        ),
      );
    }
  }

  if (result) {
    logOpenAiUsage(contextLabel, usageFromAgentsUsage(result.state.usage), { prefix: '  ' });
  }
}

/** Imported in `lib/run-agent.ts`. */
export function createAgentRunTrace(contextLabel: string) {
  const runner = new Runner();
  const requests: TracedRequest[] = [];
  let currentRequest: TracedRequest | null = null;
  let previousTools: TracedToolCall[] = [];

  const finalizeCurrentRequest = () => {
    if (!currentRequest) return;

    markModelResponseReceived(currentRequest);
    requests.push(currentRequest);
    previousTools = currentRequest.tools;
    currentRequest = null;
  };

  runner.on('agent_start', (_context, agent) => {
    finalizeCurrentRequest();

    const number = requests.length + 1;
    currentRequest = {
      number,
      agentName: agent.name,
      reason: describeRequestReason(number, previousTools),
      tools: [],
      responseLogged: false,
    };

    logLiveRequestStart(contextLabel, currentRequest);
  });

  runner.on('agent_tool_start', (_context, _agent, tool: Tool, details) => {
    if (!currentRequest) return;

    markModelResponseReceived(currentRequest);

    const args = parseToolArguments(getToolCallArguments(details.toolCall as { arguments?: string }));
    const toolName = getToolName(tool) ?? 'unknown_tool';

    logLiveToolStart(currentRequest.number, toolName, args);
  });

  runner.on('agent_tool_end', (_context, _agent, tool: Tool, result, details) => {
    if (!currentRequest) return;

    const args = parseToolArguments(getToolCallArguments(details.toolCall as { arguments?: string }));
    const toolName = getToolName(tool) ?? 'unknown_tool';
    const callId = getToolCallId(details.toolCall as { callId?: string; call_id?: string; id?: string });

    currentRequest.tools.push({ name: toolName, args, result, callId });
    logLiveToolEnd(currentRequest.number, toolName, result);
  });

  runner.on('agent_end', () => {
    markModelResponseReceived(currentRequest);
  });

  return {
    runner,
    finish(result: RunResult<any, Agent<any, any>>) {
      finalizeCurrentRequest();
      logRunTraceSummary(contextLabel, requests, result);
    },
    finishWithError(error: unknown) {
      finalizeCurrentRequest();
      logRunTraceSummary(contextLabel, requests);
      const message = error instanceof Error ? error.message : String(error);
      console.error(styleText('red', `✗ ${contextLabel} run failed: ${message}`));
    },
  };
}
