import { getHandler, patchHandler } from "../../../lib/store.js";

// GET /api/schema/:id   -> the schema
// PATCH /api/schema/:id -> apply one change ({op: "check" | "note" | "extra.add" | "extra.del" | "plan", ...})
export const onRequestGet = ({ params, env }) => getHandler(params.id, env.LOOPMAATJE);
export const onRequestPatch = ({ request, params, env }) => patchHandler(request, params.id, env.LOOPMAATJE);
