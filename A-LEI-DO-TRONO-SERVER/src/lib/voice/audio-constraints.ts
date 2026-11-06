import type { MicrophoneSettings } from '../../types/voice';

export function microphoneConstraints(
  settings: Pick<MicrophoneSettings, 'enabled' | 'deviceId'>,
  nativeOnly: boolean,
  support: MediaTrackSupportedConstraints,
  customSuppressionSupported: () => boolean,
): MediaTrackConstraints {
  const audio: MediaTrackConstraints = {};
  if (support.echoCancellation) audio.echoCancellation = true;
  if (support.noiseSuppression)
    audio.noiseSuppression = settings.enabled && (nativeOnly || !customSuppressionSupported());
  if (support.autoGainControl) audio.autoGainControl = false;
  if (support.channelCount) audio.channelCount = { ideal: 1 };
  if (support.sampleRate) audio.sampleRate = { ideal: 48000 };
  if (settings.deviceId) audio.deviceId = { exact: settings.deviceId };
  return audio;
}

export async function enableNativeSuppression(
  stream: MediaStream,
  supported: boolean,
): Promise<boolean> {
  const track = stream.getAudioTracks()[0];
  if (!track) return false;
  if (supported) {
    try {
      await track.applyConstraints({ noiseSuppression: true, autoGainControl: false });
    } catch {
      /* Inspect the applied setting, not the requested setting. */
    }
  }
  return track.getSettings().noiseSuppression === true;
}
