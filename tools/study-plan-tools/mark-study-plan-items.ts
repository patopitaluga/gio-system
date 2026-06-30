import { tool } from '@openai/agents';
import type { RunItem } from '@openai/agents';
import { z } from 'zod';
import { formatCurrentDate } from '../../lib/study-plan-context.ts';
import { markStudyPlanItems } from '../../lib/study-plan-mark.ts';

/** Used in `agents/agent-lessons.ts` and `agents/agent-exercises.ts`. */
export const MARK_STUDY_PLAN_ITEMS_TOOL_NAME = 'mark_study_plan_items';

/** Imported in `agents/agent-lessons.ts` and `agents/agent-exercises.ts`. */
export const markStudyPlanItemsTool = tool({
  name: MARK_STUDY_PLAN_ITEMS_TOOL_NAME,
  description:
    'Mark today\'s checkboxes in study-plan.md as complete for the given plan items.',
  parameters: z.object({
    itemTexts: z
      .array(z.string())
      .min(1)
      .describe(
        'Substrings that identify each plan line to mark, e.g. ["Pronombres personales"]',
      ),
    planDateLabel: z
      .string()
      .optional()
      .describe(
        'Plan day header label, e.g. "29 de junio (Lunes)". Defaults to today.',
      ),
  }),
  async execute({ itemTexts, planDateLabel }) {
    const today = formatCurrentDate();
    const dateLabel = planDateLabel?.trim() || today.label;
    const marked = markStudyPlanItems(itemTexts, dateLabel);

    return JSON.stringify({ marked, date: dateLabel });
  },
});

function getToolCallName(item: RunItem): string | undefined {
  if (item.type !== 'tool_call_item') return undefined;

  const raw = item.rawItem;
  if (raw && 'name' in raw && typeof raw.name === 'string') return raw.name;

  return undefined;
}

function ensureMarkStudyPlanToolUsed(result: { newItems: RunItem[] }, required: boolean) {
  const called = result.newItems.some(
    (item) => getToolCallName(item) === MARK_STUDY_PLAN_ITEMS_TOOL_NAME,
  );

  if (called) return;

  if (required) throw new Error(`Agent did not call required tool: ${MARK_STUDY_PLAN_ITEMS_TOOL_NAME}`);

  console.warn(`[gio-system] Warning: ${MARK_STUDY_PLAN_ITEMS_TOOL_NAME} was not called.`);
}

/** Imported in `agents/agent-lessons.ts`. */
export function warnIfMarkStudyPlanToolMissing(result: { newItems: RunItem[] }) {
  ensureMarkStudyPlanToolUsed(result, false);
}

/** Imported in `agents/agent-exercises.ts`. */
export function assertMarkStudyPlanToolUsed(result: { newItems: RunItem[] }) {
  ensureMarkStudyPlanToolUsed(result, true);
}
