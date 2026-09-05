import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  DB: D1Database;
  ASSETS?: R2Bucket;
  AUTH_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for desktop app & web clients
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Auth-Key"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
  })
);

// Optional authentication middleware
app.use("/api/*", async (c, next) => {
  // If no AUTH_KEY is configured on worker, allow open access for single-user dev
  const requiredKey = c.env.AUTH_KEY;
  if (!requiredKey || requiredKey.trim() === "") {
    return next();
  }

  // Health endpoint is public
  if (c.req.path === "/api/health") {
    return next();
  }

  const authHeader = c.req.header("Authorization") || c.req.header("X-Auth-Key") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (token !== requiredKey) {
    return c.json({ error: "Unauthorized: Invalid or missing auth key" }, 401);
  }

  await next();
});

// Health check
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    service: "draw-sync-worker",
    timestamp: Date.now(),
    hasR2: !!c.env.ASSETS,
    hasD1: !!c.env.DB,
  });
});

// List all active drawings (metadata only)
app.get("/api/drawings", async (c) => {
  try {
    const result = await c.env.DB.prepare(
      "SELECT id, title, created_at, updated_at, LENGTH(content_json) as size FROM drawings WHERE is_deleted = 0 ORDER BY updated_at DESC"
    ).all();

    return c.json({
      drawings: result.results || [],
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to list drawings" }, 500);
  }
});

// Get a single drawing with full canvas data
app.get("/api/drawings/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const record = await c.env.DB.prepare(
      "SELECT id, title, content_json, files_json, created_at, updated_at FROM drawings WHERE id = ? AND is_deleted = 0"
    )
      .bind(id)
      .first<{
        id: string;
        title: string;
        content_json: string;
        files_json: string;
        created_at: number;
        updated_at: number;
      }>();

    if (!record) {
      return c.json({ error: "Drawing not found" }, 404);
    }

    return c.json({
      id: record.id,
      title: record.title,
      content: JSON.parse(record.content_json || "{}"),
      files: JSON.parse(record.files_json || "{}"),
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to fetch drawing" }, 500);
  }
});

// Upsert a drawing (Create or Update)
app.put("/api/drawings/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json<{
      title?: string;
      content?: any;
      files?: any;
      updatedAt?: number;
    }>();

    const title = (body.title || "Untitled").trim();
    const contentJson = typeof body.content === "string" ? body.content : JSON.stringify(body.content || {});
    const filesJson = typeof body.files === "string" ? body.files : JSON.stringify(body.files || {});
    const now = body.updatedAt || Date.now();

    await c.env.DB.prepare(`
      INSERT INTO drawings (id, title, content_json, files_json, created_at, updated_at, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        content_json = excluded.content_json,
        files_json = excluded.files_json,
        updated_at = excluded.updated_at,
        is_deleted = 0
    `)
      .bind(id, title, contentJson, filesJson, now, now)
      .run();

    return c.json({
      success: true,
      id,
      title,
      updatedAt: now,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to save drawing" }, 500);
  }
});

// Delete a drawing (soft delete)
app.delete("/api/drawings/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const now = Date.now();
    await c.env.DB.prepare(
      "UPDATE drawings SET is_deleted = 1, updated_at = ? WHERE id = ?"
    )
      .bind(now, id)
      .run();

    return c.json({ success: true, id, deletedAt: now });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to delete drawing" }, 500);
  }
});

// Upload image asset to R2
app.post("/api/assets/:hash", async (c) => {
  const hash = c.req.param("hash");
  if (!c.env.ASSETS) {
    return c.json({ error: "R2 bucket not bound" }, 503);
  }

  try {
    const contentType = c.req.header("Content-Type") || "application/octet-stream";
    const body = await c.req.arrayBuffer();

    await c.env.ASSETS.put(hash, body, {
      httpMetadata: { contentType },
    });

    // Save asset metadata to D1
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO drawing_assets (hash, mime_type, size, created_at) VALUES (?, ?, ?, ?)"
    )
      .bind(hash, contentType, body.byteLength, Date.now())
      .run();

    return c.json({ success: true, hash, size: body.byteLength, mimeType: contentType });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to upload asset" }, 500);
  }
});

// Download image asset from R2
app.get("/api/assets/:hash", async (c) => {
  const hash = c.req.param("hash");
  if (!c.env.ASSETS) {
    return c.json({ error: "R2 bucket not bound" }, 503);
  }

  try {
    const object = await c.env.ASSETS.get(hash);
    if (!object) {
      return c.json({ error: "Asset not found" }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(object.body, { headers });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to fetch asset" }, 500);
  }
});

export default app;
