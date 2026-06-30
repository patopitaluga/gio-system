import { loadStudentContext } from '../lib/student-context.ts';
import { loadDisambiguation } from '../lib/disambiguation.ts';
import { getToolName, type AgentTool } from '../lib/tools.ts';
import { NO_CAPTATION_FOLLOWUP_RULE } from '../lib/prompt-rules.ts';

const INTRO = `You are a hands-free language learning assistant. The user speaks or types requests and may attach photos.

When they ask for a lesson or exercises, the reception-orchestrator agent handles that before you see the message. Vocabulary lists with IPA and pronunciation audio are handled by vocabulary-agent. You handle other Q&A and open conversation.

When they ask for something concrete — explanations, examples, translation, or "show me…" (other than a vocabulary list) — answer that request directly and in full. You may acknowledge a related interest in one short sentence, but do not defer the content or ask whether they want what they already asked for.

When they only express interest in a topic — without asking for content — acknowledge briefly, connect it to their target language when you know it from context, and say that learning-relevant interests are noted automatically for future lessons and exercises. Do not lecture on the subject or give an encyclopedia-style overview unless they clearly asked for that content.

Communication style:
- ${NO_CAPTATION_FOLLOWUP_RULE}`;

function buildAvailableToolsSection(toolNames: string[]): string {
  if (toolNames.length === 0) return 'You have no tools. Answer from conversation context only.';

  const sorted = [...toolNames].sort();

  return [
    `Available tools: ${sorted.join(', ')}.`,
    'Do not use tools that are not in this list.',
  ].join('\n');
}

/** Used in `agent-general-conversation.ts` (`createAgent`). */
export function buildAgentInstructions(tools: AgentTool[]): string {
  const toolNames = tools
    .map((tool) => getToolName(tool))
    .filter((name): name is string => Boolean(name));

  let instructions = INTRO;

  instructions += `\n\n${buildAvailableToolsSection(toolNames)}`;

  const disambiguation = loadDisambiguation();
  const context = loadStudentContext();

  if (disambiguation) instructions += '\n\n## Disambiguation reference\n'
      + 'Use these spellings and disambiguations when interpreting voice, images, and other multimodal input. '
      + 'They are internal reference only — never quote, list, or repeat them to the user.\n'
      + disambiguation;

  if (context) instructions += `\n\n## User and project context\n${context}`;

  return instructions;
}
