/** Loads simple .env values without exposing them in a response or logs.
 * Modern Node supports process.loadEnvFile(); this fallback also handles Node 18/20.
 * Existing environment variables take precedence over .env values.
 */
import fs from 'node:fs';
import path from 'node:path';

export function loadProjectEnv(filename = path.resolve('.env'), env = process.env) {
  if (!fs.existsSync(filename)) return false;
  const content = fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (Object.prototype.hasOwnProperty.call(env, key)) continue;
    let value = raw.trim();
    if ((value[0] === '"' && value.endsWith('"')) || (value[0] === "'" && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    env[key] = value;
  }
  return true;
}
