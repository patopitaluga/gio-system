import { tool } from '@openai/agents';
import type { RunItem } from '@openai/agents';
import { z } from 'zod';
import { formatCurrentDate, type StudyPlanDate } from '../../lib/study-plan-context.ts';
import { markStudyPlanItems } from '../../lib/study-plan-mark.ts';

/** Used in `agents/agent-lessons.ts` and `agents/agent-exercises.ts`. */
export const MARK_STUDY_PLAN_ITEMS_TOOL_NAME = 'mark_study_plan_items';

/** Used in `createMarkStudyPlanItemsTool`. */
function buildMarkStudyPlanItemsDescription(today: StudyPlanDate): string {
  return [
    'Check off plan items in study-plan.md that you delivered in this run.',
    `Today is ${today.label} (${today.iso}).`,
    `Default to today's plan entry (${today.label}).`,
    'Only pass a different planDateLabel when the user specifically asked for another day.',
    'Pass itemTexts as substrings that match unchecked lines on that plan day.',
  ].join(' ');
}

/** Used in `createMarkStudyPlanItemsTool`. */
function buildPlanDateLabelDescription(today: StudyPlanDate): string {
  return [
    `Plan day header for the content you delivered. Defaults to today: "${today.label}".`,
    'Only pass another day when the user specifically asked for it.',
    'Must match the plan day of the items in itemTexts.',
  ].join(' ');
}

/** Used in `createMarkStudyPlanItemsTool`. */
function buildItemTextsDescription(): string {
  return [
    'Substrings identifying unchecked plan lines to mark on the given plan day,',
    'e.g. ["Pronombres personales"].',
    'Each substring must match a line on planDateLabel\'s entry only.',
  ].join(' ');
}

/** Imported in `agents/agent-lessons.ts` and `agents/agent-exercises.ts`. */
export function createMarkStudyPlanItemsTool(today: StudyPlanDate = formatCurrentDate()) {
  return tool({
    name: MARK_STUDY_PLAN_ITEMS_TOOL_NAME,
    description: buildMarkStudyPlanItemsDescription(today),
    parameters: z.object({
      itemTexts: z
        .array(z.string())
        .min(1)
        .describe(buildItemTextsDescription()),
      planDateLabel: z
        .string()
        .optional()
        .describe(buildPlanDateLabelDescription(today)),
    }),
    async execute({ itemTexts, planDateLabel }) {
      const now = formatCurrentDate();
      const dateLabel = planDateLabel?.trim() || now.label;
      const marked = markStudyPlanItems(itemTexts, dateLabel);

      return JSON.stringify({
        marked,
        planDateLabel: dateLabel,
        todayLabel: now.label,
      });
    },
  });
}

function getToolCallName(item: RunItem): string | undefined {
  if (item.type !== 'tool_call_item') return undefined;

  const raw = item.rawItem;
  if (raw && 'name' in raw && typeof raw.name === 'string') return raw.name;

  return undefined;
}

function ensureMarkStudyPlanToolUsed(result: { newItems: RunItem[] }) {
  const called = result.newItems.some(
    (item) => getToolCallName(item) === MARK_STUDY_PLAN_ITEMS_TOOL_NAME,
  );

  if (called) return;

  console.warn(`[gio-system] Warning: ${MARK_STUDY_PLAN_ITEMS_TOOL_NAME} was not called.`);
}

/** Imported in `agents/agent-lessons.ts` and `agents/agent-exercises.ts`. */
export function warnIfMarkStudyPlanToolMissing(result: { newItems: RunItem[] }) {
  ensureMarkStudyPlanToolUsed(result);
}
