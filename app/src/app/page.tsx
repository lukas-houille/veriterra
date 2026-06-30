import { auth, signOut } from '@/auth';

// Protected home (Tranche 0). Minimal but on-brand shell; real product screens land in
// Tranche 1. Its jobs: prove a session exists and sign out.
export default async function HomePage() {
  const session = await auth();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-[var(--vt-shadow-sm)]">
        <div className="mb-6 flex items-center gap-3">
          <img src="/veriterra-mark.svg" alt="" width={36} height={36} className="rounded-md" />
          <span className="text-2xl font-bold tracking-tight text-foreground">Veriterra</span>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Connecté
        </p>
        <p className="mt-1 mb-6 font-data text-foreground">
          {session?.user?.email ?? session?.user?.id ?? 'inconnu'}
        </p>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/sign-in' });
          }}
        >
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
