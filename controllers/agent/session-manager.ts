/**
 * Manages Realtime sessions and orchestrates user turns to specialized agents.
 *
 * A turn is one user request (voice, text, and/or image) through to the agent's
 * final text reply. Before starting a Realtime response, this module tries
 * Before starting a Realtime response, this module tries the unified orchestrator
 * in `lib/orchestrator.ts`: one agent decides general vs lesson vs exercises and
 * retrieve vs generate, otherwise falls back to the Realtime learning assistant.
 *
 * Flow per turn:
 * 1. **Orchestrator** — `runOrchestrator()` (single SDK `Agent` + tools).
 * 2. **Fallback** — Realtime session handles general requests (open conversation, email).
 *
 * @see {@link https://openai.github.io/openai-agents-js/guides/multi-agent/ | Agent orchestration (SDK)}
 * @see ../../lib/orchestrator.ts — unified routing
 *
 * **Exports** (1 class, 2 public methods):
 * - `TurnSessionManager` — session lifecycle and single-turn concurrency guard
 * - `TurnSessionManager.processTextTurn` — text/image turns (`POST /turn`)
 * - `TurnSessionManager.beginTurn` — start a turn; returns a `StreamingTurn`
 *   handle to stream audio (`appendAudio`), finish (`commit`), or abort (`cancel`)
 *
 * @module controllers/agent/session-manager
 */
import {
  logOpenAiRequest,
  logOpenAiThinking,
  logOpenAiUsage,
  usageFromRealtimeResponse,
} from '../../lib/log-openai-usage.ts';
import type { RealtimeSession } from '@openai/agents/realtime';
import { RealtimeSession as RealtimeSessionClass } from '@openai/agents/realtime';
import { buildTranscriptionPrompt, isEmptyOrDictionaryHallucination } from '../../config/dictionary.ts';
import {
  logResponseDone,
  logToolEnd,
  logToolStart,
  logTurn,
  logTurnError,
  logUserPrompt,
} from '../../utils/turn-log.ts';
import { runOrchestrator } from '../../lib/orchestrator.ts';
import { scheduleInterestsAnalysis } from '../../agent-interests.ts';
import { createAgent, createSessionConfig } from './session-config.ts';
import {
  buildUserPrompt,
  formatToolAction,
  parseToolArguments,
  responseHasToolCalls,
  toError,
} from './turn-helpers.ts';
import type { AgentTool } from '../../config/tools.ts';
import type { StreamingTurn, TurnMetadata, TurnResult, TurnStreamEvent } from './types.ts';

const TURN_TIMEOUT_MS = 120_000;

function interestsSourceFromTurn(result: TurnResult): string {
  const action = result.actions[0] ?? '';

  if (action.startsWith('lesson:')) return 'lesson';
  if (action.startsWith('exercises:')) return 'exercises';

  return 'realtime';
}

function scheduleInterestsFromTurn(result: TurnResult): void {
  scheduleInterestsAnalysis(
    result.userPrompt,
    result.response,
    interestsSourceFromTurn(result),
  );
}

/**
 * Keeps one Realtime WebSocket session alive, routes learning turns, and runs
 * one turn at a time.
 *
 * Imported in:
 * - `controllers/agent/index.ts` — instantiated in `createAgentService`
 * - `controllers/realtime-ws.ts` — type for `attachRealtimeWebSocket` session param
 * - `controllers/turn-http.ts` — type for `createTurnPostHandler` session param
 *
 * @param agentTools - Tools loaded at startup (built-ins, plugins, profile filters)
 */
export class TurnSessionManager {
  private session: RealtimeSession | null = null;
  private connectPromise: Promise<RealtimeSession> | null = null;
  private busy = false;
  private activeTurn: StreamingTurn | null = null;

  private readonly agentTools: AgentTool[];

  constructor(agentTools: AgentTool[]) {
    this.agentTools = agentTools;
  }

  /**
   * Unified orchestrator for one user message.
   *
   * Returns a completed {@link TurnResult} when lesson or exercises own the turn,
   * or `null` so the caller can fall back to the Realtime assistant (general path).
   *
   * @see ../../lib/orchestrator.ts
   */
  private async runOrchestratedTurn(
    userMessage: string,
    metadata: TurnMetadata,
    onStream?: (event: TurnStreamEvent) => void,
  ): Promise<TurnResult | null> {
    const outcome = await runOrchestrator(userMessage);
    if (outcome.route === 'general') return null;

    logTurn('orchestrator routed', {
      route: outcome.route,
      source: outcome.result.source,
    });

    const content = outcome.result.markdown;
    onStream?.({ type: 'response.delta', delta: content, response: content });

    return {
      userPrompt: buildUserPrompt(metadata, userMessage),
      actions: [`${outcome.route}: ${outcome.result.source}`],
      response: content,
    };
  }

  private createResolvedTurn(result: TurnResult): StreamingTurn {
    const resolvedTurn: StreamingTurn = {
      appendAudio: () => {},
      commit: async () => {
        this.busy = false;
        this.activeTurn = null;
        scheduleInterestsFromTurn(result);
        return result;
      },
      cancel: () => {
        this.busy = false;
        this.activeTurn = null;
      },
    };

    this.activeTurn = resolvedTurn;
    return resolvedTurn;
  }

  /**
   * Runs a text-only turn (optionally with an image) and waits for the result.
   *
   * Used in:
   * - `controllers/turn-http.ts` — `POST /turn` handler
   */
  async processTextTurn(metadata: TurnMetadata): Promise<TurnResult> {
    const turn = await this.beginTurn({ ...metadata, hasAudio: false });
    try {
      return await turn.commit();
    } catch (error) {
      turn.cancel();
      throw error;
    }
  }

  /**
   * Starts a turn and returns a handle to stream audio or commit/cancel it.
   *
   * Orchestration entry points (before Realtime `response.create`):
   * - **Text** — orchestrate `metadata.question` immediately after turn start.
   * - **Voice** — orchestrate the transcript in `maybeCreateResponseImpl` after transcription.
   *
   * @see {@link https://openai.github.io/openai-agents-js/guides/multi-agent/ | Agent orchestration}
   *
   * Used in:
   * - `controllers/realtime-ws.ts` — WebSocket `turn.start` handler (voice turns)
   * - `controllers/agent/session-manager.ts` — `processTextTurn`
   */
  async beginTurn(
    metadata: TurnMetadata,
    onStream?: (event: TurnStreamEvent) => void,
  ): Promise<StreamingTurn> {
    if (this.busy) throw new Error('Already processing a turn');

    this.busy = true;

    logTurn('started', {
      hasAudio: metadata.hasAudio ?? false,
      hasImage: Boolean(metadata.imageDataUrl),
      hasQuestion: Boolean(metadata.question?.trim()),
    });

    if (!metadata.hasAudio && metadata.question?.trim())
      try {
        // Unified orchestrator: route study output or continue to Realtime below.
        const orchestrated = await this.runOrchestratedTurn(
          metadata.question.trim(),
          metadata,
          onStream,
        );
        if (orchestrated) {
          logTurn('completed', {
            orchestrated: true,
            actionCount: orchestrated.actions.length,
            responseLength: orchestrated.response.length,
          });
          return this.createResolvedTurn(orchestrated);
        }
      } catch (error) {
        this.busy = false;
        throw error;
      }

    const session = await this.getSession();
    let cleanedUp = false;
    let abortTurn: ((error: Error) => void) | null = null;
    let silentCancel: (() => void) | null = null;
    let commitStarted = false;
    let responseCycle = 0;
    let audioCommitSent = false;
    let transcriptionFinalized = false;
    let responseCreateSent = false;
    let maybeCreateResponse: () => void = () => {};

    const turnPromise = new Promise<TurnResult>((resolve, reject) => {
      let response = '';
      let transcript = '';
      const actions: string[] = [];
      let settled = false;

      const timeout = setTimeout(() => {
        finish(new Error('Turn request timed out'));
      }, TURN_TIMEOUT_MS);

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearTimeout(timeout);
        session.off('transport_event', onTransportEvent);
        session.off('agent_tool_start', onAgentToolStart);
        session.off('agent_tool_end', onAgentToolEnd);
        session.off('error', onSessionError);
        this.busy = false;
        if (this.activeTurn === streamingTurn) this.activeTurn = null;
      };

      const skipTurn = () => {
        if (settled) return;
        settled = true;
        abortTurn = null;
        silentCancel = null;
        cleanup();
        logTurn('skipped empty transcript');
        resolve({ userPrompt: '', actions: [], response: '' });
      };

      const finishWithResult = (result: TurnResult) => {
        if (settled) return;
        settled = true;
        abortTurn = null;
        silentCancel = null;
        cleanup();
        logTurn('completed', {
          orchestrated: true,
          actionCount: result.actions.length,
          responseLength: result.response.length,
        });
        scheduleInterestsFromTurn(result);
        resolve(result);
      };

      /**
       * Voice path: after transcription, triage before Realtime `response.create`.
       * @see {@link https://openai.github.io/openai-agents-js/guides/multi-agent/ | Agent orchestration}
       */
      const maybeCreateResponseImpl = async () => {
        if (responseCreateSent || !audioCommitSent || !metadata.hasAudio || !transcriptionFinalized) return;

        if (isEmptyOrDictionaryHallucination(transcript)) {
          skipTurn();
          return;
        }

        responseCreateSent = true;

        try {
          const orchestrated = await this.runOrchestratedTurn(transcript, metadata, onStream);
          if (orchestrated) {
            finishWithResult(orchestrated);
            return;
          }
        } catch (error) {
          finish(toError(error));
          return;
        }

        logUserPrompt('Realtime assistant', transcript, {
          hasImage: Boolean(metadata.imageDataUrl),
          typedQuestion: metadata.question?.trim() || undefined,
        });

        session.transport.sendEvent({
          type: 'response.create',
          response: { output_modalities: ['text'] },
        });
      };

      maybeCreateResponse = () => {
        void maybeCreateResponseImpl();
      };

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        abortTurn = null;
        silentCancel = null;
        cleanup();
        if (error) {
          logTurnError('failed', error, {
            responseCycle,
            actionCount: actions.length,
            transcriptLength: transcript.length,
            responseLength: response.length,
          });
          reject(error);
          return;
        }

        logTurn('completed', {
          responseCycle,
          actionCount: actions.length,
          transcriptLength: transcript.length,
          responseLength: response.length,
        });

        const turnResult = {
          userPrompt: buildUserPrompt(metadata, transcript),
          actions,
          response,
        };
        scheduleInterestsFromTurn(turnResult);
        resolve(turnResult);
      };

      const onSessionError = ({ error }: { error: unknown }) => {
        if (this.session === session) this.session = null;
        logTurnError('session error', error, { responseCycle, actionCount: actions.length });
        finish(toError(error));
      };

      const onAgentToolStart = (...handlerArgs: unknown[]) => {
        const tool = handlerArgs[2] as { name: string };
        const details = handlerArgs[3] as { toolCall: { arguments?: string; callId?: string } };
        const args = parseToolArguments(details.toolCall.arguments);
        logToolStart(tool.name, args, details.toolCall.callId);
      };

      const onAgentToolEnd = (...handlerArgs: unknown[]) => {
        const tool = handlerArgs[2] as { name: string };
        const result = typeof handlerArgs[3] === 'string' ? handlerArgs[3] : String(handlerArgs[3] ?? '');
        const details = handlerArgs[4] as { toolCall: { arguments?: string; callId?: string } };
        const args = parseToolArguments(details.toolCall.arguments);
        logToolEnd(tool.name, args, result, details.toolCall.callId);
        actions.push(formatToolAction(tool.name, args, result));
      };

      const onTransportEvent = (event: {
        type: string;
        delta?: string;
        transcript?: string;
        response?: {
          status: string;
          output?: Array<{ type: string }>;
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
            total_tokens?: number;
          };
        };
      }) => {
        if (event.type === 'conversation.item.input_audio_transcription.delta' && event.delta) {
          transcript += event.delta;
          onStream?.({ type: 'transcript.delta', delta: event.delta, transcript });
        }

        if (event.type === 'conversation.item.input_audio_transcription.completed') {
          transcript = event.transcript ?? '';
          transcriptionFinalized = true;
          if (event.transcript) onStream?.({ type: 'transcript.completed', transcript: event.transcript });
          void maybeCreateResponseImpl();
        }

        if (event.type === 'response.created') {
          logOpenAiRequest('Realtime assistant');
          logOpenAiThinking();
        }

        if (event.type === 'response.output_text.delta' && event.delta) {
          response += event.delta;
          onStream?.({ type: 'response.delta', delta: event.delta, response });
        }

        if (event.type === 'response.done') {
          responseCycle += 1;
          const status = event.response?.status;
          const outputTypes = event.response?.output?.map((item) => item.type) ?? [];
          const hasToolCalls = responseHasToolCalls(event);

          logResponseDone(status, {
            responseCycle,
            outputTypes,
            hasToolCalls,
            statusDetails: (event.response as { status_details?: unknown } | undefined)?.status_details,
          });

          const usage = usageFromRealtimeResponse(event.response?.usage);
          if (usage) {
            logOpenAiUsage('Realtime assistant', usage);
          }

          if (status !== 'completed') {
            finish(new Error(`Response status: ${status ?? 'unknown'}`));
            return;
          }

          if (hasToolCalls) {
            response = '';
            return;
          }

          finish();
        }
      };

      session.on('transport_event', onTransportEvent);
      session.on('agent_tool_start', onAgentToolStart);
      session.on('agent_tool_end', onAgentToolEnd);
      session.on('error', onSessionError);

      abortTurn = (error: Error) => finish(error);

      silentCancel = () => {
        if (settled) return;
        settled = true;
        abortTurn = null;
        silentCancel = null;
        cleanup();
        logTurn('cancelled');
      };

      const messageContent: Array<
        { type: 'input_image'; image: string } | { type: 'input_text'; text: string }
      > = [];

      if (metadata.imageDataUrl) messageContent.push({ type: 'input_image', image: metadata.imageDataUrl });
      if (metadata.question) messageContent.push({ type: 'input_text', text: metadata.question });

      if (messageContent.length > 0) {
        if (metadata.question?.trim()) {
          logUserPrompt('Realtime assistant', metadata.question, {
            hasImage: Boolean(metadata.imageDataUrl),
            hasAudio: Boolean(metadata.hasAudio),
          });
        }

        session.transport.sendMessage(
          {
            type: 'message',
            role: 'user',
            content: messageContent,
          },
          {},
          { triggerResponse: !metadata.hasAudio },
        );
      }
    });

    const streamingTurn: StreamingTurn = {
      appendAudio: (pcm: Buffer) => {
        const arrayBuffer = new Uint8Array(pcm).buffer;
        session.transport.sendAudio(arrayBuffer, { commit: false });
      },
      commit: async () => {
        commitStarted = true;
        if (metadata.hasAudio) {
          session.transport.sendEvent({ type: 'input_audio_buffer.commit' });
          audioCommitSent = true;
          maybeCreateResponse();
        }

        return turnPromise;
      },
      cancel: () => {
        if (commitStarted) {
          abortTurn?.(new Error('Turn cancelled'));
          return;
        }
        silentCancel?.();
      },
    };

    this.activeTurn = streamingTurn;
    return streamingTurn;
  }

  private async getSession(): Promise<RealtimeSession> {
    if (this.session?.transport.status === 'connected') return this.session;

    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.connect();
    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async connect(): Promise<RealtimeSession> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const session = new RealtimeSessionClass(createAgent(this.agentTools), createSessionConfig());
    const transcriptionPrompt = buildTranscriptionPrompt();

    if (transcriptionPrompt) logTurn('session dictionary loaded', {
        promptLength: transcriptionPrompt.length,
      });
    

    session.on('error', ({ error }) => {
      console.error(error);
      if (this.session === session) this.session = null;
    });

    await session.connect({ apiKey });
    this.session = session;
    return session;
  }
}
