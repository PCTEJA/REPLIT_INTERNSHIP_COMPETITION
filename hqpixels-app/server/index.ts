import 'dotenv/config';
import { resolve } from 'node:path';
import express from 'express';
import { createApp } from './app';
import { Store } from './store';
const production=process.env.NODE_ENV==='production';
if(production && (!process.env.DATABASE_URL || !process.env.APP_ORIGIN?.startsWith('https://'))) throw new Error('Production needs DATABASE_URL and an HTTPS APP_ORIGIN. Local SQLite is for development only.');
const store=new Store(process.env.DATABASE_URL);await store.init();
// Recover interrupted runs on a single local process restart. Production runs can span instances; they expire in the UI instead.
if(!production)await store.transaction(async q=>{const rows=await q('SELECT user_id,body FROM hq_workspaces');for(const row of rows){const data=JSON.parse(row.body);for(const run of data.runs)if(run.status==='running'){run.status='error';run.error='The server restarted before this run finished. Your previous work is safe; please retry.';}await q('UPDATE hq_workspaces SET body=$1 WHERE user_id=$2',[JSON.stringify(data),row.user_id]);}});
const {app}=createApp(store,undefined,production);
if(production){app.use(express.static(resolve('dist/client')));app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/client/index.html')));}
else {const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
const server=app.listen(port,host,()=>console.log(`HQPIXELS ready at http://${host==='0.0.0.0'?'localhost':host}:${port} (${store.kind}; Google ${process.env.GEMINI_API_KEY?'configured':'not connected'})`));
process.on('SIGTERM',()=>server.close(()=>void store.close().finally(()=>process.exit(0))));
