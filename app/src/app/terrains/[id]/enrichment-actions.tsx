'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@veriterra/ui';

// Îlot client de l'enrichissement (US-2.6 / US-1.4). Deux rôles :
//  - remplissage auto : tant qu'un bloc est en attente, on interroge l'état à intervalle borné
//    et on rafraîchit la fiche serveur (router.refresh) jusqu'au statut terminal ;
//  - rafraîchissement manuel : le bouton (ré)enfile l'enrichissement (force) puis relance le
//    polling. Le rendu des blocs reste côté serveur ; cet îlot ne fait que déclencher.

const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 20; // ~1 min, borne dure

export function EnrichmentActions({ terrainId, pending }: { terrainId: string; pending: boolean }) {
  const router = useRouter();
  const [polling, setPolling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stalled, setStalled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (activeRef.current) return; // un seul poller à la fois
    activeRef.current = true;
    setStalled(false);
    setPolling(true);
    let attempts = 0;
    const tick = async () => {
      if (!activeRef.current) return;
      attempts += 1;
      let done = false;
      try {
        const res = await fetch(`/api/terrains/${terrainId}/enrichment`, { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as { anyPending?: boolean };
          router.refresh();
          done = data.anyPending === false;
        }
      } catch {
        // on réessaiera au prochain tick
      }
      if (!activeRef.current) return;
      if (done) {
        stop();
        return;
      }
      if (attempts >= MAX_POLLS) {
        // Budget épuisé alors qu'un bloc reste en attente : on ne laisse pas un squelette
        // éternel silencieux (règle 3), on surface l'état et on laisse relancer.
        setStalled(true);
        stop();
        return;
      }
      timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };
    timerRef.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  }, [terrainId, router, stop]);

  useEffect(() => {
    if (pending) startPolling();
    return () => stop();
  }, [pending, startPolling, stop]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch(`/api/terrains/${terrainId}/enrich`, { method: 'POST' });
    } catch {
      // silencieux : le polling reflétera l'état réel.
    } finally {
      setRefreshing(false);
    }
    startPolling();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={handleRefresh} disabled={refreshing || polling}>
          {refreshing ? 'Lancement...' : 'Actualiser'}
        </Button>
        {polling && <span className="text-xs text-muted-foreground">Mise à jour en cours...</span>}
      </div>
      {stalled && !polling && (
        <span className="text-xs text-amber-600">
          L&apos;enrichissement prend plus de temps que prévu. Réessayez avec Actualiser.
        </span>
      )}
    </div>
  );
}
