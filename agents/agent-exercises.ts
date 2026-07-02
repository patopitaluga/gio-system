/**
 * Exercises flow: **identify-exercises-intent-agent** and **generate-exercises-agent**
 * (both in this file). CLI entry for `npm run exercises`.
 *
 * **Exports**:
 * - `askLlmToIdentifyExercisesIntent` — **identify-exercises-intent-agent** (retrieve or generate). App, CLI, tests.
 * - `askLlmToGenerateExercises` — **generate-exercises-agent**. Cron, `generate_new_exercises`.
 * - `sendExercisesByEmail` — imported in `cronjob.ts`
 */
import { Agent } from '@openai/agents';
import type { RunItem } from '@openai/agents';
import { askAgentAndLog } from '../lib/ask-agent.ts';
import { fileURLToPath } from 'url';
import {
  formatCurrentDate,
  loadStudyPlan,
  type StudyPlanDate,
} from '../lib/study-plan-context.ts';
import { markdownToHtml } from '../lib/markdown-to-html.ts';
import { saveStudyOutput } from '../lib/save-study-output.ts';
import { logStudyOutputStatus } from '../lib/log-study-output-status.ts';
import { NO_CAPTATION_FOLLOWUP_RULE } from '../lib/prompt-rules.ts';
import { resolveAgentOutput, type AgentLoopResult } from '../lib/resolve-agent-output.ts';
import { listStudyOutputDates } from '../lib/save-study-output.ts';
import { askLlmToIdentifyInterests } from './agent-interests-observer.ts';
import { askLlmToIdentifyShortcomings } from './agent-shortcomings-observer.ts';
import { logTurnError } from '../utils/turn-log.ts';
import { createGenerateNewExercisesTool } from '../tools/study-output-tools/generate-study-output-tool.ts';
import { retrieveExistingExercisesTool } from '../tools/study-output-tools/retrieve-existing-study-output.ts';
import { StudyOutputToolName } from '../tools/study-output-tools/tool-names.ts';
import {
  createSendEmailAgentTool,
  isEmailConfigured,
  SEND_EMAIL_TOOL_NAME,
  sendEmail,
  type SendEmailResult,
} from '../tools/communication-tools/send-email.ts';
import {
  warnIfMarkStudyPlanToolMissing,
  MARK_STUDY_PLAN_ITEMS_TOOL_NAME,
  createMarkStudyPlanItemsTool,
} from '../tools/study-plan-tools/mark-study-plan-items.ts';

/** Used in `cronjob.ts` and as the default CLI prompt when `npm run exercises` has no args. */
export const DEFAULT_EXERCISES_PROMPT = 'Generate the exercises for today.';

function formatSavedDates(dates: string[]): string {
  return dates.length > 0
    ? dates.map((date) => `- ${date}`).join('\n')
    : '- (none yet)';
}

/** Used in `createIdentifyExercisesIntentAgent`. */
function buildIdentifyExercisesIntentInstructions(today: StudyPlanDate, exerciseDates: string[]): string {
  return `You are the identify-exercises-intent agent in Gio-System — figure out what the user wants regarding exercises, then retrieve saved content or trigger generation.

Today: ${today.generatedAt} (${today.label}, ${today.iso})

Saved exercises (newest first, ISO dates):
${formatSavedDates(exerciseDates)}

Tools — ${StudyOutputToolName.RetrieveExercises}, ${StudyOutputToolName.GenerateExercises}:
- Infer the target date from the message in any language, using today as the anchor for relative dates (yesterday, last week, etc.).
- To read, review, show, repeat, or load existing saved exercises when a file exists for that date, call ${StudyOutputToolName.RetrieveExercises} with that dateIso.
- If ${StudyOutputToolName.RetrieveExercises} returns found:true, your final reply MUST be the markdown from the tool verbatim. Do not rewrite, summarize, or regenerate it.
- For newly generated exercises, or when no saved exercises exist for the requested date, call ${StudyOutputToolName.GenerateExercises} with the full user request as userPrompt.
- When calling ${StudyOutputToolName.GenerateExercises}, pass the user's message unchanged unless you need to clarify the plan day.
- If ${StudyOutputToolName.RetrieveExercises} returns found:false and the user only wanted past exercises, explain that none are saved for that date and ask whether to generate new ones.
- On retrieve, do not invent exercises content yourself.
- You MUST call exactly one study tool before finishing, unless you are only explaining that a retrieve found nothing.

${NO_CAPTATION_FOLLOWUP_RULE}`;
}

/** Used in `askLlmToIdentifyExercisesIntent`. */
function createIdentifyExercisesIntentAgent(today: StudyPlanDate, exerciseDates: string[]): Agent {
  return new Agent({
    name: 'identify-exercises-intent-agent',
    instructions: buildIdentifyExercisesIntentInstructions(today, exerciseDates),
    tools: [retrieveExistingExercisesTool, createGenerateNewExercisesTool()],
  });
}

/**
 * **identify-exercises-intent-agent** — retrieve saved file or call `generate_new_exercises`.
 *
 * Imported in `conversation/session-manager.ts`, CLI (`npm run exercises`), tests, and
 * `agents/agent-reception-orchestrator.ts` (`npm run gio`).
 */
export async function askLlmToIdentifyExercisesIntent(userPrompt: string): Promise<AgentLoopResult> {
  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('Exercises prompt is required');

  const today = formatCurrentDate();
  const exerciseDates = listStudyOutputDates('exercises', 10);
  const agent = createIdentifyExercisesIntentAgent(today, exerciseDates);
  const result = await askAgentAndLog(agent, prompt, 'identify-exercises-intent-agent');

  const output = resolveAgentOutput(
    result,
    StudyOutputToolName.RetrieveExercises,
    StudyOutputToolName.GenerateExercises,
  );
  askLlmToIdentifyInterests(prompt, output.markdown, 'exercises').catch((error) => {
    logTurnError('interests identification failed', error, { source: 'exercises' });
  });
  askLlmToIdentifyShortcomings(prompt, output.markdown, 'exercises').catch((error) => {
    logTurnError('shortcomings identification failed', error, { source: 'exercises' });
  });

  return output;
}

/** Used in `askLlmToGenerateExercises`. */
function buildGenerateExercisesInstructions(studyPlan: string, today: StudyPlanDate): string {
  const emailRule = isEmailConfigured()
    ? `9. Call ${SEND_EMAIL_TOOL_NAME} only when the user explicitly asks to send or email the exercises. Include the full exercises as plain text; you may omit html. Otherwise return the exercises as your final response only — do not send email on your own.`
    : '9. Email is not configured. Always return the exercises as your final response.';

  return `You are an expert language teacher.

Current date and time: ${today.generatedAt} (${today.label}, ${today.iso})

Full study plan:
---
${studyPlan}
---

Follow the user prompt to decide which plan day to target. Default to today (${today.label}); use another day only when the user specifically asks (for example tomorrow's exercises).

Core rules:
1. Infer from the plan the target language, the student's language, and any other relevant context.
2. Find the plan entry for today (${today.label}) unless the user specifically asked for a different day.
3. For that day, separate THEORETICAL CONTENT from EXERCISES or PRACTICE.
   - Theory: new topics, grammar, vocabulary, explanations, rules.
   - Exercises/practice: activities such as "practice", "write", "conjugate", "simulate", "compose a text", etc.
4. Create practical exercises from the exercise/practice items for that day only.
5. Do not include theoretical explanations or lessons; go straight to the activities.
6. Write clear, varied, actionable exercises in the student's language, using the target language where appropriate.
7. If the day only lists theoretical content, design practical exercises for those topics. Do not mark theoretical items — the lesson agent handles those. Do not mark items from other plan days.
8. After writing the exercises, call ${MARK_STUDY_PLAN_ITEMS_TOOL_NAME} at most once with unchecked exercise/practice item texts you covered on that plan day. planDateLabel defaults to today (${today.label}); only pass another day when the user specifically asked for it. If that day has no unchecked exercise or practice items to mark, skip this tool entirely.
9. ${NO_CAPTATION_FOLLOWUP_RULE}
${emailRule.replace(/^9\./, '10.')}

Output format:
- Start with a brief header:
  1. Generation date and time: ${today.generatedAt}
  2. Plan location derived from the document structure (section, unit, month, module, etc.) and the exercise items numbered. Example: "Unit 1 · Exercise 1: \\"Practice greetings\\"". List all exercise items covered.
- Then continue with numbered exercises and their instructions.
- No meta preambles outside that header.
- End with the exercises only — no closing offers or teasers.`;
}

/** Used in `askLlmToGenerateExercises`. */
function createGenerateExercisesAgent(studyPlan: string, today: StudyPlanDate): Agent {
  const tools = [createMarkStudyPlanItemsTool(today)];

  if (isEmailConfigured()) tools.push(createSendEmailAgentTool());

  return new Agent({
    name: 'generate-exercises-agent',
    instructions: buildGenerateExercisesInstructions(studyPlan, today),
    tools,
  });
}

/** Used in `askLlmToGenerateExercises`. */
function wasToolUsed(result: { newItems: RunItem[] }, toolName: string): boolean {
  return result.newItems.some((item) => {
    if (item.type !== 'tool_call_item') return false;

    const raw = item.rawItem;
    return raw && 'name' in raw && raw.name === toolName;
  });
}

/**
 * **generate-exercises-agent** — write new exercises from study plan. Cron, `generate_new_exercises`.
 *
 * Imported in `cronjob.ts` and `tools/study-output-tools/generate-study-output-tool.ts`.
 */
export async function askLlmToGenerateExercises(
  userPrompt: string = DEFAULT_EXERCISES_PROMPT,
): Promise<AgentLoopResult> {
  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('Exercises prompt is required');

  const today = formatCurrentDate();
  const studyPlan = loadStudyPlan();
  const agent = createGenerateExercisesAgent(studyPlan, today);

  const result = await askAgentAndLog(agent, prompt, 'generate-exercises-agent');

  warnIfMarkStudyPlanToolMissing(result);

  const exercisesMarkdown = result.finalOutput?.trim();

  if (!exercisesMarkdown) throw new Error('The agent did not generate exercises');

  const savedPath = saveStudyOutput('exercises', exercisesMarkdown, today.iso);

  return {
    markdown: exercisesMarkdown,
    emailed: wasToolUsed(result, SEND_EMAIL_TOOL_NAME),
    savedPath,
    source: 'generated',
  };
}

/** Used in CLI entry when this file is the main module. */
function readCliPrompt(): string {
  const args = process.argv.slice(2).join(' ').trim();

  return args || DEFAULT_EXERCISES_PROMPT;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { // is running by cli command
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY is not set');
  const prompt = readCliPrompt();

  askLlmToIdentifyExercisesIntent(prompt)
    .then((result) => {
      logStudyOutputStatus('exercises', result.source, result.savedPath);
      console.log(result.markdown);
      if (result.emailed) console.log('Exercises emailed via send_email tool.');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

/** Imported in `cronjob.ts`. */
export async function sendExercisesByEmail(exercisesMarkdown: string): Promise<SendEmailResult> {
  const today = formatCurrentDate();

  return sendEmail({
    subject: `Ejercicios del día — ${today.label}`,
    text: exercisesMarkdown,
    html: await markdownToHtml(exercisesMarkdown),
  });
}
