/* LES GESTES DITS EN FRANÇAIS — 13 octobre 2026.

   Les clientes ne lisent pas les marques fon : « SÍNSIN™ Essentiel » ne dit
   rien à qui ne connaît pas encore la Maison. Le dictionnaire, donné par
   Yéman, sert à la réponse WhatsApp (depuis le 13 octobre au matin) et au
   site (depuis le soir) : le français d'abord, le fon ensuite.

   ENTRE SES REPÈRES ⟨gestes-en-francais⟩, CE MODULE SE RECOPIE TEL QUEL dans
   la fonction whatsapp-automate (une fonction Edge ne lit rien du dépôt) ;
   le banc de l'automate tient la copie caractère pour caractère. Pur. */

/* ⟨gestes-en-francais⟩ */
/* ── 9 bis. LES GESTES DITS EN FRANÇAIS (13 octobre 2026) ───────────────
   Les clientes ne lisent pas les marques fon : « SÍNSIN™ Essentiel » ne dit
   rien à qui ne connaît pas encore la Maison. Dans les listes, le français
   vient d'abord (« Resserrage · Essentiel »), la marque et la durée en
   dessous ; dans le récapitulatif, le français puis la marque entre
   parenthèses. Mots donnés par Yéman ; une marque absente d'ici garde son
   nom tel quel. */
const GESTES_EN_FRANCAIS: Record<string, { court: string; long: string }> = {
  'VÈKPÈ': { court: 'Création', long: 'Création de locks' },
  'SÍNSIN': { court: 'Resserrage', long: 'Resserrage des racines' },
  'FÍNFÍN': { court: 'Restauration', long: 'Restauration' },
  'YÈKPÈ': { court: 'Couleur', long: 'Couleur végétale' },
  'GBÀTÀ': { court: 'Défaisage', long: 'Défaisage' },
  'DÀNDÀN': { court: 'Hydratation', long: 'Hydratation' },
  'KLƆKLƆ': { court: 'Lavage', long: 'Lavage rituel' },
  'KÒKÒ': { court: 'Consultation', long: 'Consultation' },
  'GBÌGBÌ': { court: 'Reconstruction', long: 'Reconstruction' },
  'GBÈJÍ': { court: 'Entretien', long: 'Entretien suivi' },
};

/** « SÍNSIN™ Essentiel · « Le Souffle » » : la marque « SÍNSIN », la
    variante « Essentiel » (le premier segment après la marque). Un nom sans
    niveau, « DÀNDÀN™ · Le Soin Hydratant », a pour variante son sous-titre,
    sans le point qui le précède (revue du 13 octobre 2026). */
const litLaMarqueWa = (nom: string): { marque: string; variante: string } => {
  const s = String(nom ?? '').replace(/\s+/g, ' ').trim();
  const m = /^([^\s™®]+)(?:™|®)?\s*(.*)$/u.exec(s);
  const marque = (m?.[1] ?? '').normalize('NFC');
  const reste = (m?.[2] ?? '').replace(/^[·:–-]\s*/u, '');
  const variante = reste.split(' · ')[0]?.trim() ?? '';
  return { marque, variante };
};

/** Le geste en toutes lettres : « Resserrage des racines (SÍNSIN™
    Essentiel) » ; sans mot français, le nom tel quel. */
const gesteDitEnFrancaisWa = (nom: string): string => {
  const g = GESTES_EN_FRANCAIS[litLaMarqueWa(nom).marque];
  return g ? `${g.long} (${nom})` : nom;
};

/** LE NOM D'UN GESTE SUR UNE PAGE (13 octobre 2026) : « les visiteurs ne
    comprennent pas sinsin et kloklo, il faut commencer par le nom en
    français et ensuite le fon » (Yéman). `francais` d'abord, en titre :
    « Resserrage des racines · Essentiel », « Création de locks · Jumbo »,
    « Reconstruction · Cure de trois » ; `fon` dessous, le nom du catalogue
    entier. Sans mot français (une marque absente du dictionnaire, une
    combinaison « × GBÈJÍ™ »), le nom tel quel et rien dessous. */
const nomEnFrancaisWa = (nom: string): { francais: string; fon: string } => {
  const brut = String(nom ?? '').replace(/\s+/g, ' ').trim();
  const { marque } = litLaMarqueWa(brut);
  const g = GESTES_EN_FRANCAIS[marque];
  const m = /^([^\s™®]+)(?:™|®)?\s*(.*)$/u.exec(brut);
  const reste = (m?.[2] ?? '').trim();
  if (!g || /^[×+]/u.test(reste)) return { francais: brut, fon: '' };
  const sansNiveau = /^[·:–-]/u.test(reste);
  const morceaux = reste.replace(/^[·:–-]\s*/u, '').split(' · ').map((x) => x.trim()).filter(Boolean);
  const sienne = (t: string): boolean => {
    const b = t.toLowerCase();
    return b.includes(g.court.toLowerCase()) || b.includes(g.long.toLowerCase());
  };
  let francais = g.long;
  if (!sansNiveau && morceaux[0]) {
    let niveau = morceaux[0];
    /* « Création Jumbo » sous « Création de locks » : le mot du geste ne se
       redit pas, « Couleur » seul sous « Couleur végétale » non plus. */
    const court = g.court.toLowerCase();
    if (niveau.toLowerCase() === court || niveau.toLowerCase() === g.long.toLowerCase()) niveau = '';
    else if (niveau.toLowerCase().startsWith(`${court} `) && !/^[+×]/u.test(niveau.slice(court.length + 1))) niveau = niveau.slice(court.length + 1);
    if (niveau) francais = `${g.long} · ${niveau}`;
  } else if (sansNiveau && morceaux[0] && !sienne(morceaux[0])) {
    francais = `${g.long} · ${morceaux[0]}`;
  }
  return { francais, fon: brut };
};
/* ⟨/gestes-en-francais⟩ */

export { GESTES_EN_FRANCAIS, litLaMarqueWa, gesteDitEnFrancaisWa, nomEnFrancaisWa };
