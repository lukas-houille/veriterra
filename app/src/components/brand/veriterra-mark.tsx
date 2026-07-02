// Marque Veriterra (logo SVG), source unique. Reproduit fidèlement le logo de la maquette
// (îlots cadastraux stylisés + trame ambre « soleil »). Remplace les copies auparavant
// dupliquées dans le dashboard, l'explorer, la landing et l'onboarding.
//
// Composant sans état ni hook : utilisable aussi bien en composant serveur (landing,
// onboarding) que client (barre de nav). L'identifiant de clip est dérivé des props, donc
// stable et, en cas de doublon de même géométrie sur une page, sans effet de bord (même forme).

export interface VeriterraMarkProps {
  /** Côté du carré en pixels (défaut 30). */
  size?: number;
  /** Rayon des coins du carré (défaut 10). */
  rx?: number;
  /** Épaisseur du trait des îlots (défaut 2.4). */
  stroke?: number;
}

export function VeriterraMark({ size = 30, rx = 10, stroke = 2.4 }: VeriterraMarkProps) {
  const id = `vt-mark-${size}-${rx}-${stroke}`;
  return (
    <svg width={size} height={size} viewBox="0 0 152 152" fill="none" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <rect x="22" y="22" width="108" height="108" rx={rx} />
        </clipPath>
      </defs>
      <rect x="22" y="22" width="108" height="108" rx={rx} fill="#EAECF4" />
      <g clipPath={`url(#${id})`}>
        <rect x="63" y="65" width="37" height="65" fill="#DB9B2C" />
        <rect x="22" y="22" width="41" height="56" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="22" y="78" width="41" height="52" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="63" y="22" width="37" height="43" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="63" y="65" width="37" height="65" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="100" y="22" width="30" height="37" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="100" y="59" width="30" height="39" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
        <rect x="100" y="98" width="30" height="32" fill="none" stroke="#2F3B6E" strokeWidth={stroke} />
      </g>
      <rect x="22" y="22" width="108" height="108" rx={rx} fill="none" stroke="#2F3B6E" strokeWidth="3" />
    </svg>
  );
}
