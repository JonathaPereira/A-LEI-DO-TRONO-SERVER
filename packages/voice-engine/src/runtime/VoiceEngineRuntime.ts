import { transitionVoiceEngine } from '../core/reducer.ts';
import { createInitialVoiceEngineSnapshot, isCommandCompletionStale } from '../core/state.ts';
import type { SnapshotListener, VoiceEngineDriver, VoiceEngineHostPorts } from '../ports/index.ts';
import type { VoiceEngineCommand } from '../protocol/commands.ts';
import type { VoiceEngineEvent } from '../protocol/events.ts';
import type { OperationId, ResourceKey, VoiceEngineSnapshot } from '../protocol/types.ts';

interface InFlightOperation {
  resourceKey: ResourceKey;
  controller: AbortController;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Executes voice-engine transitions with per-resourceKey serialized async queues,
 * AbortSignal cancellation, and stale operationId filtering.
 */
export class VoiceEngineRuntime implements VoiceEngineDriver {
  #ports: VoiceEngineHostPorts;
  #snapshot: VoiceEngineSnapshot;
  #listeners = new Set<SnapshotListener>();
  #queues = new Map<ResourceKey, Promise<void>>();
  #inFlight = new Map<OperationId, InFlightOperation>();
  #cancelledOperationIds = new Set<OperationId>();
  #gatewayUnsubscribe: (() => void) | null = null;
  #disposed = false;

  constructor(
    ports: VoiceEngineHostPorts,
    initialSnapshot: VoiceEngineSnapshot = createInitialVoiceEngineSnapshot(),
  ) {
    this.#ports = ports;
    this.#snapshot = initialSnapshot;
    if (ports.gateway?.onGatewayEvent) {
      this.#gatewayUnsubscribe = ports.gateway.onGatewayEvent((event) => {
        void this.dispatch(event);
      });
    }
  }

  getSnapshot(): VoiceEngineSnapshot {
    return this.#snapshot;
  }

  isOperationCancelled(operationId: OperationId): boolean {
    return this.#cancelledOperationIds.has(operationId);
  }

  getCancelledOperationIds(): ReadonlySet<OperationId> {
    return this.#cancelledOperationIds;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async dispatch(event: VoiceEngineEvent): Promise<void> {
    if (this.#disposed) return;

    const { snapshot, commands } = transitionVoiceEngine(this.#snapshot, event);
    this.#snapshot = snapshot;

    this.#cancelSupersededOperations();
    this.#notify(snapshot, event);

    if (commands.length === 0) return;

    const scheduled: Promise<void>[] = [];
    for (const command of commands) {
      const controller = new AbortController();
      if (command.type !== 'microphone.setMuted') {
        this.#inFlight.set(command.operationId, {
          resourceKey: command.resourceKey,
          controller,
        });
      }

      const runTask = () => this.#executeCommand(command, controller.signal);
      const pending = this.#queues.get(command.resourceKey);
      const task = (pending ? pending.then(runTask, runTask) : runTask()).finally(() => {
        if (this.#queues.get(command.resourceKey) === task) {
          this.#queues.delete(command.resourceKey);
        }
      });
      this.#queues.set(command.resourceKey, task);
      scheduled.push(task);
    }

    await Promise.all(scheduled);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#gatewayUnsubscribe?.();
    this.#gatewayUnsubscribe = null;
    for (const [operationId, entry] of this.#inFlight) {
      this.#cancelledOperationIds.add(operationId);
      entry.controller.abort();
    }
    this.#inFlight.clear();
    this.#listeners.clear();
  }

  #cancelSupersededOperations(): void {
    for (const [operationId, entry] of this.#inFlight) {
      if (
        isCommandCompletionStale(this.#snapshot, {
          resourceKey: entry.resourceKey,
          operationId,
        })
      ) {
        this.#cancelledOperationIds.add(operationId);
        entry.controller.abort();
        this.#inFlight.delete(operationId);
      }
    }
  }

  #notify(snapshot: VoiceEngineSnapshot, event: VoiceEngineEvent): void {
    this.#ports.gateway?.notifyEvent?.(event);
    for (const listener of this.#listeners) {
      listener(snapshot, event);
    }
  }

  #isCommandStaleOrCancelled(command: VoiceEngineCommand): boolean {
    if (this.#disposed) return true;
    if (this.#cancelledOperationIds.has(command.operationId)) return true;
    if (command.type === 'microphone.setMuted') return false;
    return isCommandCompletionStale(this.#snapshot, command);
  }

  async #executeCommand(command: VoiceEngineCommand, signal: AbortSignal): Promise<void> {
    if (this.#isCommandStaleOrCancelled(command)) {
      this.#inFlight.delete(command.operationId);
      return;
    }

    try {
      const completionEvent = await this.#runPortCommand(command, signal);
      this.#inFlight.delete(command.operationId);

      if (!completionEvent) return;
      if (this.#isCommandStaleOrCancelled(command)) return;

      await this.dispatch(completionEvent);
    } catch (error) {
      this.#inFlight.delete(command.operationId);

      if (this.#isCommandStaleOrCancelled(command)) return;

      const message = toErrorMessage(error);
      this.#ports.gateway?.reportError?.({
        resourceKey: command.resourceKey,
        operationId: command.operationId,
        message,
      });

      const failedEvent = this.#buildFailedEvent(command, message);
      if (failedEvent) {
        await this.dispatch(failedEvent);
      }
      if (this.#ports.propagateCommandErrors) throw error;
    }
  }

  async #runPortCommand(
    command: VoiceEngineCommand,
    signal: AbortSignal,
  ): Promise<VoiceEngineEvent | null> {
    switch (command.type) {
      case 'connection.connect': {
        const result = await this.#ports.media.connect({
          roomId: command.roomId,
          participantId: command.participantId,
          quality: command.quality,
          token: command.token,
          sfuUrl: command.sfuUrl,
          signal,
        });
        return {
          type: 'connection/connectSucceeded',
          operationId: command.operationId,
          roomId: command.roomId,
          participantId: command.participantId,
          publisherSessionId: result.publisherSessionId,
          subscriberSessionId: result.subscriberSessionId,
        };
      }

      case 'connection.disconnect': {
        await this.#ports.media.disconnect({
          roomId: command.roomId,
          reason: command.reason,
        });
        return {
          type: 'connection/disconnectSucceeded',
          operationId: command.operationId,
        };
      }

      case 'microphone.start': {
        const result = await this.#ports.media.startMicrophone({
          options: command.options,
          signal,
        });
        return {
          type: 'microphone/startSucceeded',
          operationId: command.operationId,
          trackId: result.trackId,
          mid: result.mid,
          options: command.options,
        };
      }

      case 'microphone.setMuted': {
        await this.#ports.media.setMicrophoneMuted?.(command.muted);
        return null;
      }

      case 'microphone.stop': {
        await this.#ports.media.stopMicrophone();
        return {
          type: 'microphone/stopSucceeded',
          operationId: command.operationId,
        };
      }

      case 'camera.start': {
        const result = await this.#ports.media.startCamera({
          options: command.options,
          signal,
        });
        return {
          type: 'camera/startSucceeded',
          operationId: command.operationId,
          trackId: result.trackId,
          mid: result.mid,
          options: command.options,
        };
      }

      case 'camera.stop': {
        await this.#ports.media.stopCamera();
        return {
          type: 'camera/stopSucceeded',
          operationId: command.operationId,
        };
      }

      case 'screen.start': {
        const result = await this.#ports.media.startScreenShare({
          captureId: command.captureId,
          options: command.options,
          signal,
        });
        return {
          type: 'screen/startSucceeded',
          operationId: command.operationId,
          captureId: command.captureId,
          trackId: result.trackId,
          mid: result.mid,
          options: command.options,
        };
      }

      case 'screen.updateEncoding': {
        await this.#ports.media.updateScreenEncoding({
          captureId: command.captureId,
          options: command.options,
          signal,
        });
        return {
          type: 'screen/encodingUpdateSucceeded',
          operationId: command.operationId,
          captureId: command.captureId,
          options: command.options,
        };
      }

      case 'screen.republish': {
        const result = await this.#ports.media.republishScreenShare({
          captureId: command.captureId,
          options: command.options,
          previousOptions: command.previousOptions,
          signal,
        });
        return {
          type: 'screen/republishSucceeded',
          operationId: command.operationId,
          captureId: command.captureId,
          trackId: result.trackId,
          mid: result.mid,
          options: command.options,
        };
      }

      case 'screen.stop': {
        await this.#ports.media.stopScreenShare({
          captureId: command.captureId,
          reason: command.reason,
        });
        return {
          type: 'screen/stopSucceeded',
          operationId: command.operationId,
        };
      }

      case 'screenAudio.start': {
        const result = await this.#ports.media.startScreenAudio({
          captureId: command.captureId,
          options: command.options,
          signal,
        });
        return {
          type: 'screenAudio/startSucceeded',
          operationId: command.operationId,
          captureId: command.captureId,
          trackId: result.trackId,
          mid: result.mid,
          options: command.options,
        };
      }

      case 'screenAudio.stop': {
        await this.#ports.media.stopScreenAudio({
          captureId: command.captureId,
        });
        return {
          type: 'screenAudio/stopSucceeded',
          operationId: command.operationId,
        };
      }

      case 'subscription.subscribe': {
        await this.#ports.subscriptions.subscribeTrack({
          participantId: command.participantId,
          kind: command.kind,
          preferredRid: command.preferredRid,
          signal,
        });
        return {
          type: 'subscription/subscribeSucceeded',
          operationId: command.operationId,
          participantId: command.participantId,
          kind: command.kind,
          preferredRid: command.preferredRid,
        };
      }

      case 'subscription.unsubscribe': {
        await this.#ports.subscriptions.unsubscribeTrack({
          participantId: command.participantId,
          kind: command.kind,
          signal,
        });
        return {
          type: 'subscription/unsubscribeSucceeded',
          operationId: command.operationId,
          participantId: command.participantId,
          kind: command.kind,
        };
      }
    }
  }

  #buildFailedEvent(command: VoiceEngineCommand, error: string): VoiceEngineEvent | null {
    switch (command.type) {
      case 'connection.connect':
        return {
          type: 'connection/connectFailed',
          operationId: command.operationId,
          error,
        };
      case 'connection.disconnect':
        return {
          type: 'connection/disconnectFailed',
          operationId: command.operationId,
          error,
        };
      case 'microphone.start':
        return {
          type: 'microphone/startFailed',
          operationId: command.operationId,
          error,
        };
      case 'microphone.setMuted':
        return null;
      case 'microphone.stop':
        return {
          type: 'microphone/stopFailed',
          operationId: command.operationId,
          error,
        };
      case 'camera.start':
        return {
          type: 'camera/startFailed',
          operationId: command.operationId,
          error,
        };
      case 'camera.stop':
        return {
          type: 'camera/stopFailed',
          operationId: command.operationId,
          error,
        };
      case 'screen.start':
        return {
          type: 'screen/startFailed',
          operationId: command.operationId,
          error,
        };
      case 'screen.updateEncoding':
        return {
          type: 'screen/encodingUpdateFailed',
          operationId: command.operationId,
          error,
        };
      case 'screen.republish':
        return {
          type: 'screen/republishFailed',
          operationId: command.operationId,
          error,
        };
      case 'screen.stop':
        return {
          type: 'screen/stopFailed',
          operationId: command.operationId,
          error,
        };
      case 'screenAudio.start':
        return {
          type: 'screenAudio/startFailed',
          operationId: command.operationId,
          error,
        };
      case 'screenAudio.stop':
        return {
          type: 'screenAudio/stopFailed',
          operationId: command.operationId,
          error,
        };
      case 'subscription.subscribe':
        return {
          type: 'subscription/subscribeFailed',
          operationId: command.operationId,
          participantId: command.participantId,
          kind: command.kind,
          error,
        };
      case 'subscription.unsubscribe':
        return {
          type: 'subscription/unsubscribeFailed',
          operationId: command.operationId,
          participantId: command.participantId,
          kind: command.kind,
          error,
        };
    }
  }
}
