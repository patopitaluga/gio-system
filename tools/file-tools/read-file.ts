import { readFileSync } from 'fs';
import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import type { WorkspaceContext } from './workspace.ts';
import { logToolAction } from './workspace.ts';

/**
 * Tool: `read_file`
 * Returns the UTF-8 contents of an existing workspace file.
 */
export function createReadFileTool(ctx: WorkspaceContext) {
  return tool({
    name: 'read_file',
    description: 'Read a file by path.',
    parameters: z.object({
      filePath: z.string().describe('Relative file path, e.g. "notes.txt"'),
    }),
    async execute({ filePath }) {
      const actualPath = ctx.findActualRelativePath(filePath);
      const fullPath = actualPath
        ? ctx.resolveWorkspacePath(actualPath)
        : ctx.resolveWorkspacePath(filePath);

      if (!fullPath) {
        logToolAction(ctx.workspaceDir, 'read_file', 'failed', filePath, {
          reason: 'invalid file path',
        });
        return 'Error: invalid file path';
      }

      try {
        const relativePath = actualPath ?? filePath;
        const content = readFileSync(fullPath, 'utf8');
        logToolAction(ctx.workspaceDir, 'read_file', 'read', relativePath, {
          contentLength: content.length,
        });
        return content;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to read file';
        logToolAction(ctx.workspaceDir, 'read_file', 'failed', actualPath ?? filePath, {
          reason: message,
        });
        return `Error: ${message}`;
      }
    },
  });
}
