import { forOrg, withOrg } from '@veriterra/db';
import type { MaisonType, ProjetInput, ProjetSummary } from './types';

// Un projet par organisation en Tranche 1 (le multi-projet viendra plus tard). Le projet
// est le concept racine : tout devient relatif à lui (cahier §5).

type ProjetRow = {
  id: string;
  name: string;
  budgetMax: unknown;
  surfaceMinM2: number | null;
  surfaceMaxM2: number | null;
  typeMaison: string | null;
  consentementPartage: boolean;
};

function toSummary(p: ProjetRow): ProjetSummary {
  return {
    id: p.id,
    name: p.name,
    budgetMax: p.budgetMax == null ? null : Number(p.budgetMax),
    surfaceMinM2: p.surfaceMinM2,
    surfaceMaxM2: p.surfaceMaxM2,
    typeMaison: (p.typeMaison as MaisonType | null) ?? null,
    consentementPartage: p.consentementPartage,
  };
}

/** Projet actif de l'organisation (le premier créé), ou null si l'onboarding n'a pas eu lieu. */
export async function getActiveProjet(orgId: string): Promise<ProjetSummary | null> {
  const rows = (await forOrg(orgId).projet.findMany({
    orderBy: { createdAt: 'asc' },
    take: 1,
  })) as unknown as ProjetRow[];
  return rows[0] ? toSummary(rows[0]) : null;
}

/** Renvoie le projet actif, en créant un projet par défaut si aucun n'existe. */
export async function ensureProjet(orgId: string): Promise<ProjetSummary> {
  const existing = await getActiveProjet(orgId);
  if (existing) return existing;
  const created = (await withOrg(orgId, (tx) =>
    tx.projet.create({ data: { organisationId: orgId } }),
  )) as unknown as ProjetRow;
  return toSummary(created);
}

/** Crée ou met à jour le projet de l'organisation (onboarding et édition). */
export async function saveProjet(orgId: string, input: ProjetInput): Promise<ProjetSummary> {
  const existing = await getActiveProjet(orgId);
  const data = {
    name: input.name?.trim() ? input.name.trim() : undefined,
    budgetMax: input.budgetMax ?? null,
    surfaceMinM2: input.surfaceMinM2 ?? null,
    surfaceMaxM2: input.surfaceMaxM2 ?? null,
    typeMaison: input.typeMaison ?? null,
    consentementPartage: input.consentementPartage ?? false,
  };
  const saved = (await withOrg(orgId, async (tx) => {
    if (existing) return tx.projet.update({ where: { id: existing.id }, data });
    return tx.projet.create({ data: { organisationId: orgId, ...data } });
  })) as unknown as ProjetRow;
  return toSummary(saved);
}
