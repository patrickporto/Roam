import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from '../services/db';
import { scanRoot, ScanCallbacks } from '../services/mediaScanner';
import {
  getForYouPage,
  getTagFeedPage,
  resetFeedSession,
  clearFeedSessions,
} from '../services/recommendation';
import {
  listTags,
  tagsForItem,
  addTag,
  removeTag,
} from '../services/tagsStore';
import {
  listMedia,
  listMediaScored,
  favoritesMedia,
  toggleFavorite,
  getFavorites,
  getProfiles,
  getProfile,
} from '../services/favoritesStore';
import { refreshRoots } from '../services/mediaProtocol';
import type {
  ScanProgress,
  RootKind,
  MediaItem,
  MediaScope,
  SortOrder,
  FavoriteTargetType,
  TagTargetType,
} from '../../src/shared/types';

// active scan handles for cancellation
const activeScans = new Map<string, { cancel: () => void }>();

export function registerIpcHandlers(): void {
  // ── Library ──

  ipcMain.handle('library:pickFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Selecionar pasta',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    'library:addRoot',
    async (_e, rootPath: string, kind: RootKind) => {
      const db = getDb();
      const existing = db
        .prepare(`SELECT 1 FROM roots WHERE path = ?`)
        .get(rootPath);
      if (!existing) {
        db.prepare(
          `INSERT INTO roots (path, kind, added_at) VALUES (?, ?, ?)`,
        ).run(rootPath, kind, Date.now());
      } else {
        db.prepare(`UPDATE roots SET kind = ? WHERE path = ?`).run(kind, rootPath);
      }
      refreshRoots();

      await startScanForRoot(rootPath);
      clearFeedSessions();
      return getProfiles();
    },
  );

  ipcMain.handle(
    'library:updateRootKind',
    async (_e, rootPath: string, kind: RootKind) => {
      const db = getDb();
      db.prepare(`UPDATE roots SET kind = ? WHERE path = ?`).run(kind, rootPath);
      // índice derivado do tipo anterior não é mais válido
      db.prepare(`DELETE FROM media_index WHERE root_path = ?`).run(rootPath);
      await startScanForRoot(rootPath);
      clearFeedSessions();
      return getProfiles();
    },
  );

  ipcMain.handle('library:removeRoot', async (_e, rootPath: string) => {
    // Cancel any ongoing scan (raiz ou perfis sob ela) before deleting from
    // DB to avoid FK violations.
    cancelScansIntersecting(rootPath);

    const db = getDb();
    db.prepare(`DELETE FROM media_index WHERE root_path = ?`).run(rootPath);
    db.prepare(`DELETE FROM roots WHERE path = ?`).run(rootPath);
    db.prepare(`DELETE FROM favorites WHERE target_path LIKE ?`).run(
      rootPath + '%',
    );
    db.prepare(`DELETE FROM item_tags WHERE target_path LIKE ?`).run(
      rootPath + '%',
    );
    db.prepare(`DELETE FROM shown_history WHERE media_path LIKE ?`).run(
      rootPath + '%',
    );
    refreshRoots();
    clearFeedSessions();
  });

  ipcMain.handle('library:list', async () => getProfiles());

  ipcMain.handle('library:getProfile', async (_e, profilePath: string) => {
    return getProfile(profilePath);
  });

  ipcMain.handle(
    'library:refreshProfile',
    async (_e, profilePath: string) => {
      const root = findContainingRoot(profilePath);
      if (!root) return null;

      // Exclusão mútua: cancela scan ativo do perfil ou da raiz que o contém
      cancelScansIntersecting(profilePath);

      let cancelled = false;
      const handle = {
        cancel: () => {
          cancelled = true;
        },
      };
      activeScans.set(profilePath, handle);

      const callbacks: ScanCallbacks = {
        shouldCancel: () => cancelled,
        onProgress: (progress: ScanProgress) => {
          persistScanItems(root.path, progress.items);
          const mainWin = BrowserWindow.getAllWindows()[0];
          if (mainWin && !mainWin.isDestroyed()) {
            mainWin.webContents.send('scan:progress', progress);
          }
        },
      };

      const scanStartedAt = Date.now();

      try {
        const result = await scanRoot(root.path, callbacks, root.kind, profilePath);
        if (!result.cancelled) {
          const exists = await reconcileProfile(
            profilePath,
            scanStartedAt,
            result.errors,
          );
          if (!exists) return null;
        }
      } finally {
        // Só remove se ainda for o handle deste scan — um scan mais novo
        // pode ter registrado outro handle sob a mesma chave
        if (activeScans.get(profilePath) === handle) {
          activeScans.delete(profilePath);
        }
      }

      return getProfile(profilePath);
    },
  );

  ipcMain.handle(
    'library:listMedia',
    async (_e, scope: MediaScope, cursor?: string, order?: SortOrder) => {
      let result;
      if (order === 'recommended' && scope.profilePath) {
        result = listMediaScored(scope.profilePath, cursor);
      } else {
        result = listMedia(scope, cursor, order);
      }
      return result;
    },
  );

  // ── Feed ──

  ipcMain.handle('feed:forYou', async (_e, cursor?: string) => {
    return getForYouPage(cursor);
  });

  ipcMain.handle('feed:resetSession', async (_e, cursor?: string) => {
    resetFeedSession(cursor);
  });

  // ── Favorites ──

  ipcMain.handle(
    'favorites:toggle',
    async (_e, targetType: FavoriteTargetType, targetPath: string) => {
      return toggleFavorite(targetType, targetPath);
    },
  );

  ipcMain.handle('favorites:list', async () => getFavorites());

  ipcMain.handle('favorites:media', async (_e, cursor?: string) => {
    return favoritesMedia(cursor);
  });

  // ── Tags ──

  ipcMain.handle('tags:list', async () => listTags());

  ipcMain.handle(
    'tags:forItem',
    async (_e, targetType: TagTargetType, targetPath: string) => {
      return tagsForItem(targetType, targetPath);
    },
  );

  ipcMain.handle(
    'tags:add',
    async (_e, name: string, targetType: TagTargetType, targetPath: string) => {
      return addTag(name, targetType, targetPath);
    },
  );

  ipcMain.handle(
    'tags:remove',
    async (_e, tagId: number, targetType: TagTargetType, targetPath: string) => {
      removeTag(tagId, targetType, targetPath);
    },
  );

  ipcMain.handle('tags:feedPage', async (_e, tagId: number, cursor?: string) => {
    return getTagFeedPage(tagId, cursor);
  });

  // ── Scan ──

  ipcMain.handle('scan:start', async (_e, rootPath: string) => {
    await startScanForRoot(rootPath);
  });

  ipcMain.handle('scan:cancel', async () => {
    for (const [, handle] of activeScans) {
      handle.cancel();
    }
    activeScans.clear();
  });

  // ── Window controls (frameless) ──

  ipcMain.handle('win:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });

  ipcMain.handle('win:toggleMaximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.handle('win:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });

  // ── Shell ──

  ipcMain.handle('shell:openPath', async (_e, targetPath: string) => {
    await shell.openPath(targetPath);
  });
}

/**
 * Rescaneia todas as raízes registradas (sequencial, em background).
 * Chamado na inicialização para revalidar o índice cacheado.
 */
export async function rescanAllRoots(): Promise<void> {
  const db = getDb();
  const rows = db.prepare(`SELECT path FROM roots`).all() as { path: string }[];
  for (const row of rows) {
    try {
      await startScanForRoot(row.path);
    } catch (err) {
      console.error('[roam] rescan falhou para', row.path, err);
    }
  }
}

/**
 * Persiste um lote de itens no índice, com guarda contra raiz removida
 * no meio do scan (evita violação da FK de root_path).
 */
function persistScanItems(rootPath: string, items: MediaItem[]): void {
  if (items.length === 0) return;
  const db = getDb();
  const rootExists = db
    .prepare(`SELECT 1 FROM roots WHERE path = ?`)
    .get(rootPath);
  if (!rootExists) return;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO media_index
      (path, root_path, profile_path, album_path, type, format, size, created_at, modified_at, keywords, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const item of items) {
      insert.run(
        item.path,
        item.rootPath,
        item.profilePath,
        item.albumPath,
        item.type,
        item.format,
        item.size,
        item.createdAt,
        item.modifiedAt,
        item.keywords.join(','),
        Date.now(),
      );
    }
  });
  tx();
}

/**
 * Encontra a raiz registrada que contém o perfil (prefix match mais longo,
 * case-insensitive, separadores normalizados). Null se o perfil não
 * pertence a nenhuma raiz.
 */
function findContainingRoot(
  profilePath: string,
): { path: string; kind: RootKind } | null {
  const db = getDb();
  const roots = db
    .prepare(`SELECT path, kind FROM roots`)
    .all() as { path: string; kind: RootKind }[];
  const normalize = (p: string) =>
    p.replace(/[\\/]+/g, path.sep).replace(/[\\/]+$/, '').toLowerCase();
  const target = normalize(profilePath);

  let best: { path: string; kind: RootKind } | null = null;
  for (const root of roots) {
    const rp = normalize(root.path);
    if (target === rp || target.startsWith(rp + path.sep)) {
      if (!best || root.path.length > best.path.length) best = root;
    }
  }
  return best;
}

/**
 * Cancela todos os scans cujo escopo intersecta `scope` (o próprio escopo,
 * um ancestral como a raiz, ou um descendente como um perfil sob a raiz).
 * Garante exclusão mútua entre scan de raiz e refresh de perfil.
 */
function cancelScansIntersecting(scope: string): void {
  const normalize = (p: string) =>
    p.replace(/[\\/]+/g, path.sep).replace(/[\\/]+$/, '').toLowerCase();
  const target = normalize(scope);
  for (const [key, handle] of activeScans) {
    const k = normalize(key);
    if (
      k === target ||
      k.startsWith(target + path.sep) ||
      target.startsWith(k + path.sep)
    ) {
      handle.cancel();
      activeScans.delete(key);
    }
  }
}

/**
 * Reconcilia o índice de um único perfil após scan escopado:
 * - Pasta do perfil sumiu do disco: apaga as entradas do perfil e os dados
 *   associados sob o path (favoritos, tags).
 * - Scan sem erros de leitura: remove entradas do perfil não revalidadas
 *   (indexed_at anterior ao início do scan = arquivo/pasta deletado).
 * Com erros de leitura, não poda: um diretório ilegível transitório
 * apagaria itens válidos do índice. Retorna false se o perfil não existe mais.
 */
async function reconcileProfile(
  profilePath: string,
  scanStartedAt: number,
  errors: number,
): Promise<boolean> {
  const db = getDb();
  const profileExists = await fs
    .stat(profilePath)
    .then(() => true)
    .catch(() => false);

  if (!profileExists) {
    const removed = db
      .prepare(`DELETE FROM media_index WHERE profile_path = ? COLLATE NOCASE`)
      .run(profilePath);
    db.prepare(`DELETE FROM favorites WHERE target_path LIKE ?`).run(profilePath + '%');
    db.prepare(`DELETE FROM item_tags WHERE target_path LIKE ?`).run(profilePath + '%');
    db.prepare(`DELETE FROM shown_history WHERE media_path LIKE ?`).run(profilePath + '%');
    if (removed.changes > 0) clearFeedSessions();
    return false;
  }

  if (errors > 0) return true;

  const pruned = db
    .prepare(
      `DELETE FROM media_index WHERE profile_path = ? COLLATE NOCASE AND indexed_at < ?`,
    )
    .run(profilePath, scanStartedAt);
  if (pruned.changes > 0) {
    clearFeedSessions();
  }
  return true;
}

async function startScanForRoot(rootPath: string): Promise<void> {
  // Exclusão mútua: cancela scan ativo da raiz ou de perfis sob ela
  cancelScansIntersecting(rootPath);

  const db = getDb();
  const kindRow = db
    .prepare(`SELECT kind FROM roots WHERE path = ?`)
    .get(rootPath) as { kind: RootKind } | undefined;
  const kind: RootKind = kindRow?.kind ?? 'profile';

  let cancelled = false;
  const handle = {
    cancel: () => {
      cancelled = true;
    },
  };
  activeScans.set(rootPath, handle);

  const callbacks: ScanCallbacks = {
    shouldCancel: () => cancelled,
    onProgress: (progress: ScanProgress) => {
      persistScanItems(rootPath, progress.items);

      // Forward progress to renderer
      const mainWin = BrowserWindow.getAllWindows()[0];
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('scan:progress', progress);
      }
    },
  };

  const scanStartedAt = Date.now();

  try {
    const result = await scanRoot(rootPath, callbacks, kind);
    if (!result.cancelled) {
      await reconcileRoot(rootPath, scanStartedAt, result.errors);
    }
  } finally {
    // Só remove se ainda for o handle deste scan (ver comentário no refresh de perfil)
    if (activeScans.get(rootPath) === handle) {
      activeScans.delete(rootPath);
    }
  }
}

/**
 * Reconcilia o índice com o disco após um scan completo:
 * - Raiz removida do disco: apaga root (cascade limpa media_index),
 *   favoritos e tags sob o path.
 * - Scan sem erros de leitura: remove entradas não revalidadas
 *   (indexed_at anterior ao início do scan = arquivo/pasta deletado).
 * Com erros de leitura, não poda: um diretório ilegível transitório
 * apagaria itens válidos do índice.
 */
async function reconcileRoot(
  rootPath: string,
  scanStartedAt: number,
  errors: number,
): Promise<void> {
  const db = getDb();
  const rootExists = await fs.stat(rootPath).then(() => true).catch(() => false);

  if (!rootExists) {
    db.prepare(`DELETE FROM roots WHERE path = ?`).run(rootPath);
    db.prepare(`DELETE FROM favorites WHERE target_path LIKE ?`).run(rootPath + '%');
    db.prepare(`DELETE FROM item_tags WHERE target_path LIKE ?`).run(rootPath + '%');
    db.prepare(`DELETE FROM shown_history WHERE media_path LIKE ?`).run(rootPath + '%');
    refreshRoots();
    clearFeedSessions();
    return;
  }

  if (errors > 0) return;

  const pruned = db
    .prepare(`DELETE FROM media_index WHERE root_path = ? AND indexed_at < ?`)
    .run(rootPath, scanStartedAt);
  if (pruned.changes > 0) {
    clearFeedSessions();
  }
}
