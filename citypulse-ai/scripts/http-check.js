/** Confirm local browser→Express route independent of Groq, then optionally a live AI analysis.
 * Safe: only sends fixed synthetic text. Never prints secrets.
 */
const base = (process.env.CITYPULSE_URL || 'http://localhost:3001').replace(/\/$/, '');
let failures = 0;
async function check(name, path, init, timeout = 12000) {
  console.log(`\n${name} ${init?.method || 'GET'} ${path}`);
  try {
    const res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeout) });
    const text = await res.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = null; }
    console.log(`HTTP ${res.status}; x-request-id=${res.headers.get('x-request-id') || '(none)'}`);
    if (!payload) console.log(`Non-JSON response: ${text.slice(0,180)}`);
    else if (path.includes('health')) console.log(`Storage=${payload.data?.storage ?? 'unknown'}; AI=${payload.data?.ai?.provider ?? 'unknown'}; configured=${payload.data?.ai?.configured ?? 'unknown'}`);
    else if (payload.success) console.log(`Success. ${path.includes('analyze') ? `category=${payload.data?.analysis?.incident_category ?? 'unknown'}` : `POST echo valid=${payload.data?.payload_valid}`}`);
    else console.log(`API error code=${payload.error?.code || 'unknown'}; message=${payload.error?.message || 'unknown'}`);
    if (!res.ok || !payload?.success || (path.includes('echo') && !payload.data?.payload_valid)) failures++;
  } catch(e) {
    failures++;
    console.error(`FAILED: ${e.name}: ${e.message}`);
    if (e.cause?.code) console.error(`cause=${e.cause.code}`);
  }
}
await check('1/2 Backend health:', '/api/health');
await check('2/2 POST JSON connectivity:', '/api/diagnostics/echo', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({check:'citypulse-connectivity'}) });
if (process.argv.includes('--live')) {
  console.log('\nAn optional REAL analysis is being sent (uses AI quota).');
  await check('3/3 Live end-to-end AI:', '/api/analyze/text', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({description:'A pothole near the bus stop is causing vehicles to swerve.'}) }, 115000);
}
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} HTTP check(s) failed.`);
if (failures) console.log('Keep npm run dev running in a SEPARATE terminal. Review its output and browser F12 → Network.');
process.exitCode = failures ? 1 : 0;
