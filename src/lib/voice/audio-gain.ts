/** Borrows the received track and context. Closing only disconnects owned nodes. */
export function createAudioGain(ctx: AudioContext, stream: MediaStream, volume: number) {
  const nodes: AudioNode[] = [];
  function close() {
    for (const node of nodes.splice(0)) {
      try {
        node.disconnect();
      } catch {}
    }
  }
  try {
    const source = ctx.createMediaStreamSource(stream);
    nodes.push(source);
    const gain = ctx.createGain();
    nodes.push(gain);
    const limiter = ctx.createDynamicsCompressor();
    nodes.push(limiter);
    gain.gain.value = volume;
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;
    source.connect(gain);
    gain.connect(limiter);
    limiter.connect(ctx.destination);
    return { ctx, gain, close };
  } catch (error) {
    close();
    throw error;
  }
}
