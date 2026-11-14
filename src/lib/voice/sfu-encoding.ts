import type { SfuSettings, SfuRid } from '../../types/sfu';
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
// Chromium's startup hint is advisory; congestion control still owns actual bandwidth.
export function screenStartupOffer(
  offer: RTCSessionDescriptionInit,
  bitrate: number,
): RTCSessionDescriptionInit {
  if (!offer?.sdp) return offer;
  const max = Math.round(bitrate / 1000),
    min = Math.min(2500, Math.max(800, Math.round(max * 0.3))),
    start = Math.min(7500, Math.max(min, Math.round(max * 0.7)));
  const parts = offer.sdp.split(/(?=m=)/);
  return {
    type: offer.type,
    sdp: parts
      .map((part) => {
        if (!part.startsWith('m=video')) return part;
        const ids = [...part.matchAll(/^a=rtpmap:(\d+) (?:VP8|VP9|H264|AV1)\/90000/gim)].map(
          (m) => m[1],
        );
        for (const id of ids) {
          const re = new RegExp('^a=fmtp:' + id + ' (.*)$', 'm'),
            hint = `x-google-min-bitrate=${min};x-google-start-bitrate=${start};x-google-max-bitrate=${max}`;
          if (re.test(part))
            part = part.replace(
              re,
              (_: string, params: string) =>
                `a=fmtp:${id} ${params.replace(/;?\s*x-google-(?:start|max|min)-bitrate=\d+/g, '')};${hint}`,
            );
          else
            part = part.replace(
              new RegExp('(^a=rtpmap:' + id + ' [^\r\n]+\r?\n)', 'm'),
              `$1a=fmtp:${id} ${hint}\r\n`,
            );
        }
        return part;
      })
      .join(''),
  };
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

export function prioritizeH264(transceiver: RTCRtpTransceiver | null | undefined): boolean {
  if (!transceiver?.setCodecPreferences) return false;
  try {
    const sender = typeof RTCRtpSender !== 'undefined' ? RTCRtpSender : null;
    const codecs = sender?.getCapabilities?.('video')?.codecs;
    if (!codecs?.length) return false;
    const h264 = codecs.filter((c) => c.mimeType?.toLowerCase() === 'video/h264');
    if (!h264.length) return false;
    transceiver.setCodecPreferences([...h264, ...codecs.filter((c) => !h264.includes(c))]);
    return true;
  } catch {
    return false;
  }
}
