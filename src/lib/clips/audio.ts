interface ClipAudioOptions {
  enabled: boolean;
  stream: MediaStream;
  isCurrent(): boolean;
  borrowMicrophone(): MediaStreamTrack | null;
  getMicrophone(): Promise<MediaStream>;
  createStream(tracks: MediaStreamTrack[]): MediaStream;
  createContext(): AudioContext;
  signal?: AbortSignal;
  subscribeMicrophone?(listener: () => void): () => void;
  onFailure?(message: string): void;
}
/** Owns replay audio inputs/output, borrowing a call microphone without cloning or stopping it. */
export async function prepareClipAudio(
  options: ClipAudioOptions,
): Promise<{ dispose(): void; microphone: boolean }> {
  const inputs = options.stream.getAudioTracks();
  let ownedMic: MediaStream | undefined,
    context: AudioContext | undefined,
    output: MediaStreamTrack | undefined,
    disposed = false;
  const nodes: MediaStreamAudioSourceNode[] = [];
  let microphone: MediaStreamTrack | null = null,
    micNode: MediaStreamAudioSourceNode | undefined,
    destination: MediaStreamAudioDestinationNode | undefined,
    replacing = false,
    unsubscribe = () => {};
  const changed = () => {
    void syncMicrophone();
  };
  function detachMicrophone() {
    microphone?.removeEventListener?.('ended', changed);
    micNode?.disconnect();
  }
  function attachMicrophone(track: MediaStreamTrack) {
    microphone = track;
    micNode = context!.createMediaStreamSource(options.createStream([track]));
    micNode.connect(destination!);
    track.addEventListener?.('ended', changed);
  }
  async function syncMicrophone() {
    if (disposed || replacing) return;
    const borrowed = options.borrowMicrophone(),
      live = borrowed?.readyState === 'live' ? borrowed : null;
    if (
      live === microphone ||
      (!live &&
        microphone?.readyState === 'live' &&
        ownedMic?.getAudioTracks().includes(microphone))
    )
      return;
    replacing = true;
    let captured: MediaStream | undefined;
    try {
      let next = live;
      if (!next) {
        captured = await options.getMicrophone();
        next = captured.getAudioTracks()[0] ?? null;
      }
      if (disposed || !options.isCurrent()) {
        captured?.getTracks().forEach((track) => track.stop());
        return;
      }
      const latest = options.borrowMicrophone();
      if (latest?.readyState === 'live') {
        captured?.getTracks().forEach((track) => track.stop());
        captured = undefined;
        next = latest;
      }
      if (!next || next.readyState !== 'live') throw Error('Microfone indisponível.');
      const previous = ownedMic;
      detachMicrophone();
      attachMicrophone(next);
      ownedMic = captured;
      previous?.getTracks().forEach((track) => track.stop());
    } catch {
      captured?.getTracks().forEach((track) => track.stop());
      if (!disposed)
        options.onFailure?.(
          'Microfone interrompido. Autorize o acesso novamente ou escolha Sem som.',
        );
    } finally {
      replacing = false;
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    detachMicrophone();
    options.signal?.removeEventListener('abort', dispose);
    nodes.forEach((node) => node.disconnect());
    inputs.forEach((track) => track.stop());
    ownedMic?.getTracks().forEach((track) => track.stop());
    output?.stop();
    void context?.close().catch(() => {});
  }
  inputs.forEach((track) => options.stream.removeTrack(track));
  options.signal?.addEventListener('abort', dispose, { once: true });
  if (!options.enabled) {
    dispose();
    return { dispose, microphone: false };
  }
  try {
    microphone = options.borrowMicrophone();
    if (!microphone || microphone.readyState !== 'live') {
      ownedMic = await options.getMicrophone();
      if (disposed || !options.isCurrent()) {
        ownedMic.getTracks().forEach((track) => track.stop());
        throw new DOMException('Captura encerrada.', 'AbortError');
      }
      microphone = ownedMic.getAudioTracks()[0] ?? null;
    }
    if (disposed || options.signal?.aborted || !options.isCurrent())
      throw new DOMException('Captura encerrada.', 'AbortError');
    if (!microphone || microphone.readyState !== 'live')
      throw Error('Microfone indisponível. Escolha Sem som ou autorize o microfone.');
    context = options.createContext();
    if (context.state === 'suspended') await context.resume();
    if (!options.isCurrent()) throw new DOMException('Captura encerrada.', 'AbortError');
    destination = context.createMediaStreamDestination();
    output = destination.stream.getAudioTracks()[0];
    if (!output) throw Error('Não foi possível preparar o áudio dos clipes.');
    for (const track of inputs) {
      const node = context.createMediaStreamSource(options.createStream([track]));
      nodes.push(node);
      node.connect(destination);
    }
    attachMicrophone(microphone);
    unsubscribe = options.subscribeMicrophone?.(changed) ?? (() => {});
    options.stream.addTrack(output);
    return { dispose, microphone: true };
  } catch (error) {
    dispose();
    if (error instanceof Error) {
      const messages: Record<string, string> = {
        NotAllowedError: 'Microfone não autorizado. Permita o acesso ou escolha Sem som.',
        NotFoundError: 'Microfone não encontrado. Conecte uma entrada ou escolha Sem som.',
        NotReadableError:
          'Não foi possível abrir o microfone. Confira o dispositivo e as permissões do Windows ou escolha Sem som.',
        OverconstrainedError:
          'O microfone selecionado não está disponível com essa configuração. Escolha outra entrada nas configurações de voz ou Sem som.',
      };
      if (messages[error.name]) throw Error(messages[error.name]);
    }
    throw error;
  }
}
