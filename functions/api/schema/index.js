import { createHandler } from "../../../lib/store.js";

// POST /api/schema -> create a new schema, returns the full document (with its id)
export const onRequestPost = ({ request, env }) => createHandler(request, env.LOOPMAATJE);
