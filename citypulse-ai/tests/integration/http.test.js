import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalRepo } from '../../server/src/repositories/localRepo.js';

const fakeAnalysis = {
  incident_category:'ROAD_DAMAGE', incident_subtype:'POTHOLE',title:'Damaged roadway near crossing',summary:'A roadway defect has been reported.',
  observed_evidence:[],user_reported_claims:['Road surface is damaged'],inferences:[],unverified_assumptions:[],
  severity:'HIGH',confidence_level:'MEDIUM',evidence_sufficiency:'PARTIALLY_SUFFICIENT',hazards:['Possible traffic conflict'],
  recommended_department:'ROAD_MAINTENANCE',recommended_actions:['Inspect the roadway'],missing_information:['Exact dimensions'],emergency_warning:false,requires_human_review:true
};

test('HTTP frontend + backend contract integration',async t=>{
  let createApp;
  try {({createApp}=await import('../../server/src/app.js'));}
  catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'){t.skip('npm install is required for Express/Helmet/CORS HTTP integration');return;}throw e;}
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'citypulse-http-'));
  const repo=createLocalRepo(path.join(dir,'db.json'));
  const ai={name:'mock-model',model:'mock',configured:true,supports:{text:true,image:true,audio:true,video:true},analyzeText:async()=>fakeAnalysis,analyzeMedia:async()=>fakeAnalysis,analyzeFrames:async()=>fakeAnalysis};
  const app=createApp({repo,ai,config:{clientUrl:'http://localhost:3001',adminToken:'test-operator-very-secret',duplicateRadiusMeters:50,nodeEnv:'test',evidenceStorage:true,evidenceDirectory:path.join(dir,'evidence')}});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const request=async(p,method='GET',body,token)=>{
    const response=await fetch(origin+p,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{'x-admin-token':token}:{})},body:body?JSON.stringify(body):undefined});
    return [response.status,await response.json()];
  };
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});});
  await t.test('index and static assets',async()=>{
    const response=await fetch(origin+'/'); assert.equal(response.status,200);assert.match(await response.text(),/CITYPULSE AI/);
    const src=await fetch(origin+'/src/main.js');assert.equal(src.status,200);assert.match(await src.text(),/function renderReport/);
  });
  await t.test('health and initial summary',async()=>{const [s,b]=await request('/api/health');assert.equal(s,200);assert.equal(b.data.storage,'local-file');const [x,c]=await request('/api/dashboard/summary');assert.equal(x,200);assert.equal(c.data.total,0);});
  let id; let usedTicket;
  await t.test('text analysis + persistent report',async()=>{
    const [s,b]=await request('/api/analyze/text','POST',{description:'Broken pavement is a hazard to vehicles.'});assert.equal(s,200);assert.ok(b.data.analysis_id);
    const [x,c]=await request('/api/incidents','POST',{analysis_id:b.data.analysis_id,latitude:40.4093,longitude:49.8671,location_source:'MAP_PIN'});
    assert.equal(x,201);usedTicket=b.data.analysis_id;id=c.data.incident.id;assert.match(id,/CP-\d{4}-\d+/);assert.equal((await repo.getIncident(id)).id,id);
  });
  await t.test('single-use analysis is rejected on replay, and public reports redact private details',async()=>{
    const [replayed]=await request('/api/incidents','POST',{analysis_id:usedTicket});
    assert.equal(replayed,400);
    const [publicStatus,publicList]=await request('/api/incidents');
    assert.equal(publicStatus,200);
    assert.equal(publicList.data.incidents[0].original_description,undefined);
    assert.equal(publicList.data.incidents[0].analysis,undefined);
    const [adminStatus,adminList]=await request('/api/incidents','GET',undefined,'test-operator-very-secret');
    assert.equal(adminStatus,200);
    assert.ok(adminList.data.incidents[0].original_description);
    assert.ok(adminList.data.incidents[0].analysis);
    assert.ok(!publicList.data.incidents[0].title.includes('Damaged roadway'));
  });
  await t.test('duplicate requires explicit action',async()=>{
    const [,b]=await request('/api/analyze/text','POST',{description:'Broken pavement is a hazard to vehicles.'});
    const [s,c]=await request('/api/incidents','POST',{analysis_id:b.data.analysis_id,latitude:40.4093,longitude:49.8671,location_source:'MAP_PIN'});
    assert.equal(s,200);assert.equal(c.data.requires_decision,true);
  });
  await t.test('photo signature validation and multimodal analysis',async()=>{
    const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(80)]).toString('base64');
    const [s,b]=await request('/api/analyze/image','POST',{description:'Road issue',mimeType:'image/png',data:png});assert.equal(s,200);assert.ok(b.data.analysis_id);
    const [x]=await request('/api/analyze/image','POST',{description:'Road issue',mimeType:'image/png',data:Buffer.alloc(80).toString('base64')});assert.equal(x,415);
  });
  await t.test('video JPEG frames use real vision adapter and save private evidence only with opt-in',async()=>{
    const frame=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(100)]).toString('base64');
    const [a,analysis]=await request('/api/analyze/frames','POST',{description:'Damaged street',frames:[frame,frame],retainEvidence:true});
    assert.equal(a,200);
    const [created,record]=await request('/api/incidents','POST',{analysis_id:analysis.data.analysis_id,latitude:40.45,longitude:49.89,location_source:'MAP_PIN'});
    assert.equal(created,201);
    assert.equal(record.data.incident.evidence.length,1);
    const evid=record.data.incident.evidence[0];
    const noAuth=await fetch(origin+`/api/evidence/${evid.id}`);
    assert.equal(noAuth.status,401);
    const yesAuth=await fetch(origin+`/api/evidence/${evid.id}`,{headers:{'x-admin-token':'test-operator-very-secret'}});
    assert.equal(yesAuth.status,200);
    assert.deepEqual(Buffer.from(await yesAuth.arrayBuffer()),Buffer.from(frame,'base64'));
  });
  await t.test('privileged status updates and work order lifecycle',async()=>{
    const [u]=await request(`/api/incidents/${id}/status`,'PATCH',{status:'REVIEWED'});assert.equal(u,401);
    const token='test-operator-very-secret';
    const [a]=await request(`/api/incidents/${id}/status`,'PATCH',{status:'REVIEWED'},token);assert.equal(a,200);
    const [b]=await request(`/api/incidents/${id}/status`,'PATCH',{status:'ASSIGNED'},token);assert.equal(b,200);
    const [created,data]=await request('/api/work-orders','POST',{incident_id:id,assigned_department:'ROAD_MAINTENANCE',priority:'HIGH',operator_notes:'Inspect the location.'},token);
    assert.equal(created,201);assert.ok(data.data.work_order.id);
    const [prog]=await request(`/api/work-orders/${data.data.work_order.id}`,'PATCH',{status:'IN_PROGRESS'},token);assert.equal(prog,200);
    const [done]=await request(`/api/work-orders/${data.data.work_order.id}`,'PATCH',{status:'COMPLETED'},token);assert.equal(done,200);
  });
});
