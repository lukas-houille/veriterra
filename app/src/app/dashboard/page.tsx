import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { CSSProperties } from 'react';
import { auth, signOut } from '@/auth';
import { listTerrains } from '@/modules/terrains/service';
import { getActiveProjet } from '@/modules/projet/service';
import { DashboardMap } from '@/components/map/dashboard-map';
import { TerrainsTable } from './terrains-table';

// Tableau de bord des terrains du projet (Tranche 1, US-5.2). Composant serveur : lit la
// session (tenant garanti par proxy.ts), exige un projet (sinon onboarding), et charge les
// terrains de l'organisation directement via le service.
//
// Reskin fidèle à la maquette designée (docs/design/handoff/Dashboard portefeuille.dc.html) :
// en-tête, résumé projet, carte, tableau des terrains et statuts colorés. La logique
// (session, garde onboarding, liens, déconnexion, carte MapLibre) est préservée à
// l'identique. Conformément à la règle « pas de donnée par défaut silencieuse », seules les
// colonnes dont la source réelle existe sont affichées (surface, prix, prix au m² dérivé),
// et un prix absent est marqué « Indisponible ».

const SANS = "'Archivo', system-ui, sans-serif";
const MONO = "'Spline Sans Mono', ui-monospace, monospace";

/** Styles de statut alignés sur la maquette (couleur de texte + fond de badge). */
const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  A_ETUDIER: { label: 'À étudier', color: '#98A0B0', bg: '#ECEEF2' },
  PROMETTEUR: { label: 'Prometteur', color: '#2E7D5B', bg: '#E7F2EC' },
  RESERVE: { label: 'Réservé', color: '#DB9B2C', bg: '#FBF2DD' },
  ECARTE: { label: 'Écarté', color: '#C0432E', bg: '#F8E7E2' },
};
const STATUS_ORDER = ['A_ETUDIER', 'PROMETTEUR', 'RESERVE', 'ECARTE'];

const STATUS_FALLBACK = { label: 'À étudier', color: '#98A0B0', bg: '#ECEEF2' };

function statusStyle(status: string): { label: string; color: string; bg: string } {
  return STATUS_STYLE[status] ?? STATUS_FALLBACK;
}

const surfaceFormat = new Intl.NumberFormat('fr-FR');
const prixFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function projetResume(projet: {
  budgetMax: number | null;
  surfaceMinM2: number | null;
  surfaceMaxM2: number | null;
}): string | null {
  const parts: string[] = [];
  if (projet.budgetMax != null) parts.push(`budget ${prixFormat.format(projet.budgetMax)}`);
  if (projet.surfaceMinM2 != null || projet.surfaceMaxM2 != null) {
    const min = projet.surfaceMinM2 != null ? surfaceFormat.format(projet.surfaceMinM2) : '…';
    const max = projet.surfaceMaxM2 != null ? surfaceFormat.format(projet.surfaceMaxM2) : '…';
    parts.push(`${min} à ${max} m²`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

const navLink: CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  color: '#6C7488',
  padding: '7px 13px',
  borderRadius: '8px',
  textDecoration: 'none',
};

/** Marque Veriterra (identique à la landing, reproduction du logo de la maquette). */
function Mark() {
  return (
    <svg width={30} height={30} viewBox="0 0 152 152" fill="none" aria-hidden="true">
      <defs>
        <clipPath id="navlogo">
          <rect x="22" y="22" width="108" height="108" rx="10" />
        </clipPath>
      </defs>
      <rect x="22" y="22" width="108" height="108" rx="10" fill="#EAECF4" />
      <g clipPath="url(#navlogo)">
        <rect x="63" y="65" width="37" height="65" fill="#DB9B2C" />
        <rect x="22" y="22" width="41" height="56" fill="none" stroke="#2F3B6E" strokeWidth="2.4" />
        <rect x="22" y="78" width="41" height="52" fill="none" stroke="#2F3B6E" strokeWidth="2.4" />
        <rect x="63" y="22" width="37" height="43" fill="none" stroke="#2F3B6E" strokeWidth="2.4" />
        <rect x="63" y="65" width="37" height="65" fill="none" stroke="#2F3B6E" strokeWidth="2.4" />
        <rect x="100" y="22" width="30" height="37" fill="none" stroke="#2F3B6E" strokeWidth="2.4" />
        <rect x="100" y="59" width="30" height="39" fill="none" stroke="#2F3B6E" strokeWidth="2.4" />
        <rect x="100" y="98" width="30" height="32" fill="none" stroke="#2F3B6E" strokeWidth="2.4" />
      </g>
      <rect x="22" y="22" width="108" height="108" rx="10" fill="none" stroke="#2F3B6E" strokeWidth="3" />
    </svg>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  // Le projet cadre tout le reste : s'il n'existe pas, on passe par l'onboarding court.
  const projet = await getActiveProjet(session.user.orgId);
  if (!projet) redirect('/onboarding');

  const terrains = await listTerrains(session.user.orgId);
  const resume = projetResume(projet);
  const total = terrains.length;

  // Répartition réelle par statut, pour les chips de la barre de filtres (affichage).
  const counts: Record<string, number> = {};
  for (const t of terrains) counts[t.status] = (counts[t.status] ?? 0) + 1;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F5F6FA',
        fontFamily: SANS,
        color: '#161A2E',
      }}
    >
      {/* TOP BAR */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          height: '58px',
          padding: '0 22px',
          background: '#FFFFFF',
          borderBottom: '1px solid #DADEE8',
        }}
      >
        <Link
          href="/dashboard"
          style={{ display: 'flex', alignItems: 'center', gap: '11px', color: 'inherit', textDecoration: 'none' }}
        >
          <Mark />
          <span style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>Veriterra</span>
        </Link>
        <nav aria-label="Navigation principale" style={{ display: 'flex', gap: '4px', marginLeft: '14px' }}>
          <Link href="/terrains/nouveau" style={navLink}>
            Explorer
          </Link>
          <span
            aria-current="page"
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#2F3B6E',
              background: '#EEF0F8',
              padding: '7px 13px',
              borderRadius: '8px',
            }}
          >
            Mes terrains
          </span>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/onboarding" style={{ ...navLink, color: '#4C5468' }}>
            Mon projet
          </Link>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button
              type="submit"
              style={{
                border: '1px solid #DADEE8',
                background: '#FFFFFF',
                color: '#161A2E',
                fontFamily: SANS,
                fontSize: '13px',
                fontWeight: 600,
                padding: '8px 13px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Se déconnecter
            </button>
          </form>
        </div>
      </header>

      {/* TITRE + BARRE */}
      <div style={{ padding: '22px 22px 0' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '16px',
          }}
        >
          <div>
            <h1 style={{ margin: '0 0 3px', fontSize: '25px', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Terrains du projet
            </h1>
            <div style={{ fontSize: '13.5px', color: '#6C7488' }}>
              <span style={{ fontFamily: MONO, color: '#2F3B6E', fontWeight: 500 }}>{surfaceFormat.format(total)}</span>{' '}
              {total > 1 ? 'terrains suivis' : 'terrain suivi'}
              {resume ? (
                <>
                  {' · '}
                  <span>
                    {projet.name} ({resume})
                  </span>
                </>
              ) : (
                <>
                  {' · '}
                  <span>{projet.name}</span>
                </>
              )}
            </div>
          </div>
          <Link
            href="/terrains/nouveau"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#2F3B6E',
              color: '#FFFFFF',
              fontFamily: SANS,
              fontSize: '13.5px',
              fontWeight: 600,
              padding: '11px 16px',
              borderRadius: '10px',
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
            Ajouter un terrain
          </Link>
        </div>

        {/* Répartition par statut (chips colorés, comptages réels) */}
        <div
          aria-label="Répartition des terrains par statut"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            padding: '12px 14px',
            background: '#FFFFFF',
            border: '1px solid #DADEE8',
            borderRadius: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
            {STATUS_ORDER.map((code) => {
              const s = statusStyle(code);
              return (
                <span
                  key={code}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: SANS,
                    fontSize: '12.5px',
                    fontWeight: 600,
                    padding: '6px 11px',
                    borderRadius: '8px',
                    border: '1px solid #DADEE8',
                    background: '#FFFFFF',
                    color: '#4C5468',
                  }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                  {s.label}
                  <span style={{ opacity: 0.6, fontFamily: MONO, fontSize: '11px' }}>{counts[code] ?? 0}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* SPLIT PRINCIPAL : tableau + carte */}
      {total === 0 ? (
        <div style={{ padding: '16px 22px 28px' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px',
              textAlign: 'center',
              background: '#FFFFFF',
              border: '1px solid #DADEE8',
              borderRadius: '12px',
              padding: '48px 24px',
            }}
          >
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Aucun terrain pour le moment</p>
            <p style={{ margin: 0, maxWidth: '460px', fontSize: '14px', lineHeight: 1.6, color: '#6C7488' }}>
              Explorez une zone à partir d&apos;une adresse, cliquez les parcelles qui vous intéressent, et
              ajoutez-les à votre projet.
            </p>
            <Link
              href="/terrains/nouveau"
              style={{
                background: '#2F3B6E',
                color: '#FFFFFF',
                fontFamily: SANS,
                fontSize: '13.5px',
                fontWeight: 600,
                padding: '11px 16px',
                borderRadius: '10px',
                textDecoration: 'none',
              }}
            >
              Explorer un terrain
            </Link>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: '16px 22px 28px',
            display: 'flex',
            gap: '18px',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }}
        >
          {/* TABLEAU (recherche + tri, US-5.9) */}
          <div style={{ flex: '1 1 560px', minWidth: 0, overflowX: 'auto' }}>
            <TerrainsTable terrains={terrains} />
          </div>

          {/* CARTE */}
          <div
            style={{
              flex: '1 1 360px',
              minWidth: '320px',
              position: 'sticky',
              top: '74px',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '520px',
                border: '1px solid #DADEE8',
                borderRadius: '12px',
                overflow: 'hidden',
                background: '#E6EAF2',
              }}
            >
              <DashboardMap terrains={terrains} className="absolute inset-0 h-full w-full" />
              <div
                style={{
                  position: 'absolute',
                  left: '12px',
                  bottom: '12px',
                  zIndex: 1,
                  background: 'rgba(255,255,255,0.94)',
                  border: '1px solid #DADEE8',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#6C7488',
                    marginBottom: '7px',
                  }}
                >
                  Statut
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {STATUS_ORDER.map((code) => {
                    const s = statusStyle(code);
                    return (
                      <div
                        key={code}
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#343B4D' }}
                      >
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: s.color }} />
                        {s.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
