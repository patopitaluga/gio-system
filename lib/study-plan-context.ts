import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { projectRoot } from './workspace.ts';

/** Used in `lib/study-plan-mark.ts` and `loadStudyPlan`. */
export const STUDY_PLAN_PATH = path.join(projectRoot, 'study-plan.md');

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const WEEKDAYS_ES = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
];

/** Used in `agent-lessons.ts`, `agent-exercises.ts`, `agent-reception-orchestrator.ts`, and `agent-interests.ts`. */
export type StudyPlanDate = {
  label: string;
  iso: string;
  generatedAt: string;
};

/** Used in `formatCurrentDate`. Imported in `cronjob.ts`. Used in `test/study-plan-context.test.ts`. */
export function formatLocalDateIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Imported in `agent-lessons.ts`, `agent-exercises.ts`, `agent-reception-orchestrator.ts`, `agent-interests.ts`, `cronjob.ts`, `lib/save-study-output.ts`, `lib/save-interests.ts`, and `tools/study-plan-tools/mark-study-plan-items.ts`. */
export function formatCurrentDate(): StudyPlanDate {
  const now = new Date();
  const day = now.getDate();
  const month = MONTHS_ES[now.getMonth()];
  const weekday = WEEKDAYS_ES[now.getDay()];
  const iso = formatLocalDateIso(now);
  const generatedAt = now.toLocaleString('es', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  return {
    label: `${day} de ${month} (${weekday})`,
    iso,
    generatedAt,
  };
}

/** Imported in `agent-lessons.ts` and `agent-exercises.ts`. */
export function loadStudyPlan(): string {
  return readFileSync(STUDY_PLAN_PATH, 'utf8').trim();
}

/** Imported in `agent-lessons.ts`, `agent-exercises.ts`, `agent-interests.ts`, and `agent-reception-orchestrator.ts`. */
export function assertAgentEnv(): void {
  if (!process.env.OPENAI_API_KEY?.trim())
    throw new Error('OPENAI_API_KEY is not set');
}
