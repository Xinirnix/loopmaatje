// Cloudflare Worker: handles /api/schema and serves the website from public/ for everything else.
import { createHandler, getHandler, patchHandler } from "../lib/store.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/schema(?:\/([^/]+))?\/?$/);
    if (!m) {
      if (url.pathname.startsWith("/api/")) return new Response("Niet gevonden", { status: 404 });
      return env.ASSETS.fetch(request);
    }
    const kv = env.LOOPMAATJE;
    if (!m[1] && request.method === "POST") return createHandler(request, kv);
    if (m[1] && request.method === "GET") return getHandler(m[1], kv);
    if (m[1] && request.method === "PATCH") return patchHandler(request, m[1], kv);
    return new Response("Method not allowed", { status: 405 });
  },
};
