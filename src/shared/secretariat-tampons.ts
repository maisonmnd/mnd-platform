import { sigle, type Entite } from './secretariat-pur';

/* LES TAMPONS DU SECRÉTARIAT — 6 octobre 2026.

   Ceux de Maison MND et d'ACIA 1 sont les PNG dessinés le 6 octobre
   (public/assets/tampons, 600 px, fond transparent). Une entreprise créée à
   l'instant reçoit le sien, DESSINÉ ICI : son nom en arc en haut, son
   téléphone (ou sa ville) en arc en bas, ses initiales au centre. Le même
   dessin sert à l'écran (SVG) et au PDF (rendu en PNG). */

export type Tampon = { cle: string; nom: string; fichier: string; ratio: number };

export const TAMPONS: Record<'mnd' | 'acia', Tampon[]> = {
  mnd: [
    { cle: 'mnd-6-dentele', nom: 'Le sceau dentelé', fichier: 'mnd-6-dentele.png', ratio: 1 },
    { cle: 'mnd-premium-indigo', nom: 'Premium indigo', fichier: 'mnd-premium-indigo.png', ratio: 1 },
    { cle: 'mnd-premium-cuivre', nom: 'Premium cuivre', fichier: 'mnd-premium-cuivre.png', ratio: 1 },
    { cle: 'mnd-1-sceau', nom: 'Le sceau', fichier: 'mnd-1-sceau.png', ratio: 1 },
    { cle: 'mnd-2-ovale', nom: 'L’ovale', fichier: 'mnd-2-ovale.png', ratio: 1.5 },
    { cle: 'mnd-3-cachet', nom: 'Le cachet commercial', fichier: 'mnd-3-cachet.png', ratio: 600 / 285 },
    { cle: 'mnd-4-cordon', nom: 'Le cordon', fichier: 'mnd-4-cordon.png', ratio: 1 },
    { cle: 'mnd-5-bouquet', nom: 'Le bouquet', fichier: 'mnd-5-bouquet.png', ratio: 1 },
    { cle: 'mnd-7-embleme', nom: 'L’emblème', fichier: 'mnd-7-embleme.png', ratio: 1 },
    { cle: 'mnd-paye', nom: 'PAYÉ', fichier: 'mnd-paye.png', ratio: 600 / 323 },
    { cle: 'mnd-recu', nom: 'REÇU LE', fichier: 'mnd-recu.png', ratio: 1.5 },
    /* Le sceau dentelé de l'Académie MND (7 octobre 2026), le même que sur ses
       certificats : pour les attestations de formation. */
    { cle: 'academie-dentele', nom: 'Le sceau dentelé de l’Académie MND', fichier: 'academie-dentele.png', ratio: 1 },
  ],
  acia: [
    { cle: 'acia-sceau', nom: 'Le sceau ACIA 1', fichier: 'acia-sceau.png', ratio: 1 },
    { cle: 'acia-cachet', nom: 'Le cachet ACIA 1', fichier: 'acia-cachet.png', ratio: 600 / 263 },
  ],
};

/** Les tampons proposés pour une entité. Une lettre personnelle n'en a pas. */
export function tamponsDe(entite: Entite): Tampon[] {
  if (entite === 'mnd' || entite === 'acia') return TAMPONS[entite];
  return [];
}

export const tamponParCle = (cle: string | undefined): Tampon | undefined =>
  [...TAMPONS.mnd, ...TAMPONS.acia].find((t) => t.cle === cle);

/** Le tampon par défaut d'une entité : le sceau dentelé, le sceau ACIA 1. */
export const tamponParDefaut = (entite: Entite): string | undefined =>
  entite === 'mnd' ? 'mnd-6-dentele' : entite === 'acia' ? 'acia-sceau' : entite === 'autre' ? 'auto' : undefined;

const echappe = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** LE TAMPON D'UNE ENTREPRISE CRÉÉE À L'INSTANT, en SVG (200 × 200). */
export function tamponAutoSvg(nom: string, mentions: string, telephone: string): string {
  const haut = (nom || 'Entreprise').toUpperCase().slice(0, 34);
  const ville = ((mentions || '').split('·').pop() || 'COTONOU, BÉNIN').trim().toUpperCase().slice(0, 26);
  const bas = telephone ? `TÉL. ${telephone}`.toUpperCase().slice(0, 30) : ville;
  const taille = Math.max(9, Math.min(15, 190 / Math.max(haut.length, 8)));
  const etoile = (x: number) => `<polygon fill="#23262B" points="${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 2.2 : 5.2;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(100 + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ')}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="600" height="600">
  <defs><path id="h" d="M 38 100 A 62 62 0 0 1 162 100"/><path id="b" d="M 33 100 A 67 67 0 0 0 167 100"/></defs>
  <circle cx="100" cy="100" r="95" fill="none" stroke="#23262B" stroke-width="4"/>
  <circle cx="100" cy="100" r="89" fill="none" stroke="#23262B" stroke-width="1"/>
  <circle cx="100" cy="100" r="50" fill="none" stroke="#23262B" stroke-width="1.5"/>
  <text font-family="Georgia, serif" font-weight="700" font-size="${taille}" fill="#23262B" text-anchor="middle" letter-spacing="1"><textPath href="#h" startOffset="50%">${echappe(haut)}</textPath></text>
  <text font-family="Georgia, serif" font-size="9.5" fill="#23262B" text-anchor="middle" letter-spacing="1" dominant-baseline="hanging"><textPath href="#b" startOffset="50%">${echappe(bas)}</textPath></text>
  ${etoile(22)}${etoile(178)}
  <text x="100" y="${telephone ? 106 : 112}" font-family="Georgia, serif" font-weight="700" font-size="${telephone ? 30 : 34}" fill="#23262B" text-anchor="middle">${echappe(sigle(nom || 'Entreprise'))}</text>
  ${telephone ? `<text x="100" y="124" font-family="Georgia, serif" font-size="7.5" fill="#23262B" text-anchor="middle" letter-spacing=".6">${echappe(ville.slice(0, 18))}</text>` : ''}
</svg>`;
}

/* LE CACHET COMMERCIAL D'UNE ENTREPRISE — 7 octobre 2026. « Tu dois créer
   l'entreprise NYM SARL et son tampon pour faire certains documents comme
   l'attestation de travail » (Yéman). Le sceau rond ne dit que le nom : une
   attestation d'employeur porte d'ordinaire un cachet qui dit aussi le
   siège, le RCCM et l'IFU. On les lit dans les mentions de l'entreprise,
   morceau par morceau (séparés par « · ») : RCCM, IFU, forme sociale, et le
   reste fait l'adresse. Rectangle 2 × 1 ; la taille du texte se règle sur
   la ligne la plus longue, jamais au-delà du cadre. */
export const RATIO_DU_CACHET = 2;

export type MorceauxDuCachet = { forme: string; adresse: string[]; legales: string; telephone: string };

export function morceauxDuCachet(mentions: string, telephone: string): MorceauxDuCachet {
  const morceaux = (mentions || '').split('·').map((m) => m.trim()).filter(Boolean);
  const sansParenthese = (m: string) => m.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const rccm = morceaux.find((m) => /\bRCCM\b/i.test(m));
  const ifu = morceaux.find((m) => /\bIFU\b/i.test(m));
  const forme = morceaux.find((m) => /responsabilit|soci[ée]t[ée] anonyme|\bSARL\b|\bSAS\b|\bSUARL\b/i.test(m) && m !== rccm && m !== ifu) ?? '';
  const reste = morceaux.filter((m) => m !== rccm && m !== ifu && m !== forme);
  /* L'adresse sur deux lignes au plus : la coupure tombe à la virgule la plus
     proche du milieu. */
  const tout = reste.join(' · ');
  let adresse: string[] = tout ? [tout] : [];
  if (tout.length > 44) {
    const virgules = [...tout.matchAll(/[,·]\s/g)].map((x) => x.index ?? 0);
    const milieu = tout.length / 2;
    const coupe = virgules.sort((a, b) => Math.abs(a - milieu) - Math.abs(b - milieu))[0];
    if (coupe) adresse = [tout.slice(0, coupe + 1).replace(/[·,]$/, '').trim(), tout.slice(coupe + 1).trim()];
  }
  const legales = [rccm && sansParenthese(rccm).replace(/n°\s*/i, ''), ifu && sansParenthese(ifu).replace(/n°\s*/i, '')].filter(Boolean).join(' · ');
  return { forme, adresse, legales, telephone: telephone.trim() };
}

export function cachetAutoSvg(nom: string, mentions: string, telephone: string): string {
  const m = morceauxDuCachet(mentions, telephone);
  const titre = (nom || 'Entreprise').toUpperCase().slice(0, 30);
  const lignes: { t: string; gras?: boolean; petit?: boolean; espace?: boolean }[] = [
    ...(m.forme ? [{ t: m.forme.toUpperCase(), petit: true, espace: true }] : []),
    ...m.adresse.map((t) => ({ t })),
    ...(m.legales ? [{ t: m.legales, gras: true }] : []),
    ...(m.telephone ? [{ t: `Tél. ${m.telephone}` }] : []),
  ];
  const tailleTitre = Math.max(16, Math.min(30, 340 / Math.max(titre.length * 0.62, 1)));
  const plusLongue = Math.max(1, ...lignes.map((l) => l.t.length));
  const taille = Math.max(7.5, Math.min(11.5, 352 / (plusLongue * 0.56)));
  const haut = 30 + tailleTitre;
  const pas = Math.min(taille * 1.55, (178 - haut - 12) / Math.max(lignes.length, 1));
  const y0 = haut + 14 + pas * 0.7;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="600" height="300">
  <rect x="5" y="5" width="390" height="190" rx="8" fill="none" stroke="#1F2B5C" stroke-width="3.5"/>
  <rect x="12" y="12" width="376" height="176" rx="5" fill="none" stroke="#1F2B5C" stroke-width="1"/>
  <text x="200" y="${haut}" font-family="Georgia, serif" font-weight="700" font-size="${tailleTitre.toFixed(1)}" fill="#1F2B5C" text-anchor="middle" letter-spacing="2">${echappe(titre)}</text>
  <line x1="70" y1="${haut + 9}" x2="330" y2="${haut + 9}" stroke="#1F2B5C" stroke-width="1"/>
  ${lignes.map((l, i) => `<text x="200" y="${(y0 + i * pas).toFixed(1)}" font-family="Georgia, serif" font-size="${(l.petit ? taille * 0.86 : taille).toFixed(1)}"${l.gras ? ' font-weight="700"' : ''}${l.espace ? ' letter-spacing="1.2"' : ''} fill="#1F2B5C" text-anchor="middle">${echappe(l.t)}</text>`).join('\n  ')}
</svg>`;
}

/* LA DATE DANS LE TAMPON « REÇU LE » — 6 octobre 2026. « Sur le reçu,
   comment je peux rajouter la date ? » (Yéman). Le tampon a trois blancs
   (jour / mois / 20 année) : la date s'y écrit, à l'encre du tampon. Les
   blancs ont été mesurés sur l'image de 600 × 400 : traits à y = 259, de
   140 à 208, de 236 à 304, de 370 à 460. */
export const TAMPON_A_DATER = 'mnd-recu';
export const BLANCS_DU_RECU = { ligne: 259, jour: [140, 208], mois: [236, 304], annee: [370, 460] } as const;

/** « 2026-10-06 » → ['06', '10', '26'] ; null si la date n'est pas lisible
    ou hors du siècle que le tampon imprime (« 20__ »). */
export function morceauxDuRecu(iso: string | undefined): [string, string, string] | null {
  const m = /^20(\d{2})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? [m[3], m[2], m[1]] : null;
}

/** Écrit la date dans les blancs du tampon « REÇU LE » (image en data URL). */
export function dateSurLeRecu(png: string, iso: string): Promise<string | null> {
  const morceaux = morceauxDuRecu(iso);
  if (!morceaux) return Promise.resolve(png);
  return new Promise((ok) => {
    try {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx) { ok(null); return; }
        ctx.drawImage(img, 0, 0);
        const k = c.width / 600;
        ctx.fillStyle = '#1E2150';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `600 ${Math.round(34 * k)}px Jost, "Noto Sans", Arial, sans-serif`;
        const B = BLANCS_DU_RECU;
        [B.jour, B.mois, B.annee].forEach(([a, b], i) => ctx.fillText(morceaux[i], ((a + b) / 2) * k, (B.ligne - 7) * k));
        ok(c.toDataURL('image/png'));
      };
      img.onerror = () => ok(null);
      img.src = png;
    } catch { ok(null); }
  });
}

/** Le SVG en image PNG (data URL), pour le PDF. */
export function svgEnPng(svg: string, cote = 600, hauteur = cote): Promise<string | null> {
  return new Promise((ok) => {
    try {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = cote; c.height = hauteur;
        const ctx = c.getContext('2d');
        if (!ctx) { ok(null); return; }
        ctx.drawImage(img, 0, 0, cote, hauteur);
        ok(c.toDataURL('image/png'));
      };
      img.onerror = () => ok(null);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch { ok(null); }
  });
}
