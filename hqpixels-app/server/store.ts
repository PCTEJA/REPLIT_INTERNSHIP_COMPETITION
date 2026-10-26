import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { User, Workspace } from '../shared/types.js';

type Query = (sql: string, values?: unknown[]) => Promise<any[]>;
export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export const fail = (status: number, message: string): never => { throw new AppError(status, message); };
export const hash = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const freshWorkspace = (): Workspace => ({ drafts: [], tasks: [], runs: [], confirmations: [], operations: [], timezone: 'America/Chicago' });
function expireRuns(data: Workspace) {
  for (const run of data.runs) {
    if (run.status === 'running' && Date.now() - Date.parse(run.createdAt) > 90000) {
      run.status = 'error';
      run.error = 'This run timed out or the server restarted. Your earlier work is safe. Please retry.';
      run.events.push({ sequence:run.events.length+1,step:'recover',state:'error',at:new Date().toISOString(),durationMs:0,summary:run.error,origin:'server' });
    }
  }
}

export class Store {
  pool?: Pool;
  sqlite?: DatabaseSync;
  private queue = Promise.resolve();
  constructor(url?: string, file = 'data/hqpixels.sqlite') {
    if (url) this.pool = new Pool({ connectionString: url, max: 5 });
    else { if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true }); this.sqlite = new DatabaseSync(file); this.sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;'); }
  }
  get kind() { return this.pool ? 'PostgreSQL' : 'SQLite (local)'; }
  async transaction<T>(fn: (q: Query) => Promise<T>): Promise<T> {
    if (this.pool) {
      const client = await this.pool.connect();
      try { await client.query('BEGIN'); const result = await fn(async (sql, values = []) => (await client.query(sql, values)).rows); await client.query('COMMIT'); return result; }
      catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }
    const previous = this.queue; let release!: () => void;
    this.queue = new Promise<void>(r => { release = r; }); await previous;
    try {
      this.sqlite!.exec('BEGIN IMMEDIATE');
      const result = await fn(async (sql, values = []) => {
        const statement = this.sqlite!.prepare(sql.replace(/\$\d+/g, '?'));
        return statement.all(...values as any[]) as any[];
      });
      this.sqlite!.exec('COMMIT'); return result;
    } catch (e) { this.sqlite!.exec('ROLLBACK'); throw e; } finally { release(); }
  }
  async init() {
    await this.transaction(async q => {
      await q('CREATE TABLE IF NOT EXISTS hq_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, guest INTEGER NOT NULL DEFAULT 0)');
      await q('CREATE TABLE IF NOT EXISTS hq_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES hq_users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires BIGINT NOT NULL)');
      await q('CREATE TABLE IF NOT EXISTS hq_workspaces (user_id TEXT PRIMARY KEY REFERENCES hq_users(id) ON DELETE CASCADE, body TEXT NOT NULL)');
      await q('CREATE TABLE IF NOT EXISTS hq_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires BIGINT NOT NULL)');
      await q('DELETE FROM hq_sessions WHERE expires < $1', [Date.now()]);
      await q('DELETE FROM hq_limits WHERE expires < $1', [Date.now()]);
    });
  }
  async createUser(email: string, name: string, password: string, guest = false): Promise<User> {
    return this.transaction(async q => {
      if ((await q('SELECT id FROM hq_users WHERE email=$1', [email])).length) fail(409, 'That email already has an account. Sign in instead.');
      const id = randomUUID();
      await q('INSERT INTO hq_users(id,email,name,password,guest) VALUES($1,$2,$3,$4,$5)', [id, email, name, password, Number(guest)]);
      await q('INSERT INTO hq_workspaces(user_id,body) VALUES($1,$2)', [id, JSON.stringify(freshWorkspace())]);
      return { id, email, name, guest };
    });
  }
  async findUser(email: string) { return this.transaction(async q => (await q('SELECT * FROM hq_users WHERE email=$1', [email]))[0]); }
  async session(raw: string) {
    return this.transaction(async q => {
      const row = (await q('SELECT u.id,u.email,u.name,u.guest,s.csrf FROM hq_sessions s JOIN hq_users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires>$2', [hash(raw), Date.now()]))[0];
      return row ? { user: { id: row.id, email: row.email, name: row.name, guest: Boolean(row.guest) } as User, csrf: row.csrf } : null;
    });
  }
  async createSession(userId: string, token: string, csrf: string) { return this.transaction(q => q('INSERT INTO hq_sessions(token,user_id,csrf,expires) VALUES($1,$2,$3,$4)', [hash(token), userId, csrf, Date.now() + 7 * 86400000])); }
  async endSession(token: string) { return this.transaction(q => q('DELETE FROM hq_sessions WHERE token=$1', [hash(token)])); }
  async workspace(userId: string) { return this.transaction(async q => { const row = (await q('SELECT body FROM hq_workspaces WHERE user_id=$1', [userId]))[0]; if (!row) return fail(401, 'Please sign in again.'); const data=JSON.parse(row.body) as Workspace; expireRuns(data); return data; }); }
  async change<T>(userId: string, fn: (data: Workspace) => T): Promise<T> {
    return this.transaction(async q => {
      const row = (await q('SELECT body FROM hq_workspaces WHERE user_id=$1' + (this.pool ? ' FOR UPDATE' : ''), [userId]))[0];
      if (!row) return fail(401, 'Please sign in again.');
      const data = JSON.parse(row.body) as Workspace; expireRuns(data); const result = fn(data);
      data.confirmations = data.confirmations.filter(c => c.expires > Date.now()).slice(-30);
      data.runs = data.runs.slice(-60);
      await q('UPDATE hq_workspaces SET body=$1 WHERE user_id=$2', [JSON.stringify(data), userId]);
      return result;
    });
  }
  async limit(key: string, max: number, interval: number) {
    await this.transaction(async q => {
      await q('INSERT INTO hq_limits(key,count,expires) VALUES($1,0,$2) ON CONFLICT(key) DO NOTHING', [key, Date.now() + interval]);
      const row = (await q('SELECT count,expires FROM hq_limits WHERE key=$1' + (this.pool ? ' FOR UPDATE' : ''), [key]))[0];
      const expired = Number(row.expires) <= Date.now(); const count = expired ? 0 : row.count;
      if (count >= max) fail(429, 'That limit has been reached. Please try again later; manual task entry is still available.');
      await q('UPDATE hq_limits SET count=$1,expires=$2 WHERE key=$3', [count + 1, expired ? Date.now() + interval : Number(row.expires), key]);
    });
  }
  async close() { if (this.pool) await this.pool.end(); this.sqlite?.close(); }
}
