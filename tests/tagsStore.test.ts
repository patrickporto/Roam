import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock em memória do módulo db (sem módulo nativo)
interface TagRow { id: number; name: string; created_at: number }
interface ItemTagRow { tag_id: number; target_type: string; target_path: string; created_at: number }

let tags: TagRow[];
let itemTags: ItemTagRow[];
let mediaPaths: string[];
let nextTagId: number;

function resetMockDb() {
  tags = [];
  itemTags = [];
  mediaPaths = [];
  nextTagId = 1;
}

function underFolder(p: string, folder: string): boolean {
  return p.startsWith(folder + '/') || p.startsWith(folder + '\\');
}

vi.mock('../electron/services/db', () => ({
  getDb: () => ({
    prepare: (query: string) => {
      const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
      return {
        get: (...args: any[]) => {
          // SELECT COUNT(*) AS c FROM media_index WHERE (path LIKE ? || '/%' ...)
          if (q.includes('count(*)') && q.includes('media_index') && q.includes('like')) {
            const folder = String(args[0]);
            return { c: mediaPaths.filter((p) => underFolder(p, folder)).length };
          }
          // SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE
          if (q.includes('from tags where name = ?')) {
            const name = String(args[0]).toLowerCase();
            const found = tags.find((t) => t.name.toLowerCase() === name);
            return found ? { id: found.id, name: found.name } : undefined;
          }
          return undefined;
        },
        all: (...args: any[]) => {
          // SELECT id, name FROM tags ORDER BY name
          if (q.startsWith('select id, name from tags order by')) {
            return [...tags]
              .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
              .map((t) => ({ id: t.id, name: t.name }));
          }
          // SELECT target_path FROM item_tags WHERE tag_id = ? AND target_type = 'folder'
          if (q.includes('select target_path from item_tags')) {
            const [tagId] = args;
            const targetType = q.includes("'file'") ? 'file' : 'folder';
            return itemTags
              .filter((it) => it.tag_id === tagId && it.target_type === targetType)
              .map((it) => ({ target_path: it.target_path }));
          }
          // SELECT it.target_path FROM item_tags it JOIN media_index ...
          if (q.includes('join media_index')) {
            const [tagId] = args;
            const targetType = q.includes("'file'") ? 'file' : 'folder';
            return itemTags
              .filter(
                (it) =>
                  it.tag_id === tagId &&
                  it.target_type === targetType &&
                  mediaPaths.includes(it.target_path),
              )
              .map((it) => ({ target_path: it.target_path }));
          }
          // SELECT t.id, t.name FROM tags t JOIN item_tags it ...
          if (q.includes('from tags t join item_tags')) {
            const [targetType, targetPath] = args;
            return itemTags
              .filter((it) => it.target_type === targetType && it.target_path === targetPath)
              .map((it) => tags.find((t) => t.id === it.tag_id)!)
              .filter(Boolean)
              .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
              .map((t) => ({ id: t.id, name: t.name }));
          }
          return [];
        },
        run: (...args: any[]) => {
          // INSERT OR IGNORE INTO tags (name, created_at)
          if (q.includes('insert or ignore into tags')) {
            const [name, createdAt] = args as [string, number];
            if (!tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
              tags.push({ id: nextTagId++, name, created_at: createdAt });
            }
            return { changes: 1 };
          }
          // INSERT OR IGNORE INTO item_tags
          if (q.includes('insert or ignore into item_tags')) {
            const [tagId, targetType, targetPath, createdAt] = args as [number, string, string, number];
            const exists = itemTags.some(
              (it) => it.tag_id === tagId && it.target_type === targetType && it.target_path === targetPath,
            );
            if (!exists) itemTags.push({ tag_id: tagId, target_type: targetType, target_path: targetPath, created_at: createdAt });
            return { changes: exists ? 0 : 1 };
          }
          // DELETE FROM item_tags
          if (q.includes('delete from item_tags')) {
            const [tagId, targetType, targetPath] = args as [number, string, string];
            const before = itemTags.length;
            itemTags = itemTags.filter(
              (it) => !(it.tag_id === tagId && it.target_type === targetType && it.target_path === targetPath),
            );
            return { changes: before - itemTags.length };
          }
          return { changes: 0 };
        },
      };
    },
  }),
}));

import { addTag, removeTag, listTags, tagsForItem, normalizeTagName } from '../electron/services/tagsStore';

describe('tagsStore', () => {
  beforeEach(() => {
    resetMockDb();
  });

  it('cria e aplica tag nova a um arquivo', () => {
    mediaPaths = ['/root/a.jpg'];
    const tag = addTag('Praia', 'file', '/root/a.jpg');
    expect(tag).not.toBeNull();
    expect(tag!.name).toBe('Praia');

    const applied = tagsForItem('file', '/root/a.jpg');
    expect(applied).toHaveLength(1);
    expect(applied[0].name).toBe('Praia');
  });

  it('normaliza nomes e reutiliza tag existente (case-insensitive)', () => {
    expect(normalizeTagName('  Praia   de  Verão ')).toBe('Praia de Verão');

    const t1 = addTag('  Praia ', 'file', '/root/a.jpg')!;
    const t2 = addTag('praia', 'file', '/root/b.jpg')!;
    expect(t2.id).toBe(t1.id);
    expect(listTags()).toHaveLength(1);
  });

  it('aplicar a mesma tag duas vezes é idempotente', () => {
    addTag('Praia', 'file', '/root/a.jpg');
    addTag('Praia', 'file', '/root/a.jpg');
    expect(tagsForItem('file', '/root/a.jpg')).toHaveLength(1);
  });

  it('remove associação de tag', () => {
    const tag = addTag('Praia', 'file', '/root/a.jpg')!;
    removeTag(tag.id, 'file', '/root/a.jpg');
    expect(tagsForItem('file', '/root/a.jpg')).toHaveLength(0);
  });

  it('retorna null para nome vazio', () => {
    expect(addTag('   ', 'file', '/root/a.jpg')).toBeNull();
    expect(listTags()).toHaveLength(0);
  });

  it('conta mídias de pasta tageada e arquivos tageados sem dupla contagem', () => {
    mediaPaths = [
      '/root/viagens/a.jpg',
      '/root/viagens/sub/b.jpg',
      '/root/viagens/c.jpg',
      '/root/outra/d.jpg',
    ];
    // Tag em pasta: conta as 3 mídias sob /root/viagens
    const tag = addTag('Verão', 'folder', '/root/viagens')!;
    // Arquivo tageado dentro da pasta: NÃO duplica
    addTag('Verão', 'file', '/root/viagens/a.jpg');
    // Arquivo tageado fora da pasta: soma 1
    addTag('Verão', 'file', '/root/outra/d.jpg');

    const summary = listTags().find((t) => t.id === tag.id)!;
    expect(summary.itemCount).toBe(4);
  });

  it('arquivo tageado ausente do índice não conta', () => {
    mediaPaths = ['/root/a.jpg'];
    addTag('Praia', 'file', '/root/a.jpg');
    addTag('Praia', 'file', '/root/removido.jpg');

    const summary = listTags()[0];
    expect(summary.itemCount).toBe(1);
  });
});
