import { tool as agentTool } from '@openai/agents';
import nodemailer from 'nodemailer';
import { z } from 'zod';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Used in `agents/agent-lessons.ts` and `agents/agent-exercises.ts`. */
export const SEND_EMAIL_TOOL_NAME = 'send_email';

const sendEmailParameters = z.object({
  to: z
    .string()
    .optional()
    .describe(
      'Full email address. Omit for "me" (sends to the configured SMTP account).',
    ),
  subject: z.string().describe('Email subject line'),
  text: z.string().describe('Plain-text email body'),
  html: z.string().optional().describe('Optional HTML email body'),
});

/** Imported in `agents/agent-lessons.ts` and `agents/agent-exercises.ts`. */
export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure =
    process.env.SMTP_SECURE === 'true' || String(port) === '465';

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function resolveRecipient(nameOrEmail?: string): string {
  const raw = String(nameOrEmail ?? 'me').trim().toLowerCase();

  if (!raw || raw === 'me' || raw === 'self') {
    const fallback = process.env.SMTP_FROM ?? process.env.SMTP_USER;

    if (!fallback) throw new Error('No default recipient configured. Provide a full email address in "to".');

    return fallback;
  }

  if (EMAIL_PATTERN.test(raw)) return raw;

  throw new Error(
    `Unknown recipient "${nameOrEmail}". Use a full email address or omit "to" to send to yourself.`,
  );
}

/** Parameter type for `sendEmail`. */
export type SendEmailInput = {
  to?: string;
  subject: string;
  text: string;
  html?: string;
};

/** Return type for `sendEmail`. */
export type SendEmailResult = {
  messageId: string;
  to: string;
};

/** Imported in `agents/agent-lessons.ts` and `agents/agent-exercises.ts` (`sendLessonByEmail` / `sendExercisesByEmail`). */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!isEmailConfigured()) throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env');

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  const recipient = resolveRecipient(input.to);

  const info = await createTransport().sendMail({
    from,
    to: recipient,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return { messageId: info.messageId, to: recipient };
}

async function executeSendEmail(input: z.infer<typeof sendEmailParameters>): Promise<string> {
  const result = await sendEmail(input);
  return JSON.stringify(result);
}

/** Imported in `agents/agent-lessons.ts` and `agents/agent-exercises.ts`. */
export function createSendEmailAgentTool() {
  return agentTool({
    name: SEND_EMAIL_TOOL_NAME,
    description:
      'Send an email via SMTP. Call only when the user explicitly asks to send or email the lesson.',
    parameters: sendEmailParameters,
    execute: executeSendEmail,
  });
}
