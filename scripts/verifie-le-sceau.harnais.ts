/* LE SCEAU, ÉPROUVÉ — `node scripts/verifie-le-sceau.mjs`.

   22 novembre 2026 : « I want to give to another session the build for the
   last two maquette that was made : devis en direct et le sceau de la
   séance. » Le Sceau, lot 1 : le direct et le sceau sur la page « Régler »
   qui existe. Ce que ce banc tient :
     - le geste : un doigt maintenu une seconde, et pas un demi-septième ;
     - le geste offert : un montant en francs ou un pourcentage, borné, et
       jamais plus que ce qu'elle doit encore ;
     - la lecture du fauteuil : cinq étapes, dans l'ordre, et la phrase qui
       les dit (celle de la maquette) ;
     - le fil : un canal nommé par le jeton, une charge VIDE, et rien d'autre ;
     - la règle recopiée dans la fonction, et la page qui porte le sceau. */
import { readFileSync } from 'node:fs';
import {
  CHARGE_DU_FIL, ETAPES_DU_FAUTEUIL, MOYEN_KKIAPAY, MOYENS_DU_SCEAU, PLAFOND_DU_GESTE_PCT, SCEAU_CUIVRE, TENUE_DU_SCEAU_MS,
  estUnFilDuSceau, etapeDuFauteuil, estFranchie, filDuSceau, gesteDemande, gesteDit, heureDit, leFauteuilDit,
  moyenDitDuSceau, signalDuSceau,
} from '../src/shared/le-sceau-pur';
import { nomDInviteePropre, pageDuLien } from '../src/shared/regler-la-seance-pur';
import { qrMatrice } from '../src/shared/qr-pur';
import { copieAttendue, copieDuServeur } from './regler-copie-serveur.mjs';

let ko = 0;
let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu);
  const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK     ${nom}`);
  else { ko++; console.log(`ECHEC  ${nom} -> attendu ${a}, obtenu ${String(o)}`); }
};
const vrai = (nom: string, oui: boolean, detail = '') => dit(nom, true, oui || `faux${detail ? ` : ${detail}` : ''}`);
const lis = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const franc = (x: number): string => `${Math.round(x).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} F`;

/* ── LE GESTE ───────────────────────────────────────────────────────────── */
dit('la maintenue dure une seconde', 1100, TENUE_DU_SCEAU_MS);
dit('le plafond du geste, en pourcentage', 50, PLAFOND_DU_GESTE_PCT);
dit('un geste en francs se lit', { ok: true, mode: 'xof', dit: 1000, xof: 1000 }, gesteDemande('1 000', 'xof', 28_000));
dit('un geste de zéro franc ne passe pas', { ok: false, raison: 'lecture' }, gesteDemande('0', 'xof', 28_000));
dit('un geste plus gros que la note est refusé', { ok: false, raison: 'trop' }, gesteDemande('28 001', 'xof', 28_000));
dit('un geste à la note entière passe', { ok: true, mode: 'xof', dit: 28_000, xof: 28_000 }, gesteDemande('28 000', 'xof', 28_000));
dit('sur une note déjà réglée, rien ne s’offre', { ok: false, raison: 'rien' }, gesteDemande('1 000', 'xof', 0));
dit('un pourcentage se lit', { ok: true, mode: 'pct', dit: 10, xof: 2_800 }, gesteDemande('10', 'pct', 28_000));
dit('la virgule du pourcentage se lit', { ok: true, mode: 'pct', dit: 12.5, xof: 3_500 }, gesteDemande('12,5', 'pct', 28_000));
dit('le plafond du pourcentage tient', { ok: true, mode: 'pct', dit: 50, xof: 14_000 }, gesteDemande('50', 'pct', 28_000));
dit('au-delà du plafond, refusé', { ok: false, raison: 'trop' }, gesteDemande('51', 'pct', 28_000));
dit('zéro pour cent ne passe pas', { ok: false, raison: 'lecture' }, gesteDemande('0', 'pct', 28_000));
/* Un pourcentage ne peut pas dépasser ce qu'elle doit : sur 3 F, la moitié
   s'arrondit à 2 F, jamais au-delà de la note. */
dit('un pourcentage ne déborde jamais la note', { ok: true, mode: 'pct', dit: 50, xof: 2 }, gesteDemande('50', 'pct', 3));
dit('le geste dit ce qu’il fait', 'Sur une note de 28 000 F : − 2 800 F. Elle le voit à l’instant.', gesteDit('10', 'pct', 28_000, franc));
dit('le geste vide dit la borne', 'De 1 à 50 %. Au-delà, la direction décide.', gesteDit('', 'pct', 28_000, franc));
dit('un pourcentage trop grand se dit', 'Un pourcentage de 1 à 50.', gesteDit('51', 'pct', 28_000, franc));
dit('la note réglée se dit', 'Il n’y a plus rien à régler sur cette note.', gesteDit('10', 'xof', 0, franc));

/* ── LE FAUTEUIL ────────────────────────────────────────────────────────── */
const lien = (x: Record<string, string>) => ({ jeton: 'abcdefghjkmnpq', creeLe: '2026-11-22T17:00:00Z', ...x });
dit('cinq étapes, dans l’ordre', ['rituel', 'note', 'page', 'regle', 'scelle'], [...ETAPES_DU_FAUTEUIL]);
dit('le rituel commence', 'rituel', etapeDuFauteuil({ lien: lien({}), etat: 'a-regler' }));
dit('la note partie se voit', 'note', etapeDuFauteuil({ lien: lien({ envoyeLe: '2026-11-22T17:40:00Z' }), etat: 'a-regler' }));
dit('sa note ouverte se voit', 'page', etapeDuFauteuil({ lien: lien({ envoyeLe: '2026-11-22T17:40:00Z', ouvertLe: '2026-11-22T17:41:00Z' }), etat: 'a-regler' }));
dit('le sceau posé se voit', 'regle', etapeDuFauteuil({ lien: lien({ ouvertLe: '2026-11-22T17:41:00Z', sceauLe: '2026-11-22T17:42:00Z', moyen: 'mtn' }), etat: 'a-regler' }));
dit('l’argent reçu scelle, même sans sceau', 'scelle', etapeDuFauteuil({ lien: lien({ ouvertLe: '2026-11-22T17:41:00Z' }), etat: 'reglee' }));
dit('un lien nu ne scelle pas', 'rituel', etapeDuFauteuil({ lien: null, etat: 'sans-piece' }));
vrai('une étape derrière est franchie', estFranchie('page', 'note'));
vrai('l’étape où il en est ne l’est pas', !estFranchie('page', 'page'));
/* 25 novembre 2026 : le serveur note le sceau en temps universel. Cette
   épreuve attendait « 17 h 42 » d'un instant de 17 h 42 UTC, et gardait donc
   l'heure de retard que Yéman a lue à l'essai (« Scellé à 5 h 38 »). */
dit('l’heure du sceau, à Cotonou : une heure de plus que le temps universel', '18 h 42', heureDit('2026-11-22T17:42:03Z'));
dit('avec les millièmes du serveur', '6 h 38', heureDit('2026-11-23T05:38:09.412Z'));
dit('23 h 30 en temps universel se dit 0 h 30, jamais 24 h 30', '0 h 30', heureDit('2026-11-22T23:30:00Z'));
dit('un instant qui porte déjà le fuseau du salon ne bouge pas', '17 h 42', heureDit('2026-11-22T17:42:00+01:00'));
dit('un instant d’un autre fuseau revient à Cotonou', '10 h 05', heureDit('2026-11-22T17:05:00+08:00'));
dit('un instant sans fuseau est déjà à l’heure du salon', '17 h 42', heureDit('2026-11-22T17:42'));
dit('l’heure d’un jour sans heure', '', heureDit(''));
dit('le Trône le dit dans sa phrase', 'Scellé à 6 h 38. Le fauteuil se libère.', leFauteuilDit({ etape: 'scelle', sceauLe: '2026-11-23T05:38:09.412Z' }));
dit('MTN : la demande est sur son téléphone', 'Le sceau est posé : la demande MTN est sur son téléphone, elle valide avec son code secret.',
  leFauteuilDit({ etape: 'regle', moyen: 'mtn' }));
dit('la carte : la fenêtre KkiaPay', 'Le sceau est posé : elle règle par carte, dans la fenêtre KkiaPay de son téléphone.',
  leFauteuilDit({ etape: 'regle', moyen: 'carte' }));
dit('KkiaPay sans réseau connu', 'Le sceau est posé : elle règle par KkiaPay, dans la fenêtre KkiaPay de son téléphone.',
  leFauteuilDit({ etape: 'regle', moyen: MOYEN_KKIAPAY }));
dit('scellé, avec son heure de Cotonou', 'Scellé à 18 h 42. Le fauteuil se libère.', leFauteuilDit({ etape: 'scelle', sceauLe: '2026-11-22T17:42:03Z' }));
dit('rien avant la note', 'Le rituel se termine. Le maître choisit : la note sur son WhatsApp, ou le médaillon du fauteuil.', leFauteuilDit({ etape: 'rituel' }));
dit('quatre moyens, MTN d’abord', ['mtn', 'moov', 'celtiis', 'carte'], MOYENS_DU_SCEAU.map((x) => x.k));
dit('MTN passe par la maison', 'mtn', MOYENS_DU_SCEAU[0].rail);
dit('la carte passe par KkiaPay', 'kkiapay', MOYENS_DU_SCEAU[3].rail);
dit('un moyen inconnu ne se lit pas', null, moyenDitDuSceau('bitcoin'));
dit('le sceau cuivre est celui de la Maison', 'assets/tampons/mnd-premium-cuivre.png', SCEAU_CUIVRE);

/* ── LE FIL ─────────────────────────────────────────────────────────────── */
dit('le fil porte le nom du jeton', 'sceau-abcdefghjkmnpq', filDuSceau('abcdefghjkmnpq'));
vrai('un fil de jeton se reconnaît', estUnFilDuSceau('sceau-abcdefghjkmnpq'));
vrai('un jeton trop court ne fait pas un fil', !estUnFilDuSceau('sceau-abc'));
vrai('un autre canal n’en est pas un', !estUnFilDuSceau('mnd:maison:1'));
dit('le signal ne porte RIEN', '{}', JSON.stringify(signalDuSceau().payload));
dit('le signal s’appelle « relis »', 'relis', signalDuSceau().event);
vrai('la charge est gelée', Object.isFrozen(CHARGE_DU_FIL));
vrai('aucun champ dans la charge', Object.keys(CHARGE_DU_FIL).length === 0);

/* ── LA PAGE, LA PIÈCE, LA FONCTION ─────────────────────────────────────── */
const piece = {
  id: 'inv1', apptId: 'rdv1', kind: 'facture', status: 'émise',
  lines: [{ label: 'Lavage et reprise', qty: 1, unitXof: 28_000 }],
  globalDiscountXof: 2_000, gesteDeLaMaison: { xof: 2_000, mode: 'pct' as const, dit: 10 },
};
const page = pageDuLien({
  rdv: { id: 'rdv1', date: '2026-11-22', status: 'honoré', clientName: 'Awa Sossou', lienDeReglement: lien({}) },
  piece, prenom: 'Awa', branchId: 'b1', maintenant: new Date('2026-11-22T17:42:00Z'),
});
dit('la page dit le geste, à part', 2_000, (page as { gesteXof?: number }).gesteXof);
dit('le geste est déjà dans le total', 26_000, page.totalXof);
dit('le geste est déjà dans le reste', 26_000, page.resteXof);
const sansGeste = pageDuLien({
  rdv: { id: 'rdv1', date: '2026-11-22', status: 'honoré', clientName: 'Awa Sossou', lienDeReglement: lien({}) },
  piece: { ...piece, globalDiscountXof: undefined, gesteDeLaMaison: undefined }, prenom: 'Awa', branchId: 'b1', maintenant: new Date(),
});
dit('sans geste, rien à dire', 0, (sansGeste as { gesteXof?: number }).gesteXof);
dit('sans geste, la note entière', 28_000, sansGeste.resteXof);

const fn = lis('supabase/functions/regler-la-seance/index.ts');
vrai('la fonction accepte le sceau', fn.includes("if (b.action === 'sceau') return await sceau(req, b);"));
vrai('la fonction note l’heure du sceau', fn.includes('sceauLe: new Date().toISOString(), moyen'));
vrai('la fonction garde le premier sceau', fn.includes('if (d.lienDeReglement.sceauLe) return json({ ok: true, deja: true });'));
vrai('la fonction prend les quatre moyens et KkiaPay', fn.includes("const MOYENS_DU_SCEAU = ['mtn', 'moov', 'celtiis', 'carte', 'kkiapay'];"));
vrai('la fonction refuse un moyen qu’elle ne connaît pas', fn.includes('!MOYENS_DU_SCEAU.includes(moyen)'));
vrai('la fonction freine le sceau', fn.includes("if (!(await permis(ipOf(req), 'regler-sceau', 30))) return json({ error: 'trop' }, 429);"));
dit('la règle recopiée est la même, mot pour mot', copieAttendue(process.cwd()), copieDuServeur(process.cwd()));

const app = lis('src/apps/regler/App.tsx');
vrai('la page porte le sceau', app.includes('<Sceau montantXof={total}'));
vrai('la page n’a plus de bouton « Régler X »', !app.includes('`Régler ${francs(total)}`'));
vrai('la page écoute le fil', app.includes('ecouteLeFilDuSceau(jeton'));
vrai('la page dit le moyen choisi au Trône', app.includes("void poseLeSceau(jeton, rail)"));
vrai('la page s’en remet au filet sans le fil', app.includes('45_000'));
vrai('le dernier écran dit « Merci. »', app.includes('>Merci.</h2>'));
vrai('le dernier écran signe la Maison', app.includes('>Maison MND</p>'));

const sceau = lis('src/ds/sceau.tsx');
vrai('le sceau tient une seconde', sceau.includes('minuteur.current = window.setTimeout(() => { minuteur.current = null; setTient(false); onTenue(); }, TENUE_DU_SCEAU_MS);'));
vrai('le sceau s’ouvre au clavier', sceau.includes('if (e.detail === 0) onTenue();'));
vrai('le sceau ne part pas du bouton du Trône', sceau.includes('SCEAU_CUIVRE'));

const fil = lis('src/shared/le-fil-du-sceau.ts');
vrai('le fil du téléphone ne reprend pas la session du poste', fil.includes('persistSession: false'));
vrai('le fil du téléphone ne dit que « relis »', fil.includes("c.on('broadcast', { event: SIGNAL_DU_SCEAU }"));
vrai('le client temps réel arrive à la demande', fil.includes("await import('@supabase/supabase-js')"));

const trone = lis('src/apps/trone/routes/clients/ReglementEnDirect.tsx');
const fn2 = lis('supabase/functions/regler-la-seance/index.ts');
vrai('le Trône voit les cinq étapes', trone.includes('ETAPES_DU_FAUTEUIL.map'));
vrai('le Trône souffle sur le fil', trone.includes('souffleSurLeFilDuSceau(jeton)'));
vrai('le Trône offre un geste', trone.includes('Offrir un geste'));
vrai('le geste du Trône entre dans la remise', trone.includes('globalDiscountXof: avant + lu.xof'));
vrai('le geste du Trône se retire', trone.includes('avant - Number(geste.xof)'));

/* ── RÉGLER À DEUX (23 novembre 2026) ─────────────────────────────────── */
dit('le prénom de l invitée se nettoie', ['Fatou', 'Awa N.', ''], [nomDInviteePropre('  Fatou '), nomDInviteePropre('Awa   N.'), nomDInviteePropre('   ')]);
dit('dix-huit signes au plus, comme la maquette', 18, nomDInviteePropre('a'.repeat(30)).length);
const pageInvitee = pageDuLien({
  rdv: { id: 'rdv1', date: '2026-11-22', status: 'honoré', clientName: 'Awa Sossou', lienDeReglement: { jeton: 'abcdefghjkmnpq', creeLe: '2026-11-22T17:00:00Z', invitee: { nom: 'Fatou', le: '2026-11-22T17:41:00Z' } } },
  piece: { id: 'inv1', kind: 'facture', status: 'émise', lines: [{ label: 'Lavage', qty: 1, unitXof: 28_000 }] },
  prenom: 'Awa', branchId: 'b1', maintenant: new Date('2026-11-22T17:42:00Z'), parInvitee: true,
});
dit('la page de l invitée le dit', true, (pageInvitee as { parInvitee?: boolean }).parInvitee);
dit('la page dit qui elle invite', { nom: 'Fatou', le: '2026-11-22T17:41:00Z' }, (pageInvitee as { invitee?: unknown }).invitee);
vrai('la fonction tire un jeton neuf pour l invitée', fn2.includes('lienDInvitee') && fn2.includes('jetonDe(crypto.getRandomValues(new Uint8Array(LONGUEUR_DU_JETON)))'));
vrai('la fonction cherche le rendez-vous par le lien de l invitée', fn2.includes("eq('data->lienDInvitee->>jeton', jeton)"));
vrai('une séance réglée n invite plus', fn2.includes("if (lien.payeLe) return json({ error: 'deja_reglee' }, 409);"));
vrai('la page ne propose pas de régler à deux à l invitée', lis('src/apps/regler/App.tsx').includes('{!p.parInvitee && (') && lis('src/apps/regler/App.tsx').includes('inviteAUnePart(jeton, nom)'));
vrai('le Trône voit qui elle invite', lis('src/apps/trone/routes/clients/ReglementEnDirect.tsx').includes("Elle invite <b"));
/* ── LA SORTIE : SA PROCHAINE PLACE, PUIS LES ÉTOILES (23 novembre 2026) ─ */
vrai('la fonction reçoit sa réponse', fn2.includes("if (b.action === 'prochain') return await prochain(req, b);"));
vrai('la fonction ne prend que les places proposées', fn2.includes("if (!permises.some((x) => x.jour === jour && x.heure === heure)) return json({ error: 'place' }, 400);"));
vrai('une réponse ne se réécrit pas', fn2.includes('if (propose.reponse) return json({ ok: true, deja: true });'));
vrai('le lien de l invitée ne choisit pas sa place', fn2.includes('if (porte.parInvitee) return json({ error: \'lien_introuvable\' }, 404);'));
const reglerPage = lis('src/apps/regler/App.tsx');
vrai('la page dit « Confirmer cette place », jamais « Garder »', reglerPage.includes('Confirmer cette place') && !reglerPage.includes('Garder cette place'));
vrai('la page offre « Modifier » et « Pas maintenant »', reglerPage.includes('>Modifier</button>') && reglerPage.includes('Pas maintenant'));
vrai('les étoiles ont leur page, après la place', reglerPage.includes('Laissez-nous vos étoiles') && reglerPage.includes("const etape = pr && !pr.reponse ? 'place' : (ecran.paye && !etoilesFaite ? 'etoiles' : 'merci');"));
vrai('le Trône propose sa prochaine place', lis('src/apps/trone/routes/clients/ReglementEnDirect.tsx').includes('Proposer cette place'));
/* ── LE QR DE L'INVITATION (23 novembre 2026) ─────────────────────────── */
const qr1 = qrMatrice('https://maisonmnd.com/trone/regler.html?r=abcdefghjkmnpq');
const qr2 = qrMatrice('https://maisonmnd.com/trone/regler.html?r=abcdefghjkmnpq');
vrai('le QR est stable pour une meme adresse', qr1.path === qr2.path && qr1.n > 0);
vrai('deux adresses font deux QR', qrMatrice('a').path !== qrMatrice('b').path);
vrai('la page montre le QR de l invitée', lis('src/apps/regler/App.tsx').includes('<QrSvg valeur={lienDeLInvitee}'));
vrai('le QR se dessine en un seul chemin', qr1.path.startsWith('M') && !qr1.path.includes('<'));
/* ── SES ÉTOILES D'UN TOUCHER (23 novembre 2026) ─────────────────────── */
vrai('la fonction lit le jeton des étoiles deja depose', fn2.includes('async function leJetonDesEtoiles') && fn2.includes('env-${pieceId}-wa-avis'));
vrai('la fonction ne depose aucune demande d avis', !fn2.includes("from('envois').insert"));
vrai('la page ouvre le vrai bouton quand le jeton existe', lis('src/apps/regler/App.tsx').includes('regler.html?e=') && lis('src/apps/regler/App.tsx').includes('Donner mes étoiles'));
vrai('sans jeton, la page dit « ce soir »', lis('src/apps/regler/App.tsx').includes('La Maison vous écrit ce soir sur WhatsApp'));
/* ── LA GAMME AU FAUTEUIL (23 novembre 2026) ──────────────────────────── */
vrai('la fonction rend la gamme de sa maison', fn2.includes('async function laGammeDeLaMaison') && fn2.includes("from('catalog_products')"));
vrai('le prix vient du catalogue, jamais du telephone', fn2.includes('unitXof: produit.xof') && fn2.includes("if (!produit) return json({ error: 'produit' }, 400);"));
vrai('un seul produit, une seule ligne', fn2.includes("if (lignes.some((l) => l.id === id)) return json({ ok: true, deja: true });"));
vrai('une seance reglee n ajoute plus rien', fn2.includes("if (d.status === 'payée' || resteDeLaPiece({ ...d, id: piece.id }) <= 0) return json({ error: 'deja_reglee' }, 409);"));
const pageRegler = lis('src/apps/regler/App.tsx');
vrai('la page a son etagere et son retour', pageRegler.includes('La Gamme · prendre un soin') && pageRegler.includes('Visez l’étiquette.') && pageRegler.includes('Retour à ma note'));
vrai('la ligne de la Gamme se retire', pageRegler.includes('retireLeProduit(l.produitId!)'));
vrai('le Trone dit ce qu il faut lui remettre', lis('src/apps/trone/routes/clients/ReglementEnDirect.tsx').includes('La Gamme · à lui remettre'));
console.log(`\n${n - ko}/${n} vérifications${ko ? `, ${ko} en échec` : ''}.`);
process.exit(ko ? 1 : 0);
