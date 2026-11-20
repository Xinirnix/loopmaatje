// Local development server: serves public/ and the API with an in-memory store.
// No dependencies needed: `npm run dev` then open http://localhost:8788
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createHandler, getHandler, patchHandler } from "../lib/store.js";

const root = new URL("../public/", import.meta.url).pathname;
const mem = new Map();
const kv = { get: async (k) => mem.get(k) ?? null, put: async (k, v) => void mem.set(k, v) };
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let response;
  const m = url.pathname.match(/^\/api\/schema(?:\/([^/]+))?$/);
  if (m) {
    const body = ["POST", "PATCH"].includes(req.method) ? await new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); }) : undefined;
    const request = new Request(url, { method: req.method, body });
    if (!m[1] && req.method === "POST") response = await createHandler(request, kv);
    else if (m[1] && req.method === "GET") response = await getHandler(m[1], kv);
    else if (m[1] && req.method === "PATCH") response = await patchHandler(request, m[1], kv);
    else response = new Response("Method not allowed", { status: 405 });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    return res.end(await response.text());
  }
  let path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!path.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (path.endsWith("/")) path += "index.html";
  if (!extname(path)) path += ".html"; // like Cloudflare Pages: /schema -> schema.html
  try {
    const data = await readFile(path);
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("Niet gevonden"); }
}).listen(process.env.PORT || 8788, () => console.log(`Loopmaatje draait op http://localhost:${process.env.PORT || 8788}`));
