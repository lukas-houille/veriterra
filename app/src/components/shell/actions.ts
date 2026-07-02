'use server';

import { signOut } from '@/auth';

/** Déconnexion depuis la barre de nav (Server Action, importable par le composant client). */
export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}
