import path from 'path';
import { fileURLToPath } from 'url';

/** Imported in `lib/student-context.ts`, `lib/disambiguation.ts`, `lib/plugins.ts`, `lib/study-plan-context.ts`, `lib/save-study-output.ts`, `lib/save-interests.ts`, `lib/save-shortcomings.ts`, and `controllers/turn-http.ts`. Used in `test/integration/study-output.test.ts`. */
export const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
