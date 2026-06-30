import type { RunItem } from '@openai/agents';
import { getToolOutputs } from './agent-tool-outputs.ts';
import type { GenerateStudyOutputResult } from '../tools/study-output-tools/generate-study-output-tool.ts';
import type { RetrieveStudyOutputResult } from '../tools/study-output-tools/retrieve-existing-study-output.ts';

/** Outcome after an agent loop finishes. Used in `agent-lessons.ts`, `agent-exercises.ts`, and `test/study-output.test.ts`. */
export type AgentLoopResult = {
  markdown: string;
  emailed: boolean;
  savedPath: string;
  source: 'archive' | 'generated' | 'message';
};

/** Used in `resolveAgentOutput` via `getToolOutputs` (retrieve tool JSON). */
function parseRetrieveResult(value: unknown): RetrieveStudyOutputResult | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const record = value as RetrieveStudyOutputResult;

  if (typeof record.found !== 'boolean' || typeof record.dateIso !== 'string') return undefined;

  return record;
}

/** Used in `resolveAgentOutput` via `getToolOutputs` (generate tool JSON). */
function parseGenerateResult(value: unknown): GenerateStudyOutputResult | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const record = value as GenerateStudyOutputResult;

  if (typeof record.markdown !== 'string' || typeof record.savedPath !== 'string') return undefined;

  return {
    markdown: record.markdown,
    savedPath: record.savedPath,
    emailed: Boolean(record.emailed),
  };
}

/** Used in `agent-lessons.ts`, `agent-exercises.ts`, and `test/study-output.test.ts`. Prefers retrieve output, then generate, then the agent's final message. */
export function resolveAgentOutput(
  result: { newItems: RunItem[]; finalOutput?: string | null },
  retrieveToolName: string,
  generateToolName: string,
): AgentLoopResult {
  const retrieveResults = getToolOutputs(
    result.newItems,
    retrieveToolName,
    parseRetrieveResult,
  );

  for (const retrieve of retrieveResults) if (retrieve.found && retrieve.markdown) return {
        markdown: retrieve.markdown,
        savedPath: retrieve.savedPath ?? '',
        emailed: false,
        source: 'archive',
      };

  const generateResults = getToolOutputs(
    result.newItems,
    generateToolName,
    parseGenerateResult,
  );
  const generated = generateResults.at(-1);

  if (generated) return {
      markdown: generated.markdown,
      savedPath: generated.savedPath,
      emailed: generated.emailed,
      source: 'generated',
    };

  const message = result.finalOutput?.trim();

  if (message) return {
      markdown: message,
      savedPath: '',
      emailed: false,
      source: 'message',
    };

  throw new Error('Agent did not produce a response');
}
