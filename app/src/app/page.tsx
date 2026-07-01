import Link from 'next/link';
import { auth } from '@/auth';
import { Button, Card } from '@veriterra/ui';

// Landing publique (Tranche 1). Seule page accessible sans session (voir auth.config).
// Pitch produit + appel à l'action vers la connexion (ou le tableau de bord si connecté).

const VALEURS = [
  {
    titre: 'Synthèse sourcée',
    texte:
      'Cadastre, PLU, risques, prix du secteur, pente : chaque donnée avec sa source, sa date et un indice de confiance. Jamais un chiffre orphelin.',
  },
  {
    titre: 'Exploration cartographique',
    texte:
      'Explorez une zone à partir d’une adresse, repérez les parcelles par surface, et ajoutez les bons terrains à votre projet.',
  },
  {
    titre: 'Ensoleillement en 3D',
    texte:
      'Visualisez les ombres portées du relief et des bâtiments, sur la journée et sur l’année. La fonctionnalité signature.',
  },
  {
    titre: 'Notez et comparez',
    texte:
      'Un score relatif à votre projet, un tableau comparatif, des alertes claires : décidez entre vos terrains en confiance.',
  },
];

export default async function LandingPage() {
  const session = await auth();
  const cta = session
    ? { href: '/dashboard', label: 'Aller au tableau de bord' }
    : { href: '/sign-in', label: 'Commencer' };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-neutral-200 bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src="/veriterra-mark.svg" alt="" width={32} height={32} className="rounded-md" />
            <span className="text-xl font-bold tracking-tight text-foreground">Veriterra</span>
          </div>
          <Button asChild variant={session ? 'default' : 'secondary'}>
            <Link href={cta.href}>{session ? cta.label : 'Se connecter'}</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-amber-700">
          Prospection foncière
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
          Acheter un terrain en confiance
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          À partir d&apos;une adresse, Veriterra localise la parcelle et réunit toutes ses données,
          sourcées et datées : cadastre, urbanisme, risques, prix, ensoleillement. Explorez, notez
          et comparez vos terrains, sans croiser dix sites à la main.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Données IGN, BAN, Géorisques, DVF en Licence Ouverte. Une aide à la décision, jamais un
          certificat d&apos;urbanisme.
        </p>
      </section>

      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {VALEURS.map((v) => (
          <Card key={v.titre} className="h-full p-6">
            <h2 className="mb-2 font-semibold text-foreground">{v.titre}</h2>
            <p className="text-sm text-muted-foreground">{v.texte}</p>
          </Card>
        ))}
      </section>
    </main>
  );
}
