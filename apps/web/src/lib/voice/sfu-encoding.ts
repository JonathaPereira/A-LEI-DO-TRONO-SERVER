import { prioritizeScreenCodec as prioritizeVoiceEngineScreenCodec } from '@trono/voice-engine';
import type { SfuSettings, SfuRid } from '../../types/sfu';
import type { ScreenCodec } from '../../types/voice-quality';
export function cameraEncodings(q: SfuSettings): RTCRtpEncodingParameters[] {
  return [
    {
      rid: 'f',
      scaleResolutionDownBy: 1,
      maxBitrate: q.videoBitrate,
      maxFramerate: q.camera.fps,
    },
    {
      rid: 'h',
      scaleResolutionDownBy: 2,
      maxBitrate: Math.max(180000, Math.round(q.videoBitrate * 0.42)),
      maxFramerate: q.camera.fps,
    },
    {
      rid: 'q',
      scaleResolutionDownBy: 4,
      maxBitrate: Math.max(90000, Math.round(q.videoBitrate * 0.16)),
      maxFramerate: Math.min(q.camera.fps, 24),
    },
  ];
}
export function screenEncodings(q: SfuSettings): RTCRtpEncodingParameters[] {
  return [
    {
      rid: 'f',
      scaleResolutionDownBy: 1,
      maxBitrate: q.screenBitrate,
      maxFramerate: q.screen.fps,
      networkPriority: 'high',
    },
    {
      rid: 'h',
      scaleResolutionDownBy: 2,
      maxBitrate: Math.max(500000, Math.round(q.screenBitrate * 0.42)),
      maxFramerate: Math.min(q.screen.fps, 30),
    },
    {
      rid: 'q',
      scaleResolutionDownBy: 4,
      maxBitrate: Math.max(250000, Math.round(q.screenBitrate * 0.18)),
      maxFramerate: Math.min(q.screen.fps, 20),
    },
  ];
}
// Sender parameters are enforced via RTCRtpSender.setParameters(); do not mangle SDP lines.
export function screenStartupOffer(
  offer: RTCSessionDescriptionInit,
  _bitrate: number,
): RTCSessionDescriptionInit {
  return offer;
}
export function advertisedRids(transceiver: RTCRtpTransceiver, pc: RTCPeerConnection): SfuRid[] {
  const allowed = new Set(['f', 'h', 'q']),
    rids: SfuRid[] = [];
  try {
    for (const enc of transceiver?.sender?.getParameters?.().encodings || [])
      if (enc?.rid && allowed.has(enc.rid) && !rids.includes(enc.rid as SfuRid))
        rids.push(enc.rid as SfuRid);
  } catch {}
  if (!rids.length) {
    const sdp = pc?.localDescription?.sdp || '';
    for (const match of sdp.matchAll(/^a=rid:([^\s]+)\s+send/gm)) {
      const rid = match[1];
      if (allowed.has(rid) && !rids.includes(rid as SfuRid)) rids.push(rid as SfuRid);
    }
  }
  return rids;
}

export function prioritizeScreenCodec(
  transceiver: RTCRtpTransceiver | null | undefined,
  codec: ScreenCodec = 'auto',
): boolean {
  return prioritizeVoiceEngineScreenCodec(transceiver, codec);
}

export function prioritizeH264(transceiver: RTCRtpTransceiver | null | undefined): boolean {
  return prioritizeScreenCodec(transceiver, 'h264');
}
