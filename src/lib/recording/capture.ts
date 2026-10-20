export type RecordingDisplayOptions = DisplayMediaStreamOptions & {
  preferCurrentTab: boolean;
  selfBrowserSurface: 'include';
};
export interface RecordingCapture {
  readonly stream: MediaStream;
  dispose(): void;
}
export interface RecordingCaptureEnvironment {
  getDisplayMedia(options: RecordingDisplayOptions): Promise<MediaStream>;
  createStream(tracks?: MediaStreamTrack[]): MediaStream;
  getMicrophone(): MediaStreamTrack | null;
  createAudioContext(): AudioContext | null;
  warn(error: unknown): void;
}
/** Owns display capture and its mixed/cloned output. The call's microphone is only borrowed. */
export async function captureRecording(
  environment: RecordingCaptureEnvironment,
  isCurrent: () => boolean,
): Promise<RecordingCapture | null> {
  const display = await environment.getDisplayMedia({
    video: { frameRate: { ideal: 30, max: 30 }, displaySurface: 'browser' },
    audio: true,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  });
  let output: MediaStream | null = null,
    context: AudioContext | null = null,
    disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const owned = new Set([...display.getTracks(), ...(output?.getTracks() ?? [])]);
    for (const track of owned) track.stop();
    try {
      void context?.close().catch(environment.warn);
    } catch (error) {
      environment.warn(error);
    }
  };
  try {
    if (!isCurrent()) {
      dispose();
      return null;
    }
    const video = display.getVideoTracks()[0];
    if (!video) throw Error('Nenhuma imagem foi selecionada para gravação.');
    output = environment.createStream([video]);
    const audio = [...display.getAudioTracks()],
      microphone = environment.getMicrophone();
    if (microphone?.readyState === 'live') audio.push(microphone);
    if (audio.length) {
      context = environment.createAudioContext();
      if (context) {
        try {
          if (context.state === 'suspended') await context.resume();
        } catch {}
        if (!isCurrent()) {
          dispose();
          return null;
        }
        const destination = context.createMediaStreamDestination();
        for (const track of audio) {
          try {
            context.createMediaStreamSource(environment.createStream([track])).connect(destination);
          } catch (error) {
            environment.warn(error);
          }
        }
        const mixed = destination.stream.getAudioTracks()[0];
        if (mixed) output.addTrack(mixed);
      } else if (audio[0]) output.addTrack(audio[0].clone());
    }
    if (!isCurrent()) {
      dispose();
      return null;
    }
    return { stream: output, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
