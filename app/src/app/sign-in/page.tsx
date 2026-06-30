import { signIn } from '@/auth';

// Sign-in page (Tranche 0). A single button kicks off the Pocket ID OIDC flow.
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-[var(--vt-shadow-sm)]">
        <div className="mb-2 flex items-center gap-3">
          <img src="/veriterra-mark.svg" alt="" width={40} height={40} className="rounded-md" />
          <span className="text-2xl font-bold tracking-tight text-foreground">Veriterra</span>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">Acheter un terrain en confiance.</p>
        <form
          action={async () => {
            'use server';
            await signIn('pocket-id', { redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-indigo-600"
          >
            Se connecter avec Pocket ID
          </button>
        </form>
      </div>
    </main>
  );
}
