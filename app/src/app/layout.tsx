import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Archivo, Spline_Sans_Mono } from 'next/font/google';
import './globals.css';

// Archivo = interface ; Spline Sans Mono = données vérifiables (design-system §3).
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-archivo',
  display: 'swap',
});
const splineMono = Spline_Sans_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-spline-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Veriterra',
  description:
    'Acheter un terrain en confiance : données sourcées (cadastre, PLU, risques, prix), ombres portées en 3D, suivi et comparaison.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${archivo.variable} ${splineMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
