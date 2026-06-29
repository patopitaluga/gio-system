import { loadAgentContext } from '../../config/agent-context.ts';
import { loadDictionary } from '../../config/dictionary.ts';
import { getToolName, type AgentTool } from '../../config/tools.ts';
import { NO_CAPTATION_FOLLOWUP_RULE } from '../../lib/prompt-rules.ts';

const INTRO = `You are a hands-free language learning assistant. The user speaks or types requests and may attach photos.

When they ask for a lesson or exercises, the orchestrator handles that before you see the message. You handle everything else: answering questions about their learning and open conversation.

Communication style:
- ${NO_CAPTATION_FOLLOWUP_RULE}`;

function buildCommunicationToolGuidance(available: Set<string>): string[] {
  const lines: string[] = [];

  if (available.has('send_email'))
    lines.push('When the user asks to send or email something, use send_email — do not only offer to draft in chat.');

  return lines;
}

function buildAvailableToolsSection(toolNames: string[]): string {
  if (toolNames.length === 0) return 'You have no tools. Answer from conversation context only.';

  const sorted = [...toolNames].sort();

  return [
    `Available tools: ${sorted.join(', ')}.`,
    'Do not use tools that are not in this list.',
  ].join('\n');
}

export function buildAgentInstructions(tools: AgentTool[]): string {
  const toolNames = tools
    .map((tool) => getToolName(tool))
    .filter((name): name is string => Boolean(name));
  const available = new Set(toolNames);

  let instructions = INTRO;

  const toolGuidance = buildCommunicationToolGuidance(available);
  if (toolGuidance.length > 0) instructions += `\n\n${toolGuidance.join('\n')}`;

  instructions += `\n\n${buildAvailableToolsSection(toolNames)}`;

  const dictionary = loadDictionary();
  const context = loadAgentContext();

  if (dictionary)
    instructions += '\n\n## Speech dictionary\n'
      + 'Use these spellings and disambiguations when interpreting voice, images, and other multimodal input. '
      + 'They are internal reference only — never quote, list, or repeat this dictionary to the user.\n'
      + dictionary;

  if (context) instructions += `\n\n## User and project context\n${context}`;

  return instructions;
}
