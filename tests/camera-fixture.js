'use strict';

// Layout tests need a stable live video source across resizes and repeated opens.
// Chromium's fake camera may disappear on Windows; microphone capture stays native/fake-device.
function installCanvasCamera() {
  const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const sources = new Set();
  navigator.mediaDevices.getUserMedia = async options => {
    if (!options.video) return capture(options);
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext('2d');
    let frame = 0;
    const paint = () => {
      context.fillStyle = frame++ % 2 ? '#284668' : '#456886';
      context.fillRect(0, 0, canvas.width, canvas.height);
    };
    paint();
    const stream = canvas.captureStream(30), video = stream.getVideoTracks()[0];
    const timer = setInterval(paint, 1000 / 30), stop = video.stop.bind(video);
    sources.add(canvas);
    video.stop = () => { clearInterval(timer); sources.delete(canvas); stop(); };
    if (options.audio)
      for (const track of (await capture({ audio: options.audio })).getTracks()) stream.addTrack(track);
    return stream;
  };
}
module.exports = { installCanvasCamera };
