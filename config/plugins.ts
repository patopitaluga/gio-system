import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { AgentTool } from './tools.ts';
import { projectRoot } from './workspace.ts';

const DEFAULT_PLUGINS_DIR = 'plugins';

export function resolvePluginsDir(): string {
  const configured = process.env.PLUGINS_DIR?.trim();

  if (!configured) return path.join(projectRoot, DEFAULT_PLUGINS_DIR);

  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(projectRoot, configured);
}

export async function loadPluginTools(pluginsDir: string): Promise<AgentTool[]> {
  if (!existsSync(pluginsDir)) return [];

  const entries = readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));

  const tools: AgentTool[] = [];

  for (const entry of entries) {
    const indexPath = path.join(pluginsDir, entry.name, 'index.ts');

    if (!existsSync(indexPath)) {
      console.warn(`Skipping plugin "${entry.name}": missing index.ts`);
      continue;
    }

    try {
      const module = await import(pathToFileURL(indexPath).href) as {
        tools?: unknown;
        default?: { tools?: unknown };
      };
      const pluginTools = module.tools ?? module.default?.tools;

      if (!Array.isArray(pluginTools)) {
        console.warn(`Skipping plugin "${entry.name}": export "tools" must be an array`);
        continue;
      }

      tools.push(...(pluginTools as AgentTool[]));
      console.log(`Loaded plugin "${entry.name}" (${pluginTools.length} tool(s))`);
    } catch (error) {
      console.error(`Failed to load plugin "${entry.name}":`, error);
    }
  }

  return tools;
}
