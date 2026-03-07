import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types.js";

const USER_COLORS = [
  "#e11d48",
  "#db2777",
  "#c026d3",
  "#9333ea",
  "#7c3aed",
  "#4f46e5",
  "#2563eb",
  "#0284c7",
  "#0891b2",
  "#0d9488",
  "#059669",
  "#16a34a",
  "#65a30d",
  "#ca8a04",
  "#ea580c",
];

export class RegistryDO extends DurableObject<Env> {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.initTables();
  }

  private initTables() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        filename TEXT NOT NULL,
        size INTEGER NOT NULL,
        owner_email TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS views (
        user_email TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        last_viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_email, doc_id)
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        token_hash TEXT PRIMARY KEY,
        user_email TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL DEFAULT ''
      )
    `);
    // Migration: add expires_at to existing tables
    try {
      this.sql.exec(
        "ALTER TABLE api_tokens ADD COLUMN expires_at TEXT DEFAULT ''",
      );
      // Backfill existing tokens: expire 90 days from their creation
      this.sql.exec(
        "UPDATE api_tokens SET expires_at = datetime(created_at, '+90 days') WHERE expires_at = ''",
      );
    } catch {
      // Column already exists
    }
  }

  private pickColor(): string {
    return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  }

  async getUser(
    email: string,
  ): Promise<{ email: string; display_name: string; color: string } | null> {
    const rows = this.sql
      .exec("SELECT email, display_name, color FROM users WHERE email = ?", email)
      .toArray();
    if (rows.length === 0) return null;
    return rows[0] as { email: string; display_name: string; color: string };
  }

  async setUser(
    email: string,
    displayName: string,
  ): Promise<{ email: string; display_name: string; color: string }> {
    const existing = await this.getUser(email);
    if (existing) {
      this.sql.exec("UPDATE users SET display_name = ? WHERE email = ?", displayName, email);
      return { ...existing, display_name: displayName };
    }
    const color = this.pickColor();
    this.sql.exec(
      "INSERT INTO users (email, display_name, color) VALUES (?, ?, ?)",
      email,
      displayName,
      color,
    );
    return { email, display_name: displayName, color };
  }

  async createDocument(doc: {
    id: string;
    title: string;
    filename: string;
    size: number;
    owner_email: string;
  }) {
    this.sql.exec(
      "INSERT INTO documents (id, title, filename, size, owner_email) VALUES (?, ?, ?, ?, ?)",
      doc.id,
      doc.title,
      doc.filename,
      doc.size,
      doc.owner_email,
    );
  }

  async getDocument(id: string) {
    const rows = this.sql.exec("SELECT * FROM documents WHERE id = ?", id).toArray();
    return rows.length > 0 ? rows[0] : null;
  }

  async listDocuments(ownerEmail?: string) {
    if (ownerEmail) {
      return this.sql
        .exec(
          "SELECT * FROM documents WHERE owner_email = ? ORDER BY created_at DESC LIMIT 500",
          ownerEmail,
        )
        .toArray();
    }
    return this.sql.exec("SELECT * FROM documents ORDER BY created_at DESC LIMIT 500").toArray();
  }

  async getDocumentByFilename(filename: string, ownerEmail: string) {
    const rows = this.sql
      .exec(
        "SELECT * FROM documents WHERE filename = ? AND owner_email = ? LIMIT 1",
        filename,
        ownerEmail,
      )
      .toArray();
    return rows.length > 0 ? rows[0] : null;
  }

  async updateDocument(id: string, updates: { title: string; filename: string; size: number }) {
    this.sql.exec(
      "UPDATE documents SET title = ?, filename = ?, size = ? WHERE id = ?",
      updates.title,
      updates.filename,
      updates.size,
      id,
    );
  }

  async recordView(userEmail: string, docId: string) {
    this.sql.exec(
      "INSERT INTO views (user_email, doc_id, last_viewed_at) VALUES (?, ?, datetime('now')) ON CONFLICT(user_email, doc_id) DO UPDATE SET last_viewed_at = datetime('now')",
      userEmail,
      docId,
    );
  }

  async getRecentViews(userEmail: string, limit = 20) {
    return this.sql
      .exec(
        `SELECT d.id, d.title, d.filename, d.size, d.owner_email, d.created_at, v.last_viewed_at
       FROM views v JOIN documents d ON v.doc_id = d.id
       WHERE v.user_email = ?
       ORDER BY v.last_viewed_at DESC LIMIT ?`,
        userEmail,
        limit,
      )
      .toArray();
  }

  async deleteDocument(id: string) {
    this.sql.exec("DELETE FROM documents WHERE id = ?", id);
  }

  async createToken(tokenHash: string, email: string) {
    this.sql.exec(
      "INSERT OR REPLACE INTO api_tokens (token_hash, user_email, expires_at) VALUES (?, ?, datetime('now', '+90 days'))",
      tokenHash,
      email,
    );
  }

  async getTokenUser(
    tokenHash: string,
  ): Promise<{ user_email: string; expired: boolean } | null> {
    const rows = this.sql
      .exec(
        "SELECT user_email, expires_at, expires_at <= datetime('now') as expired FROM api_tokens WHERE token_hash = ?",
        tokenHash,
      )
      .toArray();
    if (rows.length === 0) return null;
    return {
      user_email: rows[0].user_email as string,
      expired: Boolean(rows[0].expired),
    };
  }

  async getTokenForUser(
    email: string,
  ): Promise<{ token_hash: string; created_at: string; expires_at: string } | null> {
    const rows = this.sql
      .exec(
        "SELECT token_hash, created_at, expires_at FROM api_tokens WHERE user_email = ? LIMIT 1",
        email,
      )
      .toArray();
    if (rows.length === 0) return null;
    return rows[0] as { token_hash: string; created_at: string; expires_at: string };
  }

  async deleteTokensForUser(email: string) {
    this.sql.exec("DELETE FROM api_tokens WHERE user_email = ?", email);
  }
}
