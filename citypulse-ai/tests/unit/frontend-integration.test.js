import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { createLocalRepo } from '../../server/src/repositories/localRepo.js';

test('local work orders are durable and updates persist across repo instances',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'citypulse-work-'));
  try{
    const filename=path.join(dir,'data.json');
    const repo=createLocalRepo(filename);
    const created=await repo.createWorkOrder({id:'work-1',incident_id:'CP-DEMO-1',assigned_department:'ROAD_MAINTENANCE',priority:'HIGH',operator_notes:'Inspect',status:'OPEN'});
    assert.equal(created.status,'OPEN');
    await repo.updateWorkOrder('work-1',{status:'IN_PROGRESS'});
    const other=createLocalRepo(filename);
    assert.equal((await other.listWorkOrders()).length,1);
    assert.equal((await other.getWorkOrder('work-1')).status,'IN_PROGRESS');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('frontend key application resources are present',async()=>{
  const base=path.resolve(import.meta.dirname,'../..');
  for(const f of ['client/index.html','client/src/main.js','client/src/api.js','client/src/icons.js','client/src/styles.css']){
    const stat=await fs.stat(path.join(base,f));assert.ok(stat.size>200,`${f} empty`);
  }
});
