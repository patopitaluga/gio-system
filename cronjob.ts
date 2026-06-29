import cron from 'node-cron';
import {
  DEFAULT_EXERCISES_PROMPT,
  generateDailyExercises,
  sendExercisesByEmail,
} from './agent-exercises.ts';
import { DEFAULT_LESSON_PROMPT, generateDailyLesson, sendLessonByEmail } from './agent-lesson.ts';
import { formatCurrentDate, formatLocalDateIso } from './lib/study-plan-context.ts';
import { readPreviousExercise, readPreviousLesson } from './lib/save-study-output.ts';
import { logStudyOutputStatus } from './lib/log-study-output-status.ts';

type DailySchedule = {
  id: string;
  label: string;
  hour: number;
  enabled: boolean;
  run: () => Promise<unknown>;
};

export const LESSON_SCHEDULE: DailySchedule = {
  id: 'lesson',
  label: 'Daily lesson',
  hour: 9,
  enabled: true,
  run: async () => {
    const today = formatCurrentDate();
    // Cron has no user prompt to interpret — intent is fixed: email today's lesson if
    // already saved, otherwise generate once. Unlike `npm run lesson` (getLesson → unified
    // orchestrator), a filesystem check is enough and avoids an API call on every rerun.
    const existing = readPreviousLesson(today.iso);

    if (existing) {
      logStudyOutputStatus('lessons', 'archive', existing.savedPath, { prefix: '[cronjob] ' });
      return sendLessonByEmail(existing.markdown);
    }

    const { markdown, savedPath, source } = await generateDailyLesson(DEFAULT_LESSON_PROMPT);
    logStudyOutputStatus('lessons', source, savedPath, { prefix: '[cronjob] ' });
    return sendLessonByEmail(markdown);
  },
};

export const EXERCISES_SCHEDULE: DailySchedule = {
  id: 'exercises',
  label: 'Daily exercises',
  hour: 9,
  enabled: true,
  run: async () => {
    const today = formatCurrentDate();
    // Same idempotency rule as LESSON_SCHEDULE — see comment there.
    const existing = readPreviousExercise(today.iso);

    if (existing) {
      logStudyOutputStatus('exercises', 'archive', existing.savedPath, { prefix: '[cronjob] ' });
      return sendExercisesByEmail(existing.markdown);
    }

    const { markdown, savedPath, source } = await generateDailyExercises(DEFAULT_EXERCISES_PROMPT);
    logStudyOutputStatus('exercises', source, savedPath, { prefix: '[cronjob] ' });
    return sendExercisesByEmail(markdown);
  },
};

const SCHEDULES = [LESSON_SCHEDULE, EXERCISES_SCHEDULE];
const lastRunBySchedule = new Map<string, string>();

function todayKey(): string {
  return formatLocalDateIso();
}

function isDue(schedule: DailySchedule): boolean {
  if (!schedule.enabled) return false;

  return new Date().getHours() === schedule.hour;
}

async function runSchedule(schedule: DailySchedule): Promise<void> {
  const today = todayKey();

  if (lastRunBySchedule.get(schedule.id) === today) return;

  console.log(`[cronjob] Running ${schedule.label}`);
  const result = await schedule.run();
  lastRunBySchedule.set(schedule.id, today);
  console.log(`[cronjob] ${schedule.label} completed`, result);
}

async function checkSchedules(): Promise<void> {
  const dueSchedules = SCHEDULES.filter(isDue);

  if (dueSchedules.length === 0) return;

  console.log(`[cronjob] ${dueSchedules.length} scheduled job(s) due`);

  for (const schedule of dueSchedules)
    try {
      await runSchedule(schedule);
    } catch (error) {
      console.error(`[cronjob] ${schedule.label} failed`, error);
    }
}

console.log('[cronjob] Started. Checking every hour for scheduled jobs.');
console.log('[cronjob] Active schedules:', SCHEDULES.filter((s) => s.enabled).map((s) => ({
  id: s.id,
  hour: `${s.hour}:00`,
})));

/**
 * Poll interval: `'0 * * * *'` (standard cron, server local timezone).
 *
 * | Field   | Value | Meaning              |
 * |---------|-------|----------------------|
 * | minute  | 0     | at minute 0          |
 * | hour    | *     | every hour           |
 * | day     | *     | every day            |
 * | month   | *     | every month          |
 * | weekday | *     | every day of week    |
 *
 * Runs once per hour at **:00** (1:00, 2:00, …, 9:00, etc.).
 * `checkSchedules()` then decides whether `LESSON_SCHEDULE` / `EXERCISES_SCHEDULE`
 * should run (both target hour 9, once per day).
 */
cron.schedule('0 * * * *', () => {
  void checkSchedules();
});

void checkSchedules();
