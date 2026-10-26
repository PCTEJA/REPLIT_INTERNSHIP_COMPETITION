import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Candidate, Draft, Run, Workspace } from '../shared/types';
import { fail, hash } from './store';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s + 'T12:00:00Z'); return Number.isFinite(+d) && d.toISOString().slice(0,10) === s; }, 'Choose a real calendar date.');
export const candidateSchema = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200), dueDate: dateSchema.nullable(), duration: z.number().int().min(1).max(1440).nullable(), note: z.string().max(1000), question: z.string().max(400), excluded: z.boolean() });
export const editSchema = z.object({ revision: z.number().int().positive(), tasks: z.array(candidateSchema).min(1).max(20), operationId: z.string().uuid() }).refine(v => new Set(v.tasks.map(t => t.id)).size === v.tasks.length, 'Task identifiers must be unique.');
export const inputSchema = z.object({ text: z.string().max(8000).optional(), audio: z.string().max(14000000).optional(), mode: z.enum(['manual', 'google']).default('manual'), timezone: z.string().max(100).default('America/Chicago'), operationId: z.string().uuid() }).refine(v => Boolean(v.text?.trim()) !== Boolean(v.audio), 'Provide either text or a recording.');
export const now = () => new Date().toISOString();
export const candidate = (title = ''): Candidate => ({ id: randomUUID(), title, dueDate: null, duration: null, note: '', question: '', excluded: false });
export const localDate = (zone: string, time = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
export function validateTimezone(zone: string) { try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { fail(400, 'Choose a valid timezone.'); } }
export function manualTasks(text: string): Candidate[] {
  const lines = text.split(/\r?\n/).map(t => t.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  if (!lines.length || lines.length > 20) return fail(422, 'Enter one to twenty tasks, one per line.');
  if (lines.some(t => t.length > 200)) return fail(422, 'Keep each task under 200 characters, or split it into separate lines.');
  return lines.map(t => candidate(t));
}
export function getDraft(data: Workspace, id: string): Draft { return data.drafts.find(d => d.id === id) ?? fail(404, 'Draft not found.'); }
export function getRun(data: Workspace, id: string): Run { return data.runs.find(r => r.id === id) ?? fail(404, 'Run not found.'); }
export function assertRevision(d: Draft, revision: number) { if (d.status !== 'draft' || d.revision !== revision) fail(409, 'This draft changed. Reload the latest version before saving your changes.'); }
export function withOperation<T>(data: Workspace, id: string, request: unknown, fn: () => T): T {
  const digest = hash(request); const previous = data.operations.find(o => o.id === id);
  if (previous) { if (previous.hash !== digest) fail(409, 'This request ID was already used for a different action.'); return previous.result as T; }
  if (data.operations.length >= 10000) fail(429, 'This workspace has reached its operation limit. Export your tasks before creating a new workspace.');
  const result = fn(); data.operations.push({ id, hash: digest, result }); return result;
}
export function applyDraft(data: Workspace, id: string, revision: number, tasks: Candidate[]) {
  const d = getDraft(data, id); assertRevision(d, revision);
  d.history.push(structuredClone(d.tasks)); d.history = d.history.slice(-20); d.tasks = tasks; d.revision++; d.updatedAt = now();
  data.confirmations = data.confirmations.filter(c => c.draftId !== id); return d;
}
export function selectedHash(d: Draft) { return hash(d.tasks.filter(t => !t.excluded)); }
export function draftSummary(d: Draft) { return d.tasks.filter(t => !t.excluded).map((t,i) => `${i+1}. ${t.title}${t.dueDate ? ` — ${t.dueDate}` : ' — unscheduled'}${t.duration ? `, ${t.duration} minutes` : ''}`).join('\n'); }
export function event(run: Run, step: string, state: 'running' | 'success' | 'error', start: number, summary: string, origin: 'server' | 'client' = 'server') { run.events.push({ sequence: run.events.length + 1, step, state, at: now(), durationMs: Math.max(0, Math.round(performance.now() - start)), summary, origin }); }
export function isSavePhrase(s: string) { return /^(?:please )?(?:save (?:these(?: \d+)? tasks|all(?: (?:three|\d+))?(?: tasks)?|the (?:three|\d+) tasks)|confirm (?:these tasks|all tasks))[.!]?$/i.test(s.trim()); }

// Only our canonical uncompressed mono WAV format is accepted. Duration comes from bytes, not client metadata.
export function validateAudio(base64: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) fail(415, 'The recording is not valid audio. Please record again.');
  const b = Buffer.from(base64, 'base64');
  if (b.length < 44 || b.length > 10 * 1024 * 1024) fail(413, 'The recording is empty or too large. Keep it under 60 seconds.');
  if (b.toString('ascii',0,4) !== 'RIFF' || b.toString('ascii',8,12) !== 'WAVE' || b.toString('ascii',12,16) !== 'fmt ' || b.readUInt32LE(16) !== 16 || b.readUInt16LE(20) !== 1 || b.readUInt16LE(22) !== 1 || b.readUInt32LE(24) !== 16000 || b.readUInt32LE(28) !== 32000 || b.readUInt16LE(32) !== 2 || b.readUInt16LE(34) !== 16 || b.toString('ascii',36,40) !== 'data' || b.readUInt32LE(40) !== b.length - 44 || b.readUInt32LE(4) !== b.length - 8 || (b.length - 44) % 2) fail(415, 'Use the in-app recorder to create a supported WAV recording.');
  const seconds = (b.length - 44) / 32000;
  if (seconds < .25 || seconds > 60.1) fail(413, 'Record between a moment and 60 seconds.');
  let energy = 0; for (let i = 44; i < b.length; i += 2) energy += (b.readInt16LE(i) / 32768) ** 2;
  if (Math.sqrt(energy / ((b.length - 44) / 2)) < .001) fail(422, 'That recording was silent. Try speaking closer to the microphone, or type instead.');
  return b;
}
