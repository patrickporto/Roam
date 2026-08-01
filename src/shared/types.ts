/**
 * Contratos compartilhados entre main process (electron/) e renderer (src/).
 * Esta é a única fonte de verdade da API IPC exposta via contextBridge.
 */

export type MediaType = 'image' | 'video';

/**
 * Tipo da pasta raiz:
 * - `container`: subpastas diretas viram perfis; mídias soltas formam um perfil implícito.
 * - `profile`: a própria pasta é um perfil; subpastas diretas viram álbuns.
 */
export type RootKind = 'container' | 'profile';

export type SortOrder = 'recent' | 'oldest' | 'recommended';

export interface MediaItem {
  /** Caminho absoluto no disco (chave estável do item). */
  path: string;
  /** URL servida pelo protocolo customizado media:// */
  mediaUrl: string;
  /** Nome do arquivo com extensão. */
  name: string;
  type: MediaType;
  /** Extensão normalizada, minúscula, sem ponto (ex.: "jpg", "mp4"). */
  format: string;
  /** Tamanho em bytes. */
  size: number;
  /** Epoch ms. */
  createdAt: number;
  /** Epoch ms. */
  modifiedAt: number;
  /** Palavras-chave derivadas do nome do arquivo (minúsculas). */
  keywords: string[];
  /** Pasta raiz registrada de onde o item foi extraído. */
  rootPath: string;
  /** Pasta do perfil de origem (nunca nula: cai para a raiz em perfis implícitos). */
  profilePath: string;
  /** Subpasta direta do perfil (álbum) de origem; null se o arquivo está no 1º nível do perfil. */
  albumPath: string | null;
}

export interface AlbumSummary {
  path: string;
  name: string;
  coverUrl: string | null;
  mediaCount: number;
  isFavorite: boolean;
}

export interface Profile {
  /** Raiz registrada de onde este perfil foi derivado. */
  rootPath: string;
  /** Tipo da raiz de origem. */
  rootKind: RootKind;
  /** Identidade do perfil (caminho da pasta do perfil). */
  profilePath: string;
  /** Nome da pasta do perfil. */
  username: string;
  coverUrl: string | null;
  mediaCount: number;
  /** Epoch ms da mídia mais recentemente modificada do perfil (0 se vazio). */
  modifiedAt: number;
  albums: AlbumSummary[];
  isFavorite: boolean;
}

export interface FeedPage {
  items: MediaItem[];
  /** Cursor opaco para a próxima página; null quando não há mais itens. */
  nextCursor: string | null;
}

export interface ScanProgress {
  rootPath: string;
  scannedDirs: number;
  foundMedia: number;
  /** Lote incremental de itens encontrados neste batch. */
  items: MediaItem[];
  done: boolean;
  cancelled: boolean;
  errors: number;
}

export type FavoriteTargetType = 'file' | 'folder';

export interface FavoritesSnapshot {
  files: string[];
  folders: string[];
}

/** Escopo de listagem de mídia: um perfil inteiro ou um álbum específico. */
export interface MediaScope {
  profilePath?: string;
  albumPath?: string;
}

/**
 * API exposta ao renderer como window.roam (via contextBridge no preload).
 * Todos os métodos são async e cruzam a fronteira de IPC.
 */
export interface RoamApi {
  library: {
    /** Abre diálogo de seleção de pasta. Null se cancelado. */
    pickFolder(): Promise<string | null>;
    /** Registra a pasta como raiz do tipo informado, varre e retorna todos os perfis. */
    addRoot(path: string, kind: RootKind): Promise<Profile[]>;
    removeRoot(rootPath: string): Promise<void>;
    /** Altera o tipo da raiz, reindexa e retorna todos os perfis. */
    updateRootKind(rootPath: string, kind: RootKind): Promise<Profile[]>;
    list(): Promise<Profile[]>;
    getProfile(profilePath: string): Promise<Profile | null>;
    /** Lista mídia achatada de um escopo (perfil ou álbum), paginada e ordenada. */
    listMedia(scope: MediaScope, cursor?: string, order?: SortOrder): Promise<FeedPage>;
  };
  feed: {
    /** Página do feed For You. Sem cursor inicia nova sessão de feed. */
    forYou(cursor?: string): Promise<FeedPage>;
    /** Descarta a sessão atual do feed (próxima chamada reembaralha). */
    resetSession(): Promise<void>;
  };
  favorites: {
    /** Alterna favorito; retorna o novo estado (true = favoritado). */
    toggle(targetType: FavoriteTargetType, targetPath: string): Promise<boolean>;
    list(): Promise<FavoritesSnapshot>;
    /** Arquivos curtidos, mais recentemente curtidos primeiro, paginados. */
    media(cursor?: string): Promise<FeedPage>;
  };
  scan: {
    start(rootPath: string): Promise<void>;
    cancel(): Promise<void>;
    /** Inscreve callback de progresso; retorna função de unsubscribe. */
    onProgress(cb: (progress: ScanProgress) => void): () => void;
  };
  win: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
  };
  shell: {
    /** Abre o caminho no gerenciador de arquivos do sistema. */
    openPath(path: string): Promise<void>;
  };
}

declare global {
  interface Window {
    roam: RoamApi;
  }
}
