export function parseToolArguments(rawArguments: string | undefined): Record<string, unknown> {
  if (!rawArguments) return {};

  try {
    const parsed = JSON.parse(rawArguments) as unknown;

    return typeof parsed === 'object' && parsed !== null
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
