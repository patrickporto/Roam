import { getDb } from './db';
import { toMediaUrl } from './urlUtil';
import { escapeLikePrefix } from './tagsStore';
import type { FeedPage, MediaItem } from '../../src/shared/types';

const PAGE_SIZE = 20;
const CANDIDATE_POOL = 120; // candidatos sorteados pelo SQL por página
const SESSION_TTL = 30 * 60 * 1000;
const MAX_PER_PROFILE = 3; // máximo de itens por perfil por página
const MAX_PER_ALBUM = 2; // máximo de itens por álbum por página

// Faixas de idade (ms)
const OLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const VERY_OLD_MS = 180 * 24 * 60 * 60 * 1000; // 180 dias

// Cotas por faixa por página (~60% / ~25% / ~15%); soma = PAGE_SIZE
const QUOTA_RECENT = 12;
const QUOTA_OLD = 5;
const QUOTA_VERY_OLD = 3;

// Anti-repetição: itens exibidos perdem até SHOWN_PENALTY de score,
// decaindo linearmente ao longo do cooldown (nunca exclui — feed infinito).
const SHOWN_PENALTY = 0.6;
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

// Ruído para quebrar empates no score (máx ~0.05). Deve ser bem menor que
// SHOWN_PENALTY e o boost de favoritos, senão anula ambos.
const RANDOM_WEIGHT = 0.000005;

interface FeedSession {
  served: Set<string>;
  page: number;
  createdAt: number;
}

/** Filtro SQL opcional sobre media_index (usado pelo feed de tag). */
interface SqlFilter {
  where: string;
  params: (string | number)[];
}

const NO_FILTER: SqlFilter = { where: '', params: [] };

const sessions = new Map<string, FeedSession>();

function gcSessions(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL) sessions.delete(id);
  }
  // Poda registros de exibição fora do cooldown (a penalidade já seria zero)
  getDb()
    .prepare(`DELETE FROM shown_history WHERE shown_at < ?`)
    .run(now - COOLDOWN_MS);
}

/** Registra a exibição dos itens servidos (upsert em batch). */
function recordShown(paths: string[]): void {
  if (paths.length === 0) return;
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO shown_history (media_path, shown_at) VALUES (?, ?)
     ON CONFLICT(media_path) DO UPDATE SET shown_at = excluded.shown_at`,
  );
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const p of paths) upsert.run(p, now);
  });
  tx();
}

/** Descarta todas as sessões (chamado quando a biblioteca muda). */
export function clearFeedSessions(): void {
  sessions.clear();
}

/**
 * Constrói o filtro do feed de uma tag: união de arquivos tageados
 * individualmente e mídias contidas em pastas tageadas (flatten).
 * A deduplicação é garantida pela chave `path` e pelo set `served` da sessão.
 */
function buildTagFilter(tagId: number): SqlFilter {
  const db = getDb();
  const folders = db
    .prepare(`SELECT target_path FROM item_tags WHERE tag_id = ? AND target_type = 'folder'`)
    .all(tagId) as { target_path: string }[];

  const clauses = [
    `path IN (SELECT target_path FROM item_tags WHERE tag_id = ? AND target_type = 'file')`,
  ];
  const params: (string | number)[] = [tagId];

  for (const f of folders) {
    clauses.push(`(path LIKE ? || '/%' ESCAPE '!' OR path LIKE ? || '\\%' ESCAPE '!')`);
    const escaped = escapeLikePrefix(f.target_path);
    params.push(escaped, escaped);
  }

  return { where: ` AND (${clauses.join(' OR ')})`, params };
}

function createFeedSession(filter: SqlFilter): string | null {
  const db = getDb();
  const total = db
    .prepare(`SELECT COUNT(*) as c FROM media_index WHERE 1=1${filter.where}`)
    .get(...filter.params) as { c: number };
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
  taggedFolders: string[];
} {
  const db = getDb();

  // Pastas favoritas
  const favFolders = db
    .prepare(`SELECT target_path FROM favorites WHERE target_type = 'folder'`)
    .all() as { target_path: string }[];
  const folderPaths = favFolders.map((r) => r.target_path);

  // Pastas tageadas (boost de tag no For You)
  const taggedFolderRows = db
    .prepare(`SELECT DISTINCT target_path FROM item_tags WHERE target_type = 'folder'`)
    .all() as { target_path: string }[];
  const taggedFolders = taggedFolderRows.map((r) => r.target_path);

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
    taggedFolders,
  };
}

/**
 * Query SQL que materializa o scoring com diversidade e aleatoriedade:
 *
 *   - Recency por faixas: recente <30d = 1.0, antigo 30–180d = 0.5,
 *     muito antigo >180d = 0.3 (piso não-zero: itens de anos atrás continuam
 *     competitivos, ao contrário do decaimento exponencial que os zerava).
 *   - Fav boost: +1 profile IN folders, +1 album IN folders, +0.5 profile IN liked, +0.5 format IN liked.
 *   - Cooldown: -SHOWN_PENALTY para itens exibidos nas últimas 24h,
 *     decaindo linearmente (anti-repetição entre sessões e ciclos).
 *   - Random: ABS(RANDOM()) com peso pequeno para quebrar empates.
 *   - Diversity: aplica limite por perfil e álbum no lado do JS após o SQL.
 *   - Recency mix: separa faixas de idade, misturando conforme as cotas.
 *
 * O pool é limitado a CANDIDATE_POOL para evitar varrer milhões de linhas a cada página.
 * Dentro do pool, excluímos o que já foi servido nesta sessão.
 */
function scoreQuery(served: string[], filter: SqlFilter): { path: string; modified_at: number }[] {
  const db = getDb();
  const fav = gatherFavParams();
  const nowMs = Date.now();

  const favFoldersIn = fav.favFolders.length > 0
    ? `(${fav.favFolders.map(() => '?').join(',')})`
    : `('')`;
  const likedProfilesIn = fav.likedProfiles.length > 0
    ? `(${fav.likedProfiles.map(() => '?').join(',')})`
    : `('')`;
  const likedFormatsIn = fav.likedFormats.length > 0
    ? `(${fav.likedFormats.map(() => '?').join(',')})`
    : `('')`;

  // Boost de tags: arquivos tageados individualmente ou sob pastas tageadas.
  const taggedFoldersCond = fav.taggedFolders.length > 0
    ? `(${fav.taggedFolders.map(() => `path LIKE ? || '/%' ESCAPE '!' OR path LIKE ? || '\\%' ESCAPE '!'`).join(' OR ')})`
    : `1=0`;
  const taggedFolderParams = fav.taggedFolders.flatMap((f) => {
    const escaped = escapeLikePrefix(f);
    return [escaped, escaped];
  });

  const servedIn = served.length > 0
    ? ` AND path NOT IN (${served.map(() => '?').join(',')})`
    : '';

  // Pool misto: TOP_K melhores por score + amostra garantida de muito
  // antigos + amostra aleatória dos demais. Sem as amostras, itens sem
  // sinal de favorito nunca entrariam no pool e as cotas de faixas
  // antigas do applyDiversity nunca seriam preenchidas.
  // Nota: o scoring é O(tamanho do índice) por página (RANDOM + JOIN por
  // linha); se bibliotecas chegarem a 10⁵–10⁶ itens, pré-filtrar por
  // faixas de modified_at antes de pontuar.
  const TOP_K = 80;
  const VERYOLD_POOL = 15;
  const REST_POOL = CANDIDATE_POOL - TOP_K - VERYOLD_POOL;

  const sql = `
    WITH scored AS (
      SELECT
        m.path,
        m.modified_at,
        m.profile_path,
        m.album_path,
        (
          0.4 * (CASE
            WHEN (? - m.modified_at) < ${OLD_MS} THEN 1.0
            WHEN (? - m.modified_at) < ${VERY_OLD_MS} THEN 0.5
            ELSE 0.3
          END)
          + 0.3 * MIN(
              (CASE WHEN m.profile_path IN ${favFoldersIn} THEN 1 ELSE 0 END)
            + (CASE WHEN m.album_path IN ${favFoldersIn} THEN 1 ELSE 0 END)
            + (CASE WHEN m.profile_path IN ${likedProfilesIn} THEN 0.5 ELSE 0 END)
            + (CASE WHEN m.format IN ${likedFormatsIn} THEN 0.5 ELSE 0 END)
            + (CASE WHEN m.path IN (SELECT target_path FROM item_tags WHERE target_type = 'file') THEN 1 ELSE 0 END)
            + (CASE WHEN ${taggedFoldersCond} THEN 1 ELSE 0 END)
            , 2.0) / 2.0
          + (ABS(RANDOM()) % 10000) * ${RANDOM_WEIGHT}
          - ${SHOWN_PENALTY} * (CASE WHEN sh.shown_at IS NULL THEN 0.0
              ELSE MIN(1.0, MAX(0.0, 1.0 - (? - sh.shown_at) / ${COOLDOWN_MS}.0)) END)
        ) AS score
      FROM media_index m
      LEFT JOIN shown_history sh ON sh.media_path = m.path
      WHERE 1=1${servedIn}${filter.where}
    ),
    top AS (
      SELECT * FROM scored ORDER BY score DESC LIMIT ${TOP_K}
    ),
    veryold AS (
      SELECT * FROM scored
      WHERE path NOT IN (SELECT path FROM top)
        AND (? - modified_at) >= ${VERY_OLD_MS}
      ORDER BY ABS(RANDOM())
      LIMIT ${VERYOLD_POOL}
    ),
    rest AS (
      SELECT * FROM scored
      WHERE path NOT IN (SELECT path FROM top)
        AND path NOT IN (SELECT path FROM veryold)
      ORDER BY ABS(RANDOM())
      LIMIT ${REST_POOL}
    )
    SELECT * FROM top
    UNION ALL
    SELECT * FROM veryold
    UNION ALL
    SELECT * FROM rest`;

  const allParams = [
    nowMs, // faixa recente
    nowMs, // faixa antiga
    ...fav.favFolders,
    ...fav.favFolders,
    ...fav.likedProfiles,
    ...fav.likedFormats,
    ...taggedFolderParams,
    nowMs, // cooldown
    ...served,
    ...filter.params,
    nowMs, // amostra veryold
  ];

  const rows = db.prepare(sql).all(...allParams) as {
    path: string;
    modified_at: number;
    profile_path: string;
    album_path: string | null;
    score: number;
  }[];

  return applyDiversity(rows, nowMs);
}

/**
 * Aplica restrições de diversidade e mistura de faixas de idade sobre os candidatos.
 *
 * 1. Separa recentes (<30d), antigos (30–180d) e muito antigos (>180d).
 * 2. Ordena cada faixa por score (desc): itens em cooldown de exibição
 *    afundam dentro da faixa — essencial para bibliotecas menores que o
 *    pool, onde tudo sempre é candidato. O ruído (RANDOM_WEIGHT) embaralha
 *    itens de score igual.
 * 3. Preenche as cotas de cada faixa; slots não preenchidos são
 *    redistribuídos às faixas com sobras, na ordem recente → antigo →
 *    muito antigo (viés de recência intencional).
 * 4. Aplica limite por perfil (MAX_PER_PROFILE) e álbum (MAX_PER_ALBUM).
 * 5. Retorna no máximo PAGE_SIZE itens.
 */
function applyDiversity(rows: Array<{
  path: string;
  modified_at: number;
  profile_path: string;
  album_path: string | null;
  score: number;
}>, nowMs: number): { path: string; modified_at: number }[] {
  if (rows.length === 0) return [];

  const recent = rows.filter((r) => (nowMs - r.modified_at) < OLD_MS);
  const old = rows.filter((r) => {
    const age = nowMs - r.modified_at;
    return age >= OLD_MS && age < VERY_OLD_MS;
  });
  const veryOld = rows.filter((r) => (nowMs - r.modified_at) >= VERY_OLD_MS);

  // Score desc por faixa: cooldown de exibição e boosts de favorito
  // determinam a prioridade; o ruído no score desempata.
  const tiers: Array<typeof rows> = [recent, old, veryOld];
  for (const tier of tiers) tier.sort((a, b) => b.score - a.score);

  // Cotas por faixa, com redistribuição dos slots não preenchidos
  const quotas = [QUOTA_RECENT, QUOTA_OLD, QUOTA_VERY_OLD];
  const selected: typeof rows = [];
  for (let i = 0; i < tiers.length; i++) {
    selected.push(...tiers[i].splice(0, quotas[i]));
  }
  let remaining = PAGE_SIZE - selected.length;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, tier.length);
    selected.push(...tier.splice(0, take));
    remaining -= take;
  }

  // Embaralha novamente para misturar as faixas
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

function popPage(sessionId: string, session: FeedSession, filter: SqlFilter): FeedPage {
  const db = getDb();
  const rows = scoreQuery([...session.served], filter);

  if (rows.length === 0 && session.served.size > 0) {
    const total = db
      .prepare(`SELECT COUNT(*) AS c FROM media_index WHERE 1=1${filter.where}`)
      .get(...filter.params) as { c: number };
    if (total.c <= session.served.size) {
      // Nenhum novo item → fim do feed
      return { items: [], nextCursor: null };
    }
    // Ha novos itens → novo ciclo
    session.served.clear();
    session.page = 0;
    return popPage(sessionId, session, filter);
  }

  if (rows.length === 0) {
    return { items: [], nextCursor: null };
  }

  const items = hydrateBatch(rows);
  for (const r of rows) session.served.add(r.path);
  recordShown(rows.map((r) => r.path));
  session.page++;

  return {
    items,
    nextCursor: `c:${sessionId}:${session.page}`,
  };
}

export function getForYouPage(cursor: string | undefined): FeedPage | null {
  gcSessions();

  if (!cursor) {
    const sessionId = createFeedSession(NO_FILTER);
    if (!sessionId) return { items: [], nextCursor: null };
    return popPage(sessionId, sessions.get(sessionId)!, NO_FILTER);
  }

  const parts = cursor.split(':');
  if (parts[0] !== 'c' || parts.length < 3) return null;

  const sessionId = parts.slice(1, -1).join(':');
  const session = sessions.get(sessionId);
  if (!session) {
    const newId = createFeedSession(NO_FILTER);
    if (!newId) return { items: [], nextCursor: null };
    return popPage(newId, sessions.get(newId)!, NO_FILTER);
  }

  return popPage(sessionId, session, NO_FILTER);
}

/**
 * Página do feed filtrado por tag. Mesma mecânica do For You (sessão,
 * paginação por cursor, ciclo infinito), restrita aos itens da tag.
 * Sessões são namespacadas por tag para não colidirem com o For You.
 */
export function getTagFeedPage(tagId: number, cursor: string | undefined): FeedPage {
  gcSessions();
  const filter = buildTagFilter(tagId);
  const ns = `tag${tagId}|`;

  if (!cursor) {
    const sessionId = createFeedSession(filter);
    if (!sessionId) return { items: [], nextCursor: null };
    const nsId = ns + sessionId;
    sessions.set(nsId, sessions.get(sessionId)!);
    sessions.delete(sessionId);
    return popPage(nsId, sessions.get(nsId)!, filter);
  }

  const parts = cursor.split(':');
  if (parts[0] !== 'c' || parts.length < 3) return { items: [], nextCursor: null };

  const sessionId = parts.slice(1, -1).join(':');
  const session = sessionId.startsWith(ns) ? sessions.get(sessionId) : undefined;
  if (!session) {
    const newId = createFeedSession(filter);
    if (!newId) return { items: [], nextCursor: null };
    const nsId = ns + newId;
    sessions.set(nsId, sessions.get(newId)!);
    sessions.delete(newId);
    return popPage(nsId, sessions.get(nsId)!, filter);
  }

  return popPage(sessionId, session, filter);
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
