/**
 * **One agent in this file** — `interests-observer-agent`. Post-turn interest
 * identification after lessons, exercises, or chat. No CLI entry.
 *
 * **Exports**:
 * - `askLlmToIdentifyInterests` — **interests-observer-agent**. `agent-general-conversation.ts`, `agent-lessons.ts`, `agent-exercises.ts`.
 */
import { Agent } from '@openai/agents';
import { loadAgentContext } from './lib/agent-context.ts';
import { askAgentAndLog } from './lib/ask-agent.ts';
import { formatCurrentDate } from './lib/study-plan-context.ts';
import { loadInterestsFile, findRestatedSavedInterest, logInterestAlreadySaved, INTERESTS_PATH } from './lib/save-interests.ts';
import {
  SAVE_INTEREST_TOOL_NAME,
  saveInterestTool,
} from './tools/interest-tools/save-interest.ts';

/** Used in `askLlmToIdentifyInterests`. */
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
2. Check Existing saved interests first. If the topic is already listed, reply exactly: No interests to save. Do not call ${SAVE_INTEREST_TOOL_NAME}.
3. If the user expresses a new language-learning-relevant interest, call ${SAVE_INTEREST_TOOL_NAME} with a short topic label and a brief note quoting why it matters for their learning.
4. If there is no clear language-learning-relevant interest, reply exactly: No interests to save. Do not call ${SAVE_INTEREST_TOOL_NAME}.
5. Save at most one new interest per conversation unless the user clearly expressed multiple distinct learning topics.`;
}

/** Used in `askLlmToIdentifyInterests`. */
function buildTurnInput(
  userPrompt: string,
  assistantResponse: string,
  source: string,
): string {
  return [
    `Source: ${source}`,
    '',
    'User message:',
    userPrompt.trim(),
    '',
    'Assistant response:',
    assistantResponse.trim(),
  ].join('\n');
}

/**
 * **interests-observer-agent** — detect and save language-learning interests from a turn.
 *
 * Imported in `agent-general-conversation.ts`, `agent-lessons.ts`, and `agent-exercises.ts`.
 */
export async function askLlmToIdentifyInterests(
  userPrompt: string,
  assistantResponse: string,
  source: string,
): Promise<void> {
  const user = userPrompt.trim();
  const assistant = assistantResponse.trim();
  if (!user || !assistant) return;

  const existingInterests = loadInterestsFile();
  const restatedInterest = findRestatedSavedInterest(user, existingInterests);
  if (restatedInterest) {
    logInterestAlreadySaved(restatedInterest, INTERESTS_PATH);
    return;
  }

  const today = formatCurrentDate();
  const learnerContext = loadAgentContext();
  const agent = new Agent({
    name: 'interests-observer-agent',
    instructions: buildSystemInstructions(existingInterests, today.label, learnerContext),
    tools: [saveInterestTool],
  });
  const input = buildTurnInput(user, assistant, source);

  await askAgentAndLog(agent, input, 'interests-observer-agent');
}
