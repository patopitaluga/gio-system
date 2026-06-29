import path from 'path';
import { existsSync, mkdirSync, readdirSync, renameSync } from 'fs';

/**
 * Normalizes a tool-supplied path:
 * - strips leading `../` traversal
 * - strips an accidental workspace folder prefix when the model includes it
 */
export function normalizeToolPath(filePath: string, workspaceBasename?: string): string {
  let normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');

  if (workspaceBasename) {
    const escapedBasename = workspaceBasename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized.replace(
      new RegExp(`^(\\.\\/|\\.\\\\)?${escapedBasename}(?:\\/|\\\\|$)`, 'i'),
      '',
    );
  }

  return normalized || '.';
}

export function formatWorkspacePath(workspaceDir: string, target: string): string {
  const workspaceLabel = path.basename(workspaceDir);
  const prefix = `${workspaceLabel}/`;

  if (target === workspaceLabel || target.startsWith(prefix)) return target;

  return `${prefix}${target}`;
}

/** Shared workspace helpers bound to one root directory. */
export type WorkspaceContext = {
  workspaceDir: string;
  resolveWorkspacePath: (filePath: string) => string | null;
  findActualRelativePath: (filePath: string) => string | null;
  renameWorkspaceFile: (fromPath: string, toPath: string) => string;
};

/**
 * Creates path helpers scoped to a workspace directory.
 * All file tools receive this context so they operate on the same root.
 */
export function createWorkspaceContext(workspaceDir: string): WorkspaceContext {
  const workspaceBasename = path.basename(workspaceDir);

  function resolveWorkspacePath(filePath: string): string | null {
    const normalized = normalizeToolPath(filePath, workspaceBasename);
    const fullPath = path.resolve(workspaceDir, normalized);

    if (!fullPath.startsWith(workspaceDir + path.sep) && fullPath !== workspaceDir) return null;

    return fullPath;
  }

  /** Finds the on-disk path for a file, matching case-insensitively when needed. */
  function findActualRelativePath(filePath: string): string | null {
    const normalized = normalizeToolPath(filePath, workspaceBasename);
    const directory = path.dirname(normalized);
    const baseName = path.basename(normalized);
    const fullDirectory = path.resolve(workspaceDir, directory === '.' ? '' : directory);

    if (!fullDirectory.startsWith(workspaceDir) || !existsSync(fullDirectory)) return null;

    const match = readdirSync(fullDirectory).find(
      (entry) => entry.toLowerCase() === baseName.toLowerCase(),
    );

    if (!match) return null;

    return directory === '.' ? match : path.join(directory, match);
  }

  /**
   * Renames or moves a file within the workspace.
   * Uses a two-step rename when only the filename casing changes (macOS-safe).
   */
  function renameWorkspaceFile(fromPath: string, toPath: string): string {
    const fromRelative = findActualRelativePath(fromPath);
    if (!fromRelative) return `Error: source file not found: ${fromPath}`;

    const toNormalized = normalizeToolPath(toPath, workspaceBasename);
    const toFull = resolveWorkspacePath(toNormalized);
    const fromFull = resolveWorkspacePath(fromRelative);

    if (!toFull || !fromFull) return 'Error: invalid file path';

    const fromBaseName = path.basename(fromRelative);
    const toBaseName = path.basename(toNormalized);
    const caseOnlyRename =
      fromBaseName.toLowerCase() === toBaseName.toLowerCase() && fromBaseName !== toBaseName;

    if (caseOnlyRename) {
      const tempName = `.gio-system-rename-${Date.now()}${path.extname(fromBaseName)}`;
      const tempFull = path.join(path.dirname(fromFull), tempName);
      const finalFull = path.join(path.dirname(fromFull), toBaseName);

      renameSync(fromFull, tempFull);
      renameSync(tempFull, finalFull);

      const finalRelative = path.relative(workspaceDir, finalFull);
      return `Renamed ${fromRelative} to ${finalRelative}`;
    }

    if (existsSync(toFull) && fromFull !== toFull) return `Error: destination already exists: ${toNormalized}`;

    mkdirSync(path.dirname(toFull), { recursive: true });
    renameSync(fromFull, toFull);

    return `Renamed ${fromRelative} to ${toNormalized}`;
  }

  return {
    workspaceDir,
    resolveWorkspacePath,
    findActualRelativePath,
    renameWorkspaceFile,
  };
}

/** Logs a tool action to the server console. */
export function logToolAction(
  workspaceDir: string,
  toolName: string,
  action: string,
  target: string,
  extra?: Record<string, unknown>,
) {
  const displayPath = formatWorkspacePath(workspaceDir, target);
  const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
  console.log(`🔧 ${toolName} tool ${action} "${displayPath}"${suffix}`);
}
