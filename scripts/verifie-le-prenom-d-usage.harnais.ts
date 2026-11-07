/* LE PRÉNOM D'USAGE, ÉPROUVÉ — `node scripts/verifie-le-prenom-d-usage.mjs` (et `--prouve`).

   7 novembre 2026 : « Les clientes comme Anne-Marie, comme Marie Gisèle, qui
   ont un prénom composé : c'est important que, quand on leur écrit, on
   écrive toujours, dans leur rendez-vous et dans leur messagerie WhatsApp,
   tout le prénom composé » (Yéman). Au sélecteur : DEVINÉ, CORRIGEABLE.

   Le harnais tient, écrit à la main et jamais déduit du code :
     1. la règle (shared/civilite `prenomDevine`), sur des noms INVENTÉS de
        la même forme que ceux du carnet de la Maison ;
     2. le prénom noté sur la fiche l'emporte ; `appelDe` dit « Mme Anne
        Marie » ;
     3. chaque fonction Edge : le bloc ⟨prenom-d-usage⟩ à l'identique, sa
        copie d'appelDe qui s'appuie sur lui (exécutée), les fichiers
        regroupés à jour ;
     4. les règles voisines qui nomment une cliente (le foyer, le message du
        foyer, la porte des modèles, les cartes, le point du compte, le
        bilan, le rappel d'appel, le retour du site) ;
     5. aucun premier mot restant sur un nom de cliente dans les fichiers
        traités, les exceptions dites avec leur raison ;
     6. le champ « Prénom d'usage » de la fiche, et les fonctions qui lisent
        `data.prenomUsage`.
   Le dépôt est public : tous les noms sont inventés. */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { PRENOMS_QUI_SE_COMPOSENT, appelDe, prenomDUsage, prenomDevine, prenomSeul } from '../src/shared/civilite';
import { prenomDe as prenomDuFoyer, questionDAnnulation } from '../src/shared/foyer-pur';
import { prenomDeLaTete } from '../src/shared/message-du-foyer-pur';
import { appelJuste } from '../src/shared/porte-des-modeles-pur';
import { prenomDe as prenomDeLaCarte } from '../src/shared/cartes';
import { prenomDe as prenomDeLAttention } from '../src/shared/attentions-pur';
import { prenomDe as prenomPourElle } from '../src/shared/gestes-conversation';
import { messageAppel } from '../src/shared/appels';
import { prenomsDuPoint } from '../src/shared/point-du-compte-pur';
import { pourQuiDuBilan } from '../src/shared/bilan-document';
import { appelDuRetour } from '../src/apps/revelateur/reservation-du-site-pure';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const lis = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const OUVRE = '/* ⟨prenom-d-usage⟩ */\n';
const FERME = '\n/* ⟨/prenom-d-usage⟩ */';
const bloc = (t: string): string | null => {
  const i = t.indexOf(OUVRE); const k = t.indexOf(FERME, i);
  return i < 0 || k < 0 ? null : t.slice(i + OUVRE.length, k);
};

/* ── 1. LA RÈGLE, sur des noms inventés de la même forme ── */
const CAS: [string, string, string][] = [
  ['un NOM en capitales : tout ce qui le précède (forme « Prénom Prénom NOM NOM »)', 'Awa Reine KOSSI ADJOVI', 'Awa Reine'],
  ['... deux prénoms quelconques avant le NOM', 'Corinne Félicité AKPAKI HOUNTON', 'Corinne Félicité'],
  ['... un seul NOM', 'Edwige Victoire SOSSA', 'Edwige Victoire'],
  ['... Marie et un second prénom avant le NOM', 'Marie Reine DOSSA', 'Marie Reine'],
  ['... un prénom à trait d’union', 'Anne-Lise HOUNSA', 'Anne-Lise'],
  ['... les accents des capitales comptent', 'Hélène Grâce ÉDOUÉ', 'Hélène Grâce'],
  ['... l’apostrophe dans le NOM', 'Ange N’KOUÉ KOSSI', 'Ange'],
  ['« X - Y » se recolle en « X-Y »', 'Marie - Ange Kpadé', 'Marie-Ange'],
  ['« X -Y » aussi', 'Marie -Ange Kpadé', 'Marie-Ange'],
  ['« X- Y » aussi', 'Marie- Ange Kpadé', 'Marie-Ange'],
  ['... quel que soit le prénom', 'Grâce - Divine Mensah', 'Grâce-Divine'],
  ['le trait d’union ne file jamais vers un NOM en capitales', 'Awa - KOSSI', 'Awa'],
  ['... ni depuis un NOM en tête', 'KOSSI - Awa', 'KOSSI'],
  ['trois mots qui commencent par Jean : les deux premiers', 'Jean Paul Ahouéfa', 'Jean Paul'],
  ['... par Marie', 'Marie Reine Dossou', 'Marie Reine'],
  ['... par Anne', 'Anne Sophie Tossou', 'Anne Sophie'],
  ['... par Paul, l’accent du second gardé', 'Paul Éric Ahyi', 'Paul Éric'],
  ['... le second en minuscules prend sa capitale, rien d’autre', 'Marie reine Dossou', 'Marie Reine'],
  ['... le premier mot garde sa casse', 'marie reine dossou', 'marie Reine'],
  ['deux mots seulement : le premier, comme avant', 'Marie Reine', 'Marie'],
  ['trois mots sans NOM ni prénom de la liste : le premier', 'Diane Ada Kossi', 'Diane'],
  ['un surnom entre guillemets n’est pas un prénom', 'Kevin “Tigre” Assogba', 'Kevin'],
  ['un nom à ponctuation : le premier mot', 'Soeur Adjoa .', 'Soeur'],
  ['le nom d’une fiche de passage', 'Cliente Ma Couronne', 'Cliente'],
  ['une particule va au NOM, jamais au prénom', 'Anne-Lise de KOUTO', 'Anne-Lise'],
  ['... ni en second prénom', 'Marie de Kouto', 'Marie'],
  ['... mais « de » au milieu d’un prénom reste', 'Jean de Dieu KOSSI', 'Jean de Dieu'],
  ['un NOM à particule écrit d’AGBO n’est pas en capitales : la liste joue', 'Marie Claire d’AGBO', 'Marie Claire'],
  ['tout en capitales : le premier mot', 'MARIE REINE DOSSA', 'MARIE'],
  ['Louis-Marie : déjà composé', 'Louis-Marie ZANNOU', 'Louis-Marie'],
  ['les espaces en trop ne comptent pas', '  Awa   Kossou ', 'Awa'],
  ['un nom simple ne change pas', 'Naffi Morou', 'Naffi'],
  ['un nom vide : rien', '', ''],
];
dit('la règle, nom par nom', CAS.map((c) => `${c[0]} : ${c[2]}`), CAS.map((c) => `${c[0]} : ${prenomDevine(c[1])}`));
dit('la liste courte et datée, en tête du fichier', ['Marie', 'Anne', 'Jean', 'Paul', 'Pierre', 'Louis'], [...PRENOMS_QUI_SE_COMPOSENT]);
dit('le premier mot reste celui de l’équipe (prenomSeul)', 'Marie', prenomSeul('Marie Reine DOSSA'));

/* ── 2. LE PRÉNOM NOTÉ L'EMPORTE ── */
dit('le prénom d’usage de la fiche fait foi', 'Reine', prenomDUsage({ name: 'Awa Reine KOSSI', prenomUsage: ' Reine ' }));
dit('... ses espaces en trop se réduisent', 'Awa Reine', prenomDUsage({ name: 'Awa KOSSI', prenomUsage: 'Awa   Reine' }));
dit('... vide, le Trône devine', 'Awa Reine', prenomDUsage({ name: 'Awa Reine KOSSI', prenomUsage: '   ' }));
dit('... sans fiche, le nom de repli se devine', 'Marie Reine', prenomDUsage(null, 'Marie Reine Dossou'));
dit('appelDe : « Mme Anne Marie »', 'Mme Anne Marie', appelDe({ name: 'Anne Marie KOSSI', civilite: 'madame' }));
dit('... M., Mlle, et la fiche muette dit tout le prénom', ['M. Jean Paul', 'Mlle Marie-Ange', 'Awa Reine'],
  [appelDe({ name: 'Jean Paul Ahouéfa', civilite: 'monsieur' }), appelDe({ name: 'Marie - Ange Kpadé', civilite: 'mademoiselle' }), appelDe({ name: 'Awa Reine KOSSI' })]);
dit('... le prénom noté l’emporte dans l’appel', 'Mme Reine', appelDe({ name: 'Awa Reine KOSSI', prenomUsage: 'Reine', civilite: 'madame' }));
dit('... sans rien de connu : jamais un blanc', 'Madame, Monsieur', appelDe(null));

/* ── 3. LES FONCTIONS EDGE ── */
const CIVILITE = lis('src/shared/civilite.ts');
const ORIGINAL = bloc(CIVILITE);
dit('civilite.ts porte le bloc, sans import ni export dedans (des bancs le rejouent par new Function)', [true, false, false],
  [!!ORIGINAL && ORIGINAL.length > 400, /^\s*import /m.test(ORIGINAL ?? ''), /^\s*export /m.test(ORIGINAL ?? '')]);
dit('... et en exporte les trois noms juste après', true, CIVILITE.includes('/* ⟨/prenom-d-usage⟩ */\nexport { PRENOMS_QUI_SE_COMPOSENT, prenomDevine, prenomDUsage };'));
const AVEC_APPEL = ['avis-google', 'confirmation-rdv', 'demande-submit', 'discussion', 'fete-de-couronne', 'rappels-d-echeance', 'rappels-j1', 'relances-factures', 'whatsapp-automate', 'whatsapp-webhook'];
const AVEC_BLOC = [...AVEC_APPEL, 'envois-partent'];
const sources = new Map(AVEC_BLOC.map((f) => [f, lis(`supabase/functions/${f}/index.ts`)]));
dit('chaque fonction porte le bloc ⟨prenom-d-usage⟩, caractère pour caractère', [], AVEC_BLOC.filter((f) => bloc(sources.get(f)!) !== ORIGINAL));
const copieDAppel = (t: string): string | null => {
  const a = t.indexOf('const appelDe = (');
  return a < 0 ? null : t.slice(a, t.indexOf('\n};\n', a) + 3);
};
const appels = AVEC_APPEL.map((f) => copieDAppel(sources.get(f)!));
dit('chaque copie d’appelDe lit prenomUsage et s’appuie sur prenomDUsage', [],
  AVEC_APPEL.filter((_, i) => !/^const appelDe = \(d: \{ name\?: unknown; prenomUsage\?: unknown; civilite\?: unknown; auMasculin\?: unknown \}/.test(appels[i] ?? '')
    || !(appels[i] ?? '').includes('  const prenom = prenomDUsage(d, repli);\n') || /split\(/.test(appels[i] ?? '')));
dit('... et toutes sont la même, mot pour mot', 1, new Set(appels).size);
/* La copie se juge sur des cas : on l'exécute, avec SON bloc. */
const casEdge: [unknown, unknown, string][] = [
  [{ name: 'Awa Reine KOSSI ADJOVI', civilite: 'madame' }, undefined, 'Mme Awa Reine'],
  [{ name: 'Marie reine Dossou' }, undefined, 'Marie Reine'],
  [{ name: 'Jean Paul Ahouéfa', auMasculin: true }, undefined, 'M. Jean Paul'],
  [{ name: 'Awa Reine KOSSI', prenomUsage: 'Reine', civilite: 'mademoiselle' }, undefined, 'Mlle Reine'],
  [null, 'Marie - Ange Kpadé', 'Marie-Ange'],
  [null, undefined, 'Madame, Monsieur'],
];
for (const f of ['avis-google', 'whatsapp-automate', 'envois-partent']) {
  const t = sources.get(f)!;
  const code = `${bloc(t) ?? ''}\n${copieDAppel(t) ?? copieDAppel(sources.get('avis-google')!) ?? ''}`;
  let rendu: unknown;
  try {
    const js = transformSync(code, { loader: 'ts', format: 'cjs' }).code;
    // eslint-disable-next-line no-new-func
    const appel = new Function(`${js}\nreturn appelDe;`)() as (d: unknown, r: unknown) => string;
    rendu = casEdge.map(([d, r]) => appel(d, r));
  } catch (e) { rendu = String(e); }
  dit(`${f} : la copie, exécutée, dit tout le prénom composé`, casEdge.map((c) => c[2]), rendu);
}
for (const s of ['assistant-maison', 'assistants-maison', 'reception-wa']) {
  const r = spawnSync(process.execPath, [`scripts/${s}-serveur.mjs`, '--verifie'], { encoding: 'utf8' });
  const regroupe = lis(`supabase/functions/${s}/index.ts`);
  dit(`${s} : le fichier regroupé est à jour, appelDe y passe par prenomDUsage`, [0, true],
    [r.status, regroupe.includes('var prenomDUsage = (c, repli) => {') && regroupe.includes('  const prenom = prenomDUsage(c, repli);\n')]);
}

/* ── 3 bis. CE QUE LES FONCTIONS LISENT DE LA FICHE (data.prenomUsage) ── */
{
  const wh = sources.get('whatsapp-webhook')!;
  const auto = sources.get('whatsapp-automate')!;
  dit('whatsapp-webhook : la fiche du numéro porte prenomUsage (la RPC et la lecture par pages)', [true, true, true],
    [wh.includes("            prenomUsage: typeof f.prenomUsage === 'string' ? f.prenomUsage : undefined,\n"),
      wh.includes("          prenomUsage: typeof r.data?.prenomUsage === 'string' ? r.data.prenomUsage : undefined,\n"),
      /type FicheDuNumero = \{ id: string; nom\?: string; prenomUsage\?: string;/.test(wh)]);
  dit('... ses trois appels et la réponse « garder » le passent', [3, true],
    [(wh.match(/appelDe\(\{ name: fiche\.nom, prenomUsage: fiche\.prenomUsage, civilite: fiche\.civilite, auMasculin: fiche\.auMasculin \}/g) ?? []).length,
      wh.includes("prenom: prenomDe(String(fiche.nom ?? ''), fiche.prenomUsage), quand })")]);
  dit('whatsapp-automate : la fiche du numéro porte prenomUsage, Opale et le récapitulatif le disent', [true, true, 4],
    [auto.includes('      ...(texteOu(f.prenomUsage) ? { prenomUsage: String(f.prenomUsage).trim() } : {}),\n'),
      auto.includes('    prenom: prenomDeLaFicheWa(f),\n'),
      (auto.match(/appelDe\(\{ name: (?:f|adulteDuNumero)\.nom, prenomUsage: (?:f|adulteDuNumero)\.prenomUsage,/g) ?? []).length]);
  const sql = lis('supabase/migrations/0173_le_prenom_d_usage.sql');
  dit('0173 : fiches_du_numero rend prenomUsage, toujours réservée au serveur', [true, true, true],
    [sql.includes("           'prenomUsage', nullif(btrim(coalesce(r.data->>'prenomUsage', '')), ''),\n"),
      sql.includes('revoke all on function public.fiches_du_numero(text) from public, anon, authenticated;'),
      sql.includes('grant execute on function public.fiches_du_numero(text) to service_role;')]);
  const dem = sources.get('demande-submit')!;
  dit('demande-submit : la marraine par son prénom d’usage, l’amie par le prénom deviné', [true, true, true],
    [dem.includes('prenom: prenomDUsage(fiche.data), telephone:'),
      dem.includes('const prenom = appelDe({ ...(ficheMarraine ?? {}), prenomUsage: o.prenomMarraine || ficheMarraine?.prenomUsage });'),
      dem.includes('prenomAmie: prenomDevine(prenom),')]);
  dit('rappels-d-echeance et fete-de-couronne : le prénom de la tête, d’usage', [true, true],
    [sources.get('rappels-d-echeance')!.includes('const prenomDe = (fiche: { name?: unknown } | undefined, repli?: string): string =>\n  prenomDUsage(fiche, repli);'),
      sources.get('fete-de-couronne')!.includes('const prenomDe = (fiche: { name?: unknown } | undefined): string =>\n  prenomDUsage(fiche);')]);
  dit('confirmation-rdv et rappels-j1 : le prénom du foyer porte celui de la fiche', [true, true],
    [sources.get('confirmation-rdv')!.includes('prenomDeLaTete(fiches.get(t.clientId)?.name ?? t.clientName, fiches.get(t.clientId)?.prenomUsage)'),
      sources.get('rappels-j1')!.includes('prenomSeul: prenomDeLaTete(fiche?.name ?? a.clientName, fiche?.prenomUsage) });')]);
}

/* ── 4. LES RÈGLES VOISINES QUI NOMMENT UNE CLIENTE ── */
dit('le foyer : tout le prénom, sans civilité, le prénom noté d’abord', ['Awa Reine', 'Marie Reine', 'Reine', ''],
  [prenomDuFoyer('Mme Awa Reine KOSSI'), prenomDuFoyer('Marie Reine Dossou'), prenomDuFoyer('Awa Reine KOSSI', 'Reine'), prenomDuFoyer(undefined)]);
{
  const rdv = (id: string, clientId: string) => ({ id, clientId, date: '2026-12-22', time: '10:00', status: 'confirmé', foyerId: 'f1' });
  const q = questionDAnnulation(rdv('r1', 'c1'), [rdv('r1', 'c1'), rdv('r2', 'c2')], [{ id: 'c1', name: 'Marie Reine Dossou' }, { id: 'c2', name: 'Ama D.' }]);
  dit('... la question d’annulation dit « seulement Marie Reine »', 'Seulement Marie Reine', q?.elle);
}
dit('le message du foyer : « Marie Reine et Jade »', ['Marie Reine', 'Reine'], [prenomDeLaTete('Marie Reine Dossou'), prenomDeLaTete('Marie Reine Dossou', 'Reine')]);
dit('la porte des modèles : un message d’avant (le premier mot) prend tout le prénom, avec la civilité de la fiche', 'Mme Awa Reine',
  appelJuste('Mme Awa', { name: 'Awa Reine KOSSI', civilite: 'madame' }));
dit('... sans civilité notée, le prénom entier ; déjà juste, rien à changer', ['Awa Reine', null],
  [appelJuste('Awa', { name: 'Awa Reine KOSSI' }), appelJuste('Mme Awa Reine', { name: 'Awa Reine KOSSI', civilite: 'madame' })]);
dit('... au masculin, « M. » garde sa civilité et prend le prénom entier', 'M. Jean Paul', appelJuste('M. Jean', { name: 'Jean Paul Ahouéfa', auMasculin: true }));
dit('... l’appel d’une autre (le parent) ne se corrige jamais', null, appelJuste('Mme Ola', { name: 'Awa Reine KOSSI', civilite: 'madame' }));
dit('les cartes : tout le prénom, le prénom noté d’abord', ['Awa Reine', 'Reine'], [prenomDeLaCarte('Awa Reine KOSSI'), prenomDeLaCarte('Awa Reine KOSSI', 'Reine')]);
dit('l’attention : tout le prénom, jamais un identifiant', ['Marie Reine', ''], [prenomDeLAttention('Marie Reine Dossou'), prenomDeLAttention('awa_kossou1')]);
dit('les gestes de conversation : « Marie-Ange »', 'Marie-Ange', prenomPourElle('Marie - Ange Kpadé'));
dit('le rappel d’un appel reçu : « Bonjour Jean Paul, »', true, messageAppel({ nom: 'Jean Paul Ahouéfa', motif: '' }).startsWith('Bonjour Jean Paul, '));
dit('le point du compte : les prénoms des têtes, entiers', ['Marie Reine', 'Reine'],
  prenomsDuPoint([{ id: 'p1', date: '2026-10-01', clientId: 'c1' }, { id: 'p2', date: '2026-10-02', clientId: 'c2' }],
    [{ id: 'c1', name: 'Marie Reine Dossou' }, { id: 'c2', name: 'Awa Reine KOSSI', prenomUsage: 'Reine' }]));
dit('le bilan : « Madame Awa Reine A. »', 'Madame Awa Reine A.', pourQuiDuBilan({ name: 'Awa Reine KOSSI ADJOVI', civilite: 'madame' }));
dit('le retour du site : « Mme Marie-Ange »', 'Mme Marie-Ange', appelDuRetour({ prenom: 'Marie - Ange', civilite: 'madame' }));

/* ── 5. AUCUN PREMIER MOT RESTANT SUR UN NOM DE CLIENTE, dans les fichiers traités ──
   [fichier, les lignes permises (un morceau de chacune), et pourquoi]. */
const PREMIER_MOT = /split\((?:\/\\s\+\/|' ')\)\[0\]/;
const TRAITES: [string, string[]][] = [
  /* prenomSeul : le premier mot de l'ÉQUIPE (maîtres, caissières, paie). */
  ['src/shared/civilite.ts', ['export const prenomSeul = ']],
  /* prenomDuNomWa : les alertes de l'équipe, et le juge des enfants (le premier mot attrape « Ama » comme « Ama Reine »). */
  ['src/shared/automate-wa.ts', ['const prenomDuNomWa = ']],
  ['supabase/functions/whatsapp-automate/index.ts', ['const prenomDuNomWa = ']],
  /* premierMot : la porte reconnaît un message déposé avant le 7 novembre 2026. */
  ['src/shared/porte-des-modeles-pur.ts', ['const premierMot = ']],
  ['supabase/functions/envois-partent/index.ts', ['const premierMot = ']],
  /* Une date (« du 18 au 20 octobre »), pas un nom. */
  ['src/shared/point-du-compte-pur.ts', ['jourEtMois(a).split(']],
  ['supabase/functions/relances-factures/index.ts', ['jourEtMois(a).split(']],
  /* Un mois du calendrier, pas un nom. */
  ['src/apps/consultation/App.tsx', ['cal.label.split(']],
  /* Trois messages de l'écran à l'ÉQUIPE (remplacer un numéro), jamais à elle. */
  ['src/apps/trone/routes/clients/Conversations.tsx', ['Remplacer le second numéro de ', 'Ce numéro est désormais celui de ', 'n’a pas de numéro sur sa fiche.']],
  ['src/shared/foyer-pur.ts', []], ['src/shared/message-du-foyer-pur.ts', []], ['src/shared/cartes.ts', []], ['src/shared/attentions-pur.ts', []],
  ['src/shared/appels.ts', []], ['src/shared/bilan-assistant-pur.ts', []], ['src/shared/bilan-document.ts', []], ['src/shared/fin-de-paquet.ts', []],
  ['src/shared/gestes-conversation.ts', []], ['src/shared/ambassade.ts', []], ['src/shared/assistant-passage-pur.ts', []],
  ['src/apps/couronne/Tabs.tsx', []], ['src/apps/couronne/RituelEnCours.tsx', []], ['src/apps/couronne/MesRendezVous.tsx', []],
  ['src/apps/couronne/lib.ts', []], ['src/apps/couronne/App.tsx', []], ['src/apps/couronne/Booking.tsx', []], ['src/apps/couronne/MaCarte.tsx', []],
  ['src/apps/revelateur/reservation-du-site-pure.ts', []], ['src/apps/revelateur/ilots/Reserver.tsx', []], ['src/apps/revelateur/ilots/Boutique.tsx', []],
  ['src/apps/trone/routes/vente/pdf-de-la-piece.ts', []], ['src/apps/trone/routes/vente/envoi-de-la-piece.ts', []],
  ['src/apps/trone/routes/clients/LesConversations.tsx', []], ['src/apps/trone/routes/clients/VitrineBoutique.tsx', []],
  ['src/apps/trone/routes/clients/CarteDeMarrainePanneau.tsx', []], ['src/apps/trone/routes/clients/CarteModal.tsx', []],
  ['src/apps/trone/routes/clients/Gerard.tsx', []], ['src/apps/trone/routes/equipe/Cercle.tsx', []],
  ['src/apps/trone/routes/equipe/MarketingBranche.tsx', []], ['src/apps/trone/routes/equipe/EditeurDesOffres.tsx', []],
  ...['avis-google', 'confirmation-rdv', 'demande-submit', 'discussion', 'fete-de-couronne', 'rappels-d-echeance', 'rappels-j1', 'whatsapp-webhook']
    .map((f): [string, string[]] => [`supabase/functions/${f}/index.ts`, []]),
];
dit('aucun premier mot restant sur un nom de cliente dans les fichiers traités', [],
  TRAITES.flatMap(([f, permises]) => lis(f).split('\n').map((l, i) => ({ l, i }))
    .filter(({ l }) => PREMIER_MOT.test(l) && !permises.some((p) => l.includes(p)))
    .map(({ l, i }) => `${f}:${i + 1} ${l.trim().slice(0, 90)}`)));

/* Les écrans qui lui parlent passent par la règle. */
dit('Ma Couronne : l’accueil, le rituel en cours, les têtes, la carte de marraine', [true, true, true, true],
  [lis('src/apps/couronne/Tabs.tsx').includes('  const brut = prenomDUsage(client);'), lis('src/apps/couronne/RituelEnCours.tsx').includes('  const brut = prenomDUsage(client);'),
    lis('src/apps/couronne/App.tsx').includes('{prenomDUsage(tt)}'), lis('src/apps/couronne/MaCarte.tsx').includes('prenom: prenomDUsage(client) || client.name,')]);
dit('l’automate WhatsApp : « Pour moi, Awa Reine », « pour Marie Reine »', [true, 2],
  [lis('src/shared/automate-wa.ts').includes('`Pour moi, ${prenomDeLaFicheWa(f)}` : `Pour ${prenomDeLaFicheWa(f)}`'),
    (lis('src/shared/automate-wa.ts').match(/pourQui = [^;]*prenomDeLaFicheWa\(/g) ?? []).length]);
dit('la pièce : « Pour Anne Marie, » ; le bilan de l’assistant : « Madame Anne Marie »', [true, true],
  [lis('src/apps/trone/routes/vente/pdf-de-la-piece.ts').includes('const prenomOf = (d: Invoice) => prenomDUsage(clientOf(d), clientNameOf(d));'),
    lis('src/shared/bilan-assistant-pur.ts').includes('  const prenom = prenomDUsage(f);')]);

/* ── 6. LE CHAMP DE LA FICHE ── */
{
  const types = lis('src/shared/clients.ts');
  const fiche = lis('src/apps/trone/routes/clients/Customers.tsx');
  dit('le type de la fiche porte prenomUsage', true, /export type Client = \{[\s\S]*?\n  prenomUsage\?: string;\n[\s\S]*?\n\};/.test(types));
  dit('la fiche montre « Prénom d’usage » près de la civilité, et l’enregistre comme elle (patch)', [true, true],
    [/<u>Prénom d’usage<\/u>\s*<ChampDuPrenomDUsage client=\{client\} onPose=\{\(v\) => patch\(\{ prenomUsage: v \}\)\} \/>/.test(fiche),
      fiche.indexOf('<u>Prénom d’usage</u>') > fiche.indexOf('onClick={() => patch(ficheAvecCivilite(x.cle))}')]);
  dit('... vide, il montre en gris ce que le Trône devine ; vidé, il s’efface de la fiche', [true, true, true],
    [fiche.includes('const devine = prenomDevine(client.name);'), fiche.includes("placeholder={devine ? `Deviné : ${devine}` : 'Son prénom'}"),
      fiche.includes('if (net !== (client.prenomUsage ?? \'\')) onPose(net || undefined);')]);
}

console.log(ko === 0 ? '\nTout le prénom composé, partout où la Maison lui écrit.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
