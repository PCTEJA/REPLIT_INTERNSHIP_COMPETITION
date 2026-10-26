import type { Request, Response } from 'express';
import { attachDatabasePool } from '@vercel/functions';
import { createApp } from '../server/app';
import { Store } from '../server/store';

let initialized: Promise<ReturnType<typeof createApp>> | undefined;
async function initialize() {
  if (!process.env.DATABASE_URL || !process.env.APP_ORIGIN?.startsWith('https://')) {
    throw new Error('Production requires DATABASE_URL and an HTTPS APP_ORIGIN.');
  }
  const store = new Store(process.env.DATABASE_URL);
  if (store.pool) attachDatabasePool(store.pool);
  await store.init();
  return createApp(store, undefined, true);
}
export default async function handler(req: Request, res: Response) {
  initialized ??= initialize().catch(error => { initialized = undefined; throw error; });
  const { app } = await initialized;
  return app(req, res);
}
