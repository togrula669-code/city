import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProjectEnv } from '../../server/src/config/load-env.js';

test('local .env loader respects existing variables and handles quoted values', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-env-'));
  try {
    const file = path.join(folder, '.env');
    fs.writeFileSync(file, '# comment\nGROQ_API_KEY="test-key-placeholder"\nGROQ_MODEL=openai/gpt-oss-120b # comment\nADMIN_TOKEN=not-real\n');
    const env = { ADMIN_TOKEN: 'existing-token' };
    assert.equal(loadProjectEnv(file, env), true);
    assert.equal(env.GROQ_API_KEY, 'test-key-placeholder');
    assert.equal(env.GROQ_MODEL, 'openai/gpt-oss-120b');
    assert.equal(env.ADMIN_TOKEN, 'existing-token');
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('local .env loader tolerates missing file', () => {
  const env = {};
  assert.equal(loadProjectEnv('/path/does/not/exist/.env', env), false);
  assert.deepEqual(env, {});
});
