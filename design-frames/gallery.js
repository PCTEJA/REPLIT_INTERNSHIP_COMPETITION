"use strict";
const data = JSON.parse(document.getElementById("frameData").textContent);
const $ = id => document.getElementById(id);
const grid = $("grid"), dialog = $("viewer");
let mode = "grid", designId = data.designs[0].id, frameNo = 4, activeDesign = designId, activeFrame = 4, interval = null;
const paths = {all:data.frames.map(f=>f.n),commit:[4,5,6,9,10,11],defer:[4,7,8,4],flow:[15,16,17,18,19]};
let pathIndex = 0;
const png = (d,f) => d+"/"+String(f.n).padStart(2,"0")+"-"+f.slug+".png";
for(const d of data.designs) $("designSelect").add(new Option(d.name,d.id));
for(const f of data.frames) $("frameSelect").add(new Option(String(f.n).padStart(2,"0")+" · "+f.title,String(f.n)));
$("frameSelect").value = "4";
function makeCard(d,f) {
  const figure=document.createElement("figure");figure.className="frame";
  const button=document.createElement("button");button.setAttribute("aria-label","Open "+d.name+" frame "+f.n+": "+f.title);
  const img=document.createElement("img");img.src=png(d.id,f);img.alt=d.name+" — "+f.title;img.loading="lazy";img.decoding="async";
  const caption=document.createElement("figcaption");caption.textContent=String(f.n).padStart(2,"0")+" / "+f.title;
  const small=document.createElement("small");small.textContent=d.name+" · PNG · click to inspect";
  caption.append(small);button.append(img);figure.append(button,caption);
  button.addEventListener("click",()=>openFrame(d.id,f.n));return figure;
}
function render(){
  grid.replaceChildren();grid.classList.toggle("compare",mode==="compare");
  $("gridMode").setAttribute("aria-pressed",String(mode==="grid"));$("compareMode").setAttribute("aria-pressed",String(mode==="compare"));
  $("frameLabel").hidden=mode!=="compare";$("groupLabel").hidden=mode==="compare";$("designSelect").parentElement.hidden=mode==="compare";
  if(mode==="compare"){
    const f=data.frames.find(f=>f.n===frameNo);
    $("collectionMeta").textContent="SAME FRAME / THREE DIRECTIONS";$("collectionTitle").textContent=f.title;
    $("collectionDescription").textContent="Compare hierarchy, palette, material and personality.";
    data.designs.forEach(d=>grid.append(makeCard(d,f)));
  } else {
    const d=data.designs.find(d=>d.id===designId);
    const range=$("groupSelect").value;let frames=data.frames;
    if(range!=="all"){const [a,b]=range.split("-").map(Number);frames=frames.filter(f=>f.n>=a&&f.n<=b);}
    $("collectionMeta").textContent=frames.length+" FRAMES / "+(d.id.startsWith("01")?"RECOMMENDED DIRECTION":"ALTERNATIVE DIRECTION");
    $("collectionTitle").textContent=d.name;$("collectionDescription").textContent=d.description+".";
    frames.forEach(f=>grid.append(makeCard(d,f)));
  }
}
function stop(){if(interval)clearInterval(interval);interval=null;$("play").textContent="Play storyboard";}
function showFrame(){
  const d=data.designs.find(d=>d.id===activeDesign),f=data.frames.find(f=>f.n===activeFrame);
  $("viewMeta").textContent=d.name+" / FRAME "+String(f.n).padStart(2,"0");$("viewTitle").textContent=f.title;
  $("viewImage").src=png(d.id,f);$("viewImage").alt=d.name+" — "+f.title;
  $("openOriginal").href=png(d.id,f);$("downloadOriginal").href=png(d.id,f);
  $("viewDescription").textContent=f.n===20?"Future native widget concept. A separate native companion is required.":f.n>=15?"Engineering storyboard. Values shown are illustrative, not measured live runs.":"Visual reference for layout, state, and product personality.";
  const path=paths[$("pathSelect").value];$("pathPosition").textContent="Storyboard "+(pathIndex+1)+" / "+path.length;
}
function openFrame(d,n){stop();activeDesign=d;activeFrame=n;$("pathSelect").value="all";pathIndex=n-1;showFrame();dialog.showModal();}
function advance(delta){const path=paths[$("pathSelect").value];pathIndex=(pathIndex+delta+path.length)%path.length;activeFrame=path[pathIndex];showFrame();}
$("designSelect").addEventListener("change",e=>{designId=e.target.value;render();});
$("frameSelect").addEventListener("change",e=>{frameNo=Number(e.target.value);render();});
$("groupSelect").addEventListener("change",render);
$("gridMode").addEventListener("click",()=>{mode="grid";render();});
$("compareMode").addEventListener("click",()=>{mode="compare";render();});
$("closeViewer").addEventListener("click",()=>dialog.close());
dialog.addEventListener("close",stop);
$("previous").addEventListener("click",()=>{stop();advance(-1);});
$("next").addEventListener("click",()=>{stop();advance(1);});
$("pathSelect").addEventListener("change",()=>{stop();pathIndex=0;activeFrame=paths[$("pathSelect").value][0];showFrame();});
$("play").addEventListener("click",()=>{if(interval){stop();return;} $("play").textContent="Pause storyboard";interval=setInterval(()=>advance(1),2200);});
dialog.addEventListener("keydown",e=>{if(["INPUT","SELECT","TEXTAREA"].includes(e.target.tagName))return;if(e.key==="ArrowRight"){e.preventDefault();stop();advance(1);}if(e.key==="ArrowLeft"){e.preventDefault();stop();advance(-1);}});
render();

