import { useEffect,useRef,useState } from 'react';
import { Mic,Square,RotateCcw,ArrowUpRight,X } from 'lucide-react';

function encodeWav(chunks:Float32Array[],sourceRate:number):string{
  const count=chunks.reduce((n,c)=>n+c.length,0),source=new Float32Array(count);let offset=0;for(const c of chunks){source.set(c,offset);offset+=c.length;}
  const length=Math.min(16000*60,Math.floor(count*16000/sourceRate)),buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer);
  const text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*2,true);
  // Average sample bins when downsampling to reduce high-frequency aliasing.
  for(let i=0;i<length;i++){const start=Math.floor(i*sourceRate/16000),end=Math.max(start+1,Math.floor((i+1)*sourceRate/16000));let sum=0;for(let j=start;j<Math.min(end,count);j++)sum+=source[j];const s=Math.max(-1,Math.min(1,sum/(end-start)));view.setInt16(44+i*2,s<0?s*32768:s*32767,true);}
  const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
}
export function Recorder({enabled,busy,onAudio,label='Stop & review'}:{enabled:boolean;busy:boolean;onAudio:(audio:string)=>Promise<void>;label?:string}){
  const [state,setState]=useState<'idle'|'permission'|'recording'|'stopped'>('idle'),[seconds,setSeconds]=useState(0),[level,setLevel]=useState(0),[error,setError]=useState('');
  const stream=useRef<MediaStream|null>(null),context=useRef<AudioContext|null>(null),node=useRef<AudioWorkletNode|null>(null),chunks=useRef<Float32Array[]>([]),rate=useRef(48000),audio=useRef(''),timer=useRef<ReturnType<typeof setInterval>|undefined>(undefined),generation=useRef(0);
  const cleanup=()=>{clearInterval(timer.current);node.current?.port.postMessage('stop');node.current?.disconnect();node.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;void context.current?.close();context.current=null;};
  useEffect(()=>()=>{generation.current++;cleanup();},[]);
  const stop=()=>{audio.current=encodeWav(chunks.current,rate.current);cleanup();setState('stopped');setLevel(0);};
  const start=async()=>{setError('');setState('permission');const gen=++generation.current;chunks.current=[];audio.current='';setSeconds(0);
    try{if(!navigator.mediaDevices?.getUserMedia||!window.AudioContext)throw new Error('Microphone recording needs a supported browser on HTTPS or localhost. You can type instead.');const s=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});if(gen!==generation.current){s.getTracks().forEach(t=>t.stop());return;}stream.current=s;
      const ctx=new AudioContext();context.current=ctx;rate.current=ctx.sampleRate;await ctx.audioWorklet.addModule('/recorder-worklet.js');if(gen!==generation.current)return;await ctx.resume();const recorder=new AudioWorkletNode(ctx,'hq-recorder');node.current=recorder;const source=ctx.createMediaStreamSource(s),mute=ctx.createGain();mute.gain.value=0;source.connect(recorder);recorder.connect(mute);mute.connect(ctx.destination);
      let lastLevel=0;recorder.port.onmessage=e=>{chunks.current.push(e.data);if(performance.now()-lastLevel>80){lastLevel=performance.now();const values=e.data as Float32Array;setLevel(Math.min(1,Math.sqrt(values.reduce((n,v)=>n+v*v,0)/values.length)*8));}};
      const started=performance.now();setState('recording');timer.current=setInterval(()=>{const elapsed=Math.floor((performance.now()-started)/1000);setSeconds(Math.min(60,elapsed));if(elapsed>=60)stop();},200);
    }catch(e:any){cleanup();if(gen===generation.current){setState('idle');setError(e.name==='NotAllowedError'?'Microphone permission was declined. You can enable it in your browser or type your tasks.':e.message||'The microphone could not start. Try typing instead.');}}
  };
  const cancel=()=>{generation.current++;cleanup();audio.current='';chunks.current=[];setState('idle');setSeconds(0);};
  const submit=async()=>{if(state==='recording')stop();await onAudio(audio.current);};
  return <div className="recorder">
    {!enabled?<div className="connection-note"><Mic size={22}/><div><strong>Voice is ready for Google.</strong><p>Google isn’t connected yet. Choose Type to make your plan now.</p></div></div>:<>
    <div className={'recording-card '+(state==='recording'?'is-recording':'')}><div className="eyebrow">{state==='recording'?<><span className="record-dot"/> RECORDING</>:state==='stopped'?'RECORDING READY':'YOUR NEXT PLAN STARTS HERE'}</div>
    <div className="wave" aria-hidden="true">{Array.from({length:25},(_,i)=><i key={i} style={{height:state==='recording'?`${10+level*72*Math.abs(Math.sin(i*1.7))}px`:`${8+25*Math.abs(Math.sin(i*1.7))*Math.sin(i/25*Math.PI)}px`}}/>)}</div>
    <div className="record-time">00:{String(seconds).padStart(2,'0')}</div><p>{state==='stopped'?'Ready when you are. Continue to send.':'Up to 60 seconds. No background listening.'}</p></div>
    <p className="privacy-copy">When you continue, your audio goes to Google for processing. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Google’s terms</a></p>
    {state==='idle'||state==='permission'?<button className="primary wide" onClick={()=>void start()} disabled={busy||state==='permission'}><Mic size={20}/>{state==='permission'?'Waiting for microphone…':'Start speaking'}</button>:<div className="record-actions"><button className="primary" onClick={()=>void submit().catch(e=>setError(e.message))} disabled={busy}>{state==='recording'?<Square size={18}/>:<ArrowUpRight size={18}/>} {busy?'Working…':state==='stopped'?'Continue to review':label}</button><button className="icon-button" aria-label="Cancel recording" onClick={cancel} disabled={busy}><X size={20}/></button>{state==='stopped'&&<button className="icon-button" aria-label="Record again" onClick={()=>void start()} disabled={busy}><RotateCcw size={19}/></button>}</div>}
    </>}{error&&<p className="inline-error" role="alert">{error}</p>}
  </div>;
}
