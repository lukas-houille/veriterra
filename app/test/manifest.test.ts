import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';

// Le manifeste PWA doit décrire une app installable (US-6.1) : nom, mode standalone,
// point d'entrée, couleur de thème et un jeu d'icônes couvrant « any » et « maskable ».
describe('manifest PWA', () => {
  it('déclare une application installable', () => {
    const m = manifest();
    expect(m.name).toBe('Veriterra');
    expect(m.short_name).toBe('Veriterra');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/dashboard');
    expect(m.scope).toBe('/');
    expect(m.theme_color).toBe('#2f3b6e');
    expect(m.lang).toBe('fr');
  });

  it('fournit des icônes 192, 512 et une variante maskable', () => {
    const m = manifest();
    const icons = m.icons ?? [];
    const key = (i: (typeof icons)[number]) => `${i.sizes}:${i.purpose ?? 'any'}`;
    const keys = icons.map(key);
    expect(keys).toContain('192x192:any');
    expect(keys).toContain('512x512:any');
    expect(keys).toContain('512x512:maskable');
    // Toutes les sources d'icônes sont des chemins absolus (servies depuis /public).
    for (const i of icons) expect(i.src.startsWith('/')).toBe(true);
  });
});
