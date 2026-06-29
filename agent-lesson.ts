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
  warnIfMarkStudyPlanToolMissing,
  MARK_STUDY_PLAN_ITEMS_TOOL_NAME,
  markStudyPlanItemsTool,
} from './tools/study-plan-tools/mark-study-plan-items.ts';

/** Default user prompt for cron and for `npm run lesson` with no args. */
export const DEFAULT_LESSON_PROMPT = 'Generate the lesson for today.';

export type LessonRunResult = {
  markdown: string;
  emailed: boolean;
  savedPath: string;
  source: 'archive' | 'generated' | 'message';
};

function buildSystemInstructions(studyPlan: string, today: StudyPlanDate): string {
  const emailRule = isEmailConfigured()
    ? `9. Call ${SEND_EMAIL_TOOL_NAME} only when the user explicitly asks to send or email the lesson. Include the full lesson as plain text; you may omit html. Otherwise return the lesson as your final response only — do not send email on your own.`
    : '9. Email is not configured. Always return the lesson as your final response.';

  return `You are an expert language teacher.

Current date and time: ${today.generatedAt} (${today.label}, ${today.iso})

Full study plan:
---
${studyPlan}
---

Follow the user prompt to decide which plan day to teach and any extra focus (for example tomorrow's entry or additional vocabulary topics).

Core rules:
1. Infer from the plan the target language, the student's language, and any other relevant context.
2. Find the plan entry for the day requested in the user prompt (default: today).
3. For that day, separate THEORETICAL CONTENT from EXERCISES or PRACTICE.
   - Theory: new topics, grammar, vocabulary, explanations, rules.
   - Exercises/practice: activities such as "practice", "write", "conjugate", "simulate", "compose a text", etc.
4. Write a complete lesson on theoretical content only.
5. Do not include exercises, practice tasks, or student activities.
6. Write clearly and structurally in the student's language, with examples in the target language when appropriate.
7. If the day only lists practice activities, teach the underlying theory needed to understand them, without assigning those activities.
8. After writing the lesson, call ${MARK_STUDY_PLAN_ITEMS_TOOL_NAME} at most once with unchecked THEORETICAL plan item texts you covered. Do not pass practice or exercise lines (for example "write", "practice", "conjugate"). Pass planDateLabel matching the plan day you taught (same format as plan headers, e.g. "29 de junio (Lunes)"). If that day has no unchecked theoretical items, skip this tool entirely.
9. ${NO_CAPTATION_FOLLOWUP_RULE}
${emailRule.replace(/^9\./, '10.')}

Output format:
- Start with a brief header:
  1. Generation date and time: ${today.generatedAt}
  2. Plan location derived from the document structure (section, unit, month, module, etc.) and the theoretical content items numbered. Example: "Unit 1 · Content 1: \\"Personal pronouns\\"". List all theoretical items covered.
- Then continue with the lesson body.
- No meta preambles outside that header.
- End with the lesson content only — no closing offers or teasers.`;
}

/**
 * {@link markStudyPlanItemsTool} marks covered items in `study-plan.md`.
 * {@link createSendEmailAgentTool} sends the lesson when the user asks for email delivery.
 */
function createLessonAgent(studyPlan: string, today: StudyPlanDate): Agent {
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

/** Generates a lesson via the language teacher agent (always calls OpenAI). */
export async function generateDailyLesson(userPrompt: string): Promise<LessonRunResult> {
  assertAgentEnv();

  const prompt = userPrompt.trim();
  if (!prompt) throw new Error('Lesson prompt is required');

  const today = formatCurrentDate();
  const studyPlan = loadStudyPlan();
  const agent = createLessonAgent(studyPlan, today);

  const result = await runLoggedAgent(agent, prompt, 'Lesson generator');

  warnIfMarkStudyPlanToolMissing(result);

  const lessonMarkdown = result.finalOutput?.trim();

  if (!lessonMarkdown) throw new Error('The agent did not generate a lesson');

  const savedPath = saveStudyOutput('lessons', lessonMarkdown, today.iso);

  return {
    markdown: lessonMarkdown,
    emailed: wasToolUsed(result, SEND_EMAIL_TOOL_NAME),
    savedPath,
    source: 'generated',
  };
}

/** Routes lesson requests through the unified orchestrator. */
export async function getLesson(userPrompt: string): Promise<LessonRunResult> {
  const outcome = await runOrchestrator(userPrompt);

  if (outcome.route === 'general')
    throw new Error('The orchestrator did not recognize a lesson or exercises request');

  const result = {
    markdown: outcome.result.markdown,
    emailed: outcome.result.emailed,
    savedPath: outcome.result.savedPath,
    source: outcome.result.source,
  };

  scheduleInterestsAnalysis(userPrompt, result.markdown, 'lesson');

  return result;
}

/** Sends an already-generated lesson by email. Used by cron and other callers. */
export async function sendLessonByEmail(lessonMarkdown: string): Promise<SendEmailResult> {
  const today = formatCurrentDate();

  return sendEmail({
    subject: `Lección del día — ${today.label}`,
    text: lessonMarkdown,
    html: await markdownToHtml(lessonMarkdown),
  });
}

function readCliPrompt(): string {
  const args = process.argv.slice(2).join(' ').trim();

  return args || DEFAULT_LESSON_PROMPT;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule)
  getLesson(readCliPrompt())
    .then(({ markdown, emailed, savedPath, source }) => {
      logStudyOutputStatus('lessons', source, savedPath);
      console.log(markdown);
      if (emailed) console.log('Lesson emailed via send_email tool.');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
