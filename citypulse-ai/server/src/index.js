import { loadProjectEnv } from './config/load-env.js';
loadProjectEnv();
import path from 'node:path';
import { loadConfig } from './config/index.js';
import { createApp } from './app.js';
import { createLocalRepo } from './repositories/localRepo.js';
import { createAIProvider } from './providers/router.js';

const config = loadConfig();
if (config.databaseMode !== 'local') {
  console.error(`DATABASE_MODE=${config.databaseMode} is not implemented yet (Supabase adapter pending). Use DATABASE_MODE=local.`);
  process.exit(1);
}
const repo = createLocalRepo(path.resolve(config.localDbFile));
const ai = createAIProvider(config);
createApp({ repo, ai, config }).listen(config.port, () => {
  console.log(`CityPulse AI API on :${config.port} | storage=${repo.mode} | ai=${ai.configured ? `${ai.name}/${ai.model}` : 'NOT CONFIGURED'}`);
});
