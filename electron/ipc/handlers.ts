import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { promises as fs } from 'fs';
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
    // Cancel any ongoing scan before deleting from DB to avoid FK violations.
    const existing = activeScans.get(rootPath);
    if (existing) existing.cancel();
    activeScans.delete(rootPath);

    const db = getDb();
    db.prepare(`DELETE FROM media_index WHERE root_path = ?`).run(rootPath);
    db.prepare(`DELETE FROM roots WHERE path = ?`).run(rootPath);
    db.prepare(`DELETE FROM favorites WHERE target_path LIKE ?`).run(
      rootPath + '%',
    );
    db.prepare(`DELETE FROM item_tags WHERE target_path LIKE ?`).run(
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

async function startScanForRoot(rootPath: string): Promise<void> {
  // Cancel any existing scan on this root
  const existing = activeScans.get(rootPath);
  if (existing) existing.cancel();

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
      // persist to DB as items arrive
      if (progress.items.length > 0) {
        const db = getDb();
        // Guard: skip if root was deleted mid-scan (avoids FK constraint error).
        const rootExists = db
          .prepare(`SELECT 1 FROM roots WHERE path = ?`)
          .get(rootPath);
        if (rootExists) {
          const insert = db.prepare(`
            INSERT OR REPLACE INTO media_index
              (path, root_path, profile_path, album_path, type, format, size, created_at, modified_at, keywords, indexed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const tx = db.transaction(() => {
            for (const item of progress.items) {
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
      }

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
    activeScans.delete(rootPath);
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
