import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve,relative,basename } from 'node:path';
import { Store,AppError } from '../server/store';
import { createApp } from '../server/app';
import { candidate,isSavePhrase,manualTasks,validateAudio } from '../server/domain';
import type { AIProvider } from '../server/google';

const disabled:AIProvider={enabled:false,speechEnabled:false,understand:async()=>{throw Error('Must not call Google in manual mode');},query:async()=>{throw Error('Must not call Google in manual mode');},speak:async()=>{throw Error('Must not call Google in manual mode');}};
async function cleanTestDirectory(dir:string){const target=resolve(dir),root=resolve(tmpdir()),rel=relative(root,target);assert.ok(rel&&!rel.startsWith('..')&&basename(target).startsWith('hq-test-'),'Refuse to remove outside the test temporary directory');await rm(target,{recursive:true,force:true});}
async function harness(provider=disabled){const store=new Store(undefined,':memory:');await store.init();const {app,settle}=createApp(store,provider);const agent=request.agent(app);const auth=await agent.post('/api/auth/guest').send({}).expect(200);const csrf=auth.body.csrf;const post=(url:string,body:any)=>agent.post('/api'+url).set('x-csrf-token',csrf).send(body);const patch=(url:string,body:any)=>agent.patch('/api'+url).set('x-csrf-token',csrf).send(body);
  const capture=async(text='Outline the essay\nEmail my tutor\nBook the study room')=>{const receipt=await post('/captures',{text,mode:'manual',operationId:randomUUID(),timezone:'America/Chicago'}).expect(202);await settle();const run=await agent.get('/api/runs/'+receipt.body.runId).expect(200);assert.equal(run.body.status,'success',JSON.stringify(run.body));const draft=await agent.get('/api/drafts/'+run.body.draftId).expect(200);return {draft:draft.body,run:run.body};};
  return {store,app,agent,csrf,post,patch,capture,settle,user:auth.body.user};
}

test('manual capture → review edits → explicit confirmation → atomic save → persistence and completion',async()=>{const h=await harness();try{
  const {draft,run}=await h.capture();assert.equal(draft.tasks.length,3);assert.equal(draft.source,'manual');assert.equal(draft.tasks[0].dueDate,null);assert.equal(draft.tasks[0].duration,null);
  assert.equal((await h.agent.get('/api/state')).body.tasks.length,0);
  assert.ok(run.events.every((e:any)=>Number.isFinite(e.durationMs)&&e.origin==='server'));
  const premature=await h.post('/drafts/'+draft.id+'/commit',{revision:1,operationId:randomUUID(),token:'x'.repeat(48)}).expect(409);assert.match(premature.body.error,/review confirmation/i);
  const tasks=structuredClone(draft.tasks);tasks[0].dueDate='2026-10-30';tasks[1].excluded=true;
  const edited=await h.patch('/drafts/'+draft.id,{revision:1,tasks,operationId:randomUUID()}).expect(200);assert.equal(edited.body.revision,2);
  const confirmation=await h.post('/drafts/'+draft.id+'/confirmation',{revision:2}).expect(200);assert.equal(confirmation.body.count,2);
  const commit={revision:2,token:confirmation.body.token,operationId:randomUUID()};const first=await h.post('/drafts/'+draft.id+'/commit',commit).expect(200);const retry=await h.post('/drafts/'+draft.id+'/commit',commit).expect(200);assert.deepEqual(first.body,retry.body);
  const state=await h.agent.get('/api/state').expect(200);assert.equal(state.body.tasks.length,2);assert.ok(state.body.tasks.every((t:any)=>t.status==='ready'));
  const t=state.body.tasks[0];const operation={version:t.version,action:'complete',confirmed:true,operationId:randomUUID()};await h.post('/tasks/'+t.id+'/action',operation).expect(200);await h.post('/tasks/'+t.id+'/action',operation).expect(200);
  assert.equal((await h.agent.get('/api/state')).body.tasks.filter((t:any)=>t.status==='done').length,1);
  await h.post('/tasks/'+t.id+'/action',{version:2,action:'reopen',confirmed:true,operationId:randomUUID()}).expect(200);
  const final=(await h.agent.get('/api/state')).body;assert.equal(final.tasks[0].status,'ready');assert.equal(final.tasks[0].completedAt,null);
  const before=final.runs.length;await h.agent.get('/api/runs/'+run.id).expect(200);await h.agent.get('/api/runs/'+run.id+'/events').expect(200).expect('Content-Type',/text\/event-stream/);assert.equal((await h.agent.get('/api/state')).body.runs.length,before);
}finally{await h.store.close();}});

test('stale draft revisions and stale confirmation are rejected, undo restores previous draft',async()=>{const h=await harness();try{const {draft}=await h.capture();const confirm=await h.post('/drafts/'+draft.id+'/confirmation',{revision:1}).expect(200);const tasks=structuredClone(draft.tasks);tasks[0].title='New title';await h.patch('/drafts/'+draft.id,{revision:1,tasks,operationId:randomUUID()}).expect(200);await h.patch('/drafts/'+draft.id,{revision:1,tasks,operationId:randomUUID()}).expect(409);await h.post('/drafts/'+draft.id+'/commit',{revision:1,token:confirm.body.token,operationId:randomUUID()}).expect(409);const undo=await h.post('/drafts/'+draft.id+'/undo',{revision:2,operationId:randomUUID()}).expect(200);assert.equal(undo.body.tasks[0].title,'Outline the essay');assert.equal(undo.body.revision,3);assert.equal((await h.agent.get('/api/state')).body.tasks.length,0);}finally{await h.store.close();}});

test('workspaces isolate drafts, runs and tasks, and require CSRF plus same-origin mutation',async()=>{const h=await harness();try{const {draft,run}=await h.capture();const other=request.agent(h.app);const auth=await other.post('/api/auth/guest').send({}).expect(200);await other.get('/api/drafts/'+draft.id).expect(404);await other.get('/api/runs/'+run.id).expect(404);await other.post('/api/drafts/'+draft.id+'/confirmation').set('x-csrf-token',auth.body.csrf).send({revision:1}).expect(404);await h.agent.post('/api/drafts/'+draft.id+'/confirmation').send({revision:1}).expect(403);await h.agent.post('/api/drafts/'+draft.id+'/confirmation').set('x-csrf-token',h.csrf).set('Origin','https://evil.example').send({revision:1}).expect(403);assert.equal((await other.get('/api/state')).body.drafts.length,0);await request(h.app).get('/api/state').expect(401);}finally{await h.store.close();}});

test('duplicate capture requests produce one run and one draft; reused key with other content fails',async()=>{const h=await harness();try{const body={text:'Read chapter one',mode:'manual',operationId:randomUUID()};const [a,b]=await Promise.all([h.post('/captures',body),h.post('/captures',body)]);assert.equal(a.status,202);assert.equal(b.status,202);assert.equal(a.body.runId,b.body.runId);await h.settle();const state=(await h.agent.get('/api/state')).body;assert.equal(state.drafts.length,1);assert.equal(state.runs.length,1);await h.post('/captures',{...body,text:'Other task'}).expect(409);}finally{await h.store.close();}});

test('validation blocks invalid dates, duplicate identifiers, empty tasks and unresolved questions',async()=>{const h=await harness();try{const {draft}=await h.capture();await h.patch('/drafts/'+draft.id,{revision:1,tasks:[{...draft.tasks[0],dueDate:'2026-02-30'}],operationId:randomUUID()}).expect(400);await h.patch('/drafts/'+draft.id,{revision:1,tasks:[draft.tasks[0],draft.tasks[0]],operationId:randomUUID()}).expect(400);await h.patch('/drafts/'+draft.id,{revision:1,tasks:[{...draft.tasks[0],title:''}],operationId:randomUUID()}).expect(400);await h.patch('/drafts/'+draft.id,{revision:1,tasks:[{...draft.tasks[0],question:'Which Friday?'}],operationId:randomUUID()}).expect(200);await h.post('/drafts/'+draft.id+'/confirmation',{revision:2}).expect(422);await h.post('/captures',{text:'x',mode:'google',operationId:randomUUID()}).expect(503);}finally{await h.store.close();}});

test('failed storage mutation rolls back the whole workspace',async()=>{const h=await harness();try{await assert.rejects(h.store.change(h.user.id,s=>{s.tasks.push({...candidate('Must not persist'),status:'ready',version:1,createdAt:new Date().toISOString(),completedAt:null,draftId:randomUUID()});throw new Error('Injected database transaction failure');}));assert.equal((await h.store.workspace(h.user.id)).tasks.length,0);}finally{await h.store.close();}});

test('late Google correction cannot overwrite a newer manual edit',async()=>{let release!:(v:any)=>void;let called!:()=>void;const waiting=new Promise<void>(r=>called=r);const provider:AIProvider={...disabled,enabled:true,understand:async(_i,current)=>{called();return new Promise(r=>{release=r;});}};const h=await harness(provider);try{const {draft}=await h.capture();const pending=h.post('/drafts/'+draft.id+'/turns',{text:'Rename the essay',mode:'google',timezone:'America/Chicago',revision:1,operationId:randomUUID()}).then(r=>r);await waiting;const tasks=structuredClone(draft.tasks);tasks[0].title='My manual edit';await h.patch('/drafts/'+draft.id,{revision:1,tasks,operationId:randomUUID()}).expect(200);release({transcript:'Rename the essay',message:'Changed',tasks:[{...draft.tasks[0],title:'Late result'},...draft.tasks.slice(1)]});assert.equal((await pending).status,409);const latest=(await h.agent.get('/api/drafts/'+draft.id)).body;assert.equal(latest.tasks[0].title,'My manual edit');assert.equal(latest.revision,2);}finally{await h.store.close();}});

test('provider failure and canceled capture preserve existing data and create no tasks',async()=>{let release!:(v:any)=>void;let started!:()=>void;const wait=new Promise<void>(r=>started=r);const provider:AIProvider={...disabled,enabled:true,understand:async()=>{started();return new Promise(r=>release=r);}};const h=await harness(provider);try{const receipt=await h.post('/captures',{text:'A thought',mode:'google',operationId:randomUUID()}).expect(202);await wait;await h.post('/runs/'+receipt.body.runId+'/cancel',{}).expect(200);release({transcript:'A thought',message:'Draft',tasks:[candidate('Do something')]});await h.settle();const state=(await h.agent.get('/api/state')).body;assert.equal(state.tasks.length,0);assert.equal(state.drafts.length,0);assert.equal(state.runs[0].status,'canceled');}finally{await h.store.close();}
  const failed=await harness({...disabled,enabled:true,understand:async()=>{throw new AppError(429,'Google quota exhausted');}});try{const r=await failed.post('/captures',{text:'Keep this',mode:'google',operationId:randomUUID()}).expect(202);await failed.settle();const run=(await failed.agent.get('/api/runs/'+r.body.runId)).body;assert.equal(run.status,'error');assert.match(run.error,/quota/);assert.equal((await failed.agent.get('/api/state')).body.drafts.length,0);}finally{await failed.store.close();}
});

test('registered accounts can log in after signing out; bad credentials fail',async()=>{const h=await harness();try{const reg=request.agent(h.app);const body={email:'test@example.com',name:'Tester',password:'test-password-only-123'};const auth=await reg.post('/api/auth/register').send(body).expect(200);await reg.post('/api/logout').set('x-csrf-token',auth.body.csrf).send({}).expect(200);await reg.get('/api/state').expect(401);await reg.post('/api/auth/login').send({...body,password:'incorrect-password'}).expect(401);await reg.post('/api/auth/login').send(body).expect(200);assert.equal((await reg.get('/api/state')).body.user.name,'Tester');}finally{await h.store.close();}});

test('local SQLite data survives closing and reopening the database',async()=>{const dir=await mkdtemp(join(tmpdir(),'hq-test-'));try{const file=join(dir,'test.sqlite');const one=new Store(undefined,file);await one.init();const user=await one.createUser('persistent@example.com','Persistent','test-hash');await one.change(user.id,s=>{s.timezone='Asia/Kolkata';});await one.close();const two=new Store(undefined,file);await two.init();assert.equal((await two.workspace(user.id)).timezone,'Asia/Kolkata');await two.close();}finally{await cleanTestDirectory(dir);}});

test('manual mode is transparent line splitting, never pretend natural-language interpretation',()=>{const tasks=manualTasks('1. Read chapter one\n- Buy milk');assert.deepEqual(tasks.map(t=>t.title),['Read chapter one','Buy milk']);assert.equal(manualTasks('Read and write')[0].title,'Read and write');assert.throws(()=>manualTasks(''),/one to twenty/);assert.throws(()=>manualTasks(Array(21).fill('x').join('\n')),/one to twenty/);assert.equal(isSavePhrase('Save these tasks'),true);for(const s of ['don’t save these tasks','save these tasks and delete one','okay','no','please do not save all'])assert.equal(isSavePhrase(s),false);assert.throws(()=>validateAudio('not-audio'),/not valid audio/);});

test('retrying a correction returns the saved result without a second provider request',async()=>{
  let calls=0;
  const provider:AIProvider={...disabled,enabled:true,understand:async(_input,current)=>{calls++;return {transcript:'Rename the essay',message:'Updated',tasks:current!.map((t,i)=>i===0?{...t,title:'Revised essay'}:t)};}};
  const h=await harness(provider);try{
    const {draft}=await h.capture();const body={text:'Rename the essay',mode:'google',revision:1,operationId:randomUUID()};
    const first=await h.post('/drafts/'+draft.id+'/turns',body).expect(200);
    const retry=await h.post('/drafts/'+draft.id+'/turns',body).expect(200);
    assert.deepEqual(retry.body,first.body);assert.equal(calls,1);assert.equal(first.body.draft.revision,2);
    await h.post('/drafts/'+draft.id+'/turns',{...body,text:'Different correction'}).expect(409);assert.equal(calls,1);
  }finally{await h.store.close();}
});

test('stalled runs become recoverable errors without creating tasks or drafts',async()=>{
  const h=await harness();try{
    await h.store.change(h.user.id,s=>{s.runs.push({id:randomUUID(),type:'capture',status:'running',createdAt:new Date(Date.now()-100000).toISOString(),events:[]});});
    const state=(await h.agent.get('/api/state').expect(200)).body;
    assert.equal(state.runs[0].status,'error');assert.match(state.runs[0].error,/timed out/);assert.equal(state.tasks.length,0);assert.equal(state.drafts.length,0);
    await h.capture('Try again');
  }finally{await h.store.close();}
});

test('audio validation accepts canonical speech-sized WAV and rejects silence, oversized duration and corrupt headers',()=>{
  const wav=(seconds:number,silent=false)=>{const b=Buffer.alloc(44+Math.floor(seconds*16000)*2);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);if(!silent)for(let i=44;i<b.length;i+=2)b.writeInt16LE(Math.round(Math.sin(i/20)*6000),i);return b;};
  const valid=wav(1);assert.equal(validateAudio(valid.toString('base64')).length,valid.length);
  assert.throws(()=>validateAudio(wav(1,true).toString('base64')),/silent/);
  assert.throws(()=>validateAudio(wav(61).toString('base64')),/60 seconds/);
  valid.writeUInt32LE(48000,24);assert.throws(()=>validateAudio(valid.toString('base64')),/supported WAV/);
});

test('direct deck save is atomic, validated, isolated and safe to retry',async()=>{
  const h=await harness();try{
    const body={text:'Write outline\nSend update',operationId:randomUUID()};
    const first=await h.post('/tasks/quick',body).expect(200);
    assert.equal(first.body.count,2);
    assert.deepEqual((await h.post('/tasks/quick',body).expect(200)).body,first.body);
    await h.post('/tasks/quick',{...body,text:'Different task'}).expect(409);
    await h.post('/tasks/quick',{text:Array(21).fill('Task').join('\n'),operationId:randomUUID()}).expect(422);
    const state=(await h.agent.get('/api/state').expect(200)).body;
    assert.equal(state.tasks.length,2);assert.ok(state.tasks.every((t:any)=>t.status==='ready'));
    assert.equal(state.drafts[0].status,'saved');
    await request(h.app).post('/api/tasks/quick').send(body).expect(401);
    await h.agent.post('/api/tasks/quick').send({...body,operationId:randomUUID()}).expect(403);
  }finally{await h.store.close();}
});

test('production guest preview creates secure, isolated and reusable sessions',async()=>{
  const store=new Store(undefined,':memory:');await store.init();
  const {app}=createApp(store,disabled,true);
  try{
    const first=await request(app).post('/api/auth/guest').send({}).expect(200);
    assert.equal(first.body.user.guest,true);
    const cookie=first.headers['set-cookie'][0];
    assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);
    const session=cookie.split(';')[0];
    const again=await request(app).post('/api/auth/guest').set('Cookie',session).send({}).expect(200);
    assert.equal(again.body.user.id,first.body.user.id);
    await request(app).get('/api/state').set('Cookie',session).expect(200);
    const other=await request(app).post('/api/auth/guest').send({}).expect(200);
    assert.notEqual(other.body.user.id,first.body.user.id);
    await request(app).post('/api/auth/guest').set('Sec-Fetch-Site','cross-site').send({}).expect(403);
    await request(app).get('/api/state').expect(401);
  }finally{await store.close();}
});
