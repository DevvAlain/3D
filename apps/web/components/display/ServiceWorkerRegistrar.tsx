'use client';

import * as React from 'react';

function collectWarmAssetUrls(): string[] {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return [];
  }

  const urls = new Set<string>();
  const origin = window.location.origin;

  const tryAdd = (raw: string | null | undefined) => {
    if (!raw) return;
    try {
      const parsed = new URL(raw, origin);
      if (parsed.origin !== origin) return;
      if (parsed.pathname.startsWith('/_next/static/') || parsed.pathname.startsWith('/sounds/')) {
        urls.add(parsed.href);
      }
    } catch {
      // Ignore malformed URLs
    }
  };

  if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
    for (const entry of performance.getEntriesByType('resource')) {
      tryAdd(entry.name);
    }
  }

  document.querySelectorAll('script[src], link[href]').forEach((el) => {
    const src = el.getAttribute('src') || el.getAttribute('href');
    tryAdd(src);
  });

  return Array.from(urls);
}

async function waitForControllingSw(): Promise<ServiceWorker | null> {
  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller;
  }

  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller;
  }

  return await new Promise<ServiceWorker | null>((resolve) => {
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve(navigator.serviceWorker.controller);
    }, 3000);

    const onChange = () => {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve(navigator.serviceWorker.controller);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onChange);
  });
}

export function ServiceWorkerRegistrar() {
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    // Avoid stale chunk conflicts with `next dev` HMR while always activating in production builds
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    let cancelled = false;
    let secondaryTimer: number | null = null;
    const warmedStaticUrls = new Set<string>();

    const warmAssetsThroughSw = async (includeDisplayDoc: boolean) => {
      if (cancelled || navigator.onLine === false) return;

      // Cache authenticated Presenter /display shell immediately so even a first-visit offline F5 recovers cleanly
      if (
        includeDisplayDoc &&
        window.location.pathname === '/display' &&
        !window.location.search.includes('preview=1')
      ) {
        try {
          const docRes = await fetch('/display', {
            credentials: 'same-origin',
            cache: 'no-cache',
            headers: { Accept: 'text/html,application/xhtml+xml' },
          });
          await docRes.body?.cancel();
        } catch {
          // Ignore transient fetch issues
        }
      }

      const urls = collectWarmAssetUrls().filter((u) => !warmedStaticUrls.has(u));
      for (const u of urls) {
        if (cancelled) return;
        warmedStaticUrls.add(u);
        try {
          const res = await fetch(u, { cache: 'force-cache' });
          await res.body?.cancel();
        } catch {
          // Ignore transient failures
        }
      }
    };

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (reg) => {
        if (cancelled) return;
        void reg.update().catch(() => undefined);
        const ctrl = await waitForControllingSw();
        if (cancelled || !ctrl) return;

        await warmAssetsThroughSw(true);
        if (cancelled) return;

        // Capture late dynamic() Three.js / Rapier chunks after 3D stage initialization
        secondaryTimer = window.setTimeout(() => {
          void warmAssetsThroughSw(false);
        }, 3000);
      })
      .catch(() => {
        // Non-fatal if browser environment blocks SW (e.g. restricted private window)
      });

    return () => {
      cancelled = true;
      if (secondaryTimer !== null) {
        window.clearTimeout(secondaryTimer);
      }
    };
  }, []);

  return null;
}
