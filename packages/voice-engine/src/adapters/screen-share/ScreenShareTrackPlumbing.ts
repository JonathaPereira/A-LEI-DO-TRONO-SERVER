import {
  buildScreenShareSenderParameters,
  type BuiltScreenShareSenderParameters,
  type ScreenShareCaptureMetrics,
  type ScreenShareCodec,
  type ScreenShareContentHint,
  type ScreenShareEncodingParameters,
  type ScreenShareSenderTarget,
} from '../../policies/screenShareOptions.ts';

export const SCREEN_SHARE_KEEPALIVE_ATTR = 'data-flx';
export const SCREEN_SHARE_KEEPALIVE_VALUE = 'voice.screen-share-keepalive';

export interface PlumbingTrackLike {
  id?: string;
  kind?: string;
  contentHint?: string;
}

export interface KeepAliveVideoStyleLike {
  position?: string;
  width?: string;
  height?: string;
  top?: string;
  left?: string;
  opacity?: string;
  visibility?: string;
  pointerEvents?: string;
  [key: string]: string | undefined;
}

export interface KeepAliveVideoElementLike {
  tagName?: string;
  style: KeepAliveVideoStyleLike;
  muted: boolean;
  playsInline: boolean;
  autoplay?: boolean;
  srcObject: unknown;
  parentNode?: { removeChild?: (node: KeepAliveVideoElementLike) => unknown } | null;
  setAttribute(name: string, value: string): void;
  getAttribute?(name: string): string | null;
  play?(): Promise<void> | void;
  pause?(): void;
  remove?(): void;
}

export interface KeepAliveContainerLike {
  appendChild(node: KeepAliveVideoElementLike): unknown;
  removeChild?(node: KeepAliveVideoElementLike): unknown;
}

export interface KeepAliveDocumentLike {
  body?: KeepAliveContainerLike | null;
  documentElement?: KeepAliveContainerLike | null;
  createElement(tagName: string): KeepAliveVideoElementLike;
  querySelector?(selector: string): KeepAliveVideoElementLike | null;
}

export interface ScreenShareSenderParametersLike {
  encodings?: ScreenShareEncodingParameters[];
  degradationPreference?: string;
  [key: string]: unknown;
}

export interface ScreenShareSenderLike {
  track?: PlumbingTrackLike | null;
  getParameters(): ScreenShareSenderParametersLike;
  setParameters(parameters: ScreenShareSenderParametersLike): Promise<void>;
}

export interface EnforceSenderParametersOptions {
  capture?: ScreenShareCaptureMetrics | null;
  scalabilityMode?: string;
  track?: PlumbingTrackLike | null;
  applyContentHint?: boolean;
}

export type EnforceSenderParametersResult =
  | {
      applied: true;
      parameters: ScreenShareSenderParametersLike & BuiltScreenShareSenderParameters;
    }
  | {
      applied: false;
      reason: 'unavailable' | 'set-parameters-failed';
      error?: unknown;
    };

export interface ScreenCodecCapability {
  mimeType: string;
  clockRate: number;
  channels?: number;
  sdpFmtpLine?: string;
}

export interface ScreenTransceiverLike {
  setCodecPreferences?(codecs: ScreenCodecCapability[]): void;
}

const keepAliveByDocument = new WeakMap<KeepAliveDocumentLike, KeepAliveVideoElementLike>();

function resolveDocument(doc?: KeepAliveDocumentLike | null): KeepAliveDocumentLike | null {
  if (doc) return doc;
  if (typeof document !== 'undefined') {
    return document as unknown as KeepAliveDocumentLike;
  }
  return null;
}

function createKeepAliveStream(track: PlumbingTrackLike): unknown {
  if (typeof MediaStream !== 'undefined') {
    try {
      return new MediaStream([track as unknown as MediaStreamTrack]);
    } catch {
      // Fall back to lightweight stream wrapper when track is a non-native mock.
    }
  }
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
}

function applyKeepAliveStyles(video: KeepAliveVideoElementLike): void {
  video.setAttribute(SCREEN_SHARE_KEEPALIVE_ATTR, SCREEN_SHARE_KEEPALIVE_VALUE);
  video.style.position = 'fixed';
  video.style.top = '0px';
  video.style.left = '0px';
  video.style.width = '2px';
  video.style.height = '2px';
  video.style.opacity = '0.001';
  video.style.visibility = 'hidden';
  video.style.pointerEvents = 'none';
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
}

/**
 * Ensures a hidden 2x2px <video data-flx="voice.screen-share-keepalive"> element
 * stays attached to the DOM while sharing so Chromium/Electron never suspends frame delivery.
 * Borrows the track without taking ownership or calling track.stop().
 */
export function ensureKeepAliveSink(
  track: PlumbingTrackLike | null | undefined,
  doc?: KeepAliveDocumentLike | null,
): KeepAliveVideoElementLike | null {
  if (!track) return null;
  const resolvedDoc = resolveDocument(doc);
  if (!resolvedDoc) return null;

  let video =
    keepAliveByDocument.get(resolvedDoc) ??
    resolvedDoc.querySelector?.(
      `[${SCREEN_SHARE_KEEPALIVE_ATTR}="${SCREEN_SHARE_KEEPALIVE_VALUE}"]`,
    ) ??
    null;

  if (!video) {
    video = resolvedDoc.createElement('video');
    applyKeepAliveStyles(video);
    const parent = resolvedDoc.body ?? resolvedDoc.documentElement;
    parent?.appendChild(video);
  } else {
    applyKeepAliveStyles(video);
  }

  keepAliveByDocument.set(resolvedDoc, video);
  video.srcObject = createKeepAliveStream(track);

  try {
    const playResult = video.play?.();
    if (playResult && typeof (playResult as Promise<void>).catch === 'function') {
      void (playResult as Promise<void>).catch(() => {});
    }
  } catch {
    // Autoplay rejection in headless/mock environments should not abort screen sharing.
  }

  return video;
}

/**
 * Detaches srcObject and removes the keep-alive <video> element from the DOM
 * without stopping the underlying borrowed MediaStreamTrack.
 */
export function clearKeepAliveSink(doc?: KeepAliveDocumentLike | null): boolean {
  const resolvedDoc = resolveDocument(doc);
  if (!resolvedDoc) return false;

  const video =
    keepAliveByDocument.get(resolvedDoc) ??
    resolvedDoc.querySelector?.(
      `[${SCREEN_SHARE_KEEPALIVE_ATTR}="${SCREEN_SHARE_KEEPALIVE_VALUE}"]`,
    ) ??
    null;

  keepAliveByDocument.delete(resolvedDoc);
  if (!video) return false;

  try {
    video.pause?.();
  } catch {
    // Ignore pause errors on detached elements.
  }
  video.srcObject = null;
  if (typeof video.remove === 'function') {
    video.remove();
  } else {
    video.parentNode?.removeChild?.(video);
  }
  return true;
}

/** Applies WebRTC contentHint ('motion' | 'detail' | 'text') to a video track safely. */
export function applyScreenContentHint(
  track: PlumbingTrackLike | null | undefined,
  contentHint: ScreenShareContentHint | '' | null | undefined,
): boolean {
  if (!track || contentHint === null || contentHint === undefined) return false;
  if (track.kind && track.kind !== 'video') return false;
  try {
    track.contentHint = contentHint;
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads current RTCRtpSender parameters, merges normalized screen-share encodings
 * and degradationPreference, and applies them via sender.setParameters().
 */
export async function enforceScreenShareSenderParameters(
  sender: ScreenShareSenderLike | null | undefined,
  target: ScreenShareSenderTarget,
  options: EnforceSenderParametersOptions = {},
): Promise<EnforceSenderParametersResult> {
  if (
    !sender ||
    typeof sender.getParameters !== 'function' ||
    typeof sender.setParameters !== 'function'
  ) {
    return { applied: false, reason: 'unavailable' };
  }

  if (options.applyContentHint !== false && target.contentHint) {
    applyScreenContentHint(options.track ?? sender.track, target.contentHint);
  }

  try {
    const current = sender.getParameters() ?? {};
    const built = buildScreenShareSenderParameters({
      encodings: current.encodings,
      target,
      capture: options.capture,
      scalabilityMode: options.scalabilityMode,
    });
    const nextParameters: ScreenShareSenderParametersLike & BuiltScreenShareSenderParameters = {
      ...current,
      degradationPreference: built.degradationPreference,
      encodings: built.encodings,
    };
    await sender.setParameters(nextParameters);
    return { applied: true, parameters: nextParameters };
  } catch (error) {
    return { applied: false, reason: 'set-parameters-failed', error };
  }
}

function h264Rank(codec: ScreenCodecCapability): number {
  const match = /profile-level-id=([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(
    codec.sdpFmtpLine ?? '',
  );
  if (!match) return 1;
  const profile = match[1].toLowerCase();
  const iop = match[2].toLowerCase();
  const level = parseInt(match[3], 16);
  // Constrained Baseline (42e0) has universal SFU/hardware compatibility and ranks first.
  const profileScore =
    profile === '42' && iop === 'e0'
      ? 300
      : profile === '42'
        ? 200
        : profile === '64'
          ? 120
          : profile === '4d'
            ? 100
            : 50;
  return profileScore + (Number.isFinite(level) ? Math.min(level, 99) : 0);
}

function vp9Rank(codec: ScreenCodecCapability): number {
  const match = /profile-id=(\d+)/i.exec(codec.sdpFmtpLine ?? '');
  if (!match) return 200;
  const profileId = Number(match[1]);
  // Profile 0 (8-bit 4:2:0) has universal hardware decode across desktop/mobile.
  return profileId === 0 ? 300 : profileId === 2 ? 150 : 50;
}

function resolveTargetMimeType(codec: ScreenShareCodec): string | null {
  switch (codec) {
    case 'h264':
      return 'video/h264';
    case 'vp9':
      return 'video/vp9';
    case 'vp8':
      return 'video/vp8';
    case 'av1':
      return 'video/av1';
    default:
      return null;
  }
}

/**
 * Prioritizes the requested video codec on an RTCRtpTransceiver while keeping every
 * paired video/rtx capability immediately adjacent to its primary codec.
 */
export function prioritizeScreenCodec(
  transceiver: ScreenTransceiverLike | null | undefined,
  codec: ScreenShareCodec = 'auto',
  capabilities?:
    { codecs?: readonly ScreenCodecCapability[] } | readonly ScreenCodecCapability[] | null,
): boolean {
  const targetMime = resolveTargetMimeType(codec);
  if (!targetMime || !transceiver || typeof transceiver.setCodecPreferences !== 'function') {
    return false;
  }

  try {
    const rawCodecs = Array.isArray(capabilities)
      ? capabilities
      : capabilities && 'codecs' in capabilities
        ? capabilities.codecs
        : typeof RTCRtpSender !== 'undefined'
          ? (RTCRtpSender.getCapabilities?.('video')?.codecs as
              readonly ScreenCodecCapability[] | undefined)
          : undefined;

    if (!rawCodecs || rawCodecs.length === 0) return false;

    // Group each primary codec with all immediately following video/rtx capabilities.
    const groups: ScreenCodecCapability[][] = [];
    for (const current of rawCodecs) {
      const mime = current.mimeType?.toLowerCase();
      if (mime === 'video/rtx' && groups.length > 0) {
        groups[groups.length - 1].push(current);
      } else {
        groups.push([current]);
      }
    }

    const matchingGroups = groups.filter(
      (group) => group[0].mimeType?.toLowerCase() === targetMime,
    );
    if (matchingGroups.length === 0) return false;

    const rankedMatching =
      codec === 'h264'
        ? [...matchingGroups].sort((a, b) => h264Rank(b[0]) - h264Rank(a[0]))
        : codec === 'vp9'
          ? [...matchingGroups].sort((a, b) => vp9Rank(b[0]) - vp9Rank(a[0]))
          : matchingGroups;

    const remainingGroups = groups.filter(
      (group) => group[0].mimeType?.toLowerCase() !== targetMime,
    );
    transceiver.setCodecPreferences([...rankedMatching, ...remainingGroups].flat());
    return true;
  } catch {
    return false;
  }
}
