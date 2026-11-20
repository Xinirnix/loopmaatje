// Small client for the Loopmaatje API plus the "my schedules" list kept in this browser.

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Er ging iets mis. Probeer het zo nog eens.");
    err.status = res.status;
    throw err;
  }
  return data;
}

export const createSchema = (plan, people) => call("POST", "/api/schema", { plan, people });
export const getSchema = (id) => call("GET", `/api/schema/${encodeURIComponent(id)}`);
export const change = (id, op) => call("PATCH", `/api/schema/${encodeURIComponent(id)}`, op);

const KEY = "loopmaatje.mine";
export function mySchemas() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
export function rememberSchema(id, title) {
  try {
    const list = mySchemas().filter((s) => s.id !== id);
    list.unshift({ id, title, seen: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch {}
}
export function forgetSchema(id) {
  try { localStorage.setItem(KEY, JSON.stringify(mySchemas().filter((s) => s.id !== id))); } catch {}
}
export const schemaUrl = (id) => `${location.origin}/schema?id=${id}`;
