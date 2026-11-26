/* L'ACCORD DES NOUVELLES, D'UN BOUTON — 26 novembre 2026 (l'audit du Trône,
   B1, validé par Yéman : « construis »).

   Le constat de l'audit, lu en base le 26 novembre : sur un peu plus de trois
   cents fiches vivantes, une poignée seulement avait répondu à la question
   des nouvelles. Sans « oui », aucune campagne WhatsApp ne part, ni les
   relances automatiques de Perle, ni les parcours à venir : la Maison
   n'écrivait à presque personne. La question sur WhatsApp (accord-whatsapp-pur)
   ne se pose qu'après un « Oui, je viens » ou un reçu, trois fois par semaine
   environ : trop rare.

   La question se pose donc aux moments où elle est devant nous :
     · sur la page « Régler », une fois la séance réglée (le merci), sauf au
       TPE de poche (le téléphone d'une employée) et sauf pour l'invitée de
       « régler à deux » ou le foyer — c'est la fonction `regler-la-seance`
       qui écrit, source `reglement` ;
     · dans Ma Couronne, une carte discrète tant qu'elle n'a pas répondu
       (source `couronne`) ;
     · au comptoir, une ligne dans la fiche du rendez-vous du jour et au
       « C'est réglé » de l'encaissement (source `comptoir`) ; la fiche
       cliente dit la réponse, et c'est le seul endroit où elle se corrige.
   Le Tableau de bord compte les réponses (`compteDesAccords`).

   La même question, les mêmes mots, les mêmes deux boutons que sur WhatsApp
   (accord-whatsapp-pur : QUESTION_DE_L_ACCORD, « Oui, volontiers » / « Non
   merci », MERCI_DE_L_ACCORD, MERCI_DU_REFUS). Ce fichier ne dit que QUAND
   elle se pose et CE QUI s'écrit.

   Le bloc ⟨accord-des-nouvelles⟩ est recopié mot pour mot dans la fonction
   `regler-la-seance` ; le banc verifie-l-accord-d-un-bouton compare les deux
   textes (et verifie-les-douze-lunes, R8). Module PUR : aucun import. */

/* ⟨accord-des-nouvelles⟩ */
/** D'où vient la réponse : la liste de `AccordDesNouvelles['par']`
    (shared/audiences-pur). `reglement` (26 novembre 2026) : sur la page
    « Régler », après le paiement de sa séance. */
export type SourceDeLAccord = 'comptoir' | 'site' | 'couronne' | 'stop' | 'whatsapp' | 'reglement';
export const SOURCES_DE_L_ACCORD: readonly SourceDeLAccord[] = ['comptoir', 'reglement', 'couronne', 'whatsapp', 'site', 'stop'];

/** La réponse posée sur la fiche : oui ou non, le jour du salon, d'où elle vient. */
export type AccordPose = { oui: boolean; le: string; par: SourceDeLAccord };

/** Ce que la règle lit d'une fiche. */
export type FicheDeLAccord = {
  nouvelles?: { oui?: unknown; le?: unknown; par?: unknown } | null;
  archived?: boolean | null;
  segments?: readonly string[] | null;
  birthday?: string | null;
};

/** Mineure ce jour-là (AAAA-MM-JJ), d'après sa date de naissance. Sans date
    lisible, non : la règle de `estMineur` (shared/clients-pur), qui échoue
    fermée. */
export function mineureLe(naissance: unknown, jour: string): boolean {
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(naissance ?? '').slice(0, 10));
  const j = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jour ?? '').slice(0, 10));
  if (!n || !j) return false;
  let age = Number(j[1]) - Number(n[1]);
  if (Number(j[2]) * 100 + Number(j[3]) < Number(n[2]) * 100 + Number(n[3])) age -= 1;
  return age < 18;
}

/** Elle a déjà répondu : oui, non, ou STOP. */
export const aDejaRepondu = (f: FicheDeLAccord | null | undefined): boolean =>
  !!f && !!f.nouvelles && typeof f.nouvelles === 'object';

/** Un enfant ne répond pas : l'accord se donne par le parent, sur sa fiche à lui. */
export const estUneTeteDEnfant = (f: FicheDeLAccord, jour: string): boolean =>
  (f.segments ?? []).includes('Enfant') || mineureLe(f.birthday, jour);

/** LA QUESTION SE POSE-T-ELLE ? Jamais à qui a répondu (un STOP compris),
    jamais sur une fiche archivée, jamais pour un enfant. `jour` : le jour du
    salon, pour juger l'âge. */
export function laQuestionSePose(f: FicheDeLAccord | null | undefined, jour: string): boolean {
  if (!f) return false;
  if (aDejaRepondu(f)) return false;
  if (f.archived === true) return false;
  if (estUneTeteDEnfant(f, jour)) return false;
  return true;
}

/** LA RÉPONSE À ÉCRIRE, ou rien : jamais par-dessus une réponse déjà là (ni
    oui, ni non, ni STOP), jamais sur une fiche où la question ne se pose pas.
    Le jour est celui du salon (AAAA-MM-JJ). */
export function accordAPoser(f: FicheDeLAccord | null | undefined, oui: boolean, jour: string, par: SourceDeLAccord): AccordPose | null {
  if (typeof oui !== 'boolean') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour ?? ''))) return null;
  if (!laQuestionSePose(f, jour)) return null;
  return { oui, le: jour, par };
}
/* ⟨/accord-des-nouvelles⟩ */

/** LA QUESTION ADRESSÉE : sur la page « Régler », le lien a pu être partagé
    (« Quelqu'un règle pour moi ») ; la question porte donc son prénom, pour
    que celle qui règle à sa place sache qu'elle ne lui est pas posée. Sans
    prénom, la question telle quelle. */
export function questionAdressee(prenom: unknown, question: string): string {
  const p = String(prenom ?? '').replace(/\s+/g, ' ').trim();
  if (!p || !question) return question;
  return `${p}, ${question.charAt(0).toLowerCase()}${question.slice(1)}`;
}

/* ══ LA FICHE CLIENTE : LE SEUL ENDROIT OÙ LA RÉPONSE SE CORRIGE ══════════
   Au comptoir, la ligne disparaît une fois la réponse donnée ; sur la fiche,
   la réponse se lit (oui ou non, le jour, d'où elle vient) et se corrige,
   toujours au nom du comptoir. Lever un STOP n'est pas un geste anodin : la
   personne a refusé par écrit. La fiche le dit et demande un second toucher
   (`leveUnStop`) ; l'écran ne réinscrit qu'à sa demande à elle. */
export type CorrectionDeLAccord = { accord: AccordPose; leveUnStop: boolean };

export function correctionDeLAccord(f: FicheDeLAccord | null | undefined, oui: boolean, jour: string): CorrectionDeLAccord | null {
  if (!f || typeof oui !== 'boolean' || !/^\d{4}-\d{2}-\d{2}$/.test(String(jour ?? ''))) return null;
  const n = f.nouvelles;
  if (n && n.oui === oui && n.par !== 'stop') return null;
  if (n && n.par === 'stop' && oui === false) return null;
  return { accord: { oui, le: jour, par: 'comptoir' }, leveUnStop: !!n && n.par === 'stop' && oui === true };
}

/** Comment la fiche dit d'où vient la réponse. */
export const SOURCE_DITE: Record<SourceDeLAccord, string> = {
  comptoir: 'au comptoir',
  reglement: 'en réglant sa séance',
  couronne: 'dans Ma Couronne',
  whatsapp: 'sur WhatsApp',
  site: 'sur le site',
  stop: 'en répondant STOP',
};
export const sourceDite = (par: unknown): string =>
  (SOURCES_DE_L_ACCORD as readonly string[]).includes(String(par)) ? SOURCE_DITE[par as SourceDeLAccord] : '';

/** Le jour en clair, l'année toujours (règle de la Maison) : « 26 nov. 2026 ». */
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export function jourCourtDeLAccord(iso: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
  return `${Number(m[3])} ${MOIS_COURTS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Ce que la fiche dit de la réponse, en une ligne, sans supposer la civilité. */
export function reponseDite(f: FicheDeLAccord | null | undefined): string {
  const n = f?.nouvelles;
  if (!n) return 'Pas encore demandé : aucune campagne WhatsApp ne part vers cette fiche.';
  const le = jourCourtDeLAccord(n.le);
  const depuis = sourceDite(n.par);
  if (n.oui === true) return `Oui${le ? `, depuis le ${le}` : ''}${depuis ? `, ${depuis}` : ''}.`;
  return `Non${le ? `, le ${le}` : ''}${depuis ? `, ${depuis}` : ''} : aucune campagne WhatsApp.`;
}

/* ══ LE TABLEAU DE BORD : LES RÉPONSES OBTENUES ══════════════════════════
   Sur les fiches vivantes de la branche qui PEUVENT répondre : ni archivée,
   ni d'essai, ni d'enfant. « Pas encore demandé » : aucune réponse ;
   « demandé sur WhatsApp, sans réponse » se compte à part. Les « oui »
   gagnés se lisent à leur jour (`nouvelles.le`), sur la semaine du salon
   (du lundi à aujourd'hui) et sur le mois. */
export type FicheComptee = FicheDeLAccord & { branchId?: string | null; essai?: boolean | null; nouvellesDemandeesLe?: string | null };

export type CompteDesAccords = {
  /** Les fiches qui peuvent répondre. */
  tetes: number;
  oui: number;
  /** Non au comptoir, sur WhatsApp, ailleurs ; et STOP, compté aussi à part. */
  non: number;
  stop: number;
  /** Aucune réponse, jamais demandé sur WhatsApp. */
  pasEncore: number;
  /** Demandé sur WhatsApp, sans réponse. */
  sansReponse: number;
  /** Les « oui » dont le jour tombe dans la semaine du salon (lundi → aujourd'hui), puis dans le mois. */
  ouiSemaine: number;
  ouiMois: number;
  /** Les « oui » du mois, par source. */
  ouiDuMoisParSource: Record<SourceDeLAccord, number>;
};

/** Le lundi de la semaine d'un jour (AAAA-MM-JJ). */
export function lundiDe(jour: string): string {
  const d = new Date(`${String(jour).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function compteDesAccords(fiches: readonly FicheComptee[], o: { branchId: string; aujourdhui: string }): CompteDesAccords {
  const lundi = lundiDe(o.aujourdhui);
  const mois = String(o.aujourdhui).slice(0, 7);
  const parSource = Object.fromEntries(SOURCES_DE_L_ACCORD.map((s) => [s, 0])) as Record<SourceDeLAccord, number>;
  const c: CompteDesAccords = { tetes: 0, oui: 0, non: 0, stop: 0, pasEncore: 0, sansReponse: 0, ouiSemaine: 0, ouiMois: 0, ouiDuMoisParSource: parSource };
  for (const f of fiches) {
    if (!f || f.branchId !== o.branchId || f.archived === true || f.essai === true) continue;
    if (estUneTeteDEnfant(f, o.aujourdhui)) continue;
    c.tetes += 1;
    const n = f.nouvelles;
    if (!n) {
      if (f.nouvellesDemandeesLe) c.sansReponse += 1;
      else c.pasEncore += 1;
      continue;
    }
    if (n.oui === true) {
      c.oui += 1;
      const le = String(n.le ?? '').slice(0, 10);
      if (le && le <= o.aujourdhui) {
        if (le >= lundi) c.ouiSemaine += 1;
        if (le.slice(0, 7) === mois) {
          c.ouiMois += 1;
          const s = String(n.par);
          if ((SOURCES_DE_L_ACCORD as readonly string[]).includes(s)) parSource[s as SourceDeLAccord] += 1;
        }
      }
    } else {
      c.non += 1;
      if (n.par === 'stop') c.stop += 1;
    }
  }
  return c;
}
