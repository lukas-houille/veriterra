import Link from 'next/link';
import type { CSSProperties } from 'react';
import { auth } from '@/auth';
import { VeriterraMark } from '@/components/brand/veriterra-mark';

// Landing publique (Tranche 1). Reproduction fidèle de la maquette designée
// (docs/design/handoff/Landing.dc.html). Seule page accessible sans session.

const SANS = "'Archivo', system-ui, sans-serif";
const MONO = "'Spline Sans Mono', ui-monospace, monospace";

const navLink: CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  color: '#4C5468',
  padding: '8px 12px',
  borderRadius: '8px',
};
const primaryBtn: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#FFF',
  background: '#2F3B6E',
  padding: '10px 16px',
  borderRadius: '9px',
};
const card: CSSProperties = {
  flex: 1,
  minWidth: '280px',
  background: '#FFFFFF',
  border: '1px solid #DADEE8',
  borderRadius: '16px',
  padding: '26px',
};
const h2: CSSProperties = {
  margin: '0 0 8px',
  fontSize: '34px',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  textAlign: 'center',
};
const cardTitle: CSSProperties = { margin: '0 0 8px', fontSize: '18px', fontWeight: 700 };
const cardText: CSSProperties = { margin: 0, fontSize: '14.5px', lineHeight: 1.6, color: '#4C5468' };

export default async function LandingPage() {
  const session = await auth();

  return (
    <div style={{ fontFamily: SANS, color: '#161A2E', background: '#FFFFFF', overflowX: 'hidden' }}>
      {/* NAV */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          height: '64px',
          padding: '0 28px',
          background: 'rgba(255,255,255,0.86)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid #EDEFF4',
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '11px', color: 'inherit' }}>
          <VeriterraMark size={30} />
          <span style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>Veriterra</span>
        </Link>
        <nav style={{ display: 'flex', gap: '6px', marginLeft: '10px' }}>
          <a href="#fonctionnalites" style={navLink}>Fonctionnalités</a>
          <a href="#soleil" style={navLink}>Le soleil</a>
          <a href="#etapes" style={navLink}>Comment ça marche</a>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {session ? (
            <Link href="/dashboard" style={primaryBtn}>Tableau de bord</Link>
          ) : (
            <>
              <Link href="/sign-in" style={{ fontSize: '14px', fontWeight: 600, color: '#161A2E', padding: '9px 12px' }}>
                Se connecter
              </Link>
              <Link href="/sign-in" style={primaryBtn}>Commencer</Link>
            </>
          )}
        </div>
      </header>

      {/* HERO */}
      <section
        style={{
          position: 'relative',
          padding: '72px 28px 64px',
          background: '#F7F8FB',
          borderBottom: '1px solid #EDEFF4',
          backgroundImage: 'radial-gradient(rgba(47,59,110,0.05) 1px,transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      >
        <div style={{ maxWidth: '1140px', margin: '0 auto', display: 'flex', gap: '48px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '330px' }}>
            <div
              style={{
                display: 'inline-block',
                fontFamily: MONO,
                fontSize: '12px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#2F3B6E',
                background: '#EEF0F8',
                border: '1px solid #D8DEF0',
                borderRadius: '999px',
                padding: '6px 13px',
                marginBottom: '20px',
              }}
            >
              Achat de terrain à bâtir
            </div>
            <h1 style={{ margin: '0 0 18px', fontSize: '50px', lineHeight: 1.04, fontWeight: 800, letterSpacing: '-0.03em' }}>
              Toutes les données d&apos;un terrain, avant de l&apos;acheter.
            </h1>
            <p style={{ margin: '0 0 28px', fontSize: '18px', lineHeight: 1.6, color: '#4C5468', maxWidth: '520px' }}>
              Veriterra réunit cadastre, PLU, risques, prix et ensoleillement, sourcés et datés. Vous comparez, vous
              suivez, vous décidez en confiance, sans mauvaise surprise.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <Link href="/sign-in" style={{ fontSize: '15px', fontWeight: 600, color: '#FFF', background: '#2F3B6E', padding: '14px 22px', borderRadius: '11px' }}>
                Analyser un terrain
              </Link>
              <Link href="/sign-in" style={{ fontSize: '15px', fontWeight: 600, color: '#161A2E', background: '#FFF', border: '1px solid #DADEE8', padding: '14px 22px', borderRadius: '11px' }}>
                Voir une fiche exemple
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: '#6C7488' }}>
              <span style={{ color: '#2E7D5B' }}>●</span>Chaque chiffre montre sa source et sa date.
            </div>
          </div>

          {/* aperçu produit */}
          <div style={{ flex: 1, minWidth: '330px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '400px', maxWidth: '100%', background: '#FFFFFF', border: '1px solid #DADEE8', borderRadius: '18px', boxShadow: '0 30px 60px -28px rgba(22,26,46,0.4)', overflow: 'hidden' }}>
              <div style={{ height: '128px', position: 'relative', overflow: 'hidden', background: '#E6EAF2', borderBottom: '1px solid #EDEFF4' }}>
                <svg viewBox="0 0 400 128" preserveAspectRatio="none" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                  <rect width="400" height="128" fill="#E6EAF2" />
                  <path d="M-5,72 C90,60 180,92 280,72 C330,62 380,72 405,68" stroke="#C2D3E6" strokeWidth="10" fill="none" />
                  <path d="M120,-5 L138,133" stroke="#FFFFFF" strokeWidth="6" fill="none" />
                  <path d="M-5,40 L405,52" stroke="#FFFFFF" strokeWidth="5" fill="none" />
                  <g stroke="#D2D9E6" strokeWidth="1" fill="none">
                    <rect x="150" y="48" width="46" height="34" />
                    <rect x="196" y="48" width="40" height="34" />
                  </g>
                  <rect x="168" y="58" width="30" height="40" fill="#DB9B2C" fillOpacity="0.9" />
                </svg>
                <span style={{ position: 'absolute', left: '50%', top: '54%', transform: 'translate(-50%,-50%)', width: '15px', height: '15px', borderRadius: '50%', background: '#2F3B6E', boxShadow: '0 0 0 3px #fff,0 1px 4px rgba(22,26,46,.5)' }} />
              </div>
              <div style={{ padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: 700 }}>Clos des Tilleuls</div>
                    <div style={{ fontSize: '12.5px', color: '#6C7488' }}>Poisy (74330)</div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#DB9B2C', background: '#FBF2DD', borderRadius: '999px', padding: '4px 11px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#DB9B2C' }} />
                    Réservé
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1, background: '#F5F6FA', border: '1px solid #DADEE8', borderRadius: '10px', padding: '12px 13px' }}>
                    <div style={{ fontSize: '10px', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#98A0B0', marginBottom: '5px' }}>Prix au m²</div>
                    <div style={{ fontFamily: MONO, fontSize: '18px', fontWeight: 500 }}>339 €</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', borderTop: '1px solid #E9ECF2', paddingTop: '7px' }}>
                      <span style={{ fontFamily: MONO, fontSize: '10px', color: '#6C7488' }}>DVF · 2024</span>
                      <span style={{ display: 'inline-flex', gap: '3px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2F3B6E' }} />
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2F3B6E' }} />
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#DADEE8' }} />
                      </span>
                    </div>
                  </div>
                  <div style={{ width: '96px', background: '#F5F6FA', border: '1px solid #DADEE8', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                    <div style={{ position: 'relative', width: '54px', height: '54px' }}>
                      <svg width="54" height="54" viewBox="0 0 60 60">
                        <circle cx="30" cy="30" r="24" fill="none" stroke="#EAECF2" strokeWidth="6" />
                        <circle cx="30" cy="30" r="24" fill="none" stroke="#51619F" strokeWidth="6" strokeLinecap="round" strokeDasharray="150.8" strokeDashoffset="34.7" transform="rotate(-90 30 30)" />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: 800 }}>77</div>
                    </div>
                    <span style={{ fontSize: '10px', color: '#6C7488' }}>Score</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* barre sources */}
        <div style={{ maxWidth: '1140px', margin: '48px auto 0', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.08em', color: '#98A0B0', textTransform: 'uppercase' }}>Données officielles</span>
          <span style={{ height: '14px', width: '1px', background: '#DADEE8' }} />
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {['Cadastre', 'DVF', 'Géorisques', 'PLU', 'IGN'].map((s, i, arr) => (
              <span key={s} style={{ display: 'flex', gap: '10px' }}>
                <span style={{ fontFamily: MONO, fontSize: '12px', color: '#4C5468', fontWeight: 500 }}>{s}</span>
                {i < arr.length - 1 && <span style={{ color: '#C4CCDB' }}>·</span>}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="fonctionnalites" style={{ padding: '76px 28px' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto' }}>
          <h2 style={h2}>Décider sur des faits, pas sur une intuition</h2>
          <p style={{ margin: '0 auto 42px', fontSize: '16px', color: '#6C7488', textAlign: 'center', maxWidth: '560px', lineHeight: 1.6 }}>
            Le terrain est souvent l&apos;achat d&apos;une vie. Veriterra rend chaque décision lisible et traçable.
          </p>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div style={card}>
              <div style={{ width: '44px', height: '44px', borderRadius: '11px', background: '#EEF0F8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2F3B6E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M9 13h6M9 17h6" /></svg>
              </div>
              <h3 style={cardTitle}>Synthèse sourcée</h3>
              <p style={cardText}>Chaque donnée affiche sa source, sa date et un indice de confiance. Les risques et les zones d&apos;ombre sont visibles, jamais masqués.</p>
            </div>
            <div style={card}>
              <div style={{ width: '44px', height: '44px', borderRadius: '11px', background: '#FBF2DD', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B07F1C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></svg>
              </div>
              <h3 style={cardTitle}>Positionnement et ombres</h3>
              <p style={cardText}>Visualisez le terrain et les bâtiments en 3D, et l&apos;ensoleillement réel heure par heure, du solstice d&apos;hiver au solstice d&apos;été.</p>
            </div>
            <div style={card}>
              <div style={{ width: '44px', height: '44px', borderRadius: '11px', background: '#E7F2EC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2E7D5B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
              </div>
              <h3 style={cardTitle}>Score et portefeuille</h3>
              <p style={cardText}>Un score sur 100 par terrain, une carte et un tableau pour comparer et suivre tous vos terrains au même endroit.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ETAPES */}
      <section id="etapes" style={{ padding: '36px 28px 76px', background: '#F7F8FB', borderTop: '1px solid #EDEFF4', borderBottom: '1px solid #EDEFF4' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto', paddingTop: '48px' }}>
          <h2 style={{ ...h2, margin: '0 0 42px' }}>De l&apos;adresse à la décision</h2>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {[
              { n: '01', t: 'Saisissez l’adresse', d: 'On localise la parcelle au cadastre, à l’adresse ou au clic sur la carte.' },
              { n: '02', t: 'Obtenez la synthèse', d: 'PLU, risques, prix au m² et ensoleillement, sourcés et datés, en un coup d’oeil.' },
              { n: '03', t: 'Comparez et décidez', d: 'Notez, comparez vos terrains et suivez votre portefeuille jusqu’à l’achat.' },
            ].map((s) => (
              <div key={s.n} style={{ ...card, minWidth: '260px' }}>
                <div style={{ fontFamily: MONO, fontSize: '13px', color: '#DB9B2C', marginBottom: '12px' }}>{s.n}</div>
                <h3 style={{ margin: '0 0 7px', fontSize: '18px', fontWeight: 700 }}>{s.t}</h3>
                <p style={cardText}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOLEIL */}
      <section id="soleil" style={{ padding: '76px 28px' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto', display: 'flex', gap: '48px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '320px', order: 2 }}>
            <div style={{ fontFamily: MONO, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#DB9B2C', marginBottom: '14px' }}>Ensoleillement</div>
            <h2 style={{ margin: '0 0 16px', fontSize: '32px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, textAlign: 'left' }}>Le soleil change tout sur un terrain</h2>
            <p style={{ margin: '0 0 18px', fontSize: '16px', lineHeight: 1.65, color: '#4C5468' }}>
              Relief et bâtiments voisins projettent des ombres qui varient sur l&apos;année. Veriterra calcule
              l&apos;ensoleillement réel, du lever au coucher, au solstice d&apos;hiver comme à celui d&apos;été.
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['Ombres portées en 3D, heure par heure', 'Lecture animée de la journée', 'Comparaison entre solstices'].map((li) => (
                <li key={li} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14.5px', color: '#343B4D' }}>
                  <span style={{ color: '#2E7D5B', marginTop: '2px' }}>✓</span>
                  {li}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ flex: 1, minWidth: '320px', order: 1 }}>
            <div style={{ border: '1px solid #DADEE8', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 24px 50px -28px rgba(22,26,46,0.4)' }}>
              <svg viewBox="0 0 440 250" width="100%" style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="lsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9FBDE6" /><stop offset="1" stopColor="#E6C79A" /></linearGradient>
                  <radialGradient id="lsun"><stop offset="0" stopColor="#FBE08A" stopOpacity="0.9" /><stop offset="1" stopColor="#FBE08A" stopOpacity="0" /></radialGradient>
                </defs>
                <rect width="440" height="250" fill="url(#lsky)" />
                <circle cx="350" cy="70" r="44" fill="url(#lsun)" /><circle cx="350" cy="70" r="13" fill="#FBE08A" />
                <polygon points="60,196 250,150 410,210 215,250" fill="#D9E2D4" />
                <polygon points="150,170 210,158 250,178 200,196" fill="#DB9B2C" fillOpacity="0.16" stroke="#DB9B2C" strokeWidth="1.5" strokeDasharray="4 3" />
                <polygon points="206,150 250,142 300,164 232,178 206,168" fill="#16203F" fillOpacity="0.2" />
                <polygon points="150,120 196,112 196,150 150,158" fill="#C7CFE0" stroke="#9AA4BE" strokeWidth="0.75" />
                <polygon points="196,112 232,124 232,158 196,150" fill="#AEB8D0" stroke="#9AA4BE" strokeWidth="0.75" />
                <polygon points="150,120 196,112 232,124 186,132" fill="#EAEDF4" stroke="#9AA4BE" strokeWidth="0.75" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '24px 28px 80px' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto', background: '#161A2E', borderRadius: '22px', padding: '56px 40px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-40px', top: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(219,155,44,0.3),rgba(219,155,44,0) 70%)' }} />
          <h2 style={{ margin: '0 0 14px', fontSize: '34px', fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF', position: 'relative' }}>Commencez à analyser vos terrains</h2>
          <p style={{ margin: '0 auto 26px', fontSize: '16px', lineHeight: 1.6, color: '#B6C0E0', maxWidth: '520px', position: 'relative' }}>
            Auto-hébergé : vos recherches et vos données restent chez vous. Pas de revente, pas de pistage.
          </p>
          <Link href="/sign-in" style={{ display: 'inline-block', fontSize: '15px', fontWeight: 700, color: '#161A2E', background: '#DB9B2C', padding: '15px 26px', borderRadius: '12px', position: 'relative' }}>
            Créer mon espace
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid #EDEFF4', padding: '36px 28px' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto', display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <VeriterraMark size={26} rx={12} stroke={3} />
            <span style={{ fontSize: '16px', fontWeight: 700 }}>Veriterra</span>
            <span style={{ fontFamily: MONO, fontSize: '11.5px', color: '#98A0B0', marginLeft: '6px' }}>CRM de prospection foncière</span>
          </div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <a href="#fonctionnalites" style={{ fontSize: '13.5px', color: '#6C7488' }}>Fonctionnalités</a>
            <a href="#soleil" style={{ fontSize: '13.5px', color: '#6C7488' }}>Ensoleillement</a>
            <a href="#etapes" style={{ fontSize: '13.5px', color: '#6C7488' }}>Comment ça marche</a>
            <span style={{ fontSize: '13.5px', color: '#98A0B0' }}>Auto-hébergé</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: '11.5px', color: '#98A0B0' }}>© 2026 Veriterra</div>
        </div>
      </footer>
    </div>
  );
}
