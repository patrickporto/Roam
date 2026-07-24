import { getDb } from './db';
import { toMediaUrl } from './urlUtil';
import type { FeedPage, MediaItem } from '../../src/shared/types';

const PAGE_SIZE = 20;
const CANDIDATE_POOL = 120; // candidatos sorteados pelo SQL por página
const SESSION_TTL = 30 * 60 * 1000;
const MAX_PER_PROFILE = 3; // máximo de itens por perfil por página
const MAX_PER_ALBUM = 2; // máximo de itens por álbum por página
const RECENT_RATIO = 0.65; // proporção de itens recentes (~65%)

interface FeedSession {
  served: Set<string>;
  page: number;
  createdAt: number;
}

const sessions = new Map<string, FeedSession>();

function gcSessions(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL) sessions.delete(id);
  }
}

/** Descarta todas as sessões (chamado quando a biblioteca muda). */
export function clearFeedSessions(): void {
  sessions.clear();
}

function createFeedSession(): string | null {
  const db = getDb();
  const total = db.prepare(`SELECT COUNT(*) as c FROM media_index`).get() as { c: number };
  if (total.c === 0) return null;

  const id = `${Date.now()}:${Math.floor(Math.random() * 1e9)}`;
  sessions.set(id, { served: new Set(), page: 0, createdAt: Date.now() });
  return id;
}

/**
 * Constrói o bloco SQL de sinais de favorito a partir da tabela `favorites`.
 *
 * Retorna um objeto com os IN-lists e placeholders para usar na query de scoring.
 */
function gatherFavParams(): {
  favFolders: string[];
  likedProfiles: string[];
  likedFormats: string[];
} {
  const db = getDb();

  // Pastas favoritas
  const favFolders = db
    .prepare(`SELECT target_path FROM favorites WHERE target_type = 'folder'`)
    .all() as { target_path: string }[];
  const folderPaths = favFolders.map((r) => r.target_path);

  // Arquivos favoritos → extraí format e profile_path
  const favFiles = db
    .prepare(`SELECT target_path FROM favorites WHERE target_type = 'file' ORDER BY created_at DESC LIMIT 200`)
    .all() as { target_path: string }[];

  const likedFormats = new Set<string>();
  for (const f of favFiles) {
    const ext = f.target_path.split('.').pop();
    if (ext) likedFormats.add(ext.toLowerCase());
  }

  // Profile paths dos arquivos favoritos
  let likedProfiles: string[] = [];
  if (favFiles.length > 0) {
    const filePlaceholders = favFiles.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT DISTINCT profile_path, format, type
         FROM media_index WHERE path IN (${filePlaceholders})`,
      )
      .all(...favFiles.map((f) => f.target_path)) as {
      profile_path: string;
      format: string;
      type: string;
    }[];
    likedProfiles = rows.map((r) => r.profile_path);
    for (const r of rows) {
      likedFormats.add(r.format);
      likedFormats.add(r.type);
    }
  }

  return {
    favFolders: folderPaths,
    likedProfiles,
    likedFormats: [...likedFormats],
  };
}

/**
 * Query SQL que materializa o scoring com diversidade e aleatoriedade:
 *
 *   - Recency: decai exponencialmente com a idade em ms.
 *   - Fav boost: +1 profile IN folders, +1 album IN folders, +0.5 profile IN liked, +0.5 format IN liked.
 *   - Random: ABS(RANDOM()) com peso significativo para quebrar ordem cronológica.
 *   - Diversity: aplica limite por perfil e álbum no lado do JS após o SQL.
 *   - Recency mix: separa recentes e antigos, misturando conforme RECENT_RATIO.
 *
 * O pool é limitado a CANDIDATE_POOL para evitar varrer milhões de linhas a cada página.
 * Dentro do pool, excluímos o que já foi servido nesta sessão.
 */
function scoreQuery(served: string[]): { path: string; modified_at: number }[] {
  const db = getDb();
  const fav = gatherFavParams();

  const favFoldersIn = fav.favFolders.length > 0
    ? `(${fav.favFolders.map(() => '?').join(',')})`
    : `('')`;
  const likedProfilesIn = fav.likedProfiles.length > 0
    ? `(${fav.likedProfiles.map(() => '?').join(',')})`
    : `('')`;
  const likedFormatsIn = fav.likedFormats.length > 0
    ? `(${fav.likedFormats.map(() => '?').join(',')})`
    : `('')`;

  const servedIn = served.length > 0
    ? ` AND path NOT IN (${served.map(() => '?').join(',')})`
    : '';

  const sql = `
    SELECT
      path,
      modified_at,
      profile_path,
      album_path,
      (
        0.4 * (1.0 / (1.0 + (strftime('%s','now') * 1000.0 - modified_at) / 864000000.0))
        + 0.3 * MIN(
            (CASE WHEN profile_path IN ${favFoldersIn} THEN 1 ELSE 0 END)
          + (CASE WHEN album_path IN ${favFoldersIn} THEN 1 ELSE 0 END)
          + (CASE WHEN profile_path IN ${likedProfilesIn} THEN 0.5 ELSE 0 END)
          + (CASE WHEN format IN ${likedFormatsIn} THEN 0.5 ELSE 0 END)
          , 2.0) / 2.0
        + (ABS(RANDOM()) % 10000) * 0.00005
      ) AS score
    FROM media_index
    WHERE 1=1${servedIn}
    ORDER BY score DESC
    LIMIT ${CANDIDATE_POOL}`;

  const allParams = [
    ...fav.favFolders,
    ...fav.favFolders,
    ...fav.likedProfiles,
    ...fav.likedFormats,
    ...served,
  ];

  const rows = db.prepare(sql).all(...allParams) as {
    path: string;
    modified_at: number;
    profile_path: string;
    album_path: string | null;
    score: number;
  }[];

  return applyDiversity(rows);
}

/**
 * Aplica restrições de diversidade e mistura de recência sobre os candidatos.
 *
 * 1. Separa recentes (modified_at > 30 dias) e antigos.
 * 2. Embaralha cada grupo independentemente.
 * 3. Pega ~65% recentes e ~35% antigos.
 * 4. Aplica limite por perfil (MAX_PER_PROFILE) e álbum (MAX_PER_ALBUM).
 * 5. Retorna no máximo PAGE_SIZE itens.
 */
function applyDiversity(rows: Array<{
  path: string;
  modified_at: number;
  profile_path: string;
  album_path: string | null;
  score: number;
}>): { path: string; modified_at: number }[] {
  if (rows.length === 0) return [];

  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  const recent = rows.filter((r) => (now - r.modified_at) < THIRTY_DAYS);
  const old = rows.filter((r) => (now - r.modified_at) >= THIRTY_DAYS);

  // Embaralha cada grupo para quebrar ordem cronológica
  shuffle(recent);
  shuffle(old);

  // Calcula quantos recentes e antigos pegar
  const recentCount = Math.min(recent.length, Math.ceil(PAGE_SIZE * RECENT_RATIO));
  const oldCount = Math.min(old.length, PAGE_SIZE - recentCount);

  const selected = [...recent.slice(0, recentCount), ...old.slice(0, oldCount)];

  // Embaralha novamente para misturar recentes e antigos
  shuffle(selected);

  // Aplica limite por perfil e álbum
  const profileCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();
  const result: typeof selected = [];

  for (const row of selected) {
    if (result.length >= PAGE_SIZE) break;

    const profile = row.profile_path;
    const album = row.album_path || '';

    const profileCount = profileCounts.get(profile) || 0;
    const albumCount = albumCounts.get(album) || 0;

    if (profileCount >= MAX_PER_PROFILE) continue;
    if (album && albumCount >= MAX_PER_ALBUM) continue;

    result.push(row);
    profileCounts.set(profile, profileCount + 1);
    if (album) albumCounts.set(album, albumCount + 1);
  }

  return result.map((r) => ({ path: r.path, modified_at: r.modified_at }));
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function hydrateBatch(rows: Array<{ path: string; modified_at: number }>): MediaItem[] {
  if (rows.length === 0) return [];
  const db = getDb();
  const placeholders = rows.map(() => '?').join(',');
  const fullRows = db
    .prepare(
      `SELECT path, root_path, profile_path, album_path, type, format, size, created_at, keywords
       FROM media_index WHERE path IN (${placeholders})`,
    )
    .all(...rows.map((r) => r.path)) as {
    path: string;
    root_path: string;
    profile_path: string;
    album_path: string | null;
    type: string;
    format: string;
    size: number;
    created_at: number;
    keywords: string;
  }[];

  const map = new Map(fullRows.map((r) => [r.path, r]));
  const modMap = new Map(rows.map((r) => [r.path, r.modified_at]));

  return rows.map((r) => {
    const full = map.get(r.path)!;
    return {
      path: r.path,
      mediaUrl: toMediaUrl(r.path),
      name: r.path.split(/[\\/]/).pop()!,
      type: full.type as 'image' | 'video',
      format: full.format,
      size: full.size,
      createdAt: full.created_at,
      modifiedAt: modMap.get(r.path)!,
      keywords: full.keywords ? full.keywords.split(',') : [],
      rootPath: full.root_path,
      profilePath: full.profile_path,
      albumPath: full.album_path,
    };
  });
}

function popPage(sessionId: string, session: FeedSession): FeedPage {
  const db = getDb();
  const rows = scoreQuery([...session.served]);

  if (rows.length === 0 && session.served.size > 0) {
    const total = db.prepare('SELECT COUNT(*) AS c FROM media_index').get() as { c: number };
    if (total.c <= session.served.size) {
      // Nenhum novo item → fim do feed
      return { items: [], nextCursor: null };
    }
    // Ha novos itens → novo ciclo
    session.served.clear();
    session.page = 0;
    return popPage(sessionId, session);
  }

  if (rows.length === 0) {
    return { items: [], nextCursor: null };
  }

  const items = hydrateBatch(rows);
  for (const r of rows) session.served.add(r.path);
  session.page++;

  return {
    items,
    nextCursor: `c:${sessionId}:${session.page}`,
  };
}

export function getForYouPage(cursor: string | undefined): FeedPage | null {
  gcSessions();

  if (!cursor) {
    const sessionId = createFeedSession();
    if (!sessionId) return { items: [], nextCursor: null };
    return popPage(sessionId, sessions.get(sessionId)!);
  }

  const parts = cursor.split(':');
  if (parts[0] !== 'c' || parts.length < 3) return null;

  const sessionId = parts.slice(1, -1).join(':');
  const session = sessions.get(sessionId);
  if (!session) {
    const newId = createFeedSession();
    if (!newId) return { items: [], nextCursor: null };
    return popPage(newId, sessions.get(newId)!);
  }

  return popPage(sessionId, session);
}

export function resetFeedSession(cursor: string | undefined): void {
  if (!cursor) {
    sessions.clear();
    return;
  }
  const parts = cursor.split(':');
  const sessionId = parts.slice(1, -1).join(':');
  sessions.delete(sessionId);
}
