import { getDb } from './db';
import type { Tag, TagSummary, TagTargetType } from '../../src/shared/types';

/** Normaliza nome de tag: trim + colapsa espaços internos. Comparação é case-insensitive (COLLATE NOCASE). */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

function isUnderFolder(filePath: string, folderPath: string): boolean {
  const f = normalizePath(filePath);
  const d = normalizePath(folderPath);
  return f === d || f.startsWith(d + '/');
}

/**
 * Condição SQL de contido-em-pasta para um caminho de mídia.
 * LIKE é case-insensitive para ASCII no SQLite (adequado ao NTFS do Windows).
 * Aceita ambos os separadores; metacaracteres LIKE (`%`, `_`, `!`) do prefixo
 * são escapados com ESCAPE '!' para não casar pastas irmãs.
 */
function folderLikeClause(): string {
  return `(path LIKE ? || '/%' ESCAPE '!' OR path LIKE ? || '\\%' ESCAPE '!')`;
}

/** Escapa metacaracteres LIKE de um prefixo de pasta (usado com ESCAPE '!'). */
export function escapeLikePrefix(p: string): string {
  return p.replace(/[!%_]/g, '!$&');
}

/** Conta itens da tag: arquivos tageados (presentes no índice) + mídias sob pastas tageadas, sem dupla contagem. */
function countTagItems(tagId: number): number {
  const db = getDb();

  const allFolders = db
    .prepare(`SELECT target_path FROM item_tags WHERE tag_id = ? AND target_type = 'folder'`)
    .all(tagId) as { target_path: string }[];

  // Pastas aninhadas sob outra pasta tageada não somam nada (conteúdo já coberto)
  const folders = allFolders.filter(
    (f) => !allFolders.some((o) => o.target_path !== f.target_path && isUnderFolder(f.target_path, o.target_path)),
  );

  let count = 0;
  const folderCountStmt = db.prepare(
    `SELECT COUNT(*) AS c FROM media_index WHERE ${folderLikeClause()}`,
  );
  for (const f of folders) {
    const escaped = escapeLikePrefix(f.target_path);
    const row = folderCountStmt.get(escaped, escaped) as { c: number };
    count += row.c;
  }

  // Arquivos tageados individualmente que não estão sob nenhuma pasta tageada
  const files = db
    .prepare(
      `SELECT it.target_path FROM item_tags it
       JOIN media_index m ON m.path = it.target_path
       WHERE it.tag_id = ? AND it.target_type = 'file'`,
    )
    .all(tagId) as { target_path: string }[];

  for (const file of files) {
    if (!folders.some((f) => isUnderFolder(file.target_path, f.target_path))) {
      count++;
    }
  }

  return count;
}

export function listTags(): TagSummary[] {
  const db = getDb();
  const tags = db
    .prepare(`SELECT id, name FROM tags ORDER BY name COLLATE NOCASE ASC`)
    .all() as { id: number; name: string }[];
  return tags.map((t) => ({ id: t.id, name: t.name, itemCount: countTagItems(t.id) }));
}

export function tagsForItem(targetType: TagTargetType, targetPath: string): Tag[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.id, t.name FROM tags t
       JOIN item_tags it ON it.tag_id = t.id
       WHERE it.target_type = ? AND it.target_path = ?
       ORDER BY t.name COLLATE NOCASE ASC`,
    )
    .all(targetType, targetPath) as Tag[];
}

/**
 * Aplica tag ao alvo, criando a tag se não existir (idempotente).
 * Retorna a tag aplicada, ou null se o nome normalizado for vazio.
 */
export function addTag(
  rawName: string,
  targetType: TagTargetType,
  targetPath: string,
): Tag | null {
  const name = normalizeTagName(rawName);
  if (!name) return null;

  const db = getDb();
  db.prepare(`INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)`).run(
    name,
    Date.now(),
  );
  const tag = db
    .prepare(`SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE`)
    .get(name) as Tag;

  db.prepare(
    `INSERT OR IGNORE INTO item_tags (tag_id, target_type, target_path, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(tag.id, targetType, targetPath, Date.now());

  return tag;
}

export function removeTag(
  tagId: number,
  targetType: TagTargetType,
  targetPath: string,
): void {
  const db = getDb();
  db.prepare(
    `DELETE FROM item_tags WHERE tag_id = ? AND target_type = ? AND target_path = ?`,
  ).run(tagId, targetType, targetPath);
}
