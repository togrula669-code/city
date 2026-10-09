/** Small synthetic heuristic regression benchmark; NOT an AI model accuracy claim. */
import { findDuplicateCandidates } from '../server/src/services/duplicates.js';
const base={id:'CP-TEST',title:'Pothole near bus stop',original_description:'Damaged asphalt with large pothole',category:'ROAD_DAMAGE',analysis:{incident_subtype:'POTHOLE'},latitude:40.4093,longitude:49.8671,status:'PENDING_REVIEW'};
const tests=[
  ['Same original wording',true,'Pothole near bus stop','Damaged asphalt with large pothole','ROAD_DAMAGE','POTHOLE',40.40930,49.86710],
  ['English synonym',true,'Street cavity','Vehicles avoid a large hole','ROAD_DAMAGE','POTHOLE',40.40931,49.86711],
  ['Azerbaijani wording',true,'Yolda çuxur var','Çuxur nəqliyyata mane olur','ROAD_DAMAGE','POTHOLE',40.40931,49.86711],
  ['Turkish wording',true,'Yolda çukur var','Asfaltta büyük çukur','ROAD_DAMAGE','POTHOLE',40.40931,49.86711],
  ['Different title same subtype',true,'Unsafe street damage','Traffic must avoid the surface','ROAD_DAMAGE','POTHOLE',40.40933,49.86710],
  ['Different distance nearby',true,'Damaged road with hole','Pothole at junction','ROAD_DAMAGE','POTHOLE',40.40938,49.86710],
  ['Very distant pothole',false,'Another pothole','Large pothole elsewhere','ROAD_DAMAGE','POTHOLE',40.5,49.9],
  ['Same location lighting',false,'Broken streetlight','Lamp stopped working','STREET_LIGHTING','LAMP',40.4093,49.8671],
  ['Same location waste',false,'Overflowing waste bin','Trash everywhere','WASTE_MANAGEMENT','WASTE_BIN',40.4093,49.8671],
  ['Same location walkway',false,'Cracked sidewalk','Pedestrian walkway issue','SIDEWALK_DAMAGE','SIDEWALK_CRACK',40.4093,49.8671],
  ['Nearby bus shelter',false,'Shelter damage','Broken bus stop shelter','BUS_STOP_DAMAGE','ROOF',40.40932,49.86710],
  ['Empty unmatched road incident',false,'Unrelated','No related details','ROAD_DAMAGE','UNRELATED',40.412,49.867],
];
let tp=0,fp=0,fn=0,tn=0;
for(const [name,expected,title,description,category,subtype,latitude,longitude] of tests){
  const result=findDuplicateCandidates({title,description,category,subtype,latitude,longitude},[base]);
  const predicted=result.candidates.length>0;
  if(expected&&predicted)tp++;else if(expected&&!predicted)fn++;else if(!expected&&predicted)fp++;else tn++;
  console.log(`${predicted===expected?'PASS':'MISS'}  ${name}: predicted=${predicted}, expected=${expected}`);
}
const fraction=(a,b)=>b?Number((a/b).toFixed(3)):null;
console.log(JSON.stringify({dataset:'synthetic limited text+geo samples',samples:tests.length,tp,fp,fn,tn,precision:fraction(tp,tp+fp),recall:fraction(tp,tp+fn)},null,2));
if(fp||fn)process.exitCode=1;
