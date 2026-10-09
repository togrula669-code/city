import { haversineMeters, isValidCoordinate } from '../utils/geo.js';

// A deliberately small multilingual synonym lexicon for the demo. This is not an
// embedding model; scores are heuristics and never authorize automatic merging.
const STOP = new Set(['the','a','an','is','are','on','in','at','of','and','to','near','with','it','this','that','there','bir','ve','və','bu','icin','üçün','yaxin','yaxın','yer','place','very','large','big','huge','road','street','yol','yolda','küçə','kucə','nearby','beside','next','by']);
const GROUPS = [
  ['pothole','potholes','hole','holes','cavity','crater','çuxur','cuxur','çukur','cukur','oyuq','oyuk','pit'],
  ['asphalt','asfalt','pavement','roadway','roadbed'],
  ['damage','damaged','broken','break','cracked','çat','çatlaq','catlaq','zədə','zede','zədələnib','zedelenib'],
  ['light','lights','lighting','lamp','streetlight','lamppost','işıq','isiq','işıqlar','isiqlar','fənər','fener'],
  ['trash','garbage','rubbish','waste','zibil','çöp','cop'],
  ['water','su','sızma','sizma','leak','leakage'],
  ['flood','flooding','sualtı','subasma','daşqın','dasqin'],
  ['sidewalk','footpath','pavementpath','səki','seki','trotuar'],
  ['bus','avtobus','otobus'],['stop','station','dayanacaq','durak'],
  ['sign','signage','nişan','nisan','levha'],
  ['danger','dangerous','unsafe','təhlükə','tehluke','təhlükəli','tehlukeli'],
];
const CANON = new Map(GROUPS.flatMap(group => group.map(word => [word, group[0]])));
const normalize = word => word.toLowerCase().normalize('NFKC').replace(/\p{M}/gu,'');
export function tokenize(text = '') {
  return new Set((String(text).toLocaleLowerCase('az').normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [])
    .map(normalize).filter(w => w.length > 2 && !STOP.has(w))
    .map(w => CANON.get(w) || w));
}
export function jaccard(a,b) {
  if(!a.size || !b.size) return 0;
  let n=0;for(const x of a) if(b.has(x)) n++;
  return n/(a.size+b.size-n);
}
const WEAK = new Set(['OTHER','UNDETERMINED']);
export function categoriesCompatible(a,b){return a===b||WEAK.has(a)||WEAK.has(b);}
export function findDuplicateCandidates(candidate, existing, opts={}){
  const {radiusMeters=50,relatedRadiusMeters=150,likelySimilarity=0.5,relatedSimilarity=0.25}=opts;
  if(!isValidCoordinate(candidate.latitude,candidate.longitude))return {status:'INSUFFICIENT_EVIDENCE',reason:'No valid location supplied',candidates:[]};
  const source=tokenize(`${candidate.title||''} ${candidate.description||''}`);
  const out=[];
  for(const inc of existing){
    if(!isValidCoordinate(inc.latitude,inc.longitude)||!categoriesCompatible(candidate.category,inc.category))continue;
    const distance=haversineMeters(candidate.latitude,candidate.longitude,inc.latitude,inc.longitude);
    if(distance>relatedRadiusMeters)continue;
    const similarity=jaccard(source,tokenize(`${inc.title||''} ${inc.original_description||''}`));
    const subtypeA=String(candidate.subtype||'').toUpperCase(),subtypeB=String(inc.analysis?.incident_subtype||inc.subtype||'').toUpperCase();
    const sameSubtype=subtypeA.length>2&&subtypeA!=='OTHER'&&subtypeA!=='UNKNOWN'&&subtypeA===subtypeB;
    let classification=null;
    if(distance<=radiusMeters&&similarity>=likelySimilarity)classification='LIKELY_DUPLICATE';
    else if(distance<=radiusMeters&&similarity>=relatedSimilarity)classification='POSSIBLY_RELATED';
    else if(distance<=25&&sameSubtype&&candidate.category===inc.category)classification='POSSIBLY_RELATED';
    else if(distance<=relatedRadiusMeters&&candidate.category===inc.category&&similarity>=likelySimilarity)classification='POSSIBLY_RELATED';
    if(!classification)continue;
    out.push({incident_id:inc.id,title:inc.title,category:inc.category,status:inc.status,distance_meters:Math.round(distance),text_similarity:Number(similarity.toFixed(2)),classification,method:'geo+unicode-token-synonyms+subtype'});
  }
  out.sort((a,b)=>Number(b.classification==='LIKELY_DUPLICATE')-Number(a.classification==='LIKELY_DUPLICATE')||b.text_similarity-a.text_similarity||a.distance_meters-b.distance_meters);
  return {status:out.length?'CANDIDATES_FOUND':'DISTINCT',candidates:out};
}
