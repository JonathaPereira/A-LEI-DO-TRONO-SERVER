'use strict';

// Layout tests need a stable live video source across resizes and repeated opens.
// Chromium's fake camera may disappear on Windows; microphone capture stays native/fake-device.
function installCanvasCamera({ display = false, demo } = {}) {
  if (window.top !== window) return;
  const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const sources = new Set();
  function videoSource(kind = 'camera') {
    const canvas = document.createElement('canvas');
    canvas.width = demo && kind === 'camera' ? 640 : 1280;
    canvas.height = demo && kind === 'camera' ? 360 : 720;
    const context = canvas.getContext('2d');
    if (demo && kind === 'screen') context.scale(2, 2);
    let frame = 0;
    const paint = () => {
      context.fillStyle = frame++ % 2 ? '#284668' : '#456886';
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (demo) {
        const palette = ['#526979', '#597268', '#846879', '#6f728c'],
          shade = palette[demo.index % palette.length];
        context.fillStyle = kind === 'camera' ? shade : '#17252b';
        context.fillRect(0, 0, 640, 360);
        if (kind === 'camera') {
          context.fillStyle = '#ffffff10';
          context.fillRect(30, 35, 146, 200);
          context.strokeStyle = '#ffffff18';
          context.lineWidth = 6;
          context.beginPath();
          context.moveTo(100, 35);
          context.lineTo(100, 235);
          context.moveTo(30, 130);
          context.lineTo(176, 130);
          context.stroke();
          context.fillStyle = '#24383c';
          context.fillRect(510, 235, 48, 90);
          context.fillStyle = '#698e7b';
          for (let i = 0; i < 4; i++) {
            context.beginPath();
            context.ellipse(
              515 + (i % 2) * 35,
              200 + i * 11,
              18,
              38,
              i % 2 ? 0.7 : -0.7,
              0,
              Math.PI * 2,
            );
            context.fill();
          }
          context.fillStyle = ['#9cadba', '#aabfa0', '#ba9e91', '#a49dbb'][demo.index % 4];
          context.beginPath();
          context.ellipse(325, 366, 138, 106, 0, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#dcc0a2';
          context.fillRect(299, 247, 50, 64);
          context.fillStyle = '#302d32';
          context.beginPath();
          context.ellipse(324, 166, 92, 112, 0, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#e5c7a5';
          context.beginPath();
          context.ellipse(324, 178, 76, 96, 0, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#302d32';
          context.beginPath();
          context.ellipse(312, 99, 81, 40, -0.2, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#343239';
          for (const x of [295, 352]) {
            context.beginPath();
            context.arc(x, 178, 4, 0, Math.PI * 2);
            context.fill();
          }
          context.strokeStyle = '#a57968';
          context.lineWidth = 3;
          context.beginPath();
          context.arc(323, 212, 20, 0.2, Math.PI - 0.2);
          context.stroke();
          context.strokeStyle = '#30383d';
          context.lineWidth = 13;
          context.beginPath();
          context.arc(324, 165, 92, Math.PI, Math.PI * 2);
          context.stroke();
          context.fillRect(228, 165, 18, 66);
          context.fillRect(402, 165, 18, 66);
        } else {
          context.fillStyle = '#203338';
          context.fillRect(0, 0, 640, 63);
          context.fillStyle = '#d6b779';
          context.font = '24px Georgia';
          context.fillText(demo.index === 0 ? 'A próxima aventura' : 'Nosso mapa da noite', 28, 42);
          for (let row = 0; row < 2; row++)
            for (let col = 0; col < 4; col++) {
              const x = 28 + col * 147,
                y = 90 + row * 120;
              context.fillStyle = ['#5f7c75', '#8c7660', '#6f718d', '#7d6870'][
                (row + col + demo.index) % 4
              ];
              context.fillRect(x, y, 128, 98);
              context.fillStyle = '#ede2c6';
              context.font = '20px Georgia';
              context.fillText(
                ['A Corte', 'Azul', 'Splendor', 'Love Letter'][(col + row) % 4],
                x + 10,
                y + 40,
              );
              context.font = '11px Segoe UI';
              context.fillText('Mesa ' + (col + 1) + ' · amigos', x + 10, y + 70);
            }
        }
        context.fillStyle = '#101819cb';
        context.fillRect(0, 332, 640, 28);
        context.fillStyle = '#ddd7c5';
        context.font = '12px Segoe UI';
        context.fillText(
          (kind === 'camera' ? 'CÂMERA' : 'TRANSMISSÃO') + ' SINTÉTICA · ' + demo.name,
          16,
          351,
        );
      }
    };
    paint();
    const stream = canvas.captureStream(demo ? 8 : 30),
      video = stream.getVideoTracks()[0];
    const timer = setInterval(paint, 1000 / (demo ? 8 : 30)),
      stop = video.stop.bind(video);
    sources.add(canvas);
    video.stop = () => {
      clearInterval(timer);
      sources.delete(canvas);
      stop();
    };
    return stream;
  }
  navigator.mediaDevices.getUserMedia = async (options) => {
    if (!options.video) return capture(options);
    const stream = videoSource();
    if (options.audio)
      for (const track of (await capture({ audio: options.audio })).getTracks())
        stream.addTrack(track);
    return stream;
  };
  if (display) navigator.mediaDevices.getDisplayMedia = async () => videoSource('screen');
}
module.exports = { installCanvasCamera };
