'use client';

import { useEffect } from 'react';

// Enregistre le service worker (coquille hors-ligne + installabilité, US-6.1). Non bloquant :
// l'app fonctionne à l'identique sans SW. Uniquement en production (le SW et le HMR de dev
// se gênent), et après l'événement `load` pour ne pas concurrencer le premier rendu.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // `?v=<build>` fait changer le scriptURL à chaque déploiement : le navigateur réinstalle
    // alors le SW (coquille /offline fraîche) et purge l'ancien cache versionné.
    const version = process.env.NEXT_PUBLIC_SW_VERSION ?? 'dev';
    const register = () => {
      navigator.serviceWorker.register(`/sw.js?v=${version}`).catch(() => {
        // Échec silencieux : l'installabilité/hors-ligne est un bonus, jamais un prérequis.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
