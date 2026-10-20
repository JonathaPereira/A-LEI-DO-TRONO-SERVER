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
module.exports = { exerciseClipWorker };
