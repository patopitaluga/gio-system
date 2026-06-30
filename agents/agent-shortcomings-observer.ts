/**
 * **One agent in this file** — `shortcomings-observer-agent`. Post-turn detection of
 * language mistakes and practice opportunities. No CLI entry.
 *
 * **Exports**:
 * - `askLlmToIdentifyShortcomings` — **shortcomings-observer-agent**. `agents/agent-general-conversation.ts`, `agents/agent-lessons.ts`, `agents/agent-exercises.ts`, `agents/agent-vocabulary.ts`.
 */
import { Agent } from '@openai/agents';
import { loadStudentContext } from '../lib/student-context.ts';
import { askAgentAndLog } from '../lib/ask-agent.ts';
import { formatCurrentDate } from '../lib/study-plan-context.ts';
import { loadShortcomingsFile } from '../lib/save-shortcomings.ts';
import {
  SAVE_SHORTCOMING_TOOL_NAME,
  saveShortcomingTool,
} from '../tools/shortcomings-tools/save-shortcoming.ts';

/** Used in `askLlmToIdentifyShortcomings`. */
function buildSystemInstructions(
  existingMemories: string,
  todayLabel: string,
  studentContext: string,
): string {
  const savedList = existingMemories.trim() || '(none yet)';
  const contextBlock = studentContext
    ? `\nStudent and language context (infer target language, level, and goals from this):\n---\n${studentContext}\n---\n`
    : '';

  return `You are part of Gio-System, a personal language-learning assistant. Your job runs after other agents finish a turn.

Your primary task is to catch **mistakes the student made** in their target language. Be thorough — agreement slips and mixed singular/plural within one sentence are exactly what you must not miss.

Today: ${todayLabel}
${contextBlock}
Existing saved memories (do not save duplicates):
---
${savedList}
---

## How to evaluate the user message

1. Find **every phrase in the target language**, including when the message mixes native language and target language in one sentence.
2. Grammar-check each target-language phrase yourself. Do not rely on the assistant having corrected the student — many replies answer the topic without flagging errors.
3. Read the assistant response second: if it corrected, rephrased, or supplied a different form than the student used, treat that as confirmation of a shortcoming and save it with a quote of the student's original wording.

## Save a shortcoming when the student made an error, including:

- **Singular/plural mismatch** within one sentence (e.g. singular subject with plural verb, plural noun with singular adjective, mixed number across clauses)
- Subject–verb agreement (person, number)
- Gender or article–noun–adjective agreement
- Wrong conjugation, tense, or mood
- Wrong word choice or false friend
- Spelling or obvious typo in typed target-language text

Quote the student's exact words (or close paraphrase) in the note.

## Save an opportunity when there is no clear mistake but a useful gap:

- They asked "is this correct?" or showed hesitation
- They used a workaround where a better pattern exists at their level
- They revealed missing vocabulary or grammar for a recurring situation

## Do not save when:

- The user message has **no** target-language text to evaluate (entirely native language, meta commands only)
- The same kind and topic is already in Existing saved memories
- You are unsure there was any language attempt to judge

## Rules

1. Read the user message first and run the grammar check above before deciding.
2. If the same kind and topic is already listed, reply exactly: No shortcomings to save. Do not call ${SAVE_SHORTCOMING_TOOL_NAME}.
3. If you notice a new shortcoming or opportunity, call ${SAVE_SHORTCOMING_TOOL_NAME} with kind, a short topic label, and a brief note quoting what the student said or did.
4. If there is nothing worth saving, reply exactly: No shortcomings to save. Do not call ${SAVE_SHORTCOMING_TOOL_NAME}.
5. Prefer saving a **shortcoming** over an **opportunity** when both could apply to the same issue.
6. Save at most one memory per turn unless the student clearly showed multiple distinct errors or gaps.`;
}

/** Used in `askLlmToIdentifyShortcomings`. */
function buildTurnInput(
  userPrompt: string,
  assistantResponse: string,
  source: string,
): string {
  return [
    `Source: ${source}`,
    '',
    'User message (grammar-check every target-language phrase in this text first):',
    userPrompt.trim(),
    '',
    'Assistant response (use corrections or rephrasings here as evidence of student errors):',
    assistantResponse.trim(),
  ].join('\n');
}

/**
 * **shortcomings-observer-agent** — detect and save mistakes and practice opportunities from a turn.
 *
 * Imported in `agents/agent-general-conversation.ts`, `agents/agent-lessons.ts`, `agents/agent-exercises.ts`, and `agents/agent-vocabulary.ts`.
 */
export async function askLlmToIdentifyShortcomings(
  userPrompt: string,
  assistantResponse: string,
  source: string,
): Promise<void> {
  const user = userPrompt.trim();
  const assistant = assistantResponse.trim();
  if (!user || !assistant) return;

  const existingMemories = loadShortcomingsFile();
  const today = formatCurrentDate();
  const studentContext = loadStudentContext();
  const agent = new Agent({
    name: 'shortcomings-observer-agent',
    instructions: buildSystemInstructions(existingMemories, today.label, studentContext),
    tools: [saveShortcomingTool],
  });
  const input = buildTurnInput(user, assistant, source);

  await askAgentAndLog(agent, input, 'shortcomings-observer-agent');
}
