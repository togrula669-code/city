import fs from 'node:fs/promises';
import path from 'node:path';

/** File-backed persistent repository (local development mode). */
export function createLocalRepo(filePath) {
  let state = null;
  let chain = Promise.resolve();

  let loading = null;
  function load() {
    if (!loading) {
      loading = (async () => {
        try { state = JSON.parse(await fs.readFile(filePath, 'utf8')); }
        catch (e) { if (e.code !== 'ENOENT') { loading = null; throw e; } state = { counter: 0, incidents: [], audit: [], work_orders: [] }; }
        state.work_orders ||= [];
        return state;
      })();
    }
    return loading;
  }
  function persist() {
    const run = async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state, null, 2));
      await fs.rename(tmp, filePath);
    };
    chain = chain.then(run, run);
    return chain;
  }

  return {
    mode: 'local-file',
    async ping() { await load(); return true; },
    async listWorkOrders() { const s = await load(); return structuredClone(s.work_orders); },
    async getWorkOrder(id) { const s = await load(); const w = s.work_orders.find(x => x.id === id); return w ? structuredClone(w) : null; },
    async createWorkOrder(data) {
      const s = await load(); const now = new Date().toISOString();
      const w = { ...data, created_at: now, updated_at: now }; s.work_orders.push(w);
      s.audit.push({ entity_type: 'work_order', entity_id: w.id, event_type: 'CREATED', timestamp: now });
      await persist(); return structuredClone(w);
    },
    async updateWorkOrder(id, patch) {
      const s = await load(); const w = s.work_orders.find(x => x.id === id); if (!w) return null;
      Object.assign(w, patch, { updated_at: new Date().toISOString() });
      s.audit.push({ entity_type: 'work_order', entity_id: w.id, event_type: 'UPDATED', timestamp: w.updated_at });
      await persist(); return structuredClone(w);
    },
    async createIncident(data) {
      const s = await load();
      s.counter += 1;
      const now = new Date().toISOString();
      const id = `CP-${new Date().getUTCFullYear()}-${String(s.counter).padStart(6, '0')}`;
      const incident = { ...data, id, corroborations: [], history: [], created_at: now, updated_at: now };
      s.incidents.push(incident);
      s.audit.push({ entity_type: 'incident', entity_id: id, event_type: 'CREATED', timestamp: now });
      await persist();
      return structuredClone(incident);
    },
    async listIncidents({ status, category, severity } = {}) {
      const s = await load();
      return structuredClone(s.incidents.filter((i) =>
        (!status || i.status === status) && (!category || i.category === category) && (!severity || i.severity === severity)
      ).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
    async getIncident(id) {
      const s = await load();
      const i = s.incidents.find((x) => x.id === id);
      return i ? structuredClone(i) : null;
    },
    async updateIncident(id, patch, audit) {
      const s = await load();
      const i = s.incidents.find((x) => x.id === id);
      if (!i) return null;
      const now = new Date().toISOString();
      Object.assign(i, patch, { updated_at: now });
      if (audit) { i.history.push({ ...audit, timestamp: now }); s.audit.push({ entity_type: 'incident', entity_id: id, ...audit, timestamp: now }); }
      await persist();
      return structuredClone(i);
    }
  };
}
