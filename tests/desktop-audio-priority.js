'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  os = require('node:os');
const { AudioPriority } = require('../electron/audio-priority.cjs');
const audio = (pid = 2, creationTime = 100) => ({
  pid,
  creationTime,
  type: 'Utility',
  serviceName: 'audio.mojom.AudioService',
});
const videoCapture = (pid = 6, creationTime = 100) => ({
  pid,
  creationTime,
  type: 'Utility',
  serviceName: 'video_capture.mojom.VideoCaptureService',
});
const gpuProcess = (pid = 7, creationTime = 100) => ({
  pid,
  creationTime,
  type: 'GPU',
});
test('Windows priority changes only owned audio, video capture and GPU processes during voice, preserving stronger priorities and restoring on exit', () => {
  let rows = [
      audio(),
      videoCapture(),
      gpuProcess(),
      { pid: 3, creationTime: 100, type: 'Tab', name: 'Audio Service' },
      audio(4),
    ],
    calls = [];
  const priorities = new Map([
    [2, 0],
    [6, 0],
    [7, 0],
    [3, 0],
    [4, os.constants.priority.PRIORITY_HIGH],
  ]);
  const c = new AudioPriority({
    platform: 'win32',
    metrics: () => rows,
    getPriority: (pid) => priorities.get(pid),
    setPriority: (pid, p) => {
      calls.push([pid, p]);
      priorities.set(pid, p);
    },
  });
  try {
    c.setActive(true);
    assert.deepEqual(calls, [
      [2, os.constants.priority.PRIORITY_ABOVE_NORMAL],
      [6, os.constants.priority.PRIORITY_ABOVE_NORMAL],
      [7, os.constants.priority.PRIORITY_ABOVE_NORMAL],
    ]);
    c.refresh();
    assert.equal(calls.length, 3);
    assert.equal(priorities.get(3), 0);
    c.setActive(false);
    assert.equal(priorities.get(2), 0);
    assert.equal(priorities.get(6), 0);
    assert.equal(priorities.get(7), 0);
    assert.equal(priorities.get(4), os.constants.priority.PRIORITY_HIGH);
    assert.equal(c.timer, null);
    assert.throws(() => c.setActive({ pid: 3 }));
  } finally {
    c.dispose();
  }
});
test('process restarts, PID reuse, denied changes and external priority choices are safe', () => {
  let rows = [audio()],
    priority = 0;
  const calls = [];
  const c = new AudioPriority({
    platform: 'win32',
    metrics: () => rows,
    getPriority: () => priority,
    setPriority: (pid, p) => {
      calls.push([pid, p]);
      priority = p;
    },
  });
  try {
    c.setActive(true);
    priority = os.constants.priority.PRIORITY_HIGH;
    c.refresh();
    c.setActive(false);
    assert.equal(calls.length, 1, 'Do not undo a stronger user/system priority');
    priority = 0;
    c.setActive(true);
    rows = [{ pid: 2, creationTime: 200, type: 'Tab', name: 'Game' }];
    c.setActive(false);
    assert.equal(calls.length, 2, 'A recycled PID is never restored');
    rows = [audio(5, 300)];
    priority = 0;
    c.setActive(true);
    assert.equal(calls.at(-1)[0], 5);
  } finally {
    c.dispose();
  }
  const denied = new AudioPriority({
    platform: 'win32',
    metrics: () => [audio()],
    getPriority: () => 0,
    setPriority: () => {
      throw Error('Access denied');
    },
  });
  try {
    assert.equal(denied.setActive(true).status, 'unavailable');
  } finally {
    denied.dispose();
  }
  const other = new AudioPriority({
    platform: 'linux',
    metrics: () => {
      throw Error('Should not query');
    },
  });
  assert.equal(other.setActive(true).status, 'system');
  other.dispose();
});
