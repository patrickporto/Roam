import { contextBridge, ipcRenderer } from 'electron';
import type { RoamApi, ScanProgress, RootKind, MediaScope, SortOrder, FavoriteTargetType } from '../src/shared/types';

const api: RoamApi = {
  library: {
    pickFolder: () => ipcRenderer.invoke('library:pickFolder'),
    addRoot: (path: string, kind: RootKind) =>
      ipcRenderer.invoke('library:addRoot', path, kind),
    removeRoot: (rootPath: string) =>
      ipcRenderer.invoke('library:removeRoot', rootPath),
    updateRootKind: (rootPath: string, kind: RootKind) =>
      ipcRenderer.invoke('library:updateRootKind', rootPath, kind),
    list: () => ipcRenderer.invoke('library:list'),
    getProfile: (profilePath: string) =>
      ipcRenderer.invoke('library:getProfile', profilePath),
    listMedia: (scope: MediaScope, cursor?: string, order?: SortOrder) =>
      ipcRenderer.invoke('library:listMedia', scope, cursor, order),
  },
  feed: {
    forYou: (cursor?: string) => ipcRenderer.invoke('feed:forYou', cursor),
    resetSession: (cursor?: string) => ipcRenderer.invoke('feed:resetSession', cursor),
  },
  favorites: {
    toggle: (targetType: FavoriteTargetType, targetPath: string) =>
      ipcRenderer.invoke('favorites:toggle', targetType, targetPath),
    list: () => ipcRenderer.invoke('favorites:list'),
    media: (cursor?: string) => ipcRenderer.invoke('favorites:media', cursor),
  },
  scan: {
    start: (rootPath: string) => ipcRenderer.invoke('scan:start', rootPath),
    cancel: () => ipcRenderer.invoke('scan:cancel'),
    onProgress: (cb: (progress: ScanProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: ScanProgress) =>
        cb(progress);
      ipcRenderer.on('scan:progress', handler);
      return () => {
        ipcRenderer.removeListener('scan:progress', handler);
      };
    },
  },
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
  },
  shell: {
    openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
  },
};

contextBridge.exposeInMainWorld('roam', api);
