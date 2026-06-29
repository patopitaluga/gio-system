import { Agent } from '@openai/agents';
import type { RunItem } from '@openai/agents';
import { runLoggedAgent } from './run-agent.ts';
import { assertAgentEnv, formatCurrentDate, type StudyPlanDate } from './study-plan-context.ts';
import { getToolOutputs, wasAnyToolUsed } from './run-tool-results.ts';
import { NO_CAPTATION_FOLLOWUP_RULE } from './prompt-rules.ts';
import { listStudyOutputDates } from './save-study-output.ts';
import {
  createGenerateNewExercisesTool,
  createGenerateNewLessonTool,
  GENERATE_NEW_EXERCISES_TOOL_NAME,
  GENERATE_NEW_LESSON_TOOL_NAME,
  type GenerateStudyOutputResult,
} from '../tools/study-output-tools/generate-study-output-tool.ts';
import {
  retrieveExistingExercisesTool,
  retrieveExistingLessonTool,
  RETRIEVE_EXISTING_EXERCISES_TOOL_NAME,
  RETRIEVE_EXISTING_LESSON_TOOL_NAME,
  type RetrieveStudyOutputResult,
} from '../tools/study-output-tools/retrieve-existing-study-output.ts';

export const GENERAL_ROUTE = 'general';

export type StudyOutputRunResult = {
  markdown: string;
  emailed: boolean;
  savedPath: string;
  source: 'archive' | 'generated' | 'message';
};

export type OrchestratorResult =
  | { route: typeof GENERAL_ROUTE }
  | { route: 'lesson' | 'exercises'; result: StudyOutputRunResult };

const STUDY_TOOL_NAMES = [
  RETRIEVE_EXISTING_LESSON_TOOL_NAME,
  GENERATE_NEW_LESSON_TOOL_NAME,
  RETRIEVE_EXISTING_EXERCISES_TOOL_NAME,
  GENERATE_NEW_EXERCISES_TOOL_NAME,
] as const;

const orchestratorTools = [
  retrieveExistingLessonTool,
  createGenerateNewLessonTool(),
  retrieveExistingExercisesTool,
  createGenerateNewExercisesTool(),
];

function formatSavedDates(dates: string[]): string {
  return dates.length > 0
    ? dates.map((date) => `- ${date}`).join('\n')
    : '- (none yet)';
}

function buildOrchestratorInstructions(
  today: StudyPlanDate,
  lessonDates: string[],
  exerciseDates: string[],
): string {
  return `You route user messages for a language learning assistant.

Today: ${today.generatedAt} (${today.label}, ${today.iso})

Saved lessons (newest first, ISO dates):
${formatSavedDates(lessonDates)}

Saved exercises (newest first, ISO dates):
${formatSavedDates(exerciseDates)}

Routing:
1. If the user wants general conversation, language Q&A, file help, email, or anything that is NOT specifically requesting lesson or exercises content, reply with ONLY the word "${GENERAL_ROUTE}". Do not call any tool.
2. If the user wants lesson content (study theory, learn today's lesson, repeat or review a past lesson, teaching content), use the lesson tools below.
3. If the user wants exercises (practice, drills, activities, repeat past exercises, apply what they learned), use the exercises tools below.

Lesson tools — ${RETRIEVE_EXISTING_LESSON_TOOL_NAME}, ${GENERATE_NEW_LESSON_TOOL_NAME}:
- Infer the target date from the message in any language, using today as the anchor for relative dates (yesterday, last week, etc.).
- To read, review, show, repeat, or load an existing saved lesson when a file exists for that date, call ${RETRIEVE_EXISTING_LESSON_TOOL_NAME} with that dateIso.
- If ${RETRIEVE_EXISTING_LESSON_TOOL_NAME} returns found:true, your final reply MUST be the markdown from the tool verbatim. Do not rewrite, summarize, or regenerate it.
- For newly generated lesson content, or when no saved lesson exists for the requested date, call ${GENERATE_NEW_LESSON_TOOL_NAME} with the full user request as userPrompt.
- When calling ${GENERATE_NEW_LESSON_TOOL_NAME}, pass the user's message unchanged unless you need to clarify the plan day.
- If ${RETRIEVE_EXISTING_LESSON_TOOL_NAME} returns found:false and the user only wanted a past lesson, explain that none is saved for that date and ask whether to generate one.
- On retrieve, do not invent lesson content yourself.

Exercises tools — ${RETRIEVE_EXISTING_EXERCISES_TOOL_NAME}, ${GENERATE_NEW_EXERCISES_TOOL_NAME}:
- Apply the same date and intent rules as for lessons, but for exercises content.
- If ${RETRIEVE_EXISTING_EXERCISES_TOOL_NAME} returns found:true, your final reply MUST be the markdown from the tool verbatim.
- For newly generated exercises, or when no saved exercises exist for the requested date, call ${GENERATE_NEW_EXERCISES_TOOL_NAME} with the full user request as userPrompt.
- On retrieve, do not invent exercises content yourself.

Shared rules:
- ${NO_CAPTATION_FOLLOWUP_RULE}
- You MUST either reply "${GENERAL_ROUTE}" OR call exactly one study tool before finishing.`;
}

function createOrchestratorAgent(
  today: StudyPlanDate,
  lessonDates: string[],
  exerciseDates: string[],
): Agent {
  return new Agent({
    name: 'Orchestrator',
    instructions: buildOrchestratorInstructions(today, lessonDates, exerciseDates),
    tools: orchestratorTools,
  });
}

function parseRetrieveResult(value: unknown): RetrieveStudyOutputResult | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const record = value as RetrieveStudyOutputResult;

  if (typeof record.found !== 'boolean' || typeof record.dateIso !== 'string') return undefined;

  return record;
}

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

export function resolveStudyOutputFromRun(
  result: { newItems: RunItem[]; finalOutput?: string | null },
  retrieveToolName: string,
  generateToolName: string,
): StudyOutputRunResult {
  const retrieveResults = getToolOutputs(
    result.newItems,
    retrieveToolName,
    parseRetrieveResult,
  );

  for (const retrieve of retrieveResults)
    if (retrieve.found && retrieve.markdown)
      return {
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

  if (generated)
    return {
      markdown: generated.markdown,
      savedPath: generated.savedPath,
      emailed: generated.emailed,
      source: 'generated',
    };

  const message = result.finalOutput?.trim();

  if (message)
    return {
      markdown: message,
      savedPath: '',
      emailed: false,
      source: 'message',
    };

  throw new Error('Orchestrator did not produce a response');
}

export function resolveOrchestratorFromRun(
  result: { newItems: RunItem[]; finalOutput?: string | null },
): OrchestratorResult {
  if (!wasAnyToolUsed(result.newItems, [...STUDY_TOOL_NAMES]))
    return { route: GENERAL_ROUTE };

  if (wasAnyToolUsed(result.newItems, [
    RETRIEVE_EXISTING_LESSON_TOOL_NAME,
    GENERATE_NEW_LESSON_TOOL_NAME,
  ]))
    return {
      route: 'lesson',
      result: resolveStudyOutputFromRun(
        result,
        RETRIEVE_EXISTING_LESSON_TOOL_NAME,
        GENERATE_NEW_LESSON_TOOL_NAME,
      ),
    };

  if (wasAnyToolUsed(result.newItems, [
    RETRIEVE_EXISTING_EXERCISES_TOOL_NAME,
    GENERATE_NEW_EXERCISES_TOOL_NAME,
  ]))
    return {
      route: 'exercises',
      result: resolveStudyOutputFromRun(
        result,
        RETRIEVE_EXISTING_EXERCISES_TOOL_NAME,
        GENERATE_NEW_EXERCISES_TOOL_NAME,
      ),
    };

  throw new Error('Orchestrator did not produce a response');
}

/**
 * Single entry point for routing user messages to general conversation, lessons,
 * or exercises. Used by the Realtime session, CLI scripts, and study-output tools.
 */
export async function runOrchestrator(userPrompt: string): Promise<OrchestratorResult> {
  assertAgentEnv();

  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('User prompt is required');

  const today = formatCurrentDate();
  const lessonDates = listStudyOutputDates('lessons', 10);
  const exerciseDates = listStudyOutputDates('exercises', 10);
  const agent = createOrchestratorAgent(today, lessonDates, exerciseDates);
  const result = await runLoggedAgent(agent, prompt, 'Orchestrator');

  if (!wasAnyToolUsed(result.newItems, [...STUDY_TOOL_NAMES]))
    return { route: GENERAL_ROUTE };

  return resolveOrchestratorFromRun(result);
}
