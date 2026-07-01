import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// Polices : Archivo (interface) et Spline Sans Mono (données) sont fournies par
// @veriterra/ui via @font-face (packages/ui/src/styles/theme.css), et exposées
// aux variables --font-sans / --font-mono. Plus de dépendance next/font.

export const metadata: Metadata = {
  title: 'Veriterra',
  description:
    'Acheter un terrain en confiance : données sourcées (cadastre, PLU, risques, prix), ombres portées en 3D, suivi et comparaison.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
