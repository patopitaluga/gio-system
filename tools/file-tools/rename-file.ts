import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import { formatWorkspacePath, logToolAction, type WorkspaceContext } from './workspace.ts';

/**
 * Tool: `rename_file`
 * Renames or moves a file within the workspace, including case-only renames.
 */
export function createRenameFileTool(ctx: WorkspaceContext) {
  return tool({
    name: 'rename_file',
    description: 'Rename or move a file. Use this for case-only renames such as readme.md to README.md.',
    parameters: z.object({
      fromPath: z.string().describe('Current relative file path'),
      toPath: z.string().describe('New relative file path'),
    }),
    async execute({ fromPath, toPath }) {
      const result = ctx.renameWorkspaceFile(fromPath, toPath);
      if (result.startsWith('Error:')) {
        logToolAction(ctx.workspaceDir, 'rename_file', 'failed', fromPath, {
          toPath,
          reason: result,
        });
        return result;
      }

      const fromDisplay = formatWorkspacePath(ctx.workspaceDir, fromPath);
      const toDisplay = formatWorkspacePath(ctx.workspaceDir, toPath);
      console.log(`🔧 rename_file tool renamed "${fromDisplay}" to "${toDisplay}"`);
      return result;
    },
  });
}
