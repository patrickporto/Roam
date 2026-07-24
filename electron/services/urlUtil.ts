/**
 * Constrói URLs media:// a partir de caminhos absolutos.
 * Módulo puro (sem dependência de electron) — importável por scanner, stores e testes.
 *
 * Formato: media://file/<segmentos-do-caminho-absoluto-codificados>
 * Ex.: C:\Media\foto 1.jpg → media://file/C%3A/Media/foto%201.jpg
 */
export function toMediaUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/');
  const encoded = normalized
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `media://file/${encoded}`;
}
