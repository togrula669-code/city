import { loadProjectEnv } from '../server/src/config/load-env.js';
loadProjectEnv();
import { loadConfig } from '../server/src/config/index.js';
import { createGroqProvider } from '../server/src/providers/groq.js';

const config = loadConfig();
const check = process.argv.includes('--smoke') ? 'smoke' : 'models';
const fail = (message) => { console.error(`ERROR: ${message}`); process.exitCode = 1; };
if (!config.groqApiKey) {
  fail('GROQ_API_KEY is missing. Set GROQ_API_KEY in the project .env or your terminal environment.');
} else {
  try {
    if (check === 'models') {
      console.log('Checking Groq model availability for your API key (no text generation)...');
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers:{Authorization:`Bearer ${config.groqApiKey}`}, signal:AbortSignal.timeout(12000) });
      if (!r.ok) {
        fail(`Groq models API HTTP ${r.status}: ${r.status === 401 ? 'invalid API key' : r.status === 403 ? 'access denied' : 'verify model permissions and connection'}.`);
      } else {
        const payload = await r.json();
        const names = (payload.data || []).map(x=>x.id).sort();
        const configured = { 'Text model':config.groqModel,'Image model':config.groqVisionModel,'Audio model':config.groqAudioModel };
        for (const [label,id] of Object.entries(configured)) console.log(`${names.includes(id)?'OK     ':'MISSING'} ${label}: ${id}`);
        console.log('\nAvailable model IDs:');
        for(const name of names) console.log(`  ${name}`);
        console.log('\nNote: listing a model does not verify your quota or modality permissions. npm run groq:test performs one real text analysis request.');
        if (Object.values(configured).some(id=>!names.includes(id))) process.exitCode=1;
      }
    } else {
      console.log('Running ONE actual Groq text analysis request (consumes API quota if successful)...');
      const ai = createGroqProvider({apiKey:config.groqApiKey,model:config.groqModel,visionModel:config.groqVisionModel,audioModel:config.groqAudioModel});
      const result = await ai.analyzeText('A large pothole is reported near a busy bus stop. Vehicles are swerving to avoid it.');
      console.log(`SUCCESS: provider=${result.provider}, model=${result.model}, category=${result.analysis.incident_category}, severity=${result.analysis.severity}`);
    }
  } catch(e) { fail(`${e.code || e.name || 'FAILED'}: ${e.message}`); }
}
