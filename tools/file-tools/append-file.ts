import path from 'path';
import { appendFileSync, mkdirSync } from 'fs';
import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import { contentTooLargeError, MAX_FILE_TOOL_CHARS } from './limits.ts';
import { prepareMarkdownForAppend } from './normalize-markdown.ts';
import { type WorkspaceContext, logToolAction } from './workspace.ts';

/**
 * Tool: `append_file`
 * Appends text to an existing file, or creates it when missing.
 * Use for large content in multiple smaller tool calls.
 */
export function createAppendFileTool(ctx: WorkspaceContext) {
  return tool({
    name: 'append_file',
    description: `Append text to a file. Use after write_file when content is too large for one call. Max ${MAX_FILE_TOOL_CHARS} characters per call.`,
    parameters: z.object({
      filePath: z.string().describe('Relative file path, e.g. "README.md"'),
      content: z.string().describe(`Text to append (max ${MAX_FILE_TOOL_CHARS} characters per call)`),
    }),
    async execute({ filePath, content }) {
      if (content.length > MAX_FILE_TOOL_CHARS) {
        logToolAction(ctx.workspaceDir, 'append_file', 'failed', filePath, {
          contentLength: content.length,
          maxAllowed: MAX_FILE_TOOL_CHARS,
          reason: 'content too large',
        });
        return contentTooLargeError(content.length);
      }

      const fullPath = ctx.resolveWorkspacePath(filePath);

      if (!fullPath) {
        logToolAction(ctx.workspaceDir, 'append_file', 'failed', filePath, {
          reason: 'invalid file path',
        });
        return 'Error: invalid file path';
      }

      const existingPath = ctx.findActualRelativePath(filePath);
      const targetPath = existingPath ? ctx.resolveWorkspacePath(existingPath) : fullPath;

      if (!targetPath) {
        logToolAction(ctx.workspaceDir, 'append_file', 'failed', filePath, {
          reason: 'invalid file path',
        });
        return 'Error: invalid file path';
      }

      try {
        mkdirSync(path.dirname(targetPath), { recursive: true });
        const preparedContent = prepareMarkdownForAppend(filePath, content);
        appendFileSync(targetPath, preparedContent, 'utf8');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to append to file';
        const relativePath = path.relative(ctx.workspaceDir, targetPath);
        logToolAction(ctx.workspaceDir, 'append_file', 'failed', relativePath, {
          contentLength: content.length,
          reason: message,
        });
        return `Error: ${message}`;
      }

      const relativePath = path.relative(ctx.workspaceDir, targetPath);
      const action = existingPath ? 'appended' : 'created';
      logToolAction(ctx.workspaceDir, 'append_file', action, relativePath, {
        contentLength: content.length,
      });
      return `${action === 'created' ? 'Created' : 'Appended to'} ${relativePath} (${content.length} bytes)`;
    },
  });
}
