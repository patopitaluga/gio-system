import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { projectRoot } from '../config/workspace.ts';

export const STUDY_PLAN_PATH = path.join(projectRoot, 'study-plan.md');

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const WEEKDAYS_ES = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
];

export type StudyPlanDate = {
  label: string;
  iso: string;
  generatedAt: string;
};

/** Calendar date in the local timezone as YYYY-MM-DD (not UTC). */
export function formatLocalDateIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

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

export function loadStudyPlan(): string {
  return readFileSync(STUDY_PLAN_PATH, 'utf8').trim();
}

export function assertAgentEnv(): void {
  if (!process.env.OPENAI_API_KEY?.trim())
    throw new Error('OPENAI_API_KEY is not set');
}
