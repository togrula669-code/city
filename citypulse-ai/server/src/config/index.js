export function loadConfig(env = process.env) {
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
  return {
    nodeEnv: env.NODE_ENV || 'development',
    port: num(env.PORT, 3001),
    clientUrl: env.CLIENT_URL || 'http://localhost:3001',
    aiProvider: (env.AI_PROVIDER || 'auto').toLowerCase(),
    geminiApiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || '',
    groqApiKey: env.GROQ_API_KEY || '',
    groqModel: env.GROQ_MODEL || 'openai/gpt-oss-120b',
    groqVisionModel: env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b',
    groqAudioModel: env.GROQ_AUDIO_MODEL || 'whisper-large-v3-turbo',
    groqVideoFallback: (env.GROQ_VIDEO_FALLBACK || 'none').toLowerCase(),
    adminToken: env.ADMIN_TOKEN || '',
    databaseMode: env.DATABASE_MODE || 'local',
    localDbFile: env.LOCAL_DB_FILE || 'data/db.json',
    duplicateRadiusMeters: num(env.DUPLICATE_RADIUS_METERS, 50),
    evidenceStorage: env.EVIDENCE_STORAGE === 'local',
    evidenceDirectory: env.EVIDENCE_DIRECTORY || 'data/evidence'
  };
}
