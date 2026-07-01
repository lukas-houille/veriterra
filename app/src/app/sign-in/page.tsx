import { signIn } from '@/auth';
import { Button, Card } from '@veriterra/ui';

// Sign-in page (Tranche 0). A single button kicks off the Pocket ID OIDC flow.
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8">
        <div className="mb-2 flex items-center gap-3">
          <img src="/veriterra-mark.svg" alt="" width={40} height={40} className="rounded-md" />
          <span className="text-2xl font-bold tracking-tight text-foreground">Veriterra</span>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">Acheter un terrain en confiance.</p>
        <form
          action={async () => {
            'use server';
            await signIn('pocket-id', { redirectTo: '/dashboard' });
          }}
        >
          <Button type="submit" className="w-full">
            Se connecter avec Pocket ID
          </Button>
        </form>
      </Card>
    </main>
  );
}
