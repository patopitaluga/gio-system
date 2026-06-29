import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAgentService } from './conversation/index.ts';
import { createTurnPostHandler } from './controllers/turn-http.ts';
import { attachWebSocket } from './controllers/websocket.ts';
import {
  csrfErrorHandler,
  csrfProtection,
  csrfTokenHandler,
  parseCookies,
} from './middleware/csrf.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Used in `server.ts`. */
export function isSpeechPreviewEnabled(): boolean {
  const value = process.env.SPEECH_PREVIEW?.trim().toLowerCase();

  if (value === 'false' || value === '0' || value === 'no') return false;

  return true;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const app = express();
  const { sessionManager } = await createAgentService();
  const handleTurnPost = createTurnPostHandler(sessionManager);

  app.use(parseCookies);
  app.use(express.urlencoded());
  app.use(express.json());

  app.use(express.static('public'));
  app.use('/components', express.static('components'));

  app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, './views/index.html'));
  });

  app.get('/csrf-token', csrfProtection, csrfTokenHandler);
  app.get('/config', (_req, res) => {
    res.json({ speechPreview: isSpeechPreviewEnabled() });
  });
  app.post('/turn', csrfProtection, handleTurnPost);

  app.use(csrfErrorHandler);

  const server = createServer(app);
  attachWebSocket(server, sessionManager);

  const port = process.env.PORT || 3001;
  server.listen(port, () => {
    console.log('Gio-System server listening on port ' + port);
  });
}
