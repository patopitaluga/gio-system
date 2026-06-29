import path from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import { contentTooLargeError, MAX_FILE_TOOL_CHARS } from './limits.ts';
import { prepareMarkdownForWrite } from './normalize-markdown.ts';
import { type WorkspaceContext, logToolAction } from './workspace.ts';

/**
 * Tool: `write_file`
 * Creates a new file or overwrites an existing one.
 * Preserves the exact filename casing supplied by the model.
 */
export function createWriteFileTool(ctx: WorkspaceContext) {
  return tool({
    name: 'write_file',
    description: `Create or overwrite a file by path. Preserve the exact filename casing provided. Max ${MAX_FILE_TOOL_CHARS} characters per call; use append_file for larger content.`,
    parameters: z.object({
      filePath: z.string().describe('Relative file path, e.g. "README.md"'),
      content: z
        .string()
        .describe(`Full file content. Max ${MAX_FILE_TOOL_CHARS} characters per call; use append_file for more.`),
    }),
    async execute({ filePath, content }) {
      if (content.length > MAX_FILE_TOOL_CHARS) {
        logToolAction(ctx.workspaceDir, 'write_file', 'failed', filePath, {
          contentLength: content.length,
          maxAllowed: MAX_FILE_TOOL_CHARS,
          reason: 'content too large',
        });
        return contentTooLargeError(content.length);
      }

      const fullPath = ctx.resolveWorkspacePath(filePath);

      if (!fullPath) {
        logToolAction(ctx.workspaceDir, 'write_file', 'failed', filePath, {
          reason: 'invalid file path',
        });
        return 'Error: invalid file path';
      }

      const existingPath = ctx.findActualRelativePath(filePath);
      const existingFullPath = existingPath ? ctx.resolveWorkspacePath(existingPath) : null;
      const normalized = path.relative(ctx.workspaceDir, fullPath);
      const targetBaseName = path.basename(normalized);
      const existingBaseName = existingPath ? path.basename(existingPath) : null;
      const caseOnlyUpdate =
        existingFullPath &&
        existingBaseName &&
        existingBaseName.toLowerCase() === targetBaseName.toLowerCase() &&
        existingBaseName !== targetBaseName;

      if (caseOnlyUpdate && existingPath) {
        const renameResult = ctx.renameWorkspaceFile(existingPath, normalized);
        if (renameResult.startsWith('Error:')) {
          logToolAction(ctx.workspaceDir, 'write_file', 'failed', filePath, {
            reason: renameResult,
          });
          return renameResult;
        }
      }

      try {
        mkdirSync(path.dirname(fullPath), { recursive: true });
        const preparedContent = prepareMarkdownForWrite(filePath, content);
        writeFileSync(fullPath, preparedContent, 'utf8');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to write file';
        logToolAction(ctx.workspaceDir, 'write_file', 'failed', normalized, {
          contentLength: content.length,
          reason: message,
        });
        return `Error: ${message}`;
      }

      const relativePath = path.relative(ctx.workspaceDir, fullPath);
      const action = existingPath ? 'updated' : 'created';
      logToolAction(ctx.workspaceDir, 'write_file', action, relativePath, {
        contentLength: content.length,
      });
      return `${action === 'updated' ? 'Updated' : 'Created'} ${relativePath} (${content.length} bytes)`;
    },
  });
}
