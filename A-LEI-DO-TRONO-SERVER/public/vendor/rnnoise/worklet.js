// Mono 48 kHz microphone processing; 128-sample Web Audio blocks -> 480-sample RNNoise frames.
import {Rnnoise} from './runtime.js';
let runtimePromise;
function runtime(binary){
  if(!runtimePromise)runtimePromise=Rnnoise.loadBinary(binary).catch(error=>{runtimePromise=null;throw error;});
  return runtimePromise;
}
class TronoRnnoiseProcessor extends AudioWorkletProcessor {
  constructor(options){
    super();this.stopped=false;this.state=null;this.frame=new Float32Array(480);this.fill=0;
    this.output=new Float32Array(2048);this.read=0;this.write=0;this.available=0;this.priming=512;
    this.port.onmessage=e=>{if(e.data==='destroy')this.destroy();};
    runtime(options.processorOptions.wasmBinary).then(module=>{
      if(this.stopped)return;
      if(sampleRate!==48000||module.frameSize!==480)throw new Error('RNNoise requires mono 48 kHz, 480-sample frames.');
      this.state=module.createDenoiseState();this.port.postMessage({type:'ready'});
    }).catch(error=>{if(!this.stopped)this.port.postMessage({type:'error',message:String(error.message||error)});this.destroy();});
  }
  destroy(){this.stopped=true;this.state?.destroy();this.state=null;}
  process(inputs,outputs){
    if(this.stopped)return false;const input=inputs[0]?.[0],output=outputs[0]?.[0];
    if(!this.state||!input||!output)return true;
    try{
      for(const sample of input){
        this.frame[this.fill++]=sample*32768;
        if(this.fill===480){
          this.state.processFrame(this.frame);this.fill=0;
          for(const clean of this.frame){this.output[this.write]=clean/32768;this.write=(this.write+1)%2048;this.available++;}
        }
      }
      for(let i=0;i<output.length;i++){
        if(this.priming>0){this.priming--;output[i]=0;}
        else if(this.available>0){output[i]=this.output[this.read];this.read=(this.read+1)%2048;this.available--;}
        else output[i]=0;
      }
      return true;
    }catch(error){this.port.postMessage({type:'error',message:String(error.message||error)});this.destroy();return false;}
  }
}
registerProcessor('trono-rnnoise',TronoRnnoiseProcessor);
