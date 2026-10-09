import { loadProjectEnv } from '../server/src/config/load-env.js';
loadProjectEnv();
import { loadConfig } from '../server/src/config/index.js';

const c = loadConfig();
const live = process.argv.includes('--live');
const row = (n, v) => console.log(`${v ? 'OK     ' : 'MISSING'}  ${n}`);
console.log(`AI_PROVIDER=${c.aiProvider}`);
row('GROQ_API_KEY', c.groqApiKey);
console.log(`GROQ_MODEL=${c.groqModel}\nGROQ_VISION_MODEL=${c.groqVisionModel}\nGROQ_AUDIO_MODEL=${c.groqAudioModel}`);
row('GEMINI_API_KEY', c.geminiApiKey);
row('GEMINI_MODEL', c.geminiModel);
row('ADMIN_TOKEN', c.adminToken);
console.log(`GROQ_VIDEO_FALLBACK=${c.groqVideoFallback}`);
console.log(`DATABASE_MODE=${c.databaseMode} (${c.localDbFile})`);
if (!['groq','gemini','auto'].includes(c.aiProvider)) { console.error('Invalid AI_PROVIDER; use groq, gemini or auto.'); process.exitCode=1; }
if (!live) {
  console.log('\nFor Groq models available to your key: npm run groq:models');
  console.log('For one real Groq inference: npm run groq:test');
} else if (c.aiProvider === 'groq' || (c.aiProvider === 'auto' && c.groqApiKey)) {
  console.log('Groq is selected. Run npm run groq:models to check your active models.');
} else if (!c.geminiApiKey) {
  console.error('Set GEMINI_API_KEY first.'); process.exitCode=1;
} else {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers:{'x-goog-api-key': c.geminiApiKey},signal:AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`Gemini model list returned HTTP ${res.status}`);
    const {models=[]} = await res.json();
    const gen = models.filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>m.name.replace('models/',''));
    console.log('\nGemini generateContent models:\n'+gen.map(n=>` - ${n}`).join('\n'));
    if (c.geminiModel) console.log(`Configured Gemini model: ${gen.includes(c.geminiModel)?'LISTED':'NOT LISTED'}`);
  } catch(e) { console.error(e.message); process.exitCode=1; }
}
