export const SW_CACHE_ASSETS = 'church-display-assets-v1';
export const SW_CACHE_DOC = 'church-display-doc-v1';

export const SW_PRECACHE_SOUNDS: ReadonlyArray<string> = [
  '/sounds/unlock-chime.wav',
  '/sounds/draw-spin-start.wav',
  '/sounds/ambient-shimmer.wav',
  '/sounds/drum-roll.wav',
  '/sounds/tick.wav',
  '/sounds/ting.wav',
  '/sounds/fanfare.wav',
];

export type SwFetchStrategy =
  | 'bypass-network'
  | 'doc-network-first'
  | 'asset-stale-revalidate';

/**
 * Pure Service Worker caching policy shared between `public/sw.js` design and unit tests.
 * STRICT INVARIANT: `/api/*` requests, cross-origin requests (Supabase), and non-GET
 * requests MUST always return `'bypass-network'` and NEVER be stored in CacheStorage.
 */
export function classifySwFetchRequest(params: {
  method: string;
  requestOrigin: string;
  currentOrigin: string;
  pathname: string;
}): SwFetchStrategy {
  const { method, requestOrigin, currentOrigin, pathname } = params;

  if (method.toUpperCase() !== 'GET') {
    return 'bypass-network';
  }

  if (requestOrigin !== currentOrigin) {
    return 'bypass-network';
  }

  // NEVER cache /api/* responses (display state, admin endpoints, auth callbacks, draw APIs)
  if (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next/webpack-hmr') ||
    pathname.startsWith('/__nextjs')
  ) {
    return 'bypass-network';
  }

  if (pathname === '/display') {
    return 'doc-network-first';
  }

  if (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/sounds/') ||
    pathname.endsWith('.wasm') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.wav') ||
    pathname.endsWith('.mp3') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico')
  ) {
    return 'asset-stale-revalidate';
  }

  return 'bypass-network';
}
