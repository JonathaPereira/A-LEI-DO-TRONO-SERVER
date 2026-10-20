'use strict';
const assert = require('node:assert/strict');

/** Exercise the actual emitted worker against a short recording of a cloned test source. */
async function exerciseClipWorker(page) {
  const result = await page.evaluate(async () => {
    const source = window.TronoSocial.getLocalDisplayStream(),
      originals = source.getTracks(),
      microphone = window.TronoSocial.getLocalAudioTrack(),
      borrowed = source.clone(),
      worker = window.TronoCreateClipWorker(),
      chunks = [];
    const recorder = new MediaRecorder(borrowed, { mimeType: 'video/webm;codecs=vp8' });
    const waiters = [];
    const fail = (error) => {
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
      }
    };
    worker.onerror = () => fail(Error('Worker failed to load or execute'));
    worker.onmessage = (event) => {
      const waiter = waiters.shift();
      if (!waiter) return;
      clearTimeout(waiter.timer);
      event.data.type === 'error'
        ? waiter.reject(Error(event.data.message))
        : waiter.resolve(event.data);
    };
    const request = (data, transfer = []) =>
      new Promise((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          timer: setTimeout(() => reject(Error('Worker response timeout')), 8000),
        };
        waiters.push(waiter);
        worker.postMessage(data, transfer);
      });
    let url, video;
    try {
      const ready = await request({ type: 'init', seconds: 3, fps: 10, maxBytes: 64 * 1048576 });
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
      });
      recorder.start(100);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      recorder.stop();
      await stopped;
      const data = await new Blob(chunks).arrayBuffer();
      const status = await request({ type: 'chunk', data }, [data]);
      const transferred = data.byteLength === 0;
      const clip = await request({ type: 'clip', id: 'native-worker' });
      video = document.createElement('video');
      video.muted = true;
      url = URL.createObjectURL(clip.blob);
      const decoded = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Remuxed clip did not decode')), 8000);
        video.onloadeddata = () => {
          clearTimeout(timer);
          resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(Error('Remuxed clip is invalid'));
        };
        video.src = url;
        video.load();
      });
      return {
        ready: ready.type,
        status: status.ready,
        transferred,
        type: clip.type,
        id: clip.id,
        mime: clip.blob.type,
        bytes: clip.blob.size,
        duration: clip.duration,
        decoded,
        preserved:
          window.TronoSocial.getLocalDisplayStream() === source &&
          originals.every((track) => track.readyState === 'live') &&
          window.TronoSocial.getLocalAudioTrack() === microphone &&
          microphone.readyState === 'live',
      };
    } finally {
      if (recorder.state !== 'inactive') recorder.stop();
      borrowed.getTracks().forEach((track) => track.stop());
      worker.terminate();
      fail(Error('Worker fixture disposed'));
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      if (url) URL.revokeObjectURL(url);
    }
  });
  assert.equal(result.ready, 'ready');
  assert.equal(result.status, true);
  assert.equal(result.transferred, true);
  assert.equal(result.type, 'clip');
  assert.equal(result.id, 'native-worker');
  assert.equal(result.mime, 'video/webm');
  assert(
    result.bytes > 0 &&
      result.duration > 0 &&
      result.decoded.width > 0 &&
      result.decoded.height > 0 &&
      result.decoded.duration > 0,
    JSON.stringify(result),
  );
  assert.equal(result.preserved, true);
}
/** Exercise the typed session under native CSP, including a clip requested just before pause. */
async function exerciseReplaySession(page) {
  const result = await page.evaluate(async () => {
    const source = window.TronoSocial.getLocalDisplayStream(),
      originals = source.getTracks(),
      microphone = window.TronoSocial.getLocalAudioTrack();
    let clip, failure, session, release, video, url;
    const persistence = new Promise((resolve) => {
      release = resolve;
    });
    const until = async (predicate) => {
      const deadline = performance.now() + 10000;
      while (!predicate()) {
        if (failure) throw Error(failure);
        if (performance.now() >= deadline) throw Error('Replay session timeout');
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    };
    try {
      session = await window.TronoCreateReplaySession({
        source,
        owner: 'native-test',
        quality: { width: 1920, height: 1080, bitrate: 16000000, label: '1080p' },
        fps: 60,
        seconds: 15,
        isCurrent: () => true,
        onStatus() {},
        async onClip(_session, value) {
          clip = value;
          await persistence;
        },
        onError(message) {
          failure = message;
        },
        onEnded() {
          failure = 'Test source ended';
        },
      });
      session.start();
      await until(() => session.status?.ready);
      session.requestClip('native-session');
      session.stop();
      await until(() => clip);
      const pendingBeforePersistence = session.pendingCount;
      release();
      await until(() => session.pendingCount === 0);
      video = document.createElement('video');
      video.muted = true;
      url = URL.createObjectURL(clip.blob);
      const decoded = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Session clip did not decode')), 8000);
        video.onloadeddata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(Error('Session clip is invalid'));
        };
      });
      video.src = url;
      video.load();
      await decoded;
      return {
        id: clip.id,
        bytes: clip.bytes,
        duration: clip.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        pendingBeforePersistence,
        pending: session.pendingCount,
        stopping: session.stopping,
        disposed: session.stream.getTracks().every((track) => track.readyState === 'ended'),
        preserved:
          window.TronoSocial.getLocalDisplayStream() === source &&
          originals.every((track) => track.readyState === 'live') &&
          window.TronoSocial.getLocalAudioTrack() === microphone &&
          microphone.readyState === 'live',
        failure,
      };
    } finally {
      release();
      session?.stop();
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      if (url) URL.revokeObjectURL(url);
    }
  });
  assert.equal(result.id, 'native-session');
  assert(
    result.bytes > 0 && result.duration > 0 && result.width > 0 && result.height > 0,
    JSON.stringify(result),
  );
  assert.equal(result.pendingBeforePersistence, 1);
  assert.equal(result.pending, 0);
  assert.equal(result.stopping, true);
  assert.equal(result.disposed, true);
  assert.equal(result.preserved, true);
  assert.equal(result.failure, undefined);
}
module.exports = { exerciseClipWorker, exerciseReplaySession };
