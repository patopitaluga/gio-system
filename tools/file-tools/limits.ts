/** Max characters accepted in a single write_file or append_file call. */
export const MAX_FILE_TOOL_CHARS = 32_768;

export function contentTooLargeError(contentLength: number): string {
  return `Error: content is ${contentLength} characters but the maximum is ${MAX_FILE_TOOL_CHARS} per call. Write the first ${MAX_FILE_TOOL_CHARS} characters with write_file, then use append_file for each remaining chunk (max ${MAX_FILE_TOOL_CHARS} characters per call).`;
}
