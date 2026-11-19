import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidSdpDescription,
  parseSfuRequestMessage,
  validatePublishTracksPayload,
  validateSubscribeTracksPayload,
  validateUnpublishTracksPayload,
  validateRenegotiatePayload,
  validateUpdateSubscriptionPayload,
} from '../../packages/protocol/src/index.ts';

const VALID_SDP =
  'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';

describe('@trono/protocol — Contratos Cloudflare SFU', () => {
  it('valida descrições SDP offer e answer e rejeita valores malformados', () => {
    assert.equal(isValidSdpDescription({ type: 'offer', sdp: VALID_SDP }, 'offer'), true);
    assert.equal(isValidSdpDescription({ type: 'answer', sdp: VALID_SDP }, 'answer'), true);
    assert.equal(isValidSdpDescription({ type: 'answer', sdp: VALID_SDP }, 'offer'), false);
    assert.equal(isValidSdpDescription({ type: 'offer', sdp: 'curto' }, 'offer'), false);
    assert.equal(isValidSdpDescription(null, 'offer'), false);
  });

  it('interpreta mensagens de requisição SFU válidas e descarta ações desconhecidas', () => {
    const valid = parseSfuRequestMessage({
      requestId: 'req-1',
      action: 'publish-tracks',
      payload: { tracks: [] },
    });
    assert.deepEqual(valid, {
      requestId: 'req-1',
      action: 'publish-tracks',
      payload: { tracks: [] },
    });

    assert.equal(parseSfuRequestMessage({ requestId: '', action: 'status', payload: {} }), null);
    assert.equal(
      parseSfuRequestMessage({ requestId: 'req-2', action: 'acao-inexistente', payload: {} }),
      null,
    );
  });

  it('valida publicação em lote (screen + screen-audio) na mesma sessão publisher', () => {
    const parsed = validatePublishTracksPayload({
      sessionId: 'cf-pub-1',
      quality: 'high',
      screenBitrate: 10000000,
      sessionDescription: { type: 'offer', sdp: VALID_SDP },
      tracks: [
        { kind: 'screen', mid: '0', rids: ['f', 'h'] },
        { kind: 'screen-audio', mid: '1' },
      ],
    });

    assert.ok(parsed.ok);
    assert.equal(parsed.value.sessionId, 'cf-pub-1');
    assert.equal(parsed.value.tracks.length, 2);
    assert.deepEqual(parsed.value.tracks[0], { kind: 'screen', mid: '0', rids: ['f', 'h'] });
    assert.deepEqual(parsed.value.tracks[1], { kind: 'screen-audio', mid: '1', rids: [] });

    const duplicateMid = validatePublishTracksPayload({
      sessionDescription: { type: 'offer', sdp: VALID_SDP },
      tracks: [
        { kind: 'screen', mid: '0' },
        { kind: 'screen-audio', mid: '0' },
      ],
    });
    assert.equal(duplicateMid.ok, false);

    const badKind = validatePublishTracksPayload({
      sessionDescription: { type: 'offer', sdp: VALID_SDP },
      tracks: [{ kind: 'invalid', mid: '0' }],
    });
    assert.equal(badKind.ok, false);
  });

  it('valida assinatura em lote na sessão subscriber', () => {
    const parsed = validateSubscribeTracksPayload({
      sessionId: 'cf-sub-1',
      quality: 'balanced',
      tracks: [
        { publisherId: 'user-2', kind: 'screen', preferredRid: 'f' },
        { publisherId: 'user-2', kind: 'screen-audio' },
      ],
    });

    assert.ok(parsed.ok);
    assert.equal(parsed.value.sessionId, 'cf-sub-1');
    assert.equal(parsed.value.tracks.length, 2);
    assert.equal(parsed.value.tracks[0].preferredRid, 'f');
    assert.equal(parsed.value.tracks[1].preferredRid, null);

    const empty = validateSubscribeTracksPayload({ tracks: [] });
    assert.equal(empty.ok, false);
  });

  it('valida fechamento de tracks, renegociação SDP e troca de layer simulcast', () => {
    const unpub = validateUnpublishTracksPayload({
      sessionId: 'cf-pub-1',
      mids: ['0', '1'],
    });
    assert.ok(unpub.ok);
    assert.deepEqual(unpub.value.mids, ['0', '1']);
    assert.equal(validateUnpublishTracksPayload({ sessionId: 'cf-pub-1', mids: [] }).ok, false);

    const reneg = validateRenegotiatePayload({
      sessionId: 'cf-sub-1',
      sessionDescription: { type: 'answer', sdp: VALID_SDP },
    });
    assert.ok(reneg.ok);
    assert.equal(
      validateRenegotiatePayload({
        sessionId: 'cf-sub-1',
        sessionDescription: { type: 'offer', sdp: VALID_SDP },
      }).ok,
      false,
    );

    const upd = validateUpdateSubscriptionPayload({
      sessionId: 'cf-sub-1',
      mid: '2',
      preferredRid: 'h',
    });
    assert.ok(upd.ok);
    assert.equal(upd.value.preferredRid, 'h');
  });
});
