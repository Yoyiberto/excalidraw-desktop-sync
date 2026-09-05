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
});
