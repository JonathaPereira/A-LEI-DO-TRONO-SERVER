import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateOperation,
  createInitialVoiceEngineSnapshot,
  isCommandCompletionStale,
} from '../../packages/voice-engine/src/core/state.ts';
import { transitionVoiceEngine } from '../../packages/voice-engine/src/core/reducer.ts';
import {
  isCameraPublished,
  isConnected,
  isMicrophonePublished,
  isScreenAudioPublished,
  isScreenPublished,
  selectParticipant,
  selectRemoteTrack,
  selectSubscription,
} from '../../packages/voice-engine/src/core/selectors.ts';
import { sameScreenOptions } from '../../packages/voice-engine/src/core/reducers/screen.ts';
import type { VoiceEngineSnapshot } from '../../packages/voice-engine/src/protocol/types.ts';

function connectSnapshot(
  initial: VoiceEngineSnapshot = createInitialVoiceEngineSnapshot(),
  roomId = 'room-1',
  participantId = 'user-1',
): VoiceEngineSnapshot {
  const req = transitionVoiceEngine(initial, {
    type: 'connection/connectRequested',
    roomId,
    participantId,
    quality: 'high',
  });
  const connectCmd = req.commands[0];
  assert.equal(connectCmd?.type, 'connection.connect');
  const ack = transitionVoiceEngine(req.snapshot, {
    type: 'connection/connectSucceeded',
    operationId: connectCmd.operationId,
    roomId,
    participantId,
    publisherSessionId: 'pub-session-1',
    subscriberSessionId: 'sub-session-1',
  });
  return ack.snapshot;
}

describe('@trono/voice-engine — Core State & Reducers', () => {
  it('aloca operationIds monotonicamente crescentes', () => {
    const s0 = createInitialVoiceEngineSnapshot();
    assert.equal(s0.nextOperationId, 1);

    const a1 = allocateOperation(s0, 'connection');
    assert.equal(a1.operationId, 1);
    assert.equal(a1.snapshot.nextOperationId, 2);

    const a2 = allocateOperation(a1.snapshot, 'microphone');
    assert.equal(a2.operationId, 2);
    assert.equal(a2.snapshot.nextOperationId, 3);
  });

  it('gerencia ciclo de conexão, reconexão, troca de sala e desconexão com incremento de generation', () => {
    const s0 = createInitialVoiceEngineSnapshot();
    assert.equal(isConnected(s0), false);

    const req = transitionVoiceEngine(s0, {
      type: 'connection/connectRequested',
      roomId: 'room-a',
      participantId: 'user-1',
      quality: 'balanced',
    });
    assert.equal(req.snapshot.connection.status, 'connecting');
    assert.equal(req.commands.length, 1);
    assert.equal(req.commands[0].type, 'connection.connect');
    const op1 = req.commands[0].operationId;

    const ok = transitionVoiceEngine(req.snapshot, {
      type: 'connection/connectSucceeded',
      operationId: op1,
      roomId: 'room-a',
      participantId: 'user-1',
      publisherSessionId: 'pub-1',
      subscriberSessionId: 'sub-1',
    });
    assert.equal(isConnected(ok.snapshot), true);
    assert.equal(ok.snapshot.connection.publisherSessionId, 'pub-1');
    assert.equal(ok.snapshot.connection.subscriberSessionId, 'sub-1');
    assert.equal(ok.snapshot.connection.operationId, null);

    // Mesmo roomId/participantId quando já conectado -> noop
    const sameRoom = transitionVoiceEngine(ok.snapshot, {
      type: 'connection/connectRequested',
      roomId: 'room-a',
      participantId: 'user-1',
    });
    assert.equal(sameRoom.commands.length, 0);

    // Inicia microfone antes de trocar de sala
    const micStart = transitionVoiceEngine(ok.snapshot, {
      type: 'microphone/startRequested',
      options: { echoCancellation: true },
    });
    assert.equal(micStart.snapshot.microphone.status, 'starting');
    const micOp = micStart.commands[0].operationId;

    // Troca de sala invalida operação pendente e incrementa generation
    const switchRoom = transitionVoiceEngine(micStart.snapshot, {
      type: 'connection/connectRequested',
      roomId: 'room-b',
      participantId: 'user-1',
    });
    assert.equal(switchRoom.snapshot.connection.status, 'connecting');
    assert.equal(switchRoom.snapshot.connection.roomId, 'room-b');
    assert.equal(switchRoom.snapshot.connection.generation, ok.snapshot.connection.generation + 1);
    assert.equal(switchRoom.snapshot.microphone.status, 'stopped');
    assert.equal(switchRoom.snapshot.microphone.operationId, null);
    assert.equal(
      isCommandCompletionStale(switchRoom.snapshot, {
        resourceKey: 'microphone',
        operationId: micOp,
      }),
      true,
    );

    // Desconexão
    const disc = transitionVoiceEngine(ok.snapshot, {
      type: 'connection/disconnectRequested',
      reason: 'user-left',
    });
    assert.equal(disc.snapshot.connection.status, 'disconnecting');
    assert.equal(disc.commands[0]?.type, 'connection.disconnect');
    const discDone = transitionVoiceEngine(disc.snapshot, {
      type: 'connection/disconnectSucceeded',
      operationId: disc.commands[0].operationId,
    });
    assert.equal(discDone.snapshot.connection.status, 'disconnected');
    assert.equal(discDone.snapshot.connection.roomId, null);
  });

  it('atualiza participantes e publicações remotas no reducer de room', () => {
    const connected = connectSnapshot();
    const joined = transitionVoiceEngine(connected, {
      type: 'room/participantJoined',
      participantId: 'user-2',
      displayName: 'Maria',
    }).snapshot;

    assert.equal(selectParticipant(joined, 'user-2')?.displayName, 'Maria');

    const pub = transitionVoiceEngine(joined, {
      type: 'room/trackPublished',
      participantId: 'user-2',
      track: {
        participantId: 'user-2',
        kind: 'screen',
        trackName: 'screen-track',
        mid: '0',
        rids: ['f', 'h'],
        available: true,
      },
    }).snapshot;

    assert.equal(selectRemoteTrack(pub, 'user-2', 'screen')?.mid, '0');

    const unpub = transitionVoiceEngine(pub, {
      type: 'room/trackUnpublished',
      participantId: 'user-2',
      kind: 'screen',
    }).snapshot;
    assert.equal(selectRemoteTrack(unpub, 'user-2', 'screen'), undefined);

    const left = transitionVoiceEngine(unpub, {
      type: 'room/participantLeft',
      participantId: 'user-2',
    }).snapshot;
    assert.equal(selectParticipant(left, 'user-2'), undefined);
  });

  it('rejeita início de mídia desconectado e gerencia microfone, câmera e áudio de tela', () => {
    const s0 = createInitialVoiceEngineSnapshot();
    const deniedMic = transitionVoiceEngine(s0, { type: 'microphone/startRequested' });
    assert.equal(deniedMic.commands.length, 0);
    assert.ok(deniedMic.snapshot.microphone.lastError);

    const connected = connectSnapshot();

    // Microfone: start -> mute (não invalida opId) -> startSucceeded -> stop
    const micStart = transitionVoiceEngine(connected, {
      type: 'microphone/startRequested',
      options: { noiseSuppression: true },
    });
    assert.equal(micStart.commands[0]?.type, 'microphone.start');
    const micOp = micStart.commands[0].operationId;

    const mutedWhileStarting = transitionVoiceEngine(micStart.snapshot, {
      type: 'microphone/muteChanged',
      muted: true,
    });
    assert.equal(mutedWhileStarting.snapshot.microphone.muted, true);
    assert.equal(mutedWhileStarting.snapshot.microphone.operationId, micOp);
    assert.equal(mutedWhileStarting.commands[0]?.type, 'microphone.setMuted');

    const micOk = transitionVoiceEngine(mutedWhileStarting.snapshot, {
      type: 'microphone/startSucceeded',
      operationId: micOp,
      trackId: 'mic-1',
      mid: '0',
      options: { noiseSuppression: true },
    });
    assert.equal(isMicrophonePublished(micOk.snapshot), true);
    assert.equal(micOk.snapshot.microphone.muted, true);

    // Câmera
    const camStart = transitionVoiceEngine(micOk.snapshot, {
      type: 'camera/startRequested',
      options: { width: 1280, height: 720, frameRate: 30 },
    });
    assert.equal(camStart.commands[0]?.type, 'camera.start');
    const camOk = transitionVoiceEngine(camStart.snapshot, {
      type: 'camera/startSucceeded',
      operationId: camStart.commands[0].operationId,
      trackId: 'cam-1',
      mid: '1',
      options: { width: 1280, height: 720, frameRate: 30 },
    });
    assert.equal(isCameraPublished(camOk.snapshot), true);

    // Áudio de tela
    const saStart = transitionVoiceEngine(camOk.snapshot, {
      type: 'screenAudio/startRequested',
      captureId: 'cap-1',
      options: { maxBitrateBps: 128000 },
    });
    assert.equal(saStart.commands[0]?.type, 'screenAudio.start');
    const saOk = transitionVoiceEngine(saStart.snapshot, {
      type: 'screenAudio/startSucceeded',
      operationId: saStart.commands[0].operationId,
      captureId: 'cap-1',
      trackId: 'sa-1',
      mid: '2',
      options: { maxBitrateBps: 128000 },
    });
    assert.equal(isScreenAudioPublished(saOk.snapshot), true);
  });

  it('descarta conclusões obsoletas via isCommandCompletionStale e no reducer puro', () => {
    const connected = connectSnapshot();
    const start1 = transitionVoiceEngine(connected, {
      type: 'microphone/startRequested',
    });
    const cmdStart1 = start1.commands[0];
    assert.equal(isCommandCompletionStale(start1.snapshot, cmdStart1), false);

    // Usuário cancela antes do start completar
    const stop1 = transitionVoiceEngine(start1.snapshot, {
      type: 'microphone/stopRequested',
    });
    assert.equal(isCommandCompletionStale(stop1.snapshot, cmdStart1), true);
    assert.equal(isCommandCompletionStale(stop1.snapshot, stop1.commands[0]), false);

    // Conclusão atrasada do start1 é ignorada pelo reducer
    const staleAttempt = transitionVoiceEngine(stop1.snapshot, {
      type: 'microphone/startSucceeded',
      operationId: cmdStart1.operationId,
      trackId: 'mic-stale',
      mid: '0',
      options: {},
    });
    assert.equal(staleAttempt.snapshot.microphone.status, 'stopping');
    assert.equal(staleAttempt.snapshot.microphone.trackId, null);
    assert.equal(staleAttempt.commands.length, 0);
  });

  it('planeja atualizações de encoding de tela (noop, updateEncoding, republish e falhas)', () => {
    assert.equal(
      sameScreenOptions(
        { width: 1920, height: 1080, frameRate: 60, codec: 'auto' },
        { width: 1920, height: 1080, frameRate: 60 },
      ),
      true,
    );
    assert.equal(
      sameScreenOptions({ width: 1920, height: 1080 }, { width: 1280, height: 720 }),
      false,
    );

    const connected = connectSnapshot();

    // Falha quando tela não está publicada
    const failNotPub = transitionVoiceEngine(connected, {
      type: 'screen/encodingUpdateRequested',
      captureId: 'cap-1',
      options: { frameRate: 60 },
    });
    assert.equal(failNotPub.commands.length, 0);
    assert.ok(failNotPub.snapshot.screen.lastError);

    // Publica tela
    const start = transitionVoiceEngine(connected, {
      type: 'screen/startRequested',
      captureId: 'cap-1',
      options: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        maxBitrateBps: 4_000_000,
        codec: 'h264',
        hardwareEncoding: false,
        zeroCopyRequired: false,
      },
    });
    const pub = transitionVoiceEngine(start.snapshot, {
      type: 'screen/startSucceeded',
      operationId: start.commands[0].operationId,
      captureId: 'cap-1',
      trackId: 'scr-1',
      mid: '3',
      options: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        maxBitrateBps: 4_000_000,
        codec: 'h264',
        hardwareEncoding: false,
        zeroCopyRequired: false,
      },
    }).snapshot;
    assert.equal(isScreenPublished(pub), true);

    // Falha quando captureId não corresponde
    const failMismatch = transitionVoiceEngine(pub, {
      type: 'screen/encodingUpdateRequested',
      captureId: 'cap-other',
      options: { frameRate: 60 },
    });
    assert.equal(failMismatch.commands.length, 0);
    assert.ok(failMismatch.snapshot.screen.lastError);

    // Noop quando opções são idênticas
    const noop = transitionVoiceEngine(pub, {
      type: 'screen/encodingUpdateRequested',
      captureId: 'cap-1',
      options: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        maxBitrateBps: 4_000_000,
        codec: 'h264',
      },
    });
    assert.equal(noop.commands.length, 0);
    assert.equal(noop.snapshot.screen.status, 'published');

    // Mudança apenas de dimensões/frameRate/bitrate -> updateEncoding
    const updateEnc = transitionVoiceEngine(pub, {
      type: 'screen/encodingUpdateRequested',
      captureId: 'cap-1',
      options: {
        width: 1280,
        height: 720,
        frameRate: 60,
        maxBitrateBps: 6_000_000,
      },
    });
    assert.equal(updateEnc.snapshot.screen.status, 'updating');
    assert.equal(updateEnc.commands[0]?.type, 'screen.updateEncoding');

    const updateOk = transitionVoiceEngine(updateEnc.snapshot, {
      type: 'screen/encodingUpdateSucceeded',
      operationId: updateEnc.commands[0].operationId,
      captureId: 'cap-1',
      options: {
        width: 1280,
        height: 720,
        frameRate: 60,
        maxBitrateBps: 6_000_000,
        codec: 'h264',
        hardwareEncoding: false,
        zeroCopyRequired: false,
      },
    }).snapshot;
    assert.equal(updateOk.screen.status, 'published');
    assert.equal(updateOk.screen.options?.frameRate, 60);

    // Mudança de codec, hardwareEncoding ou zeroCopyRequired -> republish
    const repubCodec = transitionVoiceEngine(updateOk, {
      type: 'screen/encodingUpdateRequested',
      captureId: 'cap-1',
      options: { codec: 'vp9' },
    });
    assert.equal(repubCodec.snapshot.screen.status, 'republishing');
    assert.equal(repubCodec.commands[0]?.type, 'screen.republish');

    const repubOk = transitionVoiceEngine(repubCodec.snapshot, {
      type: 'screen/republishSucceeded',
      operationId: repubCodec.commands[0].operationId,
      captureId: 'cap-1',
      trackId: 'scr-2',
      mid: '4',
      options: {
        width: 1280,
        height: 720,
        frameRate: 60,
        maxBitrateBps: 6_000_000,
        codec: 'vp9',
        hardwareEncoding: false,
        zeroCopyRequired: false,
      },
    }).snapshot;
    assert.equal(repubOk.screen.status, 'published');
    assert.equal(repubOk.screen.options?.codec, 'vp9');

    const repubHw = transitionVoiceEngine(repubOk, {
      type: 'screen/encodingUpdateRequested',
      captureId: 'cap-1',
      options: { hardwareEncoding: true },
    });
    assert.equal(repubHw.commands[0]?.type, 'screen.republish');

    const repubZeroCopy = transitionVoiceEngine(repubOk, {
      type: 'screen/encodingUpdateRequested',
      captureId: 'cap-1',
      options: { zeroCopyRequired: true },
    });
    assert.equal(repubZeroCopy.commands[0]?.type, 'screen.republish');
  });

  it('gerencia assinaturas de tracks remotas por participantId e kind', () => {
    const connected = connectSnapshot();

    const subReq = transitionVoiceEngine(connected, {
      type: 'subscription/setRequested',
      participantId: 'user-2',
      kind: 'screen',
      subscribed: true,
      preferredRid: 'f',
    });
    assert.equal(subReq.commands[0]?.type, 'subscription.subscribe');
    assert.equal(subReq.commands[0]?.resourceKey, 'subscription:user-2:screen');

    const subState = selectSubscription(subReq.snapshot, 'user-2', 'screen');
    assert.equal(subState?.status, 'subscribing');

    const subOk = transitionVoiceEngine(subReq.snapshot, {
      type: 'subscription/subscribeSucceeded',
      operationId: subReq.commands[0].operationId,
      participantId: 'user-2',
      kind: 'screen',
      preferredRid: 'f',
    }).snapshot;
    assert.equal(selectSubscription(subOk, 'user-2', 'screen')?.status, 'subscribed');

    // Repetição idêntica -> noop
    const dupSub = transitionVoiceEngine(subOk, {
      type: 'subscription/setRequested',
      participantId: 'user-2',
      kind: 'screen',
      subscribed: true,
      preferredRid: 'f',
    });
    assert.equal(dupSub.commands.length, 0);

    // Desassinatura
    const unsubReq = transitionVoiceEngine(subOk, {
      type: 'subscription/setRequested',
      participantId: 'user-2',
      kind: 'screen',
      subscribed: false,
    });
    assert.equal(unsubReq.commands[0]?.type, 'subscription.unsubscribe');

    const unsubOk = transitionVoiceEngine(unsubReq.snapshot, {
      type: 'subscription/unsubscribeSucceeded',
      operationId: unsubReq.commands[0].operationId,
      participantId: 'user-2',
      kind: 'screen',
    }).snapshot;
    assert.equal(selectSubscription(unsubOk, 'user-2', 'screen')?.status, 'unsubscribed');
  });
});
