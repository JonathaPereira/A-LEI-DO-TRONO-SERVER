'use strict';

const assert = require('node:assert/strict');

async function exerciseAudioWorklets(page) {
  const measurements = await page.evaluate(async () => {
    const queue = async (rate, frames, channels = 2) => {
      const context = new OfflineAudioContext(channels, rate / 2, rate);
      await context.audioWorklet.addModule('/application-audio-worklet.js');
      const node = new AudioWorkletNode(context, 'mn-application-audio', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [channels],
      });
      try {
        node.connect(context.destination);
        const samples = Float32Array.from({ length: frames * 2 }, (_, index) =>
          index % 2 ? -0.25 : 0.125,
        );
        node.port.postMessage(samples, [samples.buffer]);
        const transferred = samples.byteLength === 0;
        const output = await context.startRendering();
        const left = output.getChannelData(0),
          right = channels === 2 ? output.getChannelData(1) : null;
        return {
          transferred,
          left: left.filter((value) => value !== 0).length,
          right: right?.filter((value) => value !== 0).length,
          valid:
            left.every((value) => value === 0 || value === 0.125) &&
            (!right || right.every((value) => value === 0 || value === -0.25)),
        };
      } finally {
        node.disconnect();
        node.port.close();
      }
    };
    const noise = async () => {
      const rate = 48000,
        context = new OfflineAudioContext(1, rate * 4, rate);
      await context.audioWorklet.addModule('/light-noise-worklet.js');
      const node = new AudioWorkletNode(context, 'trono-light-noise', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        outputChannelCount: [1],
      });
      const buffer = context.createBuffer(1, rate * 4, rate),
        input = buffer.getChannelData(0);
      input.fill(0.0001);
      input.fill(0.1, rate * 2, rate * 3);
      const source = context.createBufferSource();
      source.buffer = buffer;
      try {
        source.connect(node);
        node.connect(context.destination);
        source.start();
        const rendered = (await context.startRendering()).getChannelData(0);
        const ratio = (from, to) => {
          let raw = 0,
            processed = 0;
          for (let frame = Math.floor(from * rate); frame < to * rate; frame++) {
            raw += input[frame] ** 2;
            processed += rendered[frame] ** 2;
          }
          return Math.sqrt(processed / raw);
        };
        return {
          finite: rendered.every(Number.isFinite),
          quiet: ratio(1, 1.8),
          speech: ratio(2.3, 2.8),
          tail: ratio(3.8, 4),
        };
      } finally {
        source.disconnect();
        node.disconnect();
        node.port.postMessage('destroy');
        node.port.close();
      }
    };
    return {
      stereo44100: await queue(44100, 4410),
      stereo48000: await queue(48000, 4800),
      mono: await queue(48000, 4800, 1),
      warmup: await queue(48000, 960),
      noise: await noise(),
    };
  });
  for (const [name, frames] of [
    ['stereo44100', 4410],
    ['stereo48000', 4800],
    ['mono', 4800],
  ]) {
    const result = measurements[name];
    assert.equal(result.transferred, true, name);
    assert.equal(result.valid, true, name);
    assert.equal(result.left, frames, name);
    if (name !== 'mono') assert.equal(result.right, frames, name);
  }
  assert.equal(measurements.warmup.left, 0);
  assert.equal(measurements.warmup.right, 0);
  assert.equal(measurements.noise.finite, true);
  assert(measurements.noise.quiet < 0.3);
  assert(measurements.noise.speech > 0.95);
  assert(measurements.noise.tail < 0.3);
  return measurements;
}

module.exports = { exerciseAudioWorklets };
