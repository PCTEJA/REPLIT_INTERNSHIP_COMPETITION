import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { waitUntil } from '@vercel/functions';
import helmet from 'helmet';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { AppError, Store, fail, hash } from './store.js';
import { applyDraft, assertRevision, dateSchema, draftSummary, editSchema, event, getDraft, getRun, inputSchema, isSavePhrase, manualTasks, now, selectedHash, validateAudio, validateTimezone, withOperation } from './domain.js';
import { GoogleProvider, type AIProvider } from './google.js';
import type { Draft, Run, User } from '../shared/types.js';

const scryptAsync = promisify(scrypt);
const cookie = 'hq_session';
const idSchema = z.string().uuid();
const revisionSchema = z.object({ revision: z.number().int().positive(), operationId: idSchema });
const authSchema = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()), password: z.string().min(10).max(128), name: z.string().trim().min(1).max(60).optional() });
async function passwordHash(password: string) { const salt = randomBytes(16).toString('hex'); const derived = await scryptAsync(password,salt,64) as Buffer; return salt + ':' + derived.toString('hex'); }
async function passwordMatches(password: string, encoded: string) { const [salt,digest] = encoded.split(':'); const actual = await scryptAsync(password,salt || 'missing-user-salt',64) as Buffer; return Boolean(digest) && timingSafeEqual(actual,Buffer.from(digest,'hex')); }
export function createApp(store: Store, provider: AIProvider = new GoogleProvider(), production = false) {
  const app = express(); const jobs = new Set<Promise<void>>();
  const config = { google: provider.enabled, tts: provider.speechEnabled, storage: store.kind, production };
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: production ? { directives: { defaultSrc:["'self'"], scriptSrc:["'self'"], styleSrc:["'self'","'unsafe-inline'"], imgSrc:["'self'",'data:','blob:'], connectSrc:["'self'"], mediaSrc:["'self'",'blob:'], fontSrc:["'self'"], objectSrc:["'none'"], frameAncestors:["'self'"], upgradeInsecureRequests: [] } } : false, crossOriginEmbedderPolicy: false }));
  app.use('/api', (req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  app.use(cookieParser());
  app.use('/api', (req,res,next) => {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    const allowed = process.env.APP_ORIGIN || (production ? '' : 'http://localhost:3000');
    if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== allowed && !( !production && ['http://127.0.0.1:3000','http://localhost:3000'].includes(origin)))) return next(new AppError(403,'This request came from another site. Please use HQPIXELS directly.'));
    if (!req.is('application/json')) return next(new AppError(415,'Send this request as JSON.'));
    next();
  });
  app.use(express.json({ limit:'14mb' }));
  app.get('/api/health', (_req,res) => res.json({ ok:true, ...config }));
  async function newSession(user: User, res: Response) {
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    await store.createSession(user.id,token,csrf);
    res.cookie(cookie,token,{ httpOnly:true, secure:production, sameSite:'lax', maxAge:7*86400000, path:'/' });
    res.json({ user,csrf,config });
  }
  app.post('/api/auth/:action', async (req,res) => {
    const action = req.params.action;
    if (!['login','register','guest'].includes(action)) return fail(404,'Not found.');
    await store.limit('auth:'+hash(req.socket.remoteAddress || 'local'), 30, 15*60000);
    if (action === 'guest') {
      const existing = req.cookies[cookie] ? await store.session(req.cookies[cookie]) : null;
      if (existing) return res.json({ ...existing,config });
      return newSession(await store.createUser('guest-'+randomUUID()+'@local.invalid','You','',true),res);
    }
    const input = authSchema.parse(req.body);
    if (action === 'register') return newSession(await store.createUser(input.email,input.name || 'Friend',await passwordHash(input.password)),res);
    const user = await store.findUser(input.email);
    if (!(await passwordMatches(input.password,user?.password || ''))) return fail(401,'Email or password is incorrect.');
    return newSession({ id:user.id,email:user.email,name:user.name,guest:false },res);
  });
  app.use('/api',async (req,res,next) => {
    const session = req.cookies[cookie] ? await store.session(req.cookies[cookie]) : null;
    if (!session) return next(new AppError(401,'Please sign in to your workspace.'));
    res.locals.user = session.user; res.locals.csrf = session.csrf;
    if (!['GET','HEAD'].includes(req.method) && req.get('x-csrf-token') !== session.csrf) return next(new AppError(403,'Your session changed. Reload HQPIXELS and try again.'));
    next();
  });
  app.get('/api/state', async (_req,res) => {
    const state = await store.workspace(res.locals.user.id);
    res.json({ user:res.locals.user,csrf:res.locals.csrf,config,timezone:state.timezone,drafts:state.drafts.map(({history,...d}) => ({...d,history:[]})),tasks:state.tasks,runs:state.runs });
  });
  app.post('/api/logout',async (req,res) => { await store.endSession(req.cookies[cookie]); res.clearCookie(cookie,{path:'/'}); res.json({ok:true}); });
  app.patch('/api/settings',async (req,res) => {
    const { timezone } = z.object({timezone:z.string().max(100)}).parse(req.body); validateTimezone(timezone);
    await store.change(res.locals.user.id,s => { s.timezone = timezone; }); res.json({timezone});
  });
  app.get('/api/export', async (_req,res) => { const data = await store.workspace(res.locals.user.id); res.set('Content-Disposition','attachment; filename="hqpixels-tasks.json"').json({exportedAt:now(),timezone:data.timezone,tasks:data.tasks,drafts:data.drafts.map(({history,...d})=>d)}); });

  async function aiLimit(userId: string) { await store.limit('ai-user:'+userId, Number(process.env.AI_DAILY_LIMIT || 30),86400000); await store.limit('ai-global',Number(process.env.AI_GLOBAL_DAILY_LIMIT || 300),86400000); }
  function enqueue(fn: () => Promise<void>) { const p = Promise.resolve().then(fn); jobs.add(p); if (process.env.VERCEL) waitUntil(p); void p.finally(() => jobs.delete(p)).catch(()=>{}); }
  async function failed(userId: string, runId: string, e: unknown) {
    try { await store.change(userId,s => { const r = getRun(s,runId); if (r.status !== 'running') return; r.status='error'; r.error=e instanceof AppError ? e.message : 'This run could not finish. Your existing work is safe. Please try again.'; event(r,'recover','error',performance.now(),r.error); }); } catch { /* Persistent storage unavailable: client retains its input and reports connection failure. */ }
  }
  app.post('/api/captures',async (req,res) => {
    const input = inputSchema.parse(req.body); validateTimezone(input.timezone);
    if (input.audio) { if (input.mode !== 'google') fail(400,'Voice input requires Google mode.'); validateAudio(input.audio); }
    if (input.mode === 'google' && !provider.enabled) fail(503,'Google is not connected. Type one task per line to continue manually.');
    const uid=res.locals.user.id; const requestHash = {action:'capture',...input,audio:input.audio ? hash(input.audio) : undefined};
    const receipt = await store.change(uid,s => withOperation(s,input.operationId,requestHash,() => {
      if (s.drafts.filter(d=>d.status==='draft').length >= 20) return fail(429,'You have 20 drafts. Save or discard a draft before creating another.');
      if (s.runs.some(r=>r.status==='running')) return fail(409,'Finish or cancel the current run first.');
      const run: Run = {id:randomUUID(),type:'capture',status:'running',createdAt:now(),events:[]};
      event(run,'receive_input','success',performance.now(),input.audio ? 'Recording received; audio kept only in memory.' : `${input.text!.length} characters received.`);
      s.runs.push(run); s.timezone=input.timezone;
      return {runId:run.id};
    }));
    // Only launch once in this process; retry receipts return the same run, including failures.
    const shouldLaunch=await store.change(uid,s=>{const r=getRun(s,receipt.runId);if(r.status!=='running'||r.events.length!==1)return false;event(r,'validate_input','success',performance.now(),'Input limits and format checked.');return true;});
    if (shouldLaunch) {
      const launchKey=uid+receipt.runId;
      if (!active.has(launchKey)) { active.add(launchKey); enqueue(async()=>{
        try {
          const start=performance.now();
          await store.change(uid,s=>event(getRun(s,receipt.runId),'understand_input','running',start,input.mode==='manual'?'Preparing your lines without AI.':'Google is interpreting your input.'));
          if (input.mode==='google') await aiLimit(uid);
          const result=input.mode==='manual' ? {tasks:manualTasks(input.text!),transcript:input.text!,message:'One line became one task. Dates and estimates are yours to set.'} : await provider.understand(input);
          await store.change(uid,s=>{
            const r=getRun(s,receipt.runId); if(r.status!=='running')return;
            event(r,'understand_input','success',start,input.mode==='manual'?'Manual line-based entry. No Google request was made.':`${result.tasks.length} candidates returned by Google.`);
            if(!result.tasks.length) return fail(422,result.message || 'No tasks found. Try another thought or type your tasks.');
            event(r,'validate_tasks','success',performance.now(),`${result.tasks.length} draft tasks validated. Nothing active yet.`);
            const d:Draft={id:randomUUID(),revision:1,transcript:result.transcript,tasks:result.tasks,status:'draft',source:input.mode,createdAt:now(),updatedAt:now(),history:[],runId:r.id,message:result.message};
            s.drafts.push(d);r.draftId=d.id;r.status='success'; event(r,'save_draft','success',performance.now(),'Draft queued for the database transaction; success is returned after commit.');
          });
        }catch(e){await failed(uid,receipt.runId,e);}finally{active.delete(launchKey);}
      }); }
    }
    res.status(202).json(receipt);
  });
  const active = new Set<string>();
  app.get('/api/runs/:id',async(req,res)=>res.json(getRun(await store.workspace(res.locals.user.id),req.params.id)));
  app.get('/api/runs/:id/events',async(req,res)=>{
    const uid=res.locals.user.id,id=req.params.id;getRun(await store.workspace(uid),id);
    res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.flushHeaders();
    let last=Number(req.get('Last-Event-ID')||0),busy=false,closed=false;
    const send=async()=>{if(busy||closed)return;busy=true;try{const r=getRun(await store.workspace(uid),id);for(const e of r.events.filter(e=>e.sequence>last)){res.write(`id: ${e.sequence}\ndata: ${JSON.stringify(e)}\n\n`);last=e.sequence;}if(r.status!=='running'){res.write(`event: finished\ndata: ${JSON.stringify({status:r.status,draftId:r.draftId,error:r.error})}\n\n`);clearInterval(timer);res.end();}else res.write(': heartbeat\n\n');}catch{clearInterval(timer);res.end();}finally{busy=false;}};
    const timer=setInterval(()=>void send(),1000);res.on('close',()=>{closed=true;clearInterval(timer);});await send();
  });
  app.post('/api/runs/:id/cancel',async(req,res)=>{await store.change(res.locals.user.id,s=>{const r=getRun(s,req.params.id);if(r.status==='running'){r.status='canceled';event(r,'cancel','success',performance.now(),'Canceled. Later results will be discarded.');}});res.json({ok:true});});
  app.post('/api/runs/:id/displayed',async(req,res)=>{const input=z.object({durationMs:z.number().min(0).max(60000)}).parse(req.body);await store.change(res.locals.user.id,s=>{const r=getRun(s,req.params.id);if(r.status==='success'&&r.draftId&&!r.events.some(e=>e.step==='render_review'))r.events.push({sequence:r.events.length+1,step:'render_review',state:'success',at:now(),durationMs:Math.round(input.durationMs),summary:'Review displayed after data arrived (client measured).',origin:'client'});});res.json({ok:true});});
  app.get('/api/drafts/:id',async(req,res)=>res.json(getDraft(await store.workspace(res.locals.user.id),req.params.id)));
  app.patch('/api/drafts/:id',async(req,res)=>{const input=editSchema.parse(req.body);const result=await store.change(res.locals.user.id,s=>withOperation(s,input.operationId,{action:'edit',id:req.params.id,...input},()=>applyDraft(s,req.params.id,input.revision,input.tasks)));res.json(result);});
  app.post('/api/drafts/:id/undo',async(req,res)=>{const input=revisionSchema.parse(req.body);res.json(await store.change(res.locals.user.id,s=>withOperation(s,input.operationId,{action:'undo',id:req.params.id,...input},()=>{const d=getDraft(s,req.params.id);assertRevision(d,input.revision);const tasks=d.history.pop();if(!tasks)return fail(409,'There is no earlier draft change to undo.');d.tasks=tasks;d.revision++;d.updatedAt=now();s.confirmations=s.confirmations.filter(c=>c.draftId!==d.id);return d;})));});
  app.post('/api/drafts/:id/discard',async(req,res)=>{const input=revisionSchema.parse(req.body);await store.change(res.locals.user.id,s=>withOperation(s,input.operationId,{action:'discard',id:req.params.id,...input},()=>{const d=getDraft(s,req.params.id);assertRevision(d,input.revision);s.drafts=s.drafts.filter(x=>x.id!==d.id);s.confirmations=s.confirmations.filter(c=>c.draftId!==d.id);return {ok:true};}));res.json({ok:true});});
  app.post('/api/drafts/:id/confirmation',async(req,res)=>{
    const {revision}=z.object({revision:z.number().int().positive()}).parse(req.body);
    res.json(await store.change(res.locals.user.id,s=>{const d=getDraft(s,req.params.id);assertRevision(d,revision);const chosen=d.tasks.filter(t=>!t.excluded);if(!chosen.length)return fail(422,'Keep at least one task before saving.');if(chosen.some(t=>t.question))return fail(422,'Resolve the questions on your tasks before saving.');const c={token:randomBytes(24).toString('hex'),draftId:d.id,revision,hash:selectedHash(d),expires:Date.now()+10*60000};s.confirmations.push(c);return {token:c.token,summary:draftSummary(d),count:chosen.length};}));
  });
  app.post('/api/drafts/:id/commit',async(req,res)=>{
    const input=z.object({revision:z.number().int().positive(),operationId:idSchema,token:z.string().length(48)}).parse(req.body);
    res.json(await store.change(res.locals.user.id,s=>withOperation(s,input.operationId,{action:'commit',id:req.params.id,...input},()=>{
      const d=getDraft(s,req.params.id);assertRevision(d,input.revision);const c=s.confirmations.find(c=>c.token===input.token&&c.draftId===d.id&&c.revision===d.revision&&c.hash===selectedHash(d)&&c.expires>Date.now());if(!c)return fail(409,'The review confirmation expired or changed. Review these tasks again.');
      const tasks=d.tasks.filter(t=>!t.excluded);if(!tasks.length||tasks.some(t=>t.question))return fail(422,'Resolve your draft before saving.');if(s.tasks.length+tasks.length>500)return fail(429,'This workspace has reached its 500-task limit. Export your work before starting another workspace.');
      for(const t of tasks){if(s.tasks.some(x=>x.id===t.id))return fail(409,'This task has already been saved.');s.tasks.push({...t,status:'ready',version:1,createdAt:now(),completedAt:null,draftId:d.id});}
      d.status='saved';d.history=[];d.revision++;d.updatedAt=now();s.confirmations=s.confirmations.filter(c=>c.draftId!==d.id);
      const r:Run={id:randomUUID(),type:'commit',status:'success',createdAt:now(),events:[],draftId:d.id};event(r,'commit_tasks','success',performance.now(),`${tasks.length} reviewed tasks activated atomically. No tasks completed.`);s.runs.push(r);
      return {count:tasks.length,ids:tasks.map(t=>t.id)};
    })));
  });
  app.post('/api/drafts/:id/turns',async(req,res)=>{
    const input=inputSchema.and(z.object({revision:z.number().int().positive()})).parse(req.body);validateTimezone(input.timezone);if(input.audio)validateAudio(input.audio);
    const uid=res.locals.user.id,id=req.params.id;
    if(!provider.enabled)return fail(503,'Google corrections are not connected yet. Use the edit controls on each task.');
    const requestHash=hash({action:'turn',id,revision:input.revision,text:input.text,audio:input.audio?hash(input.audio):undefined,timezone:input.timezone});
    const reservation=await store.change(uid,s=>{
      const previous=s.operations.find(o=>o.id===input.operationId);
      if(previous){if(previous.hash!==requestHash)fail(409,'This request ID was already used for another action.');const result=previous.result as any;if(result?.pending){const r=getRun(s,result.runId);return fail(409,r.status==='running'?'This correction is already processing. Please wait before retrying.':r.error||'That correction did not finish. Use a new correction request to try again.');}return {cached:true,result:previous.result};}
      const current=getDraft(s,id);assertRevision(current,input.revision);
      if(s.runs.some(r=>r.status==='running'))return fail(409,'Finish or cancel the current run first.');
      if(s.operations.length>=10000)return fail(429,'This workspace has reached its operation limit.');
      const runId=randomUUID();s.runs.push({id:runId,type:'correction',status:'running',createdAt:now(),events:[],draftId:id});event(getRun(s,runId),'understand_input','running',performance.now(),'Interpreting a correction. Existing draft is preserved.');s.operations.push({id:input.operationId,hash:requestHash,result:{pending:true,runId}});return {cached:false,runId,current:structuredClone(current)};
    });
    if(reservation.cached)return res.json(reservation.result);
    const runId=reservation.runId!,current=reservation.current!;
    const start=performance.now();
    try{
      await aiLimit(uid);const output=await provider.understand(input,current.tasks);
      const result=await store.change(uid,s=>{
        const d=getDraft(s,id);assertRevision(d,input.revision);const r=getRun(s,runId);if(r.status!=='running')return fail(409,'This correction was canceled.');
        const unchanged=JSON.stringify(output.tasks)===JSON.stringify(current.tasks);
        const value=unchanged?d:applyDraft(s,id,input.revision,output.tasks);value.message=output.message;
        r.status='success';event(r,'revise_draft','success',start,unchanged?'Draft unchanged.':`Draft updated to revision ${value.revision}. Review before saving.`);
        const result={draft:value,confirmRequested:unchanged&&isSavePhrase(output.transcript),transcript:output.transcript};
        s.operations.find(o=>o.id===input.operationId)!.result=result;return result;
      });res.json(result);
    }catch(e){await failed(uid,runId,e);throw e;}
  });
  app.post('/api/task-queries',async(req,res)=>{
    const input=inputSchema.parse(req.body);validateTimezone(input.timezone);if(input.audio)validateAudio(input.audio);
    const uid=res.locals.user.id,tasks=(await store.workspace(uid)).tasks.filter(t=>t.status==='ready');
    if(!provider.enabled||input.mode==='manual'){
      if(input.audio)return fail(503,'Google voice is not connected yet. Search by typing a task name.');
      const phrase=input.text!.trim().toLowerCase();return res.json({ids:tasks.filter(t=>t.title.toLowerCase().includes(phrase)).map(t=>t.id),intent:'show',message:'Matching task names',transcript:input.text});
    }
    await aiLimit(uid);res.json(await provider.query(input,tasks));
  });
  app.post('/api/tasks/quick',async(req,res)=>{
    const input=z.object({text:z.string().trim().min(1).max(8000),operationId:idSchema}).parse(req.body);
    res.json(await store.change(res.locals.user.id,s=>withOperation(s,input.operationId,{action:'quick',...input},()=>{
      const tasks=manualTasks(input.text);if(s.tasks.length+tasks.length>500)return fail(429,'This workspace has reached its 500-task limit.');
      const draftId=randomUUID(),runId=randomUUID();
      s.drafts.push({id:draftId,revision:1,transcript:input.text,tasks,status:'saved',source:'manual',createdAt:now(),updatedAt:now(),history:[],runId,message:'Saved directly from the deck.'});
      for(const t of tasks)s.tasks.push({...t,status:'ready',version:1,createdAt:now(),completedAt:null,draftId});
      const run:Run={id:runId,type:'commit',status:'success',createdAt:now(),events:[],draftId};event(run,'quick_save','success',performance.now(),`${tasks.length} tasks explicitly saved from the deck.`);s.runs.push(run);
      return {count:tasks.length,ids:tasks.map(t=>t.id)};
    })));
  });
  app.post('/api/tasks/:id/action',async(req,res)=>{
    const input=z.object({operationId:idSchema,version:z.number().int().positive(),action:z.enum(['complete','reopen','archive','restore','reschedule']),dueDate:dateSchema.nullable().optional(),confirmed:z.literal(true)}).parse(req.body);
    res.json(await store.change(res.locals.user.id,s=>withOperation(s,input.operationId,{id:req.params.id,...input},()=>{
      const t=s.tasks.find(t=>t.id===req.params.id)??fail(404,'Task not found.');if(t.version!==input.version)fail(409,'This task changed. Reload it before trying again.');
      if(input.action==='complete'){if(t.status!=='ready')fail(409,'This task is not active.');t.status='done';t.completedAt=now();}
      if(input.action==='reopen'){if(t.status!=='done')fail(409,'This task is not completed.');t.status='ready';t.completedAt=null;}
      if(input.action==='archive'){if(t.status!=='ready')fail(409,'Only active tasks can be set aside.');t.status='archived';}
      if(input.action==='restore'){if(t.status!=='archived')fail(409,'This task is not set aside.');t.status='ready';}
      if(input.action==='reschedule'){if(t.status!=='ready')fail(409,'Reopen the task before rescheduling.');if(input.dueDate===undefined)fail(400,'Choose a date or leave the task unscheduled.');t.dueDate=input.dueDate??null;}
      t.version++;const r:Run={id:randomUUID(),type:'action',status:'success',createdAt:now(),events:[]};event(r,input.action,'success',performance.now(),'User-confirmed task change saved.');s.runs.push(r);return t;
    })));
  });
  app.post('/api/readback',async(req,res)=>{const {draftId,revision}=z.object({draftId:idSchema,revision:z.number().int().positive()}).parse(req.body);const d=getDraft(await store.workspace(res.locals.user.id),draftId);assertRevision(d,revision);await aiLimit(res.locals.user.id);const audio=await provider.speak(draftSummary(d));res.type('audio/wav').send(audio);});
  app.use('/api',(_req,_res,next)=>next(new AppError(404,'That action was not found.')));
  app.use((error:any,_req:Request,res:Response,_next:NextFunction)=>{
    if(res.headersSent)return res.end();
    if(error instanceof z.ZodError)return res.status(400).json({error:error.issues.map(i=>i.message).join(' ')});
    if(error instanceof AppError)return res.status(error.status).json({error:error.message});
    if(error.type==='entity.too.large')return res.status(413).json({error:'That recording or note is too large.'});
    if(error.type==='entity.parse.failed')return res.status(400).json({error:'The request was not valid JSON.'});
    console.error('HQ request failed:',error.code || error.name || 'unknown');res.status(503).json({error:'The server could not save this change. Your draft is still available; please retry.'});
  });
  return {app,settle:async()=>{await Promise.allSettled([...jobs]);}};
}
