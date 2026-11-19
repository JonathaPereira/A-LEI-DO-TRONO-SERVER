import type {
  ScreenShareCodec,
  ScreenShareContentHint,
  ScreenShareDegradationPreference,
  ScreenShareFrameRate,
  ScreenShareResolutionPreset,
} from './screenShareOptions.ts';

export interface ScreenShareEncodingSpec {
  captureId?: string | null;
  resolution?: ScreenShareResolutionPreset;
  frameRate?: ScreenShareFrameRate | number;
  width?: number | null;
  height?: number | null;
  maxBitrateBps?: number;
  minBitrateBps?: number;
  contentHint?: ScreenShareContentHint;
  degradationPreference?: ScreenShareDegradationPreference;
  codec?: ScreenShareCodec;
  hardwareEncoding?: boolean;
  zeroCopyRequired?: boolean;
  scalabilityMode?: string;
  simulcast?: boolean;
}

export interface PlanScreenEncodingChangeInput {
  published: ScreenShareEncodingSpec | null | undefined;
  desired?: ScreenShareEncodingSpec | null;
  update?: Partial<ScreenShareEncodingSpec> | null;
}

export type ScreenEncodingChangeAction = 'noop' | 'updateEncoding' | 'republish' | 'reject';

export type ScreenEncodingChangeReason =
  | 'not-published'
  | 'capture-mismatch'
  | 'invalid-options'
  | 'unchanged'
  | 'codec-changed'
  | 'hardware-encoding-changed'
  | 'zero-copy-changed'
  | 'simulcast-changed'
  | 'encoding-parameters-changed';

export interface ScreenEncodingChangePlan {
  action: ScreenEncodingChangeAction;
  reason: ScreenEncodingChangeReason;
  desired: ScreenShareEncodingSpec | null;
  update: Partial<ScreenShareEncodingSpec>;
  error: Error | null;
}

function isPositiveFinite(value: number | null | undefined): boolean {
  return value === undefined || value === null || (Number.isFinite(value) && value > 0);
}

function hasInvalidEncodingSpec(spec: ScreenShareEncodingSpec): boolean {
  return (
    !isPositiveFinite(spec.frameRate) ||
    !isPositiveFinite(spec.maxBitrateBps) ||
    !isPositiveFinite(spec.minBitrateBps) ||
    !isPositiveFinite(spec.width) ||
    !isPositiveFinite(spec.height)
  );
}

/**
 * Decides whether a screen share encoding change can be skipped ('noop'),
 * applied dynamically via RTCRtpSender.setParameters ('updateEncoding'),
 * requires renegotiating/republishing ('republish'), or must be rejected ('reject').
 */
export function planScreenEncodingChange(
  input: PlanScreenEncodingChangeInput,
): ScreenEncodingChangePlan {
  const { published, desired, update } = input;
  const normalizedUpdate: Partial<ScreenShareEncodingSpec> = update ? { ...update } : {};

  if (!published) {
    return {
      action: 'reject',
      reason: 'not-published',
      desired: desired ? { ...desired, ...normalizedUpdate } : null,
      update: normalizedUpdate,
      error: new Error('Cannot change screen share encoding when no stream is published.'),
    };
  }

  const nextDesired: ScreenShareEncodingSpec = {
    ...published,
    ...(desired ?? {}),
    ...normalizedUpdate,
  };

  if (
    published.captureId &&
    nextDesired.captureId &&
    published.captureId !== nextDesired.captureId
  ) {
    return {
      action: 'reject',
      reason: 'capture-mismatch',
      desired: nextDesired,
      update: normalizedUpdate,
      error: new Error(
        `Screen share captureId mismatch (published=${published.captureId}, desired=${nextDesired.captureId}).`,
      ),
    };
  }

  if (hasInvalidEncodingSpec(nextDesired)) {
    return {
      action: 'reject',
      reason: 'invalid-options',
      desired: nextDesired,
      update: normalizedUpdate,
      error: new Error('Invalid screen share encoding parameters.'),
    };
  }

  if ((published.codec ?? 'auto') !== (nextDesired.codec ?? 'auto')) {
    return {
      action: 'republish',
      reason: 'codec-changed',
      desired: nextDesired,
      update: normalizedUpdate,
      error: null,
    };
  }

  if (Boolean(published.hardwareEncoding) !== Boolean(nextDesired.hardwareEncoding)) {
    return {
      action: 'republish',
      reason: 'hardware-encoding-changed',
      desired: nextDesired,
      update: normalizedUpdate,
      error: null,
    };
  }

  if (Boolean(published.zeroCopyRequired) !== Boolean(nextDesired.zeroCopyRequired)) {
    return {
      action: 'republish',
      reason: 'zero-copy-changed',
      desired: nextDesired,
      update: normalizedUpdate,
      error: null,
    };
  }

  if (Boolean(published.simulcast) !== Boolean(nextDesired.simulcast)) {
    return {
      action: 'republish',
      reason: 'simulcast-changed',
      desired: nextDesired,
      update: normalizedUpdate,
      error: null,
    };
  }

  const encodingChanged =
    published.resolution !== nextDesired.resolution ||
    published.frameRate !== nextDesired.frameRate ||
    (published.width ?? null) !== (nextDesired.width ?? null) ||
    (published.height ?? null) !== (nextDesired.height ?? null) ||
    published.maxBitrateBps !== nextDesired.maxBitrateBps ||
    published.minBitrateBps !== nextDesired.minBitrateBps ||
    published.contentHint !== nextDesired.contentHint ||
    published.degradationPreference !== nextDesired.degradationPreference ||
    published.scalabilityMode !== nextDesired.scalabilityMode;

  if (encodingChanged) {
    return {
      action: 'updateEncoding',
      reason: 'encoding-parameters-changed',
      desired: nextDesired,
      update: normalizedUpdate,
      error: null,
    };
  }

  return {
    action: 'noop',
    reason: 'unchanged',
    desired: nextDesired,
    update: normalizedUpdate,
    error: null,
  };
}
