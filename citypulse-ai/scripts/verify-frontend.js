import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
for(const f of ['client/index.html','client/src/main.js','client/src/styles.css','client/src/icons.js','client/src/api.js','server/src/app.js']){
  assert.ok(fs.existsSync(path.join(root,f)),`${f} missing`);
  if(f.endsWith('.js'))execFileSync('node',['--check',path.join(root,f)]);
}
const html=fs.readFileSync(path.join(root,'client/index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'client/src/main.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server/src/app.js'),'utf8');
for(const page of ['overview','report','explore','operations','health'])assert.match(html,new RegExp(`data-page="${page}"`));
for(const key of ['/analyze/text','/analyze/','/incidents','/dashboard/summary','/work-orders','/health'])assert.ok(app.includes(key),`Missing frontend API reference ${key}`);
assert.ok(server.includes('express.static(staticDir'), 'Backend must serve client assets');
assert.ok(server.includes('requireAdmin(config)'), 'Operator API requires server-side auth');
assert.ok(server.includes('mediaSignatureMatches') && fs.existsSync(path.join(root,'server/src/services/media-type.js')), 'Missing media signature checking');
console.log('Frontend verification PASSED: assets, JavaScript syntax, navigation, API wiring and guards.');
