import { unlinkSync } from 'fs';
import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import type { WorkspaceContext } from './workspace.ts';
import { logToolAction } from './workspace.ts';

/**
 * Tool: `delete_file`
 * Deletes a file from the workspace.
 */
export function createDeleteFileTool(ctx: WorkspaceContext) {
  return tool({
    name: 'delete_file',
    description: 'Delete a file by path.',
    parameters: z.object({
      filePath: z.string().describe('Relative file path to delete'),
    }),
    async execute({ filePath }) {
      const actualPath = ctx.findActualRelativePath(filePath);
      const fullPath = actualPath
        ? ctx.resolveWorkspacePath(actualPath)
        : ctx.resolveWorkspacePath(filePath);

      if (!fullPath) {
        logToolAction(ctx.workspaceDir, 'delete_file', 'failed', filePath, {
          reason: 'invalid file path',
        });
        return 'Error: invalid file path';
      }

      try {
        unlinkSync(fullPath);
        logToolAction(ctx.workspaceDir, 'delete_file', 'deleted', actualPath ?? filePath);
        return `Deleted ${actualPath ?? filePath}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete file';
        logToolAction(ctx.workspaceDir, 'delete_file', 'failed', actualPath ?? filePath, {
          reason: message,
        });
        return `Error: ${message}`;
      }
    },
  });
}
