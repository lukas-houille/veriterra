import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker-registration';

// Polices : Archivo (interface) et Spline Sans Mono (données) sont fournies par
// @veriterra/ui via @font-face (packages/ui/src/styles/theme.css), et exposées
// aux variables --font-sans / --font-mono. Plus de dépendance next/font.

export const metadata: Metadata = {
  title: 'Veriterra',
  description:
    'Acheter un terrain en confiance : données sourcées (cadastre, PLU, risques, prix), ombres portées en 3D, suivi et comparaison.',
  applicationName: 'Veriterra',
  // Convention Next 16 : app/manifest.ts est lié automatiquement dans le <head>.
  // appleWebApp émet les meta apple-mobile-web-app-* (installable en plein écran iOS).
  appleWebApp: {
    capable: true,
    title: 'Veriterra',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#2f3b6e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
