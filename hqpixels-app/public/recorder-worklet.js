class HQRecorder extends AudioWorkletProcessor {
  constructor(){super();this.port.onmessage=e=>{if(e.data==='stop')this.stopped=true;};this.stopped=false;}
  process(inputs){const samples=inputs[0]?.[0];if(samples&&!this.stopped)this.port.postMessage(samples.slice());return !this.stopped;}
}
registerProcessor('hq-recorder',HQRecorder);
