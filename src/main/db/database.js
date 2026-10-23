import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const CURRENT_SCHEMA_VERSION = 1;

/**
 * Menginisialisasi koneksi SQLite ke file dbPath.
 * Jika berkas rusak/korup, otomatis memindahkan ke .corrupt dan membuat baru.
 */
export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  let db = null;
  try {
    db = new DatabaseSync(dbPath);
    // Verifikasi integritas dasar
    db.exec('PRAGMA foreign_keys = ON;');
  } catch (err) {
    if (dbPath !== ':memory:') {
      const corruptBackup = dbPath + '.corrupt.' + Date.now();
      try {
        if (fs.existsSync(dbPath)) fs.renameSync(dbPath, corruptBackup);
        db = new DatabaseSync(dbPath);
      } catch (innerErr) {
        throw new Error('Gagal menginisialisasi database SQLite: ' + String(innerErr.message || innerErr));
      }
    } else {
      throw err;
    }
  }

  runMigrations(db);
  return createDatabaseApi(db);
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedVersions = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(row => row.version)
  );

  if (!appliedVersions.has(1)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS printer_profiles (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        driver_name TEXT,
        raw_host TEXT,
        raw_port INTEGER,
        is_default INTEGER DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recent_files (
        path TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        paper_width INTEGER NOT NULL,
        last_opened_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recovery_snapshots (
        id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        file_path TEXT,
        updated_at TEXT NOT NULL
      );
    `);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(1, new Date().toISOString());
  }
}

function createDatabaseApi(db) {
  return {
    getPreference(key, defaultValue = null) {
      if (typeof key !== 'string') throw new TypeError('Key preferensi harus string.');
      const row = db.prepare('SELECT value FROM preferences WHERE key = ?').get(key);
      if (!row) return defaultValue;
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    },

    setPreference(key, value) {
      if (typeof key !== 'string') throw new TypeError('Key preferensi harus string.');
      const serialized = JSON.stringify(value);
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO preferences (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(key, serialized, now);
      return true;
    },

    getAllPreferences() {
      const rows = db.prepare('SELECT key, value FROM preferences').all();
      const result = {};
      for (const row of rows) {
        try {
          result[row.key] = JSON.parse(row.value);
        } catch {
          result[row.key] = row.value;
        }
      }
      return result;
    },

    getPrinterProfile(id = 'default') {
      const row = db.prepare('SELECT * FROM printer_profiles WHERE id = ?').get(id);
      if (!row) return null;
      return {
        id: row.id,
        mode: row.mode,
        driverName: row.driver_name,
        rawHost: row.raw_host,
        rawPort: row.raw_port,
        isDefault: Boolean(row.is_default),
        updatedAt: row.updated_at,
      };
    },

    savePrinterProfile(profile) {
      if (!profile || typeof profile !== 'object') throw new TypeError('Profile harus objek.');
      const id = profile.id || 'default';
      const mode = profile.mode === 'raw' ? 'raw' : 'driver';
      const driverName = typeof profile.driverName === 'string' ? profile.driverName : '';
      const rawHost = typeof profile.rawHost === 'string' ? profile.rawHost : '127.0.0.1';
      const rawPort = Number.isInteger(profile.rawPort) ? profile.rawPort : 9100;
      const isDefault = profile.isDefault !== false ? 1 : 0;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO printer_profiles (id, mode, driver_name, raw_host, raw_port, is_default, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          mode = excluded.mode,
          driver_name = excluded.driver_name,
          raw_host = excluded.raw_host,
          raw_port = excluded.raw_port,
          is_default = excluded.is_default,
          updated_at = excluded.updated_at
      `).run(id, mode, driverName, rawHost, rawPort, isDefault, now);

      return true;
    },

    addRecentFile(filePath, title = 'Tanpa Judul', paperWidth = 58) {
      if (typeof filePath !== 'string' || !filePath) throw new TypeError('Path file harus string.');
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO recent_files (path, title, paper_width, last_opened_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          title = excluded.title,
          paper_width = excluded.paper_width,
          last_opened_at = excluded.last_opened_at
      `).run(filePath, title, paperWidth, now);

      // Batasi 20 file terbaru
      db.exec(`
        DELETE FROM recent_files
        WHERE path NOT IN (
          SELECT path FROM recent_files ORDER BY last_opened_at DESC LIMIT 20
        )
      `);
      return true;
    },

    getRecentFiles(limit = 10) {
      const rows = db.prepare(`
        SELECT path, title, paper_width, last_opened_at
        FROM recent_files
        ORDER BY last_opened_at DESC
        LIMIT ?
      `).all(limit);
      return rows.map(r => ({
        path: r.path,
        title: r.title,
        paperWidth: r.paper_width,
        lastOpenedAt: r.last_opened_at,
      }));
    },

    saveRecoverySnapshot(document, filePath = null) {
      if (!document || typeof document !== 'object') throw new TypeError('Dokumen recovery harus berupa objek.');
      const serialized = JSON.stringify(document);
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO recovery_snapshots (id, document_json, file_path, updated_at)
        VALUES ('active', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          document_json = excluded.document_json,
          file_path = excluded.file_path,
          updated_at = excluded.updated_at
      `).run(serialized, filePath || null, now);
      return true;
    },

    getRecoverySnapshot() {
      const row = db.prepare('SELECT document_json, file_path, updated_at FROM recovery_snapshots WHERE id = ?').get('active');
      if (!row) return null;
      try {
        return {
          document: JSON.parse(row.document_json),
          filePath: row.file_path,
          updatedAt: row.updated_at,
        };
      } catch {
        return null;
      }
    },

    clearRecoverySnapshot() {
      db.prepare("DELETE FROM recovery_snapshots WHERE id = 'active'").run();
      return true;
    },

    close() {
      try {
        db.close();
      } catch {}
    }
  };
}
