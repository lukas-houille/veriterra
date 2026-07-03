import { notFound, redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { auth } from '@/auth';

// Garde serveur de la zone /admin (US-8.1). Défense en profondeur : appelée par le layout `(admin)`
// ET par chaque page/chargement de données admin, au cas où une future route sous /admin
// échapperait au layout. Un anonyme est redirigé vers la connexion ; un utilisateur connecté mais
// non-admin-plateforme reçoit notFound() (404, pour ne pas révéler l'existence de la zone).
export async function requirePlatformAdmin(): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect('/sign-in');
  if (!session.user.platformAdmin) notFound();
  return session;
}
