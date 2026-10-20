import { describe, it, expect, beforeAll } from "vitest";
import app from "../src/index";

// Mock D1 database for unit tests
class MockD1PreparedStatement {
  private query: string;
  private params: any[] = [];
  private db: MockD1Database;

  constructor(query: string, db: MockD1Database) {
    this.query = query;
    this.db = db;
  }

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async all() {
    return { results: Array.from(this.db.storage.values()).filter((d) => d.is_deleted === 0) };
  }

  async first() {
    const id = this.params[0];
    const item = this.db.storage.get(id);
    if (!item || item.is_deleted === 1) return null;
    return item;
  }

  async run() {
    if (this.query.includes("INSERT INTO drawings")) {
      const [id, title, content_json, files_json, created_at, updated_at] = this.params;
      this.db.storage.set(id, {
        id,
        title,
        content_json,
        files_json,
        created_at,
        updated_at,
        is_deleted: 0,
      });
    } else if (this.query.includes("UPDATE drawings SET is_deleted = 1")) {
      const [updated_at, id] = this.params;
      const item = this.db.storage.get(id);
      if (item) {
        item.is_deleted = 1;
        item.updated_at = updated_at;
      }
    }
    return { success: true };
  }
}

class MockR2Bucket {
  public objects = new Map<string, { body: ArrayBuffer; contentType?: string }>();

  async put(key: string, body: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
    this.objects.set(key, { body, contentType: opts?.httpMetadata?.contentType });
    return {};
  }

  async get(key: string) {
    const obj = this.objects.get(key);
    if (!obj) return null;
    return {
      body: obj.body,
      httpEtag: `"${key}"`,
      writeHttpMetadata(headers: Headers) {
        if (obj.contentType) headers.set("Content-Type", obj.contentType);
      },
    };
  }
}

class MockD1Database {
  public storage = new Map<string, any>();

  prepare(query: string) {
    return new MockD1PreparedStatement(query, this);
  }
}

describe("Cloudflare Sync Worker API", () => {
  let mockDb: MockD1Database;
  const env = {
    DB: undefined as any,
    AUTH_KEY: "",
  };

  beforeAll(() => {
    mockDb = new MockD1Database();
    env.DB = mockDb as any;
  });

  it("should respond to health check", async () => {
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe("ok");
    expect(body.service).toBe("draw-sync-worker");
  });

  it("should create and upsert a drawing", async () => {
    const testDrawing = {
      title: "Architecture Diagram",
      content: { elements: [{ id: "box-1", type: "rectangle" }] },
      files: {},
      updatedAt: 1700000000000,
    };

    const res = await app.request(
      "/api/drawings/diag-123",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testDrawing),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.id).toBe("diag-123");
    expect(body.title).toBe("Architecture Diagram");
  });

  it("should list drawings", async () => {
    const res = await app.request("/api/drawings", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.drawings).toBeDefined();
    expect(body.drawings.length).toBe(1);
    expect(body.drawings[0].id).toBe("diag-123");
  });

  it("should fetch single drawing details", async () => {
    const res = await app.request("/api/drawings/diag-123", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.id).toBe("diag-123");
    expect(body.title).toBe("Architecture Diagram");
    expect(body.content.elements.length).toBe(1);
  });

  it("should delete drawing", async () => {
    const res = await app.request(
      "/api/drawings/diag-123",
      {
        method: "DELETE",
      },
      env
    );
    expect(res.status).toBe(200);

    // Verify it's no longer returned in list
    const listRes = await app.request("/api/drawings", {}, env);
    const listBody = await listRes.json() as any;
    expect(listBody.drawings.length).toBe(0);
  });

  it("should enforce authentication if AUTH_KEY is set", async () => {
    const authEnv = {
      ...env,
      AUTH_KEY: "secret-token-123",
    };

    // Unauthenticated request
    const unauthorizedRes = await app.request("/api/drawings", {}, authEnv);
    expect(unauthorizedRes.status).toBe(401);

    // Authenticated request
    const authorizedRes = await app.request(
      "/api/drawings",
      {
        headers: { Authorization: "Bearer secret-token-123" },
      },
      authEnv
    );
    expect(authorizedRes.status).toBe(200);
  });

  describe("R2 assets", () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

    it("returns 503 when the R2 bucket is not bound", async () => {
      const res = await app.request(
        "/api/assets/abc123",
        { method: "POST", headers: { "Content-Type": "image/png" }, body: pngBytes },
        env
      );
      expect(res.status).toBe(503);
      const getRes = await app.request("/api/assets/abc123", {}, env);
      expect(getRes.status).toBe(503);
    });

    it("uploads an asset and downloads the same bytes", async () => {
      const bucket = new MockR2Bucket();
      const r2Env = { ...env, ASSETS: bucket as any };

      const upRes = await app.request(
        "/api/assets/abc123",
        { method: "POST", headers: { "Content-Type": "image/png" }, body: pngBytes },
        r2Env
      );
      expect(upRes.status).toBe(200);
      const upBody = (await upRes.json()) as any;
      expect(upBody).toMatchObject({ success: true, hash: "abc123", size: pngBytes.length, mimeType: "image/png" });
      expect(bucket.objects.has("abc123")).toBe(true);

      const getRes = await app.request("/api/assets/abc123", {}, r2Env);
      expect(getRes.status).toBe(200);
      expect(getRes.headers.get("Content-Type")).toBe("image/png");
      expect(getRes.headers.get("Cache-Control")).toContain("immutable");
      expect(new Uint8Array(await getRes.arrayBuffer())).toEqual(pngBytes);
    });

    it("returns 404 for a missing asset", async () => {
      const r2Env = { ...env, ASSETS: new MockR2Bucket() as any };
      const res = await app.request("/api/assets/missing", {}, r2Env);
      expect(res.status).toBe(404);
    });

    it("rejects an empty upload", async () => {
      const r2Env = { ...env, ASSETS: new MockR2Bucket() as any };
      const res = await app.request("/api/assets/empty", { method: "POST", body: new Uint8Array() }, r2Env);
      expect(res.status).toBe(400);
    });

    it("still stores the asset if the drawing_assets insert fails", async () => {
      const bucket = new MockR2Bucket();
      const failingDb = {
        prepare: () => ({ bind: () => ({ run: async () => { throw new Error("no such table: drawing_assets"); } }) }),
      };
      const res = await app.request(
        "/api/assets/def456",
        { method: "POST", headers: { "Content-Type": "image/webp" }, body: pngBytes },
        { ...env, DB: failingDb as any, ASSETS: bucket as any }
      );
      expect(res.status).toBe(200);
      expect(bucket.objects.get("def456")?.contentType).toBe("image/webp");
    });

    it("requires auth for assets when AUTH_KEY is set", async () => {
      const r2Env = { ...env, AUTH_KEY: "secret-token-123", ASSETS: new MockR2Bucket() as any };
      const res = await app.request("/api/assets/abc123", {}, r2Env);
      expect(res.status).toBe(401);
    });
  });

  it("stores metadata-only files_json without dataURLs", async () => {
    const files = { abc123: { id: "abc123", mimeType: "image/png", created: 1 } };
    await app.request(
      "/api/drawings/img-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Img", content: { elements: [] }, files, updatedAt: 5 }),
      },
      env
    );
    const res = await app.request("/api/drawings/img-1", {}, env);
    const body = (await res.json()) as any;
    expect(body.files).toEqual(files);
  });
});
