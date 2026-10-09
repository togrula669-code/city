import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findDuplicateCandidates, tokenize } from '../../server/src/services/duplicates.js';
import { createEvidenceArchive } from '../../server/src/services/evidence.js';
import { createGroqProvider } from '../../server/src/providers/groq.js';
import { createAIProvider } from '../../server/src/providers/router.js';
import { loadConfig } from '../../server/src/config/index.js';

const original={id:'CP-1',title:'Large pothole near bus stop',original_description:'Damaged asphalt with deep pothole',category:'ROAD_DAMAGE',analysis:{incident_subtype:'POTHOLE'},latitude:40.4093,longitude:49.8671,status:'PENDING_REVIEW'};
const report=(title,description,category='ROAD_DAMAGE',subtype='POTHOLE',lat=40.40931,lng=49.8671)=>({title,description,category,subtype,latitude:lat,longitude:lng});

test('Unicode tokenization preserves Azerbaijani infrastructure words',()=>{
  assert.ok(tokenize('Böyük çuxur, zədələnmiş yol').has('pothole'));
  assert.equal(tokenize('çuxur').has('pothole'),true);
  assert.equal(tokenize('potholes').has('pothole'),true);
});
test('Different English phrasing recognizes close pothole without forced merge',()=>{
  const result=findDuplicateCandidates(report('Dangerous cavity','Cars avoid a huge hole'),[original]);
  assert.equal(result.status,'CANDIDATES_FOUND');
  assert.equal(result.candidates[0].classification,'POSSIBLY_RELATED');
});
test('Azerbaijani phrasing recognizes nearby same category and subtype',()=>{
  const result=findDuplicateCandidates(report('Yolda böyük çuxur var','Maşınlar çuxurdan qaçır'),[original]);
  assert.equal(result.status,'CANDIDATES_FOUND');
});
test('Distinct category and far away issues are not matched',()=>{
  assert.equal(findDuplicateCandidates(report('Broken lighting','lamp is off','STREET_LIGHTING','LAMP'),[original]).status,'DISTINCT');
  assert.equal(findDuplicateCandidates(report('A pothole','deep road cavity','ROAD_DAMAGE','POTHOLE',40.5,49.9),[original]).status,'DISTINCT');
});
test('Private evidence archive saves matching bytes; invalid IDs blocked',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cp-evidence-'));
  try{
    const archive=createEvidenceArchive(dir);
    const source=Buffer.from([0xff,0xd8,0xff,0x01,0x02,0x03]);
    const meta=await archive.save('CP-1',{bytes:source,mime:'image/jpeg'});
    assert.equal(meta.mime_type,'image/jpeg');
    assert.deepEqual(await archive.read(meta.id),source);
    await assert.rejects(()=>archive.read('../.env'),{code:'NOT_FOUND'});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Groq sampled-video frames are sent as real vision input with no soundtrack claim',async()=>{
  let received;
  const fakeAnalysis={incident_category:'ROAD_DAMAGE',incident_subtype:'POTHOLE',title:'Pothole observed',summary:'Visible road damage',observed_evidence:[],user_reported_claims:[],inferences:[],unverified_assumptions:[],severity:'HIGH',confidence_level:'MEDIUM',evidence_sufficiency:'PARTIALLY_SUFFICIENT',hazards:[],recommended_department:'ROAD_MAINTENANCE',recommended_actions:[],missing_information:[],emergency_warning:false,requires_human_review:true};
  const provider=createGroqProvider({apiKey:'fake',visionModel:'vision-test',fetchImpl:async(_url,init)=>{
    received=JSON.parse(init.body);
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(fakeAnalysis)}}]})};
  }});
  const output=await provider.analyzeFrames([Buffer.from('one'),Buffer.from('two')],'broken road');
  assert.equal(output.analysis.incident_category,'ROAD_DAMAGE');
  assert.equal(received.model,'vision-test');
  assert.equal(received.messages[1].content.filter(x=>x.type==='image_url').length,2);
  assert.match(received.messages[1].content[0].text,/audio is not included/i);
});
test('Groq route exposes real sampled-video capability but not native Groq video',()=>{
  const ai=createAIProvider(loadConfig({AI_PROVIDER:'groq',GROQ_API_KEY:'fake'}));
  assert.equal(ai.supports.video,false);
  assert.equal(ai.supports.video_frames,true);
});
