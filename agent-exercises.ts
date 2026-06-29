import { Agent } from '@openai/agents';
import type { RunItem } from '@openai/agents';
import { runLoggedAgent } from './lib/run-agent.ts';
import { fileURLToPath } from 'url';
import {
  assertAgentEnv,
  formatCurrentDate,
  loadStudyPlan,
  type StudyPlanDate,
} from './lib/study-plan-context.ts';
import { markdownToHtml } from './lib/markdown-to-html.ts';
import { saveStudyOutput } from './lib/save-study-output.ts';
import { logStudyOutputStatus } from './lib/log-study-output-status.ts';
import { NO_CAPTATION_FOLLOWUP_RULE } from './lib/prompt-rules.ts';
import { runOrchestrator } from './lib/orchestrator.ts';
import { scheduleInterestsAnalysis } from './agent-interests.ts';
import {
  createSendEmailAgentTool,
  isEmailConfigured,
  SEND_EMAIL_TOOL_NAME,
  sendEmail,
  type SendEmailResult,
} from './tools/communication-tools/send-email.ts';
import {
  assertMarkStudyPlanToolUsed,
  MARK_STUDY_PLAN_ITEMS_TOOL_NAME,
  markStudyPlanItemsTool,
} from './tools/study-plan-tools/mark-study-plan-items.ts';

/** Default user prompt for cron and for `npm run exercises` with no args. */
export const DEFAULT_EXERCISES_PROMPT = 'Generate the exercises for today.';

export type ExercisesRunResult = {
  markdown: string;
  emailed: boolean;
  savedPath: string;
  source: 'archive' | 'generated' | 'message';
};

function buildSystemInstructions(studyPlan: string, today: StudyPlanDate): string {
  const emailRule = isEmailConfigured()
    ? `9. Call ${SEND_EMAIL_TOOL_NAME} only when the user explicitly asks to send or email the exercises. Include the full exercises as plain text; you may omit html. Otherwise return the exercises as your final response only — do not send email on your own.`
    : '9. Email is not configured. Always return the exercises as your final response.';

  return `You are an expert language teacher.

Current date and time: ${today.generatedAt} (${today.label}, ${today.iso})

Full study plan:
---
${studyPlan}
---

Follow the user prompt to decide which plan day to target and any extra focus (for example tomorrow's entry or additional practice topics).

Core rules:
1. Infer from the plan the target language, the student's language, and any other relevant context.
2. Find the plan entry for the day requested in the user prompt (default: today).
3. For that day, separate THEORETICAL CONTENT from EXERCISES or PRACTICE.
   - Theory: new topics, grammar, vocabulary, explanations, rules.
   - Exercises/practice: activities such as "practice", "write", "conjugate", "simulate", "compose a text", etc.
4. Create practical exercises from the exercise/practice items for that day only.
5. Do not include theoretical explanations or lessons; go straight to the activities.
6. Write clear, varied, actionable exercises in the student's language, using the target language where appropriate.
7. If the day only lists theoretical content, design practical exercises for those topics and mark those plan items.
8. After writing the exercises, you MUST call ${MARK_STUDY_PLAN_ITEMS_TOOL_NAME} exactly once with the plan item texts you covered. Pass planDateLabel matching the plan day you targeted (same format as plan headers, e.g. "29 de junio (Lunes)"). Do not finish without calling it.
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

/**
 * {@link markStudyPlanItemsTool} marks covered items in `study-plan.md`.
 * {@link createSendEmailAgentTool} sends the exercises when the user asks for email delivery.
 */
function createExercisesAgent(studyPlan: string, today: StudyPlanDate): Agent {
  const tools = [markStudyPlanItemsTool];

  if (isEmailConfigured()) tools.push(createSendEmailAgentTool());

  return new Agent({
    name: 'Language teacher',
    instructions: buildSystemInstructions(studyPlan, today),
    tools,
  });
}

function wasToolUsed(result: { newItems: RunItem[] }, toolName: string): boolean {
  return result.newItems.some((item) => {
    if (item.type !== 'tool_call_item') return false;

    const raw = item.rawItem;
    return raw && 'name' in raw && raw.name === toolName;
  });
}

/** Generates exercises via the language teacher agent (always calls OpenAI). */
export async function generateDailyExercises(userPrompt: string): Promise<ExercisesRunResult> {
  assertAgentEnv();

  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('Exercises prompt is required');

  const today = formatCurrentDate();
  const studyPlan = loadStudyPlan();
  const agent = createExercisesAgent(studyPlan, today);

  const result = await runLoggedAgent(agent, prompt, 'Exercises generator');

  assertMarkStudyPlanToolUsed(result);

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

/** Routes exercises requests through the unified orchestrator. */
export async function getExercises(userPrompt: string): Promise<ExercisesRunResult> {
  const outcome = await runOrchestrator(userPrompt);

  if (outcome.route === 'general')
    throw new Error('The orchestrator did not recognize a lesson or exercises request');

  const result = {
    markdown: outcome.result.markdown,
    emailed: outcome.result.emailed,
    savedPath: outcome.result.savedPath,
    source: outcome.result.source,
  };

  scheduleInterestsAnalysis(userPrompt, result.markdown, 'exercises');

  return result;
}

/** Sends already-generated exercises by email. Used by cron and other callers. */
export async function sendExercisesByEmail(exercisesMarkdown: string): Promise<SendEmailResult> {
  const today = formatCurrentDate();

  return sendEmail({
    subject: `Ejercicios del día — ${today.label}`,
    text: exercisesMarkdown,
    html: await markdownToHtml(exercisesMarkdown),
  });
}

function readCliPrompt(): string {
  const args = process.argv.slice(2).join(' ').trim();

  return args || DEFAULT_EXERCISES_PROMPT;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule)
  getExercises(readCliPrompt())
    .then(({ markdown, emailed, savedPath, source }) => {
      logStudyOutputStatus('exercises', source, savedPath);
      console.log(markdown);
      if (emailed) console.log('Exercises emailed via send_email tool.');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
