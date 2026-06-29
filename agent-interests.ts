import { Agent } from '@openai/agents';
import { loadAgentContext } from './config/agent-context.ts';
import { runLoggedAgent } from './lib/run-agent.ts';
import { assertAgentEnv, formatCurrentDate } from './lib/study-plan-context.ts';
import { loadInterestsFile } from './lib/save-interests.ts';
import { logTurnError } from './utils/turn-log.ts';
import {
  SAVE_INTEREST_TOOL_NAME,
  saveInterestTool,
} from './tools/interest-tools/save-interest.ts';

function buildSystemInstructions(
  existingInterests: string,
  todayLabel: string,
  learnerContext: string,
): string {
  const savedList = existingInterests.trim() || '(none yet)';
  const contextBlock = learnerContext
    ? `\nLearner and language context (infer target language, level, and goals from this):\n---\n${learnerContext}\n---\n`
    : '';

  return `You are part of Gio-System, a personal language-learning assistant. Your job runs after other agents (lessons, exercises, or conversation) finish a turn.

Identify if in this conversation you can notice that the user is expressing interest in a topic that is relevant to their language learning — vocabulary themes, cultural subjects, situations they want to handle in the target language, professions or hobbies they want to discuss in that language, places they care about, or other study angles worth revisiting later.

Today: ${todayLabel}
${contextBlock}
Existing saved interests (do not save duplicates):
---
${savedList}
---

Save when the user shows interest in topics like:
- Words, grammar areas, or language skills they want to go deeper on
- Culture, places, food, history, or daily-life themes tied to the language they are learning
- Personal goals where language matters (travel, work, family, hobbies they want to practice in the target language)

Do not save when:
- The interest is unrelated to language learning (generic tech, politics, news, etc. with no learning angle)
- The user only asked for a lesson, exercises, or repetition without naming a specific topic
- The topic is already in the saved list above

Rules:
1. Read the user message and assistant response in the conversation transcript.
2. If the user expresses a language-learning-relevant interest, call ${SAVE_INTEREST_TOOL_NAME} with a short topic label and a brief note quoting why it matters for their learning.
3. If there is no clear language-learning-relevant interest, reply exactly: No interests to save. Do not call ${SAVE_INTEREST_TOOL_NAME}.
4. Save at most one new interest per conversation unless the user clearly expressed multiple distinct learning topics.`;
}

function createInterestsAgent(existingInterests: string): Agent {
  const today = formatCurrentDate();
  const learnerContext = loadAgentContext();

  return new Agent({
    name: 'Interests observer',
    instructions: buildSystemInstructions(existingInterests, today.label, learnerContext),
    tools: [saveInterestTool],
  });
}

function buildConversationInput(
  userPrompt: string,
  assistantResponse: string,
  source: string,
): string {
  return [
    `Conversation source: ${source}`,
    '',
    'User message:',
    userPrompt.trim(),
    '',
    'Assistant response:',
    assistantResponse.trim(),
  ].join('\n');
}

/**
 * Analyzes a completed user/assistant exchange and may persist a new interest.
 * Used after lesson, exercises, and Realtime turns — not after cron-only generation.
 */
export async function analyzeConversationInterests(
  userPrompt: string,
  assistantResponse: string,
  source: string,
): Promise<void> {
  assertAgentEnv();

  const user = userPrompt.trim();
  const assistant = assistantResponse.trim();
  if (!user || !assistant) return;

  const existingInterests = loadInterestsFile();
  const agent = createInterestsAgent(existingInterests);
  const input = buildConversationInput(user, assistant, source);

  await runLoggedAgent(agent, input, 'Interests observer');
}

/** Fire-and-forget interests analysis so the user turn is not blocked. */
export function scheduleInterestsAnalysis(
  userPrompt: string,
  assistantResponse: string,
  source: string,
): void {
  void analyzeConversationInterests(userPrompt, assistantResponse, source).catch((error) => {
    logTurnError('interests analysis failed', error, { source });
  });
}
