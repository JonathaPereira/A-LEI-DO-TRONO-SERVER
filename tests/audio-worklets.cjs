'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadWorklet } = require('./audio-worklet-fixture.cjs');
const filename = (name) => path.resolve(__dirname, '../src/lib/voice/worklets', name + '.ts');
const queue = (rate = 1000) => loadWorklet(filename('application-audio'), rate);
const send = (processor, value) => processor.port.onmessage({ data: value });
const stereo = (frames, offset = 0) =>
  Float32Array.from({ length: frames * 2 }, (_, i) => offset + i / 1000);
function render(processor, size = 16, channels = 2, input = []) {
  const out = Array.from({ length: channels }, () => new Float32Array(size));
  return { active: processor.process(input, [out]), out };
}

test('application audio waits for 60 ms without consuming samples, then preserves stereo order', () => {
  const processor = queue(),
    first = stereo(30),
    second = stereo(30, 1);
  send(processor, first);
  assert(render(processor).out.every((channel) => channel.every((value) => value === 0)));
  send(processor, second);
  const expected = [...first, ...second],
    left = [],
    right = [];
  for (let block = 0; block < 4; block++) {
    const { out, active } = render(processor);
    assert.equal(active, true);
    left.push(...out[0]);
    right.push(...out[1]);
  }
  assert.deepEqual(
    left.slice(0, 60),
    expected.filter((_, i) => i % 2 === 0),
  );
  assert.deepEqual(
    right.slice(0, 60),
    expected.filter((_, i) => i % 2 === 1),
  );
  assert(left.slice(60).every((value) => value === 0));
  assert(right.slice(60).every((value) => value === 0));
});

test('mono playback consumes both interleaved samples and keeps the next stereo block aligned', () => {
  const processor = queue(),
    input = stereo(80);
  send(processor, input);
  const mono = render(processor, 16, 1).out[0];
  assert.deepEqual([...mono], [...input].filter((_, i) => i % 2 === 0).slice(0, 16));
  const next = render(processor).out;
  assert.equal(next[0][0], input[32]);
  assert.equal(next[1][0], input[33]);
});

test('backlog discards old remaining frames rather than keeping the stream delayed', () => {
  const processor = queue();
  send(processor, stereo(600));
  render(processor, 128);
  send(processor, stereo(600, 2));
  const { out } = render(processor);
  assert.equal(out[0][0], 2);
  assert.equal(out[1][0], Math.fround(2.001));
});

test('invalid chunks are ignored and underruns rebuffer without replaying exhausted audio', () => {
  const processor = queue();
  for (const value of [null, [1, 2], new Float32Array(3), 'audio']) send(processor, value);
  assert(render(processor).out.every((channel) => channel.every((value) => value === 0)));
  send(processor, stereo(60, 1));
  render(processor, 64);
  send(processor, stereo(20, 3));
  assert(render(processor).out.every((channel) => channel.every((value) => value === 0)));
  send(processor, stereo(40, 4));
  assert.equal(render(processor).out[0][0], 3);
});

test('light noise attenuates quiet gaps, retains speech and hold, and stops on destruction', () => {
  const processor = loadWorklet(filename('light-noise'));
  function level(value, blocks) {
    let output;
    for (let i = 0; i < blocks; i++) {
      output = render(processor, 128, 1, [[new Float32Array(128).fill(value)]]).out[0];
      assert(output.every(Number.isFinite));
    }
    return Math.abs(output.at(-1) / value);
  }
  const quiet = level(0.0001, 1200);
  assert(quiet > 0.17 && quiet < 0.25);
  assert(level(0.2, 100) > 0.95);
  assert(level(0.0001, 30) > 0.95, 'short pauses retain the speech hold');
  assert(level(0.0001, 300) < 0.3);
  send(processor, 'destroy');
  assert.equal(render(processor).active, false);
});

test('light noise tolerates disconnected ports without ending an active processor', () => {
  const processor = loadWorklet(filename('light-noise'));
  assert.equal(processor.process([], []), true);
  assert.equal(processor.process([[]], [[]]), true);
});
