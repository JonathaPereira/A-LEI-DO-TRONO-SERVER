'use strict';
if(window.TronoDesktop){
  const native=window.TronoDesktop,pipes=new Map(),moduleURL=new URL('application-audio-worklet.js',document.currentScript.src);
  native.onApplicationAudio(data=>{
    const pipe=pipes.get(data.id);
    if(data.type==='chunk'){try{if(pipe){const bytes=new Uint8Array(data.bytes),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),audio=new Float32Array(bytes.length/2);for(let i=0;i<audio.length;i++)audio[i]=view.getInt16(i*2,true)/32768;pipe.node.port.postMessage(audio,[audio.buffer]);}}finally{native.ackApplicationAudio(data.id);}}
    else if(data.type==='ended'&&pipe){void pipe.close();window.dispatchEvent(new CustomEvent('trono-application-audio-ended'));}
  });
  window.TronoApplicationAudio={async create(info){
    const context=new AudioContext({sampleRate:info.sampleRate});let node,track,closed=false;
    const close=async()=>{if(closed)return;closed=true;pipes.delete(info.id);node?.disconnect();track?.stop();await context.close().catch(()=>{});await native.stopApplicationAudio(info.id).catch(()=>{});};
    try{await context.audioWorklet.addModule(moduleURL);node=new AudioWorkletNode(context,'mn-application-audio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});const destination=context.createMediaStreamDestination();node.connect(destination);track=destination.stream.getAudioTracks()[0];const originalStop=track.stop.bind(track);track.stop=()=>{originalStop();void close();};pipes.set(info.id,{node,close});await context.resume();return {track,close};}
    catch(error){await close();throw error;}
  }};
}
