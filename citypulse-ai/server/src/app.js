import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createEvidenceArchive } from './services/evidence.js';
import { mediaSignatureMatches, mediaMismatchMessage, normalizeMediaMime } from './services/media-type.js';
import { AppError } from './utils/errors.js';
import { isValidCoordinate } from './utils/geo.js';
import { computePriority } from './services/priority.js';
import { findDuplicateCandidates } from './services/duplicates.js';
import { LOCATION_SOURCES, STATUSES, STATUS_TRANSITIONS, OPEN_STATUSES, DEPARTMENTS, SEVERITIES } from '../../shared/constants.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

function rateLimiter(max, windowMs = 60000) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const k = req.ip;
    const e = hits.get(k) && hits.get(k).reset > now ? hits.get(k) : { count: 0, reset: now + windowMs };
    e.count++; hits.set(k, e);
    if (hits.size > 5000) for (const [kk, v] of hits) if (v.reset < now) hits.delete(kk);
    if (e.count > max) return next(new AppError('RATE_LIMITED', 'Too many requests. Please slow down.', 429));
    next();
  };
}

function requireAdmin(config) {
  return (req, _res, next) => {
    if (!config.adminToken) return next(new AppError('ADMIN_NOT_CONFIGURED', 'Admin access is not configured.', 503));
    const given = Buffer.from(String(req.get('x-admin-token') ?? ''));
    const want = Buffer.from(config.adminToken);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return next(new AppError('UNAUTHORIZED', 'Admin authentication required.', 401));
    next();
  };
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp({ repo, ai, config }) {
  const app = express();
  const analyses = new Map(); // server-issued, single-use analysis tickets
  const evidenceArchive = createEvidenceArchive(path.resolve(config.evidenceDirectory || 'data/evidence'));
  let pendingEvidenceBytes = 0;
  function evictAnalysis(id){ const entry=analyses.get(id); if(!entry)return;pendingEvidenceBytes-=entry.media?.bytes.length||0;analyses.delete(id); }
  function pruneAnalyses(){for(const [id,entry] of analyses){if(Date.now()-entry.at>30*60000)evictAnalysis(id);}while(analyses.size>100||pendingEvidenceBytes>75*1024*1024){evictAnalysis(analyses.keys().next().value);}}
  const staticDir = fileURLToPath(new URL('../../client', import.meta.url));

  function cacheAnalysis(response, description, started, media=null) {
    const { analysis, provider, model, transcript } = response?.analysis ? response : { analysis: response, provider: ai.name, model: ai.model };
    const analysis_id = crypto.randomUUID();
    // If audio was transcribed, retain what was actually said alongside optional typed context.
    // Do not replace the original citizen statement with a generic '[audio submitted]' label.
    const reportText = transcript ? [description, `Audio transcript: ${transcript}`].filter(Boolean).join('\n') : description;
    pruneAnalyses();
    // In-memory evidence stays until the ticket is used/expired. Persistent storage is opt-in.
    const retained = config.evidenceStorage && media?.retain ? media : null;
    analyses.set(analysis_id, { analysis, description: reportText, model, provider, duration_ms: Date.now() - started, at: Date.now(), media:retained, submitting:false });
    pendingEvidenceBytes+=retained?.bytes.length||0;
    pruneAnalyses();
    const priority = computePriority({ category: analysis.incident_category, severity: analysis.severity, hazards: analysis.hazards, emergency_warning: analysis.emergency_warning, evidence_sufficiency: analysis.evidence_sufficiency });
    return { analysis_id, analysis, priority, provider, model, ...(transcript ? { transcript } : {}) };
  }

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    // OpenStreetMap requires a Referer on browser tile requests; Helmet defaults to no-referrer.
    // Only the origin is shared, never the user's report path or query string.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://unpkg.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://unpkg.com', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null
    } }
  }));
  app.use(cors({ origin: config.clientUrl }));
  app.use('/api/analyze', express.json({ limit: '36mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => { req.id = crypto.randomUUID(); res.setHeader('x-request-id', req.id); next(); });
  // Logs contain only path, timing and status: never report bodies, audio, or API credentials.
  app.use('/api/analyze', (req, res, next) => {
    const start = Date.now();
    console.log(`[CityPulse] ${req.method} ${req.path} received request=${req.id}`);
    let finished = false;
    res.on('finish', () => { finished = true; console.log(`[CityPulse] ${req.method} ${req.path} status=${res.statusCode} duration_ms=${Date.now()-start} request=${req.id}`); });
    res.on('close', () => { if (!finished) console.warn(`[CityPulse] ${req.method} ${req.path} client disconnected duration_ms=${Date.now()-start} request=${req.id}`); });
    next();
  });
  app.use('/api', rateLimiter(120));

  app.get('/api/health', (_req, res) => ok(res, { status: 'ok', storage: repo.mode, evidence_archive:Boolean(config.evidenceStorage), ai: { provider: ai.name, model: ai.model || null, models: ai.models || null, configured: ai.configured, modalities: ai.supports, video_fallback: ai.videoFallback || null } }));

  // This does NOT invoke the AI provider and never accepts credentials.
  // It helps isolate browser→Express connectivity from Express→Groq connectivity.
  app.post('/api/diagnostics/echo', (req, res) => ok(res, {
    ok: true, request_received: true, method: 'POST', request_id: req.id,
    payload_valid: req.body?.check === 'citypulse-connectivity'
  }));

  app.get('/api/health/dependencies', wrap(async (_req, res) => {
    let db = false; try { db = await repo.ping(); } catch { db = false; }
    ok(res, { database: db, ai_configured: ai.configured, admin_configured: Boolean(config.adminToken) });
  }));

  app.post('/api/analyze/text', rateLimiter(10), wrap(async (req, res) => {
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    if (description.length < 5 || description.length > 2000) throw new AppError('VALIDATION_ERROR', 'Description must be between 5 and 2000 characters.', 400);
    const started = Date.now();
    const analysis = await ai.analyzeText(description);
    ok(res, cacheAnalysis(analysis, description, started));
  }));

  // Media sent transiently to the configured model. Evidence bytes are not stored as files.
  // Model capability and quotas must be confirmed with the configured provider account.
  const allowedMimes = {
    image: ['image/jpeg', 'image/png', 'image/webp'],
    audio: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav'],
    video: ['video/mp4', 'video/webm']
  };
  const analyzeMedia = (kind) => wrap(async (req, res) => {
    const { data } = req.body ?? {};
    const mimeType = normalizeMediaMime(req.body?.mimeType);
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    if (description.length > 2000) throw new AppError('VALIDATION_ERROR', 'Description must be below 2000 characters.', 400);
    if (!allowedMimes[kind]?.includes(mimeType)) throw new AppError('UNSUPPORTED_MEDIA', `Unsupported ${kind} format.`, 415);
    if (typeof data !== 'string' || !data.length || data.length > 36_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new AppError('VALIDATION_ERROR', 'Invalid base64 media payload.', 400);
    const bytes = Buffer.from(data, 'base64');
    const max = { image: 10, audio: 15, video: 25 }[kind] * 1024 * 1024;
    if (bytes.length < 20 || bytes.length > max) throw new AppError('VALIDATION_ERROR', `${kind} file size must be between 20 bytes and ${max / 1024 / 1024} MB.`, 413);
    if (!mediaSignatureMatches(bytes, mimeType)) throw new AppError('INVALID_FILE_SIGNATURE', mediaMismatchMessage(bytes, mimeType), 415);
    if (!ai.analyzeMedia) throw new AppError('AI_UNSUPPORTED_MODALITY', 'Media analysis is not supported by this provider.', 503);
    const started = Date.now();
    const analysis = await ai.analyzeMedia(bytes, mimeType, description);
    ok(res, cacheAnalysis(analysis, description || (kind === 'audio' ? '' : `[${kind} evidence submitted]`), started,
      {bytes,mime:mimeType,retain:req.body.retainEvidence === true}));
  });
  app.post('/api/analyze/media', rateLimiter(5), (req, res, next) => {
    const mime = normalizeMediaMime(req.body?.mimeType);
    const kind = mime.split('/')[0];
    if (!allowedMimes[kind]) return next(new AppError('UNSUPPORTED_MEDIA', 'Unsupported media type.', 415));
    analyzeMedia(kind)(req, res, next);
  });
  for (const kind of ['image', 'audio', 'video']) app.post(`/api/analyze/${kind}`, rateLimiter(5), analyzeMedia(kind));
  // JPEG keyframes extracted locally by the browser (no fake or textual video analysis).
  app.post('/api/analyze/frames', rateLimiter(5), wrap(async(req,res)=>{
    const {frames,description=''}=req.body||{};
    if(typeof description!=='string'||description.length>2000)throw new AppError('VALIDATION_ERROR','Invalid description.',400);
    if(!Array.isArray(frames)||frames.length<1||frames.length>3)throw new AppError('VALIDATION_ERROR','Provide 1 to 3 sampled video frames.',400);
    const buffers=frames.map(frame=>{
      if(typeof frame!=='string'||frame.length>2_100_000||!/^\s*[A-Za-z0-9+/]+={0,2}\s*$/.test(frame))throw new AppError('VALIDATION_ERROR','Invalid video frame.',400);
      const bytes=Buffer.from(frame.trim(),'base64');
      if(bytes.length<64||bytes.length>1_500_000||!mediaSignatureMatches(bytes,'image/jpeg'))throw new AppError('UNSUPPORTED_MEDIA','Invalid JPEG frame.',415);
      return bytes;
    });
    if(typeof ai.analyzeFrames!=='function')throw new AppError('AI_UNSUPPORTED_MODALITY','Video-frame analysis unavailable.',422);
    const started=Date.now();
    const result=await ai.analyzeFrames(buffers,description);
    ok(res,cacheAnalysis(result,description||'[short video: sampled visual frames; no audio transcript]',started,
      {bytes:buffers[0],mime:'image/jpeg',retain:req.body.retainEvidence===true}));
  }));


  app.post('/api/incidents', wrap(async (req, res) => {
    const b = req.body ?? {};
    const cached = analyses.get(b.analysis_id);
    if (!cached || cached.submitting || Date.now() - cached.at > 30 * 60000) throw new AppError('ANALYSIS_NOT_FOUND', 'Analysis expired, already submitted, or not found. Please analyze again.', 400);
    const hasLoc = b.latitude !== undefined || b.longitude !== undefined;
    if (hasLoc && !isValidCoordinate(b.latitude, b.longitude)) throw new AppError('VALIDATION_ERROR', 'Invalid coordinates.', 400);
    const location_source = hasLoc ? b.location_source : 'NONE';
    if (!LOCATION_SOURCES.includes(location_source)) throw new AppError('VALIDATION_ERROR', 'Invalid location_source.', 400);
    const a = cached.analysis;
    cached.submitting = true;
    try {
    const open = (await repo.listIncidents()).filter((i) => OPEN_STATUSES.includes(i.status));
    const dup = findDuplicateCandidates({ title: a.title, description: cached.description, category: a.incident_category, subtype: a.incident_subtype, latitude: b.latitude, longitude: b.longitude }, open, { radiusMeters: config.duplicateRadiusMeters });
    const decision = b.duplicate_decision;

    if (decision === 'SUPPORT') {
      const target = dup.candidates.find((c) => c.incident_id === b.support_incident_id);
      if (!target) throw new AppError('VALIDATION_ERROR', 'support_incident_id is not a current duplicate candidate.', 400);
      const inc = await repo.getIncident(target.incident_id);
      const source_ref = typeof b.source_ref === 'string' ? b.source_ref.slice(0, 64) : 'anonymous';
      const corroborations = [...inc.corroborations, { id: crypto.randomUUID(), description: cached.description, source_ref, created_at: new Date().toISOString() }];
      // Anonymous source_ref can be user-forged, so it must not increase hazard priority.
      const p = computePriority({ category: inc.category, severity: inc.analysis.severity, hazards: inc.analysis.hazards, emergency_warning: inc.analysis.emergency_warning, evidence_sufficiency: inc.analysis.evidence_sufficiency, created_at: inc.created_at });
      try {
        let updated=await repo.updateIncident(inc.id,{corroborations,operational_priority:p.score,priority_factors:p.factors},{event_type:'CORROBORATED'});
        if(cached.media){
          try{const meta=await evidenceArchive.save(inc.id,cached.media);updated=await repo.updateIncident(inc.id,{evidence:[...(updated.evidence||[]),meta]},{event_type:'SUPPORTING_EVIDENCE_ARCHIVED'});}
          catch(error){console.error('Supporting evidence archive failed:',error.message);}
        }
        evictAnalysis(b.analysis_id);
        return ok(res,{created:false,incident:toPublic(updated)});
      } catch(e){cached.submitting=false;throw e;}
    }
    if (dup.candidates.length && decision !== 'SEPARATE') {
      return ok(res, { created: false, requires_decision: true, duplicates: dup.candidates.map(c=>({...c,title:`${String(c.category||'OTHER').replace(/_/g,' ')} report`})), message: 'An existing incident may match your report.' });
    }
    const p = computePriority({ category: a.incident_category, severity: a.severity, hazards: a.hazards, emergency_warning: a.emergency_warning, evidence_sufficiency: a.evidence_sufficiency });
    let incident;
    try { incident = await repo.createIncident({
      title: a.title, original_description: cached.description, ai_summary: a.summary,
      category: a.incident_category, severity: a.severity, operational_priority_level: p.level, operational_priority: p.score, priority_factors: p.factors,
      latitude: hasLoc ? b.latitude : null, longitude: hasLoc ? b.longitude : null, location_source,
      status: 'PENDING_REVIEW', analysis: a, analysis_meta: { provider: cached.provider, model: cached.model, duration_ms: cached.duration_ms },
      is_sample: false
    });
      if(cached.media){
        try{
          const meta=await evidenceArchive.save(incident.id,cached.media);
          incident=await repo.updateIncident(incident.id,{evidence:[meta]},{event_type:'EVIDENCE_ARCHIVED'});
        }catch(error){console.error('Evidence could not be archived:',error.message);}
      }
      evictAnalysis(b.analysis_id);
      ok(res, { created: true, incident, note: 'Stored in the prototype operations dashboard. Not sent to any real municipal authority.' }, 201);
    }catch(e){cached.submitting=false;throw e;}
    } finally { if(analyses.get(b.analysis_id)===cached) cached.submitting=false; }
  }));

  app.get('/api/evidence/:id',requireAdmin(config),wrap(async(req,res)=>{
    const incidents=await repo.listIncidents();
    const matching=incidents.flatMap(i=>i.evidence||[]).find(e=>e.id===req.params.id);
    if(!matching)throw new AppError('NOT_FOUND','Evidence not found.',404);
    const bytes=await evidenceArchive.read(matching.id);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Content-Disposition',`attachment; filename="evidence-${matching.id}.bin"`);
    res.type(matching.mime_type).send(bytes);
  }));
  const isAdmin=(req)=>{
    if(!config.adminToken)return false;
    const given=Buffer.from(String(req.get('x-admin-token')||''));const wanted=Buffer.from(config.adminToken);
    return given.length===wanted.length&&crypto.timingSafeEqual(given,wanted);
  };
  // Public map entries are deliberately reduced; private evidence and citizen
  // descriptions require an operator token. Public coordinates are approximate.
  const toPublic=(i)=>({id:i.id,title:i.is_sample?i.title:`${String(i.category||'OTHER').replace(/_/g,' ')} report`,category:i.category,severity:i.severity,
    operational_priority:i.operational_priority,operational_priority_level:i.operational_priority_level,
    status:i.status,created_at:i.created_at,updated_at:i.updated_at,
    is_sample:i.is_sample||false,
    latitude:Number.isFinite(i.latitude)?Number(i.latitude.toFixed(3)):null,
    longitude:Number.isFinite(i.longitude)?Number(i.longitude.toFixed(3)):null,
    location_source:i.location_source});
  app.get('/api/incidents', wrap(async (req, res) => {
    const { status, category, severity } = req.query;
    const incidents=await repo.listIncidents({status,category,severity});
    ok(res,{incidents:isAdmin(req)?incidents:incidents.map(toPublic)});
  }));

  app.get('/api/incidents/:id', wrap(async (req, res) => {
    const i = await repo.getIncident(req.params.id);
    if (!i) throw new AppError('NOT_FOUND', 'Incident not found.', 404);
    ok(res,{incident:isAdmin(req)?i:toPublic(i)});
  }));

  app.patch('/api/incidents/:id/status', requireAdmin(config), wrap(async (req, res) => {
    const { status, note } = req.body ?? {};
    if (!STATUSES.includes(status)) throw new AppError('VALIDATION_ERROR', 'Invalid status.', 400);
    const i = await repo.getIncident(req.params.id);
    if (!i) throw new AppError('NOT_FOUND', 'Incident not found.', 404);
    if (!STATUS_TRANSITIONS[i.status].includes(status)) throw new AppError('INVALID_TRANSITION', `Cannot move from ${i.status} to ${status}.`, 409);
    const updated = await repo.updateIncident(i.id, { status }, { event_type: 'STATUS_CHANGED', previous_state: i.status, new_state: status, note: typeof note === 'string' ? note.slice(0, 500) : undefined });
    ok(res, { incident: updated });
  }));

  app.get('/api/dashboard/summary', wrap(async (_req, res) => {
    const incidents = await repo.listIncidents();
    const workOrders = await repo.listWorkOrders();
    ok(res, {
      total: incidents.length,
      pending: incidents.filter(i => i.status === 'PENDING_REVIEW').length,
      high_priority: incidents.filter(i => ['CRITICAL', 'HIGH'].includes(i.severity) && OPEN_STATUSES.includes(i.status)).length,
      resolved: incidents.filter(i => i.status === 'RESOLVED').length,
      open: incidents.filter(i => OPEN_STATUSES.includes(i.status)).length,
      sample: incidents.filter(i => i.is_sample).length,
      work_orders_open: workOrders.filter(w => w.status !== 'COMPLETED').length,
      by_category: Object.fromEntries([...new Set(incidents.map(i => i.category))].map(c => [c, incidents.filter(i => i.category === c).length]))
    });
  }));
  app.get('/api/work-orders', requireAdmin(config), wrap(async (_req, res) => ok(res, { work_orders: await repo.listWorkOrders() })));
  app.post('/api/work-orders', requireAdmin(config), wrap(async (req, res) => {
    const { incident_id, assigned_department, priority, operator_notes } = req.body ?? {};
    const incident = await repo.getIncident(incident_id);
    if (!incident) throw new AppError('NOT_FOUND', 'Incident not found.', 404);
    if (!DEPARTMENTS.includes(assigned_department) || !SEVERITIES.includes(priority)) throw new AppError('VALIDATION_ERROR', 'Invalid department or priority.', 400);
    if (incident.status !== 'ASSIGNED' && incident.status !== 'IN_PROGRESS') throw new AppError('INVALID_TRANSITION', 'Review and assign the incident before creating a work order.', 409);
    if (typeof operator_notes !== 'string' || operator_notes.length > 800) throw new AppError('VALIDATION_ERROR', 'Notes must be under 800 characters.', 400);
    const work_order = await repo.createWorkOrder({ id: crypto.randomUUID(), incident_id, assigned_department, priority, operator_notes, status: 'OPEN' });
    ok(res, { work_order, note: 'Prototype work order. No real municipal dispatch was performed.' }, 201);
  }));
  app.patch('/api/work-orders/:id', requireAdmin(config), wrap(async (req, res) => {
    const { status, operator_notes } = req.body ?? {};
    if (!['OPEN', 'IN_PROGRESS', 'COMPLETED'].includes(status)) throw new AppError('VALIDATION_ERROR', 'Invalid work order status.', 400);
    if (operator_notes !== undefined && (typeof operator_notes !== 'string' || operator_notes.length > 800)) throw new AppError('VALIDATION_ERROR', 'Invalid notes.', 400);
    const old = await repo.getWorkOrder(req.params.id);
    if (!old) throw new AppError('NOT_FOUND', 'Work order not found.', 404);
    if (!({ OPEN: ['IN_PROGRESS'], IN_PROGRESS: ['COMPLETED'], COMPLETED: [] }[old.status]).includes(status)) throw new AppError('INVALID_TRANSITION', 'Invalid work order transition.', 409);
    const work_order = await repo.updateWorkOrder(old.id, { status, ...(operator_notes === undefined ? {} : {operator_notes}) });
    ok(res, { work_order });
  }));

  // Same-origin hosting: npm run dev serves the UI and API together on port 3001.
  app.use(express.static(staticDir, { extensions: ['html'], index: 'index.html' }));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));

  app.use('/api', (_req, _res, next) => next(new AppError('NOT_FOUND', 'Route not found.', 404)));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed') err = new AppError('VALIDATION_ERROR', 'Malformed JSON body.', 400);
    if (err.type === 'entity.too.large') err = new AppError('VALIDATION_ERROR', 'Request body too large.', 413);
    const known = err instanceof AppError;
    if (!known) console.error(JSON.stringify({ request_id: req.id, error: err.message }));
    res.status(known ? err.status : 500).json({ success: false, error: { code: known ? err.code : 'INTERNAL_ERROR', message: known ? err.message : 'Internal server error.', request_id: req.id } });
  });
  return app;
}
