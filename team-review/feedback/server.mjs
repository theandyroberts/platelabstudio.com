import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const recipient = 'andy@note15.com';
const pageURL = 'https://platelabstudio.com/composite-review/';
const clipId = 'roll-001-clip-020';
const maxBytes = 32768;
class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function normalize(body, labels, clip = {id:clipId,media:{duration:68}}) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new RequestError(400, 'Invalid feedback.');
  if (!/^[a-f0-9-]{36}$/i.test(body.submissionId ?? '')) throw new RequestError(400, 'Invalid submission identifier. Reload and try again.');
  if (body.clipId !== clip.id) throw new RequestError(400, 'Unknown clip.');
  const string = (key, max, required = false) => {
    if (typeof body[key] !== 'string' || body[key].length > max || (required && !body[key].trim())) throw new RequestError(400, `Please check the ${key} field.`);
    return body[key].trim();
  };
  const name = string('name', 100, true), email = string('email', 254), message = string('message', 8000, true);
  if (/[\r\n\x00-\x1f]/.test(name) || (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) throw new RequestError(400, 'Please check your name and email.');
  if (body.website) throw new RequestError(400, 'Unable to accept this submission.');
  if (!Number.isFinite(body.posterTime) || body.posterTime < 0 || body.posterTime >= clip.media.duration) throw new RequestError(400, 'Invalid poster time.');
  const decisions = body.labelDecisions;
  if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions) || Object.keys(decisions).length > labels.size) throw new RequestError(400, 'Invalid label decisions.');
  const labelDecisions = Object.fromEntries(Object.entries(decisions).sort().map(([id, value]) => {
    if (!labels.has(id) || !['accepted', 'dismissed'].includes(value)) throw new RequestError(400, 'Invalid label decision.');
    return [id, value];
  }));
  return {submissionId: body.submissionId, clipId:clip.id, name, email, message, posterTime: body.posterTime, labelDecisions};
}
function emailFor(feedback, labels, from, clip = {title:"Roll 001 · Clip 020 — Sixth Street Viaduct"}) {
  const decisions = Object.entries(feedback.labelDecisions).map(([id, status]) => `- ${status.toUpperCase()}: ${labels.get(id)}`).join('\n');
  return {
    from, to: [recipient], subject: `[TPL review] ${clip.title.replace(/[\r\n]/g,' ')} feedback`,
    ...(feedback.email ? {reply_to: feedback.email} : {}),
    text: `THE PLATE LAB — CLIP FEEDBACK\n\nReviewer: ${feedback.name}\nReply email: ${feedback.email || 'Not provided'}\nClip: ${clip.title}\nReview page: ${pageURL}review/${feedback.clipId}\n\nCOMMENTS\n${feedback.message}\n\nREVIEW CHOICES\nSelected poster: ${feedback.posterTime.toFixed(2)} seconds\n${decisions || 'No label decisions selected.'}\n\nSubmission: ${feedback.submissionId}\n`,
  };
}
export function resendSender({apiKey, fetchImpl = fetch}) {
  return async (mail, id) => {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `tpl-review/${id}`},
      body: JSON.stringify(mail),
    });
    const result = await response.json();
    if (!response.ok || typeof result.id !== 'string') throw new Error(`Email provider returned ${response.status}`);
    return result.id;
  };
}
export function createFeedbackServer({dataDir, labels, loadClip, from, send, origins = ['https://platelabstudio.com', 'https://www.platelabstudio.com', 'https://theplatelab.studio'], hourlyLimit = 150, now = Date.now}) {
  const inFlight = new Map();
  let attempts = [];
  const persist = async (file, record) => {
    const temp = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(record), {mode: 0o600});
    await fs.rename(temp, file);
  };
  const deliver = async (feedback, fingerprint, clip, clipLabels) => {
    await fs.mkdir(dataDir, {recursive: true, mode: 0o700});
    const file = path.join(dataDir, `${feedback.submissionId}.json`);
    let record;
    try { record = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (record && record.fingerprint !== fingerprint) throw new RequestError(409, 'This submission changed. Please submit it again.');
    if (record?.status === 'sent') return;
    // Resend retains idempotency keys for 24 hours. Do not automatically resend an ambiguous older attempt.
    if (record && now() - record.createdAt > 23 * 3600000) throw new RequestError(409, 'This earlier submission needs checking. Please email andy@note15.com directly.');
    attempts = attempts.filter(t => now() - t < 3600000);
    if (attempts.length >= hourlyLimit) throw new RequestError(429, 'Too many submissions right now. Please try again later.');
    attempts.push(now());
    record ??= {feedback, fingerprint, createdAt: now(), mail: emailFor(feedback, clipLabels, from, clip)};
    record.status = 'pending';
    await persist(file, record);
    try {
      record.emailId = await send(record.mail, feedback.submissionId);
      record.status = 'sent';
      record.sentAt = now();
      await persist(file, record);
      console.log(JSON.stringify({event: 'feedback_sent', id: feedback.submissionId, emailId: record.emailId}));
    } catch {
      // Keep the submission and the same provider idempotency key for a safe retry.
      console.error(JSON.stringify({event: 'feedback_send_unconfirmed', id: feedback.submissionId}));
      throw new RequestError(502, 'Email sending could not be confirmed. Your text is still here; please retry, or email andy@note15.com directly.');
    }
  };
  return http.createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}); res.end(JSON.stringify(body)); };
    try {
      if (req.url === '/health' && req.method === 'GET') return reply(200, {ok: true});
      if (req.url !== '/composite-review/api/feedback') throw new RequestError(404, 'Not found.');
      if (req.method !== 'POST') throw new RequestError(405, 'Use the feedback form to submit comments.');
      if (!origins.includes(req.headers.origin)) throw new RequestError(403, 'Please submit from the review page.');
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) throw new RequestError(415, 'JSON required.');
      if (Number(req.headers['content-length']) > maxBytes) throw new RequestError(413, 'Feedback is too long.');
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > maxBytes) throw new RequestError(413, 'Feedback is too long.'); chunks.push(chunk); }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RequestError(400, 'Invalid feedback.'); }
      const clip = loadClip ? await loadClip(body?.clipId) : {id:clipId,title:'Roll 001 · Clip 020 — Sixth Street Viaduct',media:{duration:68}};
      const clipLabels = clip.labels ? new Map(clip.labels.map(label=>[label.id,label.label])) : labels;
      const feedback = normalize(body, clipLabels, clip);
      const fingerprint = createHash('sha256').update(JSON.stringify(feedback)).digest('hex');
      const existing = inFlight.get(feedback.submissionId);
      if (existing && existing.fingerprint !== fingerprint) throw new RequestError(409, 'This submission is already being sent.');
      if (existing) await existing.promise;
      else {
        const promise = deliver(feedback, fingerprint, clip, clipLabels);
        inFlight.set(feedback.submissionId, {promise, fingerprint});
        try { await promise; } finally { inFlight.delete(feedback.submissionId); }
      }
      reply(200, {ok: true, submissionId: feedback.submissionId});
    } catch (error) {
      if (!(error instanceof RequestError)) console.error(JSON.stringify({event: 'feedback_internal_error', code: error.code ?? 'unknown'}));
      reply(error.status ?? 500, {error: error.status ? error.message : 'Feedback could not be sent. Please try again or email andy@note15.com.'});
    }
  });
}
export async function loadFeedbackClip(file) {
  const clip=JSON.parse(await fs.readFile(file,'utf8'));
  let editorial;try{editorial=JSON.parse(await fs.readFile(path.join(path.dirname(file),'label-editorial.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return clip;throw e;}
  if(editorial.schema!=='tpl.label-editorial.v1'||editorial.sourceFingerprint!==clip.sourceFingerprint)throw new Error('Editorial source mismatch');
  // Feedback needs the current display names and allowed decision IDs, not image geometry.
  const labels=new Map(clip.labels.map(l=>[l.id,{...l}]));
  for(const p of editorial.patches){const l=labels.get(p.id);if(!l||l.label!==p.expected.label||l.category!==p.expected.category)throw new Error('Editorial label changed');if(p.changes.label)l.label=p.changes.label;}
  for(const mood of editorial.moods??[]){if(labels.has(mood.id)||mood.category!=='mood'||!labels.has(mood.sourceLabelId)||typeof mood.label!=='string')throw new Error('Invalid editorial mood');labels.set(mood.id,{id:mood.id,label:mood.label});}
  return {...clip,labels:[...labels.values()]};
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const {RESEND_API_KEY, FEEDBACK_FROM, CLIP_PATH = '/clip/clip.json', CATALOG_ROOT, DATA_DIR = '/data', PORT = '8080'} = process.env;
  if (!RESEND_API_KEY || !FEEDBACK_FROM) throw new Error('Email configuration is required.');
  const loadClip = async id => {
    if(typeof id!=='string'||!/^[-a-z0-9]+$/.test(id))throw new RequestError(400,'Unknown clip.');
    if(CATALOG_ROOT){
      const catalog=JSON.parse(await fs.readFile(path.join(CATALOG_ROOT,'catalog.json'),'utf8'));
      if(!catalog.some(c=>c.id===id))throw new RequestError(400,'Unknown clip.');
      return loadFeedbackClip(path.join(CATALOG_ROOT,'media/composite',id,'clip.json'));
    }
    const clip=await loadFeedbackClip(CLIP_PATH);if(clip.id!==id)throw new RequestError(400,'Unknown clip.');return clip;
  };
  const server = createFeedbackServer({dataDir: DATA_DIR, loadClip, from: FEEDBACK_FROM, send: resendSender({apiKey: RESEND_API_KEY})});
  server.requestTimeout = 20000;
  server.listen(Number(PORT), '0.0.0.0', () => console.log('Feedback email service ready'));
}
