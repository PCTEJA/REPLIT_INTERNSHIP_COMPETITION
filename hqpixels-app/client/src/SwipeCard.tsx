import {useRef,useState,type ReactNode} from 'react';

export function SwipeCard({children,disabled,onComplete,onNext,onFocus}:{children:ReactNode;disabled:boolean;onComplete:()=>Promise<void>;onNext:()=>void;onFocus:()=>void}){
  const start=useRef<{x:number;y:number;id:number}|null>(null),locked=useRef(false);
  const [offset,setOffset]=useState({x:0,y:0}),[dragging,setDragging]=useState(false),[leaving,setLeaving]=useState(false);
  const reset=()=>{start.current=null;setDragging(false);setOffset({x:0,y:0});};
  const finish=async(x:number,y:number)=>{
    if(locked.current)return;
    const direction=Math.abs(x)>Math.abs(y)?(x>75?'done':x< -75?'next':null):(y< -75?'focus':null);
    if(!direction){reset();return;}
    locked.current=true;setDragging(false);setLeaving(true);setOffset(direction==='focus'?{x:0,y:-500}:{x:direction==='done'?700:-700,y:25});
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)await new Promise(resolve=>setTimeout(resolve,220));
    try{if(direction==='done')await onComplete();else if(direction==='next')onNext();else onFocus();}finally{locked.current=false;setLeaving(false);reset();}
  };
  return <article className={'hero-task swipe-card'+(dragging?' dragging':'')} tabIndex={0} aria-label="Task card. Swipe right to complete, left for next, up to focus. Arrow keys do the same." aria-busy={disabled||leaving}
    style={{transform:`translate3d(${offset.x}px,${offset.y}px,0) rotate(${offset.x/22}deg)`,opacity:leaving?0:1}}
    onKeyDown={e=>{if(disabled||locked.current)return;if(['ArrowRight','ArrowLeft','ArrowUp'].includes(e.key)){e.preventDefault();void finish(e.key==='ArrowRight'?100:e.key==='ArrowLeft'?-100:0,e.key==='ArrowUp'?-100:0);}}}
    onPointerDown={e=>{if(disabled||locked.current||!e.isPrimary||e.button!==0)return;start.current={x:e.clientX,y:e.clientY,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);}}
    onPointerMove={e=>{if(start.current?.id!==e.pointerId)return;setOffset({x:e.clientX-start.current.x,y:e.clientY-start.current.y});}}
    onPointerUp={e=>{if(start.current?.id!==e.pointerId)return;const x=e.clientX-start.current.x,y=e.clientY-start.current.y;start.current=null;void finish(x,y);}}
    onPointerCancel={reset} onLostPointerCapture={()=>{if(start.current)reset();}}>
    {dragging&&<span className="swipe-intent">{Math.abs(offset.x)>Math.abs(offset.y)?offset.x>0?'✓ Done':'Next task':offset.y<0?'↑ Focus':'Release to return'}</span>}{children}
  </article>;
}
