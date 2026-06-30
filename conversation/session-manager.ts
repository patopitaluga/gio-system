/**
 * Manages the conversation assistant session and orchestrates user turns.
 *
 * A turn is one user request (voice, text, and/or image) through to the agent's
 * final text reply. Before calling the multimodal model, this module runs the
 * unified orchestrator in `agent-reception-orchestrator.ts`: one agent decides general vs
 * lesson vs exercises and retrieve vs generate, otherwise falls back to the
 * conversation assistant (`gpt-realtime-1.5` via the OpenAI Realtime API).
 *
 * Flow per turn:
 * 1. **reception-orchestrator-agent** — `runOrchestrator()` returns general, lesson, or exercises (no tools).
 * 2. **Lesson / exercises agents** — retrieve or generate when routed; conversation assistant handles general.
 *
 * @see {@link https://openai.github.io/openai-agents-js/guides/multi-agent/ | Agent orchestration (SDK)}
 * @see ../agent-reception-orchestrator.ts — unified routing
 *
 * **Exports** (1 class, 2 public methods):
 * - `TurnSessionManager` — session lifecycle and single-turn concurrency guard
 * - `TurnSessionManager.processTextTurn` — text/image turns (`POST /turn`)
 * - `TurnSessionManager.beginTurn` — start a turn; returns a `StreamingTurn`
 *   handle to buffer audio (`appendAudio`), finish (`commit`), or abort (`cancel`)
 *
 * @module conversation/session-manager
 */
import {
  logOpenAiRequest,
  logOpenAiThinking,
  logOpenAiUsage,
  usageFromRealtimeResponse,
} from '../lib/log-openai-usage.ts';
import { RealtimeSession as ConversationSession } from '@openai/agents/realtime';
import { buildTranscriptionPrompt, isEmptyOrDisambiguationHallucination } from '../lib/disambiguation.ts';
import {
  logResponseDone,
  logToolEnd,
  logToolStart,
  logTurn,
  logTurnError,
  logUserPrompt,
} from '../utils/turn-log.ts';
import { runOrchestrator, OrchestratorRoute } from '../agent-reception-orchestrator.ts';
import { askLlmToIdentifyLessonIntent } from '../agent-lessons.ts';
import { askLlmToIdentifyExercisesIntent } from '../agent-exercises.ts';
import { scheduleInterestsAnalysis } from '../agent-interests.ts';
import { createAgent, createSessionConfig } from './general-conversation-agent.ts';
import {
  buildUserPrompt,
  formatToolAction,
  parseToolArguments,
  responseHasToolCalls,
  toError,
} from './turn-helpers.ts';
import type { AgentTool } from '../lib/tools.ts';
import type { StreamingTurn, TurnMetadata, TurnResult, TurnStreamEvent } from './types.ts';

const TURN_TIMEOUT_MS = 120_000;

function interestsSourceFromTurn(result: TurnResult): string {
  const action = result.actions[0] ?? '';

  if (action.startsWith('lesson:')) return 'lesson';
  if (action.startsWith('exercises:')) return 'exercises';

  return 'conversation';
}

function scheduleInterestsFromTurn(result: TurnResult): void {
  scheduleInterestsAnalysis(
    result.userPrompt,
    result.response,
    interestsSourceFromTurn(result),
  );
}

/**
 * Keeps the conversation assistant session alive, routes learning turns, and runs
 * one turn at a time.
 *
 * Imported in:
 * - `conversation/index.ts` — instantiated in `createAgentService`
 * - `controllers/websocket.ts` — voice turns over `/ws`
 * - `controllers/turn-http.ts` — type for `createTurnPostHandler` session param
 *
 * @param agentTools - Tools loaded at startup (built-ins, plugins, profile filters)
 */
export class TurnSessionManager {
  private session: ConversationSession | null = null;
  private connectPromise: Promise<ConversationSession> | null = null;
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
   * or `null` so the caller can fall back to the conversation assistant (general path).
   *
   * @see ../agent-reception-orchestrator.ts
   */
  private async runOrchestratedTurn(
    userMessage: string,
    metadata: TurnMetadata,
    onStream?: (event: TurnStreamEvent) => void,
  ): Promise<TurnResult | null> {
    const route = await runOrchestrator(userMessage);
    if (route === OrchestratorRoute.General) return null;

    const result = route === OrchestratorRoute.Lesson
      ? await askLlmToIdentifyLessonIntent(userMessage)
      : await askLlmToIdentifyExercisesIntent(userMessage);

    logTurn('reception-orchestrator-agent routed', {
      route,
      source: result.source,
    });

    const content = result.markdown;
    onStream?.({ type: 'response.delta', delta: content, response: content });

    return {
      userPrompt: buildUserPrompt(metadata, userMessage),
      actions: [`${route}: ${result.source}`],
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
   * Orchestration entry points (before the model generates a response):
   * - **Text** — orchestrate `metadata.question` immediately after turn start.
   * - **Voice** — orchestrate the transcript in `maybeCreateResponseImpl` after transcription.
   *
   * @see {@link https://openai.github.io/openai-agents-js/guides/multi-agent/ | Agent orchestration}
   *
   * Used in:
   * - `controllers/websocket.ts` — WebSocket `turn.start` handler (voice turns)
   * - `conversation/session-manager.ts` — `processTextTurn`
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
        // Unified orchestrator: route study output or continue to conversation assistant below.
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
       * Voice path: after transcription, triage before the model responds.
       * @see {@link https://openai.github.io/openai-agents-js/guides/multi-agent/ | Agent orchestration}
       */
      const maybeCreateResponseImpl = async () => {
        if (responseCreateSent || !audioCommitSent || !metadata.hasAudio || !transcriptionFinalized) return;

        if (isEmptyOrDisambiguationHallucination(transcript)) {
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

        logUserPrompt('general-conversation-agent', transcript, {
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
          logOpenAiRequest('general-conversation-agent');
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
            logOpenAiUsage('general-conversation-agent', usage);
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
          logUserPrompt('general-conversation-agent', metadata.question, {
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

  private async getSession(): Promise<ConversationSession> {
    if (this.session?.transport.status === 'connected') return this.session;

    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.connect();
    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async connect(): Promise<ConversationSession> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const session = new ConversationSession(createAgent(this.agentTools), createSessionConfig());
    const transcriptionPrompt = buildTranscriptionPrompt();

    if (transcriptionPrompt) logTurn('session disambiguation loaded', {
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
