/* ══ LA PRESTATION EN CLAIR — 25 novembre 2026 ═══════════════════════════
   « Quand les clients reçoivent leurs rendez-vous ou leurs factures, ils ne
   savent pas ce que Rituel Sówà™ est : le traitement anti-poux. Ils ne
   savent pas ce qu'est Le Souffle : ils doivent savoir que c'est un lavage.
   Il faut la mini-description des noms des services » (Yéman).

   Chaque prestation porte `enClair` (shared/catalog) : quelques mots simples,
   sans marque. Ce module les pose à côté du nom, d'UNE seule façon, pour
   toutes les surfaces qu'une cliente lit :
     « Rituel Sówà™ (traitement anti-poux) ».
   Sans mot en clair, ou quand le nom le dit déjà, le nom reste tel quel.

   ENTRE SES REPÈRES ⟨en-clair⟩, CE MODULE SE RECOPIE TEL QUEL dans les
   fonctions Edge qui écrivent aux clientes (une fonction ne lit rien du
   dépôt) ; `scripts/verifie-en-clair.mjs` tient les copies caractère pour
   caractère. Pur, sans import. */

/* ⟨en-clair⟩ */
/* LA PRESTATION EN CLAIR (25 novembre 2026, shared/en-clair-pur) : quelques
   mots simples à côté du nom, « Rituel Sówà™ (traitement anti-poux) ». */
const sansAccentsEnClair = (t: string): string =>
  String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Les mots en clair d'une prestation, propres : un espace entre chaque mot,
    rien autour. Vide quand la prestation n'en porte pas. */
const enClairDe = (s: { enClair?: unknown } | null | undefined): string =>
  typeof s?.enClair === 'string' ? s.enClair.replace(/\s+/g, ' ').trim() : '';

/** Le nom, puis ses mots en clair entre parenthèses. Le nom seul quand il n'y
    en a pas, ou quand le nom les dit déjà (« … · lavage et retouche »). */
const nomEtEnClair = (nom: string, enClair?: string | null): string => {
  const n = String(nom ?? '').replace(/\s+/g, ' ').trim();
  const e = String(enClair ?? '').replace(/\s+/g, ' ').trim();
  if (!e || !n) return n;
  return sansAccentsEnClair(n).includes(sansAccentsEnClair(e)) ? n : `${n} (${e})`;
};

/** Les mots en clair de la prestation qui porte CE nom au catalogue : une
    ligne de facture ne garde que le nom écrit le jour de la pièce. Vide quand
    aucune prestation de ce nom n'en porte. */
const enClairDuLibelle = (libelle: string, services: readonly { name?: unknown; enClair?: unknown }[]): string => {
  const l = String(libelle ?? '').replace(/\s+/g, ' ').trim();
  if (!l) return '';
  const s = services.find((x) => typeof x?.name === 'string' && x.name.replace(/\s+/g, ' ').trim() === l && enClairDe(x) !== '');
  return s ? enClairDe(s) : '';
};
/* ⟨/en-clair⟩ */

export { enClairDe, nomEtEnClair, enClairDuLibelle };
