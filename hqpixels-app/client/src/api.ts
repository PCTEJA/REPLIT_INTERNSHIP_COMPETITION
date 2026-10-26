let csrf='';
export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export async function api<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok){const data=await response.json().catch(()=>({error:'The server is unavailable. Your text is still on this device.'}));throw new ApiError(response.status,data.error);}
  const data=await response.json();if(data.csrf)csrf=data.csrf;return data;
}
export async function readback(draftId:string,revision:number){const res=await fetch('/api/readback',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify({draftId,revision})});if(!res.ok)throw new Error((await res.json()).error);return res.blob();}
export const operationId=()=>crypto.randomUUID();
export function dateLabel(date:string|null){if(!date)return 'Unscheduled';return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',weekday:'short'}).format(new Date(date+'T12:00:00'));}
