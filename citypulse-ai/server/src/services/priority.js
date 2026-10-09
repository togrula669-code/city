// Deterministic operational priority score (0-100).
// This is NOT AI confidence and NOT a physical hazard probability.
const CATEGORY_BASE = {
  ROAD_DAMAGE: 40, DRAINAGE_FLOODING: 40, WATER_LEAK: 35, ACCESSIBILITY_OBSTRUCTION: 30,
  STREET_LIGHTING: 30, SIDEWALK_DAMAGE: 28, TRAFFIC_SIGN_DAMAGE: 28, BUS_STOP_DAMAGE: 22,
  PUBLIC_INFRASTRUCTURE: 25, WASTE_MANAGEMENT: 20, OTHER: 15, UNDETERMINED: 10
};
const SEVERITY_HINT = { CRITICAL: 30, HIGH: 20, MEDIUM: 10, LOW: 0, NEEDS_REVIEW: 0 };
const DAY_MS = 86400000;

export function computePriority(input, now = new Date()) {
  const {
    category = 'UNDETERMINED', severity = 'NEEDS_REVIEW', hazards = [],
    emergency_warning = false, evidence_sufficiency = 'PARTIALLY_SUFFICIENT',
    independent_reports = 1, created_at = now.toISOString()
  } = input;
  const factors = [];
  const add = (name, points, note) => { factors.push({ name, points, note }); };

  add('category_base', CATEGORY_BASE[category] ?? CATEGORY_BASE.UNDETERMINED, `Base weight for ${category}`);
  add('ai_severity_hint', SEVERITY_HINT[severity] ?? 0, `AI severity suggestion: ${severity}`);
  add('hazards', Math.min(10, hazards.length * 5), `${hazards.length} hazard(s) listed`);
  if (emergency_warning) add('emergency_warning', 15, 'Possible emergency flagged for operator attention');
  const extra = Math.max(0, Math.floor(independent_reports) - 1);
  add('corroboration', Math.min(10, extra * 3), `${Math.max(1, Math.floor(independent_reports))} distinct source(s); unverified, capped`);
  if (evidence_sufficiency === 'INSUFFICIENT' || evidence_sufficiency === 'CONTRADICTORY') {
    add('evidence_penalty', -10, `Evidence is ${evidence_sufficiency}`);
  }
  const ageDays = Math.max(0, (now.getTime() - new Date(created_at).getTime()) / DAY_MS);
  add('age', Math.min(10, Math.floor(ageDays)), `Open for ${Math.floor(ageDays)} day(s)`);

  const raw = factors.reduce((s, f) => s + f.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  let level;
  if (evidence_sufficiency === 'INSUFFICIENT') level = 'NEEDS_REVIEW';
  else if (score >= 80) level = 'CRITICAL';
  else if (score >= 60) level = 'HIGH';
  else if (score >= 35) level = 'MEDIUM';
  else level = 'LOW';
  return { score, level, factors };
}
