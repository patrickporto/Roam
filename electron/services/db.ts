import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'roam.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(db: Database.Database) {
  const version = db.pragma('user_version', { simple: true }) as number;

  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS roots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        kind TEXT NOT NULL DEFAULT 'profile' CHECK(kind IN ('container','profile')),
        added_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS favorites (
        target_type TEXT NOT NULL CHECK(target_type IN ('file','folder')),
        target_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (target_type, target_path)
      );
      CREATE INDEX IF NOT EXISTS idx_fav_type ON favorites(target_type);
    `);
    db.pragma('user_version = 1');
  }

  if (version < 2) {
    // media_index é cache derivado do filesystem: recriar é seguro.
    // O rescan na inicialização repovoa com o novo modelo (profile_path).
    db.exec(`
      DROP TABLE IF EXISTS media_index;
      CREATE TABLE media_index (
        path TEXT PRIMARY KEY,
        root_path TEXT NOT NULL,
        profile_path TEXT NOT NULL,
        album_path TEXT,
        type TEXT NOT NULL CHECK(type IN ('image','video')),
        format TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        keywords TEXT NOT NULL DEFAULT '',
        indexed_at INTEGER NOT NULL,
        FOREIGN KEY (root_path) REFERENCES roots(path) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_media_root ON media_index(root_path);
      CREATE INDEX IF NOT EXISTS idx_media_profile ON media_index(profile_path);
      CREATE INDEX IF NOT EXISTS idx_media_album ON media_index(profile_path, album_path);
      CREATE INDEX IF NOT EXISTS idx_media_modified ON media_index(modified_at);
    `);
    // roots de versões antigas ganham kind default 'profile' (comportamento anterior)
    const cols = db.prepare(`PRAGMA table_info(roots)`).all() as { name: string }[];
    if (!cols.some((c) => c.name === 'kind')) {
      db.exec(`ALTER TABLE roots ADD COLUMN kind TEXT NOT NULL DEFAULT 'profile' CHECK(kind IN ('container','profile'))`);
    }
    db.pragma('user_version = 2');
  }

  if (version < 3) {
    // Composite indexes for keyset pagination & common query patterns.
    // These make listMedia, favoritesMedia, getProfiles, and feed queries
    // scale to millions of rows without OFFSET-based scans.
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_profile_mod
        ON media_index(profile_path, modified_at);
      CREATE INDEX IF NOT EXISTS idx_media_album_mod
        ON media_index(album_path, modified_at);
      CREATE INDEX IF NOT EXISTS idx_media_root_profile
        ON media_index(root_path, profile_path);
      CREATE INDEX IF NOT EXISTS idx_fav_file_created
        ON favorites(target_path, created_at) WHERE target_type = 'file';
      CREATE INDEX IF NOT EXISTS idx_fav_folder
        ON favorites(target_path) WHERE target_type = 'folder';
    `);
    db.pragma('user_version = 3');
  }

  if (version < 4) {
    // Covering indexes for cover-image queries: type filter + modified_at ordering.
    // Makes "WHERE profile_path = ? AND type = 'image' ORDER BY modified_at DESC LIMIT 1"
    // an index-only scan without touching full table rows.
    // Also adds root_path + profile_path combo for batch profile discovery.
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_profile_type_mod
        ON media_index(profile_path, type, modified_at);
      CREATE INDEX IF NOT EXISTS idx_media_album_type_mod
        ON media_index(album_path, type, modified_at);
      CREATE INDEX IF NOT EXISTS idx_media_root_profile_path
        ON media_index(root_path, profile_path, album_path);
    `);
    db.pragma('user_version = 4');
  }

  if (version < 5) {
    // Tags: nomes únicos case-insensitive; item_tags associa tag a arquivo/pasta.
    // Paths órfãos (mídia/pasta removida) são ignorados na resolução,
    // mesma estratégia dos favoritos.
    db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL COLLATE NOCASE,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS item_tags (
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK(target_type IN ('file','folder')),
        target_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (tag_id, target_type, target_path)
      );
      CREATE INDEX IF NOT EXISTS idx_item_tags_target ON item_tags(target_type, target_path);
      CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);
    `);
    db.pragma('user_version = 5');
  }
}

export function closeDb() {
  if (db) {
    db.close();
  }
}
