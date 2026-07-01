export type MaisonType = 'PLAIN_PIED' | 'R1' | 'R2' | 'R3';

/** Entrée de définition/mise à jour du projet (tous les champs optionnels : onboarding court). */
export interface ProjetInput {
  name?: string;
  budgetMax?: number | null;
  surfaceMinM2?: number | null;
  surfaceMaxM2?: number | null;
  typeMaison?: MaisonType | null;
  consentementPartage?: boolean;
}

export interface ProjetSummary {
  id: string;
  name: string;
  budgetMax: number | null;
  surfaceMinM2: number | null;
  surfaceMaxM2: number | null;
  typeMaison: MaisonType | null;
  consentementPartage: boolean;
}
