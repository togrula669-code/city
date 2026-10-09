// Optional Node.js built-in .env support; defaults to data/db.json if absent.
try { process.loadEnvFile?.('.env'); } catch {}
import path from 'node:path';
import { createLocalRepo } from '../server/src/repositories/localRepo.js';
const repo = createLocalRepo(path.resolve(process.env.LOCAL_DB_FILE || 'data/db.json'));
const examples = [
  ['Road surface damage near a sample bus stop','ROAD_DAMAGE','HIGH',79,40.4087,49.8680,'A sample pothole report near a bus stop.','ROAD_MAINTENANCE'],
  ['Unlit pedestrian crossing reported','STREET_LIGHTING','MEDIUM',57,40.4164,49.8540,'Sample concern about crossing illumination.','LIGHTING'],
  ['Overflowing public waste container','WASTE_MANAGEMENT','LOW',32,40.3964,49.8650,'Synthetic report of accumulated household waste.','WASTE'],
  ['Damaged pavement blocks','SIDEWALK_DAMAGE','MEDIUM',51,40.4202,49.8383,'Synthetic observation of uneven sidewalk tiles.','ROAD_MAINTENANCE'],
  ['Possible water leakage at the curb','WATER_LEAK','HIGH',74,40.3905,49.8523,'Synthetic report of water near a road edge.','WATER_UTILITY'],
  ['Bus shelter roof damage','BUS_STOP_DAMAGE','MEDIUM',49,40.4049,49.8809,'Synthetic observation of damage to a bus shelter.','PUBLIC_TRANSPORT'],
  ['Standing water along a road','DRAINAGE_FLOODING','HIGH',77,40.4147,49.8916,'Synthetic report of pooled rainwater.','DRAINAGE']
];
let added=0;
for(const [title,category,severity,priority,latitude,longitude,desc,department] of examples){
  const existing=await repo.listIncidents();
  if(existing.some(i=>i.is_sample && i.title===title))continue;
  await repo.createIncident({title,original_description:desc,ai_summary:desc,category,severity,operational_priority:priority,priority_factors:['SYNTHETIC_DEMO_PRIORITY'],latitude,longitude,location_source:'MAP_PIN',status:'PENDING_REVIEW',is_sample:true,analysis:{incident_category:category,incident_subtype:'SAMPLE',title,summary:desc,observed_evidence:[],user_reported_claims:[desc],inferences:[],unverified_assumptions:[],severity,confidence_level:'UNDETERMINED',evidence_sufficiency:'INSUFFICIENT',hazards:[],recommended_department:department,recommended_actions:['Operator inspection required'],missing_information:['Synthetic demo data; not physically verified'],emergency_warning:false,requires_human_review:true},analysis_meta:{provider:'synthetic-fixture',model:null,duration_ms:null}});
  added++;
}
console.log(`Synthetic demo seed complete: ${added} added. These are NOT real Baku reports or AI predictions.`);
