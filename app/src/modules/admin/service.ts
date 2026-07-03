import { admin } from '@veriterra/db';
import { WORKER_HEARTBEAT_KEY, getRedisConnection } from '@veriterra/shared';
import { isPlatformAdmin } from '@/lib/platform-admin';

// Accès aux données CROSS-TENANT de la section admin plateforme (US-8.1). Utilise le client
// privilégié `admin` (contourne la RLS), à n'appeler QUE derrière `requirePlatformAdmin` (règle 2).
// Aucune donnée de tenant n'est servie hors de ce contexte gardé.

const WORKER_FRESH_MS = 30_000; // aligné sur worker/src/healthcheck.ts
const PROBE_TIMEOUT_MS = 2_000;

// La connexion Redis partagée est celle des producteurs BullMQ (maxRetriesPerRequest: null,
// offline queue activée) : une commande émise alors que Redis est injoignable est mise en file et
// n'est JAMAIS rejetée. Sans borne, la sonde de santé bloquerait le rendu de /admin exactement
// pendant une panne Redis. On borne donc chaque appel par une course avec un timeout : le dépassement
// rejette, tombe dans le catch et affiche « indisponible » (règle 3). La commande en attente reste
// inoffensive dans la file offline d'ioredis (réglée au reconnect).
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      (t as unknown as { unref?: () => void }).unref?.();
    }),
  ]);
}

export interface PlatformStats {
  organisations: number;
  comptes: number;
  terrains: number;
  documents: number;
  documentsBytes: number;
  invitationsEnAttente: number;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const [organisations, comptes, terrains, docAgg, invitationsEnAttente] = await Promise.all([
    admin.organisation.count(),
    admin.user.count(),
    admin.terrain.count(),
    admin.terrainDocument.aggregate({ _count: true, _sum: { sizeBytes: true } }),
    admin.invitation.count({ where: { status: 'PENDING' } }),
  ]);
  return {
    organisations,
    comptes,
    terrains,
    documents: docAgg._count,
    documentsBytes: docAgg._sum.sizeBytes ?? 0,
    invitationsEnAttente,
  };
}

export interface OrgRow {
  id: string;
  name: string;
  createdAt: Date;
  members: number;
  terrains: number;
  documents: number;
}

export async function listOrganisations(): Promise<OrgRow[]> {
  const orgs = await admin.organisation.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { memberships: true, terrains: true, documents: true } },
    },
  });
  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    createdAt: o.createdAt,
    members: o._count.memberships,
    terrains: o._count.terrains,
    documents: o._count.documents,
  }));
}

export interface AccountRow {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: Date;
  platformAdmin: boolean;
  memberships: Array<{ organisation: string; role: string }>;
}

export async function listAccounts(): Promise<AccountRow[]> {
  const users = await admin.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      memberships: { select: { role: true, organisation: { select: { name: true } } } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt,
    platformAdmin: isPlatformAdmin(u.email),
    memberships: u.memberships.map((m) => ({ organisation: m.organisation.name, role: m.role })),
  }));
}

export interface SystemHealth {
  db: boolean;
  redis: boolean;
  /** null = état worker indisponible (clé absente ou Redis injoignable), jamais une valeur inventée (règle 3). */
  workerLastBeatAgeMs: number | null;
  workerAlive: boolean;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  let db = false;
  let redis = false;
  let workerLastBeatAgeMs: number | null = null;
  let workerAlive = false;

  try {
    await admin.$queryRaw`SELECT 1`;
    db = true;
  } catch (err) {
    console.error('[admin] db check failed:', err);
  }

  try {
    const conn = getRedisConnection();
    redis = (await withTimeout(conn.ping(), PROBE_TIMEOUT_MS, 'redis ping')) === 'PONG';
    const ts = await withTimeout(conn.get(WORKER_HEARTBEAT_KEY), PROBE_TIMEOUT_MS, 'worker heartbeat');
    if (ts !== null) {
      const age = Date.now() - Number(ts);
      if (Number.isFinite(age)) {
        workerLastBeatAgeMs = age;
        workerAlive = age < WORKER_FRESH_MS;
      }
    }
  } catch (err) {
    console.error('[admin] redis/worker check failed:', err);
  }

  return { db, redis, workerLastBeatAgeMs, workerAlive };
}
