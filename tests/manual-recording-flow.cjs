'use strict';
const assert = require('node:assert/strict');
const { expect } = require('@playwright/test');
/** Real encoder/mixer, with a deferred destination picker. Used in Edge and Electron. */
async function exerciseManualRecording(page, { desktop = false, exportBytes = false } = {}) {
  let mediaWasOpen = false;
  await page.evaluate(() => {
    const media = navigator.mediaDevices;
    window.__manualBaseline = {
      capture: media.getDisplayMedia,
      picker: window.showDirectoryPicker,
      mic: window.TronoSocial.getLocalAudioTrack(),
      source: window.TronoSocial.getLocalDisplayStream(),
    };
    media.getDisplayMedia = async (options) => {
      window.__manualCaptureGesture = navigator.userActivation.isActive;
      const stream = await window.__manualBaseline.capture.call(media, options);
      window.__manualLastSource = stream;
      return stream;
    };
    window.showDirectoryPicker = () => {
      window.__manualPickerGesture = navigator.userActivation.isActive;
      return new Promise((resolve) => {
        window.__manualResolveDirectory = resolve;
      });
    };
  });
  try {
    if (desktop) {
      await page.evaluate(() => window.TronoCallSettings.open('game'));
      mediaWasOpen = await page.locator('[data-game-group="media"]').evaluate((node) => {
        const previous = node.closest('details').open;
        node.closest('details').open = true;
        return previous;
      });
    } else await page.evaluate(() => window.TronoPortal.showOnly('gameScreen'));
    await page.locator('#recordMatchBtn').click();
    await expect
      .poll(() => page.evaluate(() => window.TronoRecorder.getSnapshot().phase))
      .toBe('recording');
    await page.waitForTimeout(1200);
    await page.locator(desktop ? '#recordMatchBtn' : '#recordingStopBtn').click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__manualLastSource.getTracks().every((track) => track.readyState === 'ended'),
        ),
      )
      .toBe(true);
    assert.equal(await page.evaluate(() => window.TronoRecorder.getSnapshot().phase), 'stopping');
    await expect(page.locator('#recordMatchBtn')).toBeDisabled();
    await page.evaluate(() =>
      window.__manualResolveDirectory({
        async getDirectoryHandle() {
          return {
            async getFileHandle() {
              return {
                async createWritable() {
                  return {
                    async write(blob) {
                      window.__manualSavedBlob = blob;
                    },
                    async close() {
                      window.__manualFileClosed = true;
                    },
                    async abort() {
                      throw Error('native fixture write should not abort');
                    },
                  };
                },
              };
            },
          };
        },
      }),
    );
    await expect
      .poll(() => page.evaluate(() => window.TronoRecorder.getSnapshot().phase))
      .toBe('idle');
    const result = await page.evaluate(async () => {
      const blob = window.__manualSavedBlob,
        video = document.createElement('video'),
        url = URL.createObjectURL(blob);
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error('Manual recording did not decode')), 8000);
          video.onloadeddata = () => {
            clearTimeout(timer);
            resolve();
          };
          video.onerror = () => {
            clearTimeout(timer);
            reject(Error('Invalid manual recording'));
          };
          video.muted = true;
          video.src = url;
          video.load();
        });
        return {
          bytes: blob.size,
          type: blob.type,
          width: video.videoWidth,
          height: video.videoHeight,
          fileClosed: window.__manualFileClosed,
          captureGesture: window.__manualCaptureGesture,
          pickerGesture: window.__manualPickerGesture,
          micPreserved:
            window.TronoSocial.getLocalAudioTrack() === window.__manualBaseline.mic &&
            window.__manualBaseline.mic.readyState === 'live',
          sourcePreserved:
            window.TronoSocial.getLocalDisplayStream() === window.__manualBaseline.source &&
            (!window.__manualBaseline.source ||
              window.__manualBaseline.source
                .getTracks()
                .every((track) => track.readyState === 'live')),
        };
      } finally {
        video.pause();
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      }
    });
    assert(result.bytes > 0 && result.width > 0 && result.height > 0, JSON.stringify(result));
    assert.equal(result.fileClosed, true);
    assert.equal(result.captureGesture, true);
    assert.equal(result.pickerGesture, true);
    assert.equal(result.micPreserved, true);
    assert.equal(result.sourcePreserved, true);
    return exportBytes
      ? Buffer.from(
          await page.evaluate(async () => [
            ...new Uint8Array(await window.__manualSavedBlob.arrayBuffer()),
          ]),
        )
      : result;
  } finally {
    await page.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = window.__manualBaseline.capture;
      window.showDirectoryPicker = window.__manualBaseline.picker;
      void window.TronoRecorder.stop(false);
      delete window.__manualSavedBlob;
      delete window.__manualFileClosed;
      delete window.__manualResolveDirectory;
      delete window.__manualBaseline;
    });
    if (desktop) {
      await page.locator('[data-game-group="media"]').evaluate((node, open) => {
        node.closest('details').open = open;
      }, mediaWasOpen);
      await page.evaluate(() => window.TronoCallSettings.close());
    }
  }
}
module.exports = { exerciseManualRecording };
