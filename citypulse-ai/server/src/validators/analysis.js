import { CATEGORIES, SEVERITIES, CONFIDENCE_LEVELS, EVIDENCE_SUFFICIENCY, DEPARTMENTS } from '../../../shared/constants.js';

const MAX_STR = 600;
const MAX_ITEMS = 12;

function enumField(obj, key, allowed, errors) {
  const v = typeof obj[key] === 'string' ? obj[key].trim().toUpperCase() : undefined;
  if (!allowed.includes(v)) { errors.push(`${key} must be one of ${allowed.join(', ')}`); return undefined; }
  return v;
}
function strField(obj, key, errors, required = true) {
  const v = obj[key];
  if (v === undefined || v === null || v === '') { if (required) errors.push(`${key} is required`); return ''; }
  if (typeof v !== 'string') { errors.push(`${key} must be a string`); return ''; }
  return v.trim().slice(0, MAX_STR);
}
function arrField(obj, key, errors) {
  const v = obj[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) { errors.push(`${key} must be an array of strings`); return []; }
  return v.map((s) => s.trim().slice(0, MAX_STR)).filter(Boolean).slice(0, MAX_ITEMS);
}

/** Strict validation of model output. Invalid enum values are rejected, never guessed. */
export function validateAnalysis(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['Analysis must be an object'] };
  const value = {
    incident_category: enumField(raw, 'incident_category', CATEGORIES, errors),
    incident_subtype: strField(raw, 'incident_subtype', errors, false).toUpperCase() || 'UNSPECIFIED',
    title: strField(raw, 'title', errors).slice(0, 120),
    summary: strField(raw, 'summary', errors),
    observed_evidence: arrField(raw, 'observed_evidence', errors),
    user_reported_claims: arrField(raw, 'user_reported_claims', errors),
    inferences: arrField(raw, 'inferences', errors),
    unverified_assumptions: arrField(raw, 'unverified_assumptions', errors),
    severity: enumField(raw, 'severity', SEVERITIES, errors),
    confidence_level: enumField(raw, 'confidence_level', CONFIDENCE_LEVELS, errors),
    evidence_sufficiency: enumField(raw, 'evidence_sufficiency', EVIDENCE_SUFFICIENCY, errors),
    hazards: arrField(raw, 'hazards', errors),
    recommended_department: enumField(raw, 'recommended_department', DEPARTMENTS, errors),
    recommended_actions: arrField(raw, 'recommended_actions', errors),
    missing_information: arrField(raw, 'missing_information', errors),
    emergency_warning: raw.emergency_warning === true,
    // AI output can never waive human review.
    requires_human_review: true
  };
  if (typeof raw.emergency_warning !== 'undefined' && typeof raw.emergency_warning !== 'boolean') errors.push('emergency_warning must be boolean');
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
