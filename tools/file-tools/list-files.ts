import path from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { tool } from '@openai/agents/realtime';
import { z } from 'zod';
import type { WorkspaceContext } from './workspace.ts';
import { logToolAction } from './workspace.ts';

/**
 * Lists regular files directly inside a directory (not recursive).
 * Includes hidden files whose names start with a dot.
 */
export function listFilesInDirectory(fullPath: string): string[] {
  return readdirSync(fullPath)
    .filter((entry) => {
      const entryPath = path.join(fullPath, entry);

      try {
        return statSync(entryPath).isFile();
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b));
}

export function formatFileListResult(directoryPath: string, fileNames: string[]): string {
  const count = fileNames.length;
  const header = `${count} file${count === 1 ? '' : 's'} in ${directoryPath}:`;

  if (fileNames.length === 0) return header;

  return `${header}\n${fileNames.join('\n')}`;
}

/**
 * Tool: `list_files`
 * Returns the names of regular files in a workspace directory.
 */
export function createListFilesTool(ctx: WorkspaceContext) {
  return tool({
    name: 'list_files',
    description:
      'List regular files in a workspace directory (non-recursive). Includes hidden dotfiles. Does not list subdirectories or files inside them.',
    parameters: z.object({
      directoryPath: z
        .string()
        .describe('Relative directory path within the workspace, e.g. "." or "docs"'),
    }),
    async execute({ directoryPath }) {
      const fullPath = ctx.resolveWorkspacePath(directoryPath);

      if (!fullPath) {
        logToolAction(ctx.workspaceDir, 'list_files', 'failed', directoryPath, {
          reason: 'invalid directory path',
        });
        return 'Error: invalid directory path';
      }

      if (!existsSync(fullPath)) {
        logToolAction(ctx.workspaceDir, 'list_files', 'failed', directoryPath, {
          reason: 'directory not found',
        });
        return `Error: directory not found: ${directoryPath}`;
      }

      let stats;
      try {
        stats = statSync(fullPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to stat directory';
        logToolAction(ctx.workspaceDir, 'list_files', 'failed', directoryPath, {
          reason: message,
        });
        return `Error: ${message}`;
      }

      if (!stats.isDirectory()) {
        logToolAction(ctx.workspaceDir, 'list_files', 'failed', directoryPath, {
          reason: 'not a directory',
        });
        return `Error: not a directory: ${directoryPath}`;
      }

      const fileNames = listFilesInDirectory(fullPath);
      const result = formatFileListResult(directoryPath, fileNames);

      logToolAction(ctx.workspaceDir, 'list_files', 'listed', directoryPath, {
        fileCount: fileNames.length,
      });

      return result;
    },
  });
}
