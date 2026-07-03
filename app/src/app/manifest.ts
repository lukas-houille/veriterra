import type { MetadataRoute } from 'next';

// Manifeste d'application (convention Next 16 : servi sur /manifest.webmanifest et lié
// automatiquement dans le <head>). Rend l'app installable (US-6.1). Les icônes plein cadre
// couvrent l'usage normal (« any ») et le masquage adaptatif Android (« maskable »).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Veriterra',
    short_name: 'Veriterra',
    description:
      'Prospection foncière : parcelle, cadastre, PLU, risques, prix et ensoleillement 3D, sources tracées.',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f6fa',
    theme_color: '#2f3b6e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
