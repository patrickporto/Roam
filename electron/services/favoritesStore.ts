import { getDb } from './db';
import { toMediaUrl } from './urlUtil';
import type {
  FavoritesSnapshot,
  MediaScope,
  FeedPage,
  MediaItem,
  FavoriteTargetType,
  Profile,
  SortOrder,
  RootKind,
} from '../../src/shared/types';

const PAGE_SIZE = 20;
const FAV_PAGE_SIZE = PAGE_SIZE * 3; // grade consome mais por página

/**
 * Keyset cursor: `{ modifiedAt: number; path: string }` encoded as Base64 JSON.
 * The `(modifiedAt, path)` tuple is unique and matches our composite indexes,
 * making every page query O(log N) instead of O(N).
 */
interface KeysetCursor {
  modifiedAt: number;
  path: string;
}

function encodeCursor(cs: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cs)).toString('base64');
}

function decodeCursor(raw: string): KeysetCursor | null {
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as KeysetCursor;
  } catch {
    return null;
  }
}

/** Backward-compat shim: old numeric-offset cursors are treated as "first page". */
function isLegacyCursor(raw: string): boolean {
  return /^\d+$/.test(raw);
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

export function listMedia(
  scope: MediaScope,
  cursor: string | undefined,
  order: SortOrder = 'recent',
): FeedPage {
  const db = getDb();
  const limit = PAGE_SIZE + 1; // fetch one extra to know if there's a next page
  const dir = order === 'oldest' ? 'ASC' : 'DESC';

  let scopeCol: string;
  let scopeVal: string;

  if (scope.albumPath) {
    scopeCol = 'album_path';
    scopeVal = scope.albumPath;
  } else if (scope.profilePath) {
    scopeCol = 'profile_path';
    scopeVal = scope.profilePath;
  } else {
    return { items: [], nextCursor: null };
  }

  // Build keyset WHERE clause
  let keysetWhere = '';
  const keysetParams: (string | number)[] = [scopeVal];

  if (cursor && !isLegacyCursor(cursor)) {
    const cs = decodeCursor(cursor);
    if (cs) {
      // (modified_at, path) tuple comparison for correct ordering
      if (dir === 'DESC') {
        keysetWhere = 'AND (modified_at, path) < (?, ?)';
      } else {
        keysetWhere = 'AND (modified_at, path) > (?, ?)';
      }
      keysetParams.push(cs.modifiedAt, cs.path);
    }
  }

  // Add favorite boost: favorited files float to the top within their recency band
  // Uses subquery to check favorites table - keeps keyset pagination intact
  const favBoost = `CASE WHEN path IN (SELECT target_path FROM favorites WHERE target_type = 'file') THEN 1 ELSE 0 END DESC,`;

  const rows = db
    .prepare(
      `SELECT path, modified_at FROM media_index
       WHERE ${scopeCol} = ? COLLATE NOCASE ${keysetWhere}
       ORDER BY ${favBoost} modified_at ${dir}, path ${dir}
       LIMIT ?`,
    )
    .all(...keysetParams, limit) as { path: string; modified_at: number }[];

  const hasMore = rows.length > PAGE_SIZE;
  const pagedRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const items = hydrateMediaItems(pagedRows.map((r) => r.path));

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = rows[PAGE_SIZE - 1];
    nextCursor = encodeCursor({ modifiedAt: last.modified_at, path: last.path });
  }

  return { items, nextCursor };
}

/**
 * Scored profile media: applies recency + favorite signal within a profile scope.
 * Uses offset-based pagination since scored ordering breaks keyset cursors.
 * Cursor format: numeric offset.
 */
export function listMediaScored(
  profilePath: string,
  cursor: string | undefined,
): FeedPage {
  const db = getDb();
  const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
  const limit = PAGE_SIZE + 1; // fetch one extra to know if there's a next page

  // Gather file favorites for this profile
  const favFiles = db
    .prepare(
      `SELECT f.target_path FROM favorites f
       JOIN media_index m ON m.path = f.target_path
       WHERE f.target_type = 'file' AND m.profile_path = ? COLLATE NOCASE`,
    )
    .all(profilePath) as { target_path: string }[];

  const favIn = favFiles.length > 0
    ? `(${favFiles.map(() => '?').join(',')})`
    : `('')`;

  const favParams = favFiles.map((f) => f.target_path);

  // Scoring: recency decay + favorite boost, com tiebreaker determinístico.
  // A ordenação PRECISA ser determinística: a paginação é por OFFSET, e um
  // componente aleatório no ORDER BY faria itens se repetirem entre páginas
  // e outros nunca aparecerem na grade.
  const sql = `
    SELECT
      path,
      modified_at,
      (
        0.5 * (1.0 / (1.0 + (strftime('%s','now') * 1000.0 - modified_at) / 864000000.0))
        + 0.5 * (CASE WHEN path IN ${favIn} THEN 1.0 ELSE 0.0 END)
      ) AS score
    FROM media_index
    WHERE profile_path = ? COLLATE NOCASE
    ORDER BY score DESC, path ASC
    LIMIT ? OFFSET ?`;

  const rows = db
    .prepare(sql)
    .all(...favParams, profilePath, limit, offset) as {
    path: string;
    modified_at: number;
  }[];

  const hasMore = rows.length > PAGE_SIZE;
  const pagedRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const items = hydrateMediaItems(pagedRows.map((r) => r.path));

  let nextCursor: string | null = null;
  if (hasMore) {
    nextCursor = String(offset + PAGE_SIZE);
  }

  return { items, nextCursor };
}

/** Arquivos curtidos (JOIN com favorites), mais recentemente curtidos primeiro. */
export function favoritesMedia(cursor: string | undefined): FeedPage {
  const db = getDb();
  const limit = FAV_PAGE_SIZE + 1;
  const dir = 'DESC';

  let keysetWhere = '';
  const keysetParams: (string | number)[] = [];

  if (cursor && !isLegacyCursor(cursor)) {
    const cs = decodeCursor(cursor);
    if (cs) {
      if (dir === 'DESC') {
        keysetWhere = 'AND (f.created_at, m.path) < (?, ?)';
      } else {
        keysetWhere = 'AND (f.created_at, m.path) > (?, ?)';
      }
      keysetParams.push(cs.modifiedAt, cs.path);
    }
  }

  const rows = db
    .prepare(
      `SELECT m.path, f.created_at
       FROM favorites f
       JOIN media_index m ON m.path = f.target_path
       WHERE f.target_type = 'file' ${keysetWhere}
       ORDER BY f.created_at ${dir}, m.path ${dir}
       LIMIT ?`,
    )
    .all(...keysetParams, limit) as { path: string; created_at: number }[];

  const hasMore = rows.length > FAV_PAGE_SIZE;
  const pagedRows = hasMore ? rows.slice(0, FAV_PAGE_SIZE) : rows;

  const items = hydrateMediaItems(pagedRows.map((r) => r.path));

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = rows[FAV_PAGE_SIZE - 1];
    nextCursor = encodeCursor({ modifiedAt: last.created_at, path: last.path });
  }

  return { items, nextCursor };
}

function hydrateMediaItems(paths: string[]): MediaItem[] {
  if (paths.length === 0) return [];
  const db = getDb();
  const placeholders = paths.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT path, type, format, size, created_at as createdAt, modified_at as modifiedAt,
              root_path as rootPath, profile_path as profilePath, album_path as albumPath, keywords
       FROM media_index WHERE path IN (${placeholders})`,
    )
    .all(...paths) as Array<{
    path: string;
    type: string;
    format: string;
    size: number;
    createdAt: number;
    modifiedAt: number;
    rootPath: string;
    profilePath: string;
    albumPath: string | null;
    keywords: string;
  }>;

  const map = new Map<string, (typeof rows)[0]>();
  for (const row of rows) map.set(row.path, row);

  return paths.map((p) => {
    const row = map.get(p);
    if (!row) return null!;
    return {
      path: row.path,
      mediaUrl: toMediaUrl(row.path),
      name: basename(row.path),
      type: row.type as 'image' | 'video',
      format: row.format,
      size: row.size,
      createdAt: row.createdAt,
      modifiedAt: row.modifiedAt,
      keywords: row.keywords ? row.keywords.split(',') : [],
      rootPath: row.rootPath,
      profilePath: row.profilePath,
      albumPath: row.albumPath,
    };
  });
}

// ── Cached favorites folder lookup ──────────────────────────────────────────

let cachedFavFolders: Set<string> | null = null;

export function invalidateFavCache(): void {
  cachedFavFolders = null;
}

function getFavFoldersSet(db: ReturnType<typeof getDb>): Set<string> {
  if (cachedFavFolders) return cachedFavFolders;
  const rows = db
    .prepare(`SELECT target_path FROM favorites WHERE target_type = 'folder'`)
    .all() as { target_path: string }[];
  cachedFavFolders = new Set(rows.map((r) => r.target_path));
  return cachedFavFolders;
}

export function toggleFavorite(
  targetType: FavoriteTargetType,
  targetPath: string,
): boolean {
  const db = getDb();

  // Check if already exists
  const exists = db
    .prepare(`SELECT 1 FROM favorites WHERE target_type = ? AND target_path = ?`)
    .get(targetType, targetPath);

  if (exists) {
    // Already exists → remove it
    db.prepare(`
      DELETE FROM favorites WHERE target_type = ? AND target_path = ?
    `).run(targetType, targetPath);
    invalidateFavCache();
    return false;
  }

  // Doesn't exist → add it
  db.prepare(`
    INSERT INTO favorites (target_type, target_path, created_at)
    VALUES (?, ?, ?)
  `).run(targetType, targetPath, Date.now());
  invalidateFavCache();
  return true;
}

/**
 * Carrega todos os favoritos para estado inicial do renderer.
 * Usa partial indexes (idx_fav_file_created, idx_fav_folder) para
 * evitar full-table scan quando a tabela cresce.
 */
export function getFavorites(): FavoritesSnapshot {
  const db = getDb();
  const files = db
    .prepare(`SELECT target_path FROM favorites WHERE target_type = 'file'`)
    .all() as { target_path: string }[];
  const folders = db
    .prepare(`SELECT target_path FROM favorites WHERE target_type = 'folder'`)
    .all() as { target_path: string }[];
  return {
    files: files.map((r) => r.target_path),
    folders: folders.map((r) => r.target_path),
  };
}

/**
 * Builds a Profile for a single path using pre-fetched batch data.
 * @internal - called by batchBuildProfiles with pre-computed lookup maps.
 */
function assembleProfile(
  rootPath: string,
  rootKind: RootKind,
  profilePath: string,
  favFolders: Set<string>,
  mediaCountMap: Map<string, number>,
  modifiedAtMap: Map<string, number>,
  coverMap: Map<string, string>,
  albumsByProfile: Map<string, { path: string; mediaCount: number }[]>,
  albumCoverMap: Map<string, string>,
): Profile {
  const albums = (albumsByProfile.get(profilePath) || []).map((a) => ({
    path: a.path,
    name: basename(a.path),
    coverUrl: albumCoverMap.has(a.path) ? toMediaUrl(albumCoverMap.get(a.path)!) : null,
    mediaCount: a.mediaCount,
    isFavorite: favFolders.has(a.path),
  }));

  return {
    rootPath,
    rootKind,
    profilePath,
    username: basename(profilePath),
    coverUrl: coverMap.has(profilePath) ? toMediaUrl(coverMap.get(profilePath)!) : null,
    mediaCount: mediaCountMap.get(profilePath) ?? 0,
    modifiedAt: modifiedAtMap.get(profilePath) ?? 0,
    albums,
    isFavorite: favFolders.has(profilePath),
  };
}

/**
 * Builds Profile[] for a set of profile paths using ~5 batch queries instead
 * of 3P individual queries (where P is the number of profiles).
 *
 * Queries executed:
 *   1. Media counts: GROUP BY profile_path
 *   2. Profile cover images: ROW_NUMBER() PARTITION BY profile_path
 *   3. Album summaries: GROUP BY profile_path, album_path
 *   4. Album cover images: ROW_NUMBER() PARTITION BY album_path
 *
 * The favorites folders set must be passed in (use getFavFoldersSet for caching).
 */
function batchBuildProfiles(
  profilePaths: string[],
  favFolders: Set<string>,
): Profile[] {
  if (profilePaths.length === 0) return [];

  const db = getDb();
  const placeholders = profilePaths.map(() => '?').join(',');

  // ── 1. Batch media counts + última modificação ───────────────────────────
  const countRows = db
    .prepare(
      `SELECT profile_path, COUNT(*) as c, MAX(modified_at) as m FROM media_index WHERE profile_path IN (${placeholders}) GROUP BY profile_path`,
    )
    .all(...profilePaths) as { profile_path: string; c: number; m: number | null }[];

  const mediaCountMap = new Map<string, number>();
  const modifiedAtMap = new Map<string, number>();
  for (const row of countRows) {
    mediaCountMap.set(row.profile_path, row.c);
    modifiedAtMap.set(row.profile_path, row.m ?? 0);
  }

  // ── 2. Batch profile cover images ────────────────────────────────────────
  const coverRows = db
    .prepare(
      `SELECT profile_path, path, ROW_NUMBER() OVER (PARTITION BY profile_path ORDER BY modified_at DESC) as rn
       FROM media_index WHERE profile_path IN (${placeholders}) AND type = 'image'`,
    )
    .all(...profilePaths) as { profile_path: string; path: string; rn: number }[];

  const coverMap = new Map<string, string>();
  for (const row of coverRows) {
    if (row.rn === 1 && !coverMap.has(row.profile_path)) {
      coverMap.set(row.profile_path, row.path);
    }
  }

  // ── 3. Batch album summaries ─────────────────────────────────────────────
  const albumRows = db
    .prepare(
      `SELECT profile_path, album_path as path, COUNT(*) as mediaCount
       FROM media_index WHERE profile_path IN (${placeholders}) AND album_path IS NOT NULL
       GROUP BY profile_path, album_path ORDER BY profile_path ASC, album_path ASC`,
    )
    .all(...profilePaths) as { profile_path: string; path: string; mediaCount: number }[];

  const albumsByProfile = new Map<string, { path: string; mediaCount: number }[]>();
  for (const row of albumRows) {
    if (!albumsByProfile.has(row.profile_path)) {
      albumsByProfile.set(row.profile_path, []);
    }
    albumsByProfile.get(row.profile_path)!.push({ path: row.path, mediaCount: row.mediaCount });
  }

  // ── 4. Batch album cover images ──────────────────────────────────────────
  const albumPaths = new Set<string>();
  for (const albums of albumsByProfile.values()) {
    for (const album of albums) {
      albumPaths.add(album.path);
    }
  }

  const albumCoverMap = new Map<string, string>();
  if (albumPaths.size > 0) {
    const albumPlaceholders = [...albumPaths].map(() => '?').join(',');
    const albumCoverRows = db
      .prepare(
        `SELECT album_path, path, ROW_NUMBER() OVER (PARTITION BY album_path ORDER BY modified_at DESC) as rn
         FROM media_index WHERE album_path IN (${albumPlaceholders}) AND type = 'image'`,
      )
      .all(...albumPaths) as { album_path: string; path: string; rn: number }[];

    for (const row of albumCoverRows) {
      if (row.rn === 1 && !albumCoverMap.has(row.album_path)) {
        albumCoverMap.set(row.album_path, row.path);
      }
    }
  }

  // ── Build profile-to-root lookup ─────────────────────────────────────────
  const rootMap = new Map<string, { rootPath: string; rootKind: RootKind }>();
  const rootRows = db
    .prepare(`SELECT path, kind FROM roots`)
    .all() as { path: string; kind: RootKind }[];
  for (const root of rootRows) {
    rootMap.set(root.path, { rootPath: root.path, rootKind: root.kind });
  }

  const profileRootMap = new Map<string, { rootPath: string; rootKind: RootKind }>();
  if (rootMap.size > 0) {
    const profileRootRows = db
      .prepare(
        `SELECT DISTINCT profile_path, root_path FROM media_index WHERE profile_path IN (${placeholders})`,
      )
      .all(...profilePaths) as { profile_path: string; root_path: string }[];

    for (const row of profileRootRows) {
      const rootInfo = rootMap.get(row.root_path);
      if (rootInfo) {
        profileRootMap.set(row.profile_path, rootInfo);
      }
    }
  }

  // ── 5. Assemble profiles ─────────────────────────────────────────────────
  return profilePaths.map((pp) => {
    const rootInfo = profileRootMap.get(pp);
    if (!rootInfo) return null!;
    return assembleProfile(
      rootInfo.rootPath,
      rootInfo.rootKind,
      pp,
      favFolders,
      mediaCountMap,
      modifiedAtMap,
      coverMap,
      albumsByProfile,
      albumCoverMap,
    );
  });
}

/**
 * @deprecated Use batchBuildProfiles instead. Kept for backward compatibility.
 * Builds a Profile by running individual queries per profile.
 */
function buildProfile(
  db: ReturnType<typeof getDb>,
  rootPath: string,
  rootKind: RootKind,
  profilePath: string,
  favFolders: Set<string>,
): Profile {
  return batchBuildProfiles([profilePath], favFolders)[0];
}

export function getProfiles(): Profile[] {
  const db = getDb();
  const favFolders = getFavFoldersSet(db);

  // Collect all unique profile paths across all roots
  const profileRows = db
    .prepare(`SELECT DISTINCT profile_path FROM media_index`)
    .all() as { profile_path: string }[];

  const profilePaths = profileRows.map((r) => r.profile_path);
  return batchBuildProfiles(profilePaths, favFolders);
}

export function getProfile(profilePath: string): Profile | null {
  const db = getDb();

  // Verify the profile exists (case-insensitive for Windows NTFS compatibility)
  const exists = db
    .prepare(`SELECT 1 FROM media_index WHERE profile_path = ? COLLATE NOCASE LIMIT 1`)
    .get(profilePath);
  if (!exists) return null;

  const favFolders = getFavFoldersSet(db);
  return batchBuildProfiles([profilePath], favFolders)[0] ?? null;
}
