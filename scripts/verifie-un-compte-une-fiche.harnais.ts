/* UN COMPTE, UNE FICHE, ÉPROUVÉ — `node scripts/verifie-un-compte-une-fiche.mjs`.

   14 novembre 2026 (Jocelyne S. : deux fiches au même compte, ses trois
   filles et ses rendez-vous invisibles dans Ma Couronne). Ma Couronne ne crée
   plus de seconde fiche pour un compte qui en a une ; la fusion du Trône fond
   deux fiches au même compte ; le réparateur du Trône ne fait plus renaître
   une fiche effacée ; la base ignore une seconde fiche au même compte (0210).
   Sortie ASCII : la console de Windows. */
import { ensureClient, ficheDejaPortee } from '../src/apps/couronne/lib';
import { clientsStore, type Client } from '../src/shared/clients';
import { survivantDe } from '../src/shared/fusion';
import { readFileSync } from 'node:fs';

let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) process.exitCode = 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const lf = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const fiche = (o: Partial<Client> & { id: string }): Client => ({
  branchId: 'b1', name: 'Jocelyne S.', phone: '', city: '', persona: '', since: '2026-05-29', segments: [], priceCoef: 1, loyaltyPoints: 0, ...o,
} as Client);

/* ── ① LE VERDICT DU SERVEUR ────────────────────────────────────────── */
dit('le serveur connait deja ma fiche, sous un autre identifiant : rien ne nait', 'MND-ANCIENNE', ficheDejaPortee({ statut: 'ok', ficheId: 'MND-ANCIENNE' }, 'u-1'));
dit('la fiche du serveur est celle de l app : on continue', null, ficheDejaPortee({ statut: 'ok', ficheId: 'u-1' }, 'u-1'));
dit('aucune fiche, ou adoptee : le verdict ne bloque pas', [null, null], [ficheDejaPortee({ statut: 'aucune' }, 'u-1'), ficheDejaPortee({ statut: 'adoptee', ficheId: 'X' }, 'u-1')]);

/* ── ② LA DERNIÈRE CEINTURE DE ensureClient ────────────────────────── */
clientsStore.set([fiche({ id: 'MND-ANCIENNE', authUserId: 'u-1', email: 'j@exemple.bj', familyId: 'fam-1' })]);
ensureClient('u-1', 'j@exemple.bj', 'b1', 'Jocelyne S.', 'u-1');
dit('une fiche porte deja ce compte : aucune seconde fiche', ['MND-ANCIENNE'], clientsStore.get().map((c) => c.id));
clientsStore.set([]);
ensureClient('u-2', 'k@exemple.bj', 'b1', 'Kafui', 'u-2');
dit('un compte neuf, sans fiche : la fiche nait a son nom', [['u-2', 'u-2', 'Kafui']], clientsStore.get().map((c) => [c.id, c.authUserId, c.name]));
clientsStore.set([fiche({ id: 'u-3', authUserId: 'u-3', email: 'l@exemple.bj', phone: '' })]);
ensureClient('u-3', 'l@exemple.bj', 'b1', 'L', 'u-3');
dit('sa propre fiche existe : rien ne s ajoute', 1, clientsStore.get().length);

/* ── ③ LA FUSION DU TRÔNE ───────────────────────────────────────────── */
const ancienne = fiche({ id: 'MND-ANCIENNE', authUserId: 'u-1' });
const neuve = fiche({ id: 'u-1', authUserId: 'u-1' });
const survit = (x: ReturnType<typeof survivantDe>) => ('erreur' in x ? 'refus' : `${x.survivant.id}<${x.absorbee.id}`);
dit('meme compte sur deux fiches : la fiche du compte reste, d ou qu on ouvre', ['u-1<MND-ANCIENNE', 'u-1<MND-ANCIENNE'], [survit(survivantDe(ancienne, neuve)), survit(survivantDe(neuve, ancienne))]);
dit('deux comptes differents : toujours refuse', 'refus', survit(survivantDe(fiche({ id: 'a', authUserId: 'u-a' }), fiche({ id: 'b', authUserId: 'u-b' }))));
dit('un seul compte : la fiche du compte reste (inchange)', 'u-1<x', survit(survivantDe(fiche({ id: 'x' }), neuve)));

/* ── ④ LES BRANCHEMENTS ─────────────────────────────────────────────── */
const lib = lf('src/apps/couronne/lib.ts');
dit('Ma Couronne ecoute le verdict avant de creer', [true, true, true], [
  /const portee = ficheDejaPortee\(verdict, clientId\);\n\s*if \(portee\) \{/.test(lib),
  /relisUneFoisPour\(uid\)/.test(lib) && /sessionStorage\.getItem\(CLE_RELU\) === uid/.test(lib),
  /c\.id !== clientId && c\.authUserId === compte\)\) return;/.test(lib),
]);
const rec = lf('src/apps/trone/shell/useReconcileClients.ts');
dit('le reparateur ne cree que pour un identifiant porte MAINTENANT', true,
  /for \(const a of appointmentsStore\.get\(\)\) if \(a\.clientId\) portes\.add\(a\.clientId\);[\s\S]{0,300}if \(!portes\.has\(id\) \|\| connues\.has\(id\)\) missing\.delete\(id\);/.test(rec));
const sql = lf('supabase/migrations/0210_un_compte_une_fiche.sql');
dit('0210 : avant chaque fiche creee, le meme compte ailleurs est ignore, le personnel passe', [true, true, true, true], [
  /before insert on public\.clients/.test(sql), /return null;/.test(sql), /public\.is_staff\(\)/.test(sql), /security definer/.test(sql),
]);

console.log(`\n${n} verifications.`);
if (process.exitCode) console.log('ECHEC : un compte peut encore ouvrir deux fiches.');
else console.log('TOUT VA BIEN : un compte, une fiche.');
