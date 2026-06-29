import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import Tokens from 'csrf';
import { parse as parseCookieHeader } from 'cookie';
import type { TurnSessionManager } from './agent/session-manager.ts';
import type { StreamingTurn } from './agent/types.ts';
import { logTurnError } from '../utils/turn-log.ts';

const tokens = new Tokens();

type ClientMessage =
  | { type: 'turn.start'; csrfToken: string; question?: string; image?: string; hasAudio?: boolean }
  | { type: 'turn.commit' }
  | { type: 'turn.cancel' };

type ConnectionState = 'idle' | 'recording';

function verifyCsrfToken(request: IncomingMessage, token: string | undefined): boolean {
  if (!request.headers.cookie || !token) return false;

  const secret = parseCookieHeader(request.headers.cookie)._csrf;
  if (!secret) return false;
  return tokens.verify(secret, token);
}

function isAllowedOrigin(request: IncomingMessage): boolean {
  if (!request.headers.origin || !request.headers.host) return true;

  try {
    const originHost = new URL(request.headers.origin).host;
    return originHost === request.headers.host;
  } catch {
    return false;
  }
}

function sendJson(socket: WebSocket, payload: Record<string, unknown>) {
  if (socket.readyState === socket.OPEN)
    socket.send(JSON.stringify(payload));
}

export function attachRealtimeWebSocket(server: import('http').Server, sessionManager: TurnSessionManager) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, request) => {
    if (!isAllowedOrigin(request)) {
      socket.close(1008, 'Origin not allowed');
      return;
    }

    let state: ConnectionState = 'idle';
    let activeTurn: StreamingTurn | null = null;
    let startGeneration = 0;

    const clearTurn = () => {
      activeTurn = null;
      state = 'idle';
    };

    const resetTurn = (notifyCancelled = false) => {
      activeTurn?.cancel();
      clearTurn();
      if (notifyCancelled) sendJson(socket, { type: 'turn.cancelled' });
    };

    socket.on('message', async (data, isBinary) => {
      if (isBinary) {
        if (state !== 'recording' || !activeTurn) {
          sendJson(socket, { type: 'turn.error', error: 'Unexpected audio chunk' });
          return;
        }

        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        activeTurn.appendAudio(chunk);
        return;
      }

      let message: ClientMessage;
      try {
        message = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        sendJson(socket, { type: 'turn.error', error: 'Invalid message payload' });
        return;
      }

      if (message.type === 'turn.cancel') {
        startGeneration += 1;
        resetTurn(true);
        return;
      }

      if (message.type === 'turn.start') {
        if (state !== 'idle') {
          sendJson(socket, { type: 'turn.error', error: 'A turn is already in progress' });
          return;
        }

        if (!verifyCsrfToken(request, message.csrfToken)) {
          sendJson(socket, { type: 'turn.error', error: 'Invalid CSRF token' });
          return;
        }

        const question = typeof message.question === 'string' ? message.question.trim() : '';
        const image = typeof message.image === 'string' && message.image ? message.image : undefined;
        const hasAudio = Boolean(message.hasAudio);

        if (!hasAudio && !question) {
          sendJson(socket, { type: 'turn.error', error: 'Provide a question or audio' });
          return;
        }

        const generation = startGeneration;

        try {
          const turn = await sessionManager.beginTurn({
            question: question || undefined,
            imageDataUrl: image,
            hasAudio,
          }, (streamEvent) => {
            const { type, ...payload } = streamEvent;
            sendJson(socket, { type: `turn.${type}`, ...payload });
          });

          if (generation !== startGeneration) {
            turn.cancel();
            sendJson(socket, { type: 'turn.cancelled' });
            return;
          }

          activeTurn = turn;

          if (hasAudio) {
            state = 'recording';
            sendJson(socket, { type: 'turn.started' });
            return;
          }

          const result = await activeTurn.commit();
          clearTurn();
          sendJson(socket, { type: 'turn.complete', ...result });
        } catch (error) {
          resetTurn();
          logTurnError('websocket turn.start failed', error);
          sendJson(socket, {
            type: 'turn.error',
            error: error instanceof Error ? error.message : 'Failed to start turn',
          });
        }
        return;
      }

      if (message.type === 'turn.commit') {
        if (state !== 'recording' || !activeTurn) {
          sendJson(socket, { type: 'turn.error', error: 'No active audio turn to commit' });
          return;
        }

        try {
          const result = await activeTurn.commit();
          clearTurn();
          sendJson(socket, { type: 'turn.complete', ...result });
        } catch (error) {
          resetTurn();
          logTurnError('websocket turn.commit failed', error);
          sendJson(socket, {
            type: 'turn.error',
            error: error instanceof Error ? error.message : 'Failed to complete turn',
          });
        }
      }
    });

    socket.on('close', () => {
      startGeneration += 1;
      resetTurn();
    });
  });

  return wss;
}
