import {test} from 'node:test';
import assert from 'node:assert/strict';
import { createGroqProvider,mapGroqError } from '../../server/src/providers/groq.js';
import { createAIProvider } from '../../server/src/providers/router.js';
import { loadConfig } from '../../server/src/config/index.js';

const valid = {
  incident_category:'ROAD_DAMAGE', incident_subtype:'POTHOLE',title:'Road damage',summary:'Road surface is reportedly damaged',
  observed_evidence:[],user_reported_claims:['Road damage reported'],inferences:[],unverified_assumptions:[],
  severity:'HIGH',confidence_level:'MEDIUM',evidence_sufficiency:'PARTIALLY_SUFFICIENT',hazards:['Potential vehicle damage'],
  recommended_department:'ROAD_MAINTENANCE',recommended_actions:['Inspect road'],missing_information:['Exact pothole dimensions'],
  emergency_warning:false,requires_human_review:true
};
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const goodChat = () => json({choices:[{message:{content:JSON.stringify(valid)}}]});

// These tests use local mock HTTP responses; no user account or quota is required.
test('Groq: text analyzes JSON with real configured model name and private auth header',async()=>{
  let inspected=0;
  const ai=createGroqProvider({apiKey:'private-test-key',model:'openai/gpt-oss-120b',fetchImpl:async(url,init)=>{
    assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(init.headers.Authorization,'Bearer private-test-key');
    const b=JSON.parse(init.body);assert.equal(b.model,'openai/gpt-oss-120b');assert.equal(b.response_format.type,'json_object');
    assert.match(JSON.stringify(b.messages),/citizen_report/);
    assert.doesNotMatch(JSON.stringify(b),/private-test-key/);
    inspected++;return goodChat();
  }});
  const result=await ai.analyzeText('There is a pothole near a bus stop.');
  assert.equal(inspected,1);assert.equal(result.analysis.incident_category,'ROAD_DAMAGE');
  assert.equal(result.provider,'groq');assert.equal(result.model,'openai/gpt-oss-120b');
});

test('Groq: image is sent to configured vision model (not text-only GPT OSS)',async()=>{
  const ai=createGroqProvider({apiKey:'mock',fetchImpl:async(url,init)=>{
    const body=JSON.parse(init.body);assert.equal(body.model,'qwen/qwen3.8-27b');
    const content=body.messages[1].content;
    assert.ok(content.some(c=>c.type==='image_url'&&c.image_url.url.startsWith('data:image/png;base64,')));
    return goodChat();
  }});
  const result=await ai.analyzeMedia(Buffer.alloc(100,1),'image/png','Pothole near crossing');
  assert.equal(result.model,'qwen/qwen3.8-27b');
});

test('Groq: audio transcription is performed before structured text analysis',async()=>{
  const seen=[];
  const ai=createGroqProvider({apiKey:'mock',fetchImpl:async(url,init)=>{
    seen.push(url);
    if(url.endsWith('audio/transcriptions')){
      assert.equal(init.body.get('model'),'whisper-large-v3-turbo');
      assert.equal(init.body.get('file').type,'audio/webm');
      return json({text:'The broken road is causing cars to swerve.'});
    }
    assert.match(JSON.stringify(JSON.parse(init.body).messages),/broken road is causing cars/);
    return goodChat();
  }});
  const result=await ai.analyzeMedia(Buffer.from('audio-test-data'),'audio/webm','Near the city center');
  assert.equal(result.transcript,'The broken road is causing cars to swerve.');
  assert.deepEqual(seen,['https://api.groq.com/openai/v1/audio/transcriptions','https://api.groq.com/openai/v1/chat/completions']);
});

test('Groq: rejects nonexistent API key without making HTTP calls',async()=>{
  const ai=createGroqProvider({apiKey:'',fetchImpl:()=>{throw new Error('should not call');}});
  await assert.rejects(ai.analyzeText('pothole'),{code:'AI_NOT_CONFIGURED'});
});

test('Groq: wrong credentials, quota and dead models fail clearly without retries',async()=>{
  for (const [status,code] of [[401,'AI_AUTH_FAILED'],[429,'AI_QUOTA_EXCEEDED'],[404,'AI_MODEL_UNSUPPORTED']]){
    let calls=0;
    const ai=createGroqProvider({apiKey:'fake',fetchImpl:async()=>{calls++;return json({error:{message:'unavailable'}},status);}});
    await assert.rejects(ai.analyzeText('pothole'),{code});
    assert.equal(calls,1);
  }
  assert.equal(mapGroqError(400,'model_decommissioned').code,'AI_MODEL_UNSUPPORTED');
});

test('Groq: invalid JSON or incomplete analysis rejected (not fabricated)',async()=>{
  const ai=createGroqProvider({apiKey:'fake',fetchImpl:async()=>json({choices:[{message:{content:'{}'}}]})});
  await assert.rejects(ai.analyzeText('Pothole'),{code:'AI_INVALID_RESPONSE'});
});

test('Groq: unsupported direct video is explicit error; no Gemini fallback without opt-in',async()=>{
  const ai=createGroqProvider({apiKey:'fake',fetchImpl:()=>{throw new Error('bad');}});
  assert.throws(()=>ai.analyzeMedia(Buffer.alloc(24),'video/mp4'),{code:'AI_UNSUPPORTED_MODALITY'});
  const c=loadConfig({AI_PROVIDER:'groq',GROQ_API_KEY:'fake',GROQ_MODEL:'openai/gpt-oss-120b',GEMINI_API_KEY:'other-key',GEMINI_MODEL:'gemini-test'});
  const router=createAIProvider(c);
  assert.equal(router.supports.video,false);
  assert.throws(()=>router.analyzeMedia(Buffer.alloc(24),'video/mp4'),{code:'AI_UNSUPPORTED_MODALITY'});
  const f=createAIProvider({...c,groqVideoFallback:'gemini'}, {gemini:{name:'gemini',model:'test',configured:true,supports:{video:true},analyzeMedia:async()=>valid}});
  assert.equal(f.supports.video,true);
  const result=await f.analyzeMedia(Buffer.alloc(24),'video/mp4');
  assert.equal(result.provider,'gemini');assert.equal(result.analysis.title,'Road damage');
});

test('Groq: auto provider chooses Groq only when its key exists',()=>{
  const c=loadConfig({AI_PROVIDER:'auto',GROQ_API_KEY:'test',GEMINI_API_KEY:'gemini',GEMINI_MODEL:'working'});
  assert.equal(createAIProvider(c).name,'groq');
  assert.equal(createAIProvider({...c,groqApiKey:''}).name,'gemini');
});

test('Groq: empty audio transcription is rejected and reasoning is not called',async()=>{
  let calls=0;
  const ai=createGroqProvider({apiKey:'fake',fetchImpl:async()=>{calls++;return json({text:'  '});}});
  await assert.rejects(ai.analyzeMedia(Buffer.from('x'),'audio/webm'),{code:'AI_EMPTY_TRANSCRIPT'});
  assert.equal(calls,1);
});

test('Groq: 500 retries once, succeeds on second request',async()=>{
  let calls=0;
  const ai=createGroqProvider({apiKey:'fake',baseDelayMs:0,maxRetries:1,fetchImpl:async()=>{
    calls++;return calls === 1 ? json({error:'temporary'},503) : goodChat();
  }});
  const result=await ai.analyzeText('Pothole on the road');
  assert.equal(result.analysis.incident_category,'ROAD_DAMAGE');assert.equal(calls,2);
});
