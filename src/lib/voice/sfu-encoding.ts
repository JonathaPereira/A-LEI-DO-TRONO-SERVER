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
// Keep min/start hints conservative so GCC can adapt smoothly without uplink bursts or tail-drop freezes.
export function screenStartupOffer(
  offer: RTCSessionDescriptionInit,
  bitrate: number,
): RTCSessionDescriptionInit {
  if (!offer?.sdp) return offer;
  const max = Math.round(bitrate / 1000),
    min = Math.min(500, Math.max(250, Math.round(max * 0.06))),
    start = Math.min(2500, Math.max(min, Math.round(max * 0.25)));
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
          const re = new RegExp('^a=fmtp:' + id + ' ([^\\r\\n]*)', 'm'),
            hint = `x-google-min-bitrate=${min};x-google-start-bitrate=${start};x-google-max-bitrate=${max}`;
          if (re.test(part))
            part = part.replace(re, (_: string, params: string) => {
              const cleaned = params
                .replace(/;?\s*x-google-(?:start|max|min)-bitrate=\d+/g, '')
                .replace(/^[\s;]+|[\s;]+$/g, '');
              return `a=fmtp:${id} ${cleaned ? `${cleaned};${hint}` : hint}`;
            });
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

function h264Rank(codec: RTCRtpCodec): number {
  const fmtp = codec.sdpFmtpLine || '';
  const match = /profile-level-id=([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(fmtp);
  if (!match) return 1;
  const profile = match[1].toLowerCase();
  const iop = match[2].toLowerCase();
  const level = parseInt(match[3], 16);
  // Strongly prefer packetization-mode=1 (FU-A fragmentation) and level-asymmetry-allowed=1
  // so hardware encoders (NVENC/AMF/QSV) are used instead of slow single-NAL software OpenH264.
  const packetizationScore = /packetization-mode=1\b/i.test(fmtp)
    ? 500
    : /packetization-mode=0\b/i.test(fmtp)
      ? -300
      : 0;
  const asymmetryScore = /level-asymmetry-allowed=1\b/i.test(fmtp) ? 100 : 0;
  // Keep Constrained Baseline (42e0) ahead of plain Baseline (4200) and sort by higher level first.
  const profileScore =
    profile === '42' && iop === 'e0'
      ? 220
      : profile === '64'
        ? 160
        : profile === '4d'
          ? 140
          : profile === '42'
            ? 100
            : 50;
  return (
    packetizationScore +
    asymmetryScore +
    profileScore +
    (Number.isFinite(level) ? Math.min(level, 99) : 0)
  );
}

function vp9Rank(codec: RTCRtpCodec): number {
  const match = /profile-id=(\d+)/i.exec(codec.sdpFmtpLine || '');
  if (!match) return 200;
  // Profile 0 (8-bit 4:2:0) has universal hardware decode across NVIDIA/AMD/Intel/Android.
  const id = Number(match[1]);
  return id === 0 ? 300 : id === 2 ? 150 : 50;
}

export function prioritizeScreenCodec(
  transceiver: RTCRtpTransceiver | null | undefined,
  codec: ScreenCodec = 'auto',
): boolean {
  if (codec === 'auto' || !transceiver?.setCodecPreferences) return false;
  const targetMime =
    codec === 'h264'
      ? 'video/h264'
      : codec === 'vp9'
        ? 'video/vp9'
        : codec === 'av1'
          ? 'video/av1'
          : 'video/vp8';
  try {
    const sender = typeof RTCRtpSender !== 'undefined' ? RTCRtpSender : null;
    const codecs = sender?.getCapabilities?.('video')?.codecs;
    if (!codecs?.length) return false;
    // Keep paired video/rtx capabilities bound to each codec so NACK/RTX stays active.
    const groups: RTCRtpCodec[][] = [];
    for (let index = 0; index < codecs.length; index++) {
      const current = codecs[index];
      const next = codecs[index + 1];
      if (
        current.mimeType?.toLowerCase() !== 'video/rtx' &&
        next?.mimeType?.toLowerCase() === 'video/rtx'
      ) {
        groups.push([current, next]);
        index++;
      } else {
        groups.push([current]);
      }
    }
    const matchingGroups = groups.filter((g) => g[0].mimeType?.toLowerCase() === targetMime);
    if (!matchingGroups.length) return false;
    const ranked =
      codec === 'h264'
        ? [...matchingGroups].sort((a, b) => h264Rank(b[0]) - h264Rank(a[0]))
        : codec === 'vp9'
          ? [...matchingGroups].sort((a, b) => vp9Rank(b[0]) - vp9Rank(a[0]))
          : matchingGroups;
    const ordered = [
      ...ranked,
      ...groups.filter((g) => g[0].mimeType?.toLowerCase() !== targetMime),
    ].flat();
    transceiver.setCodecPreferences(ordered);
    return true;
  } catch {
    return false;
  }
}

export function prioritizeH264(transceiver: RTCRtpTransceiver | null | undefined): boolean {
  return prioritizeScreenCodec(transceiver, 'h264');
}
