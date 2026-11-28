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
  const hScale = q.screen.width >= 1920 ? 1.5 : 2;
  const hBitrate = Math.min(3_000_000, Math.max(1_200_000, Math.round(q.screenBitrate * 0.35)));
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
      scaleResolutionDownBy: hScale,
      maxBitrate: hBitrate,
      maxFramerate: Math.min(q.screen.fps, 30),
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
  // so hardware encoders (NVENC/AMF/QSV) are used instead of single-NAL software OpenH264.
  const packetizationScore = /packetization-mode=1\b/i.test(fmtp)
    ? 500
    : /packetization-mode=0\b/i.test(fmtp)
      ? -300
      : 0;
  const asymmetryScore = /level-asymmetry-allowed=1\b/i.test(fmtp) ? 100 : 0;
  // Rank High Profile (64, CABAC + 8x8 transform, native NVENC/AMF/QSV) and Main (4d)
  // ahead of Constrained Baseline (42e0) and plain Baseline (4200).
  const profileScore =
    profile === '64'
      ? iop === '0c'
        ? 300
        : 320
      : profile === '4d'
        ? 240
        : profile === '42' && iop === 'e0'
          ? 180
          : profile === '42'
            ? 80
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

interface EncodingCapabilitiesLike {
  encodingInfo(configuration: {
    type: 'webrtc';
    video: {
      contentType: string;
      width: number;
      height: number;
      bitrate: number;
      framerate: number;
    };
  }): Promise<{ supported?: boolean; smooth?: boolean; powerEfficient?: boolean }>;
}

let cachedHardwareCodec: Exclude<ScreenCodec, 'auto'> | null = null;
let cachedHardwareEfficient = false;
let pendingHardwareProbe: Promise<Exclude<ScreenCodec, 'auto'>> | null = null;

export function resetHardwareScreenCodecCache(): void {
  cachedHardwareCodec = null;
  cachedHardwareEfficient = false;
  pendingHardwareProbe = null;
}

/** Codec reported as power-efficient (hardware) by the last probe, or null for software only. */
export function efficientHardwareScreenCodec(): Exclude<ScreenCodec, 'auto'> | null {
  return cachedHardwareEfficient ? cachedHardwareCodec : null;
}

/** Last codec selected by detectHardwareScreenCodec, regardless of hardware efficiency. */
export function lastDetectedScreenCodec(): Exclude<ScreenCodec, 'auto'> | null {
  return cachedHardwareCodec;
}

export async function detectHardwareScreenCodec(
  mediaCapabilities?: EncodingCapabilitiesLike | null,
): Promise<Exclude<ScreenCodec, 'auto'>> {
  const customProbe = arguments.length > 0;
  if (!customProbe && cachedHardwareCodec) return cachedHardwareCodec;
  if (!customProbe && pendingHardwareProbe) return pendingHardwareProbe;

  const probe = (async (): Promise<Exclude<ScreenCodec, 'auto'>> => {
    const mc =
      mediaCapabilities !== undefined
        ? mediaCapabilities
        : typeof navigator !== 'undefined' &&
            typeof navigator.mediaCapabilities?.encodingInfo === 'function'
          ? (navigator.mediaCapabilities as unknown as EncodingCapabilitiesLike)
          : null;
    if (typeof mc?.encodingInfo === 'function') {
      const desktopBridge =
        typeof window !== 'undefined'
          ? (window as { TronoDesktop?: { hardwareH264?: boolean } }).TronoDesktop
          : undefined;
      // Standard desktop Electron ships without proprietary H.264 HW encode and falls back to OpenH264.
      const skipSoftwareElectronH264 = Boolean(desktopBridge) && !desktopBridge?.hardwareH264;
      const candidates: readonly [Exclude<ScreenCodec, 'auto'>, readonly string[]][] = [
        ['av1', ['video/AV1']],
        ...(skipSoftwareElectronH264
          ? ([] as readonly [Exclude<ScreenCodec, 'auto'>, readonly string[]][])
          : ([
              [
                'h264',
                [
                  'video/H264; profile-level-id=640032; packetization-mode=1',
                  'video/H264; profile-level-id=64002a; packetization-mode=1',
                  'video/H264; profile-level-id=42e02a; packetization-mode=1',
                ],
              ],
            ] as readonly [Exclude<ScreenCodec, 'auto'>, readonly string[]][])),
        ['vp9', ['video/VP9; profile-id=0', 'video/VP9']],
      ];
      for (const [codec, contentTypes] of candidates) {
        for (const contentType of contentTypes) {
          try {
            const info = await mc.encodingInfo({
              type: 'webrtc',
              video: {
                contentType,
                width: 1920,
                height: 1080,
                bitrate: 8_000_000,
                framerate: 60,
              },
            });
            if (info?.supported && info?.powerEfficient) {
              cachedHardwareCodec = codec;
              cachedHardwareEfficient = true;
              return codec;
            }
          } catch {}
        }
      }
      cachedHardwareCodec = 'vp9';
      cachedHardwareEfficient = false;
      return 'vp9';
    }
    return 'vp9';
  })();

  if (!customProbe) {
    const pending: Promise<Exclude<ScreenCodec, 'auto'>> = probe.finally(() => {
      if (pendingHardwareProbe === pending) pendingHardwareProbe = null;
    });
    pendingHardwareProbe = pending;
    return pending;
  }
  return probe;
}

export function prioritizeScreenCodec(
  transceiver: RTCRtpTransceiver | null | undefined,
  codec: ScreenCodec = 'auto',
  resolvedAutoCodec?: Exclude<ScreenCodec, 'auto'> | null,
): boolean {
  if (!transceiver?.setCodecPreferences) return false;
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

    const sortMimeGroups = (mime: string) => {
      const matching = groups.filter((g) => g[0].mimeType?.toLowerCase() === mime);
      if (mime === 'video/h264')
        return [...matching].sort((a, b) => h264Rank(b[0]) - h264Rank(a[0]));
      if (mime === 'video/vp9') return [...matching].sort((a, b) => vp9Rank(b[0]) - vp9Rank(a[0]));
      return matching;
    };

    if (codec === 'auto') {
      const preferredAuto = resolvedAutoCodec ?? cachedHardwareCodec ?? 'vp9';
      const autoMimeOrder =
        preferredAuto === 'av1'
          ? ['video/av1', 'video/h264', 'video/vp9', 'video/vp8']
          : preferredAuto === 'h264'
            ? ['video/h264', 'video/vp9', 'video/av1', 'video/vp8']
            : ['video/vp9', 'video/h264', 'video/av1', 'video/vp8'];
      const known = new Set(autoMimeOrder);
      const orderedGroups = [
        ...autoMimeOrder.flatMap((mime) => sortMimeGroups(mime)),
        ...groups.filter((g) => !known.has(g[0].mimeType?.toLowerCase() || '')),
      ];
      if (!orderedGroups.length) return false;
      transceiver.setCodecPreferences(orderedGroups.flat());
      return true;
    }

    const targetMime =
      codec === 'h264'
        ? 'video/h264'
        : codec === 'vp9'
          ? 'video/vp9'
          : codec === 'av1'
            ? 'video/av1'
            : 'video/vp8';
    const ranked = sortMimeGroups(targetMime);
    if (!ranked.length) return false;
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
