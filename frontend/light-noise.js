'use strict';
window.TronoLightNoise=(()=>{
  const url=new URL('light-noise-worklet.js?v=112',document.currentScript.src),modules=new WeakMap();
  async function create(ctx,{onFailure=()=>{}}={}){
    if(!ctx?.audioWorklet||!window.AudioWorkletNode)throw Error('Filtro leve indisponível neste motor.');
    if(!modules.has(ctx))modules.set(ctx,ctx.audioWorklet.addModule(url).catch(error=>{modules.delete(ctx);throw error;}));
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('O filtro leve demorou para iniciar.')),8000);modules.get(ctx).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
    const node=new AudioWorkletNode(ctx,'trono-light-noise',{numberOfInputs:1,numberOfOutputs:1,channelCount:1,channelCountMode:'explicit',outputChannelCount:[1]});
    const highpass=ctx.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=75;highpass.Q.value=.707;highpass.connect(node);
    let stopped=false;const destroy=()=>{if(stopped)return;stopped=true;node.removeEventListener('processorerror',failed);highpass.disconnect();node.disconnect();node.port.postMessage('destroy');node.port.close();};
    const failed=()=>{if(!stopped){destroy();onFailure(Error('Filtro leve interrompido.'));}};node.addEventListener('processorerror',failed);
    return {input:highpass,node,destroy};
  }
  return {create};
})();
