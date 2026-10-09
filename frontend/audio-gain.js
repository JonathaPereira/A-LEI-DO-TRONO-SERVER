'use strict';
// Amplified audio goes straight to AudioContext's speaker output. Replacing
// an <audio> srcObject with a generated MediaStream can produce silent playback.
window.TronoAudioGain={
 create(ctx,stream,volume){
   if(ctx.state!=='running')return null;
   const source=ctx.createMediaStreamSource(stream),gain=ctx.createGain(),limiter=ctx.createDynamicsCompressor();
   gain.gain.value=volume;
   limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=16;limiter.attack.value=.002;limiter.release.value=.08;
   source.connect(gain);gain.connect(limiter);limiter.connect(ctx.destination);
   return {ctx,source,gain,limiter,trackId:stream.getAudioTracks()[0]?.id,close(){source.disconnect();gain.disconnect();limiter.disconnect();}};
 }
};
