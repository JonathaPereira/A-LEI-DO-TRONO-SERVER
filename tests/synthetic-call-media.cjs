'use strict';

/** Install with context.addInitScript. Sources live for the page so borrowed clones remain live. */
function installSyntheticCallMedia({ simulateNativeSuppression = false } = {}) {
  const sources = [];
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = new MediaStream();
    if (constraints.audio) {
      const context = new AudioContext({ sampleRate: 48000 });
      const tone = context.createOscillator();
      const gain = context.createGain();
      const output = context.createMediaStreamDestination();
      tone.frequency.value = 440;
      gain.gain.value = 0.01;
      tone.connect(gain).connect(output);
      tone.start();
      await context.resume();
      output.stream.getAudioTracks().forEach((track) => {
        // Exercise native-mode routing without claiming that an oscillator has
        // a microphone driver's suppression capability or DSP.
        if (simulateNativeSuppression) {
          const settings = track.getSettings.bind(track);
          let native = !!constraints.audio.noiseSuppression;
          track.getSettings = () => ({ ...settings(), noiseSuppression: native });
          track.applyConstraints = async (options) => {
            if ('noiseSuppression' in options) native = !!options.noiseSuppression;
          };
        }
        stream.addTrack(track);
      });
      sources.push({ context, stream: output.stream });
    }
    if (constraints.video) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d');
      let frame = 0;
      const draw = () => {
        context.fillStyle = '#384460';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#e6d9ff';
        context.fillRect((frame++ * 7) % canvas.width, 80, 40, 80);
      };
      draw();
      const video = canvas.captureStream(30);
      video.getVideoTracks().forEach((track) => stream.addTrack(track));
      sources.push({ canvas, timer: setInterval(draw, 33), stream: video });
    }
    return stream;
  };
  window.addEventListener(
    'pagehide',
    () => {
      for (const source of sources) {
        clearInterval(source.timer);
        source.stream.getTracks().forEach((track) => track.stop());
        void source.context?.close();
      }
    },
    { once: true },
  );
}

module.exports = { installSyntheticCallMedia };
