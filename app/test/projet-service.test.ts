import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin } from '@veriterra/db';
import { ensureProjet, getActiveProjet, saveProjet } from '@/modules/projet/service';

const ORG_ID = '00000000-0000-0000-0000-0000000000dd';

beforeAll(async () => {
  await admin.organisation.upsert({
    where: { id: ORG_ID },
    update: {},
    create: { id: ORG_ID, name: 'Org Projet Test' },
  });
});

afterAll(async () => {
  await admin.organisation.delete({ where: { id: ORG_ID } }).catch(() => undefined);
  await admin.$disconnect();
});

describe('projet service', () => {
  it('ensureProjet crée un projet par défaut puis le renvoie (idempotent)', async () => {
    const first = await ensureProjet(ORG_ID);
    expect(first.name).toBe('Mon projet');
    const second = await ensureProjet(ORG_ID);
    expect(second.id).toBe(first.id);
    expect(await getActiveProjet(ORG_ID)).not.toBeNull();
  });

  it('saveProjet met à jour le projet existant, sans en créer un second', async () => {
    await ensureProjet(ORG_ID);
    const saved = await saveProjet(ORG_ID, {
      budgetMax: 250000,
      surfaceMinM2: 400,
      surfaceMaxM2: 800,
      typeMaison: 'R1',
    });
    expect(saved.budgetMax).toBe(250000);
    expect(saved.surfaceMinM2).toBe(400);
    expect(saved.typeMaison).toBe('R1');

    const all = await admin.projet.findMany({ where: { organisationId: ORG_ID } });
    expect(all).toHaveLength(1);
  });
});
