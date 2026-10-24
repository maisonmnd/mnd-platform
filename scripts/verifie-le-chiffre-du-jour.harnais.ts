/* LE CHIFFRE DU JOUR ET CE QU'ELLE DOIT, ÉPROUVÉS — `node scripts/verifie-le-chiffre-du-jour.mjs`.

   24 octobre 2026 : « Je veux le chiffre d'affaires attendu de la journée
   dans le Carnet ou sur le tableau de bord » (au sélecteur : les deux, rituels
   et Gamme posée) ; puis « je veux voir les 2 montants, 67 000 F et 9 000 F,
   dans ce qu'elle doit » (Yéman, A. S.). La règle (clients/chiffre-du-jour-
   pur.ts), le tableau de bord, le Carnet et le bloc « Ce qu'elle doit ».
   Tout est inventé. Sortie ASCII : la console de Windows. */
import { chiffreAttenduDuJour, type RdvDuChiffre } from '../src/apps/trone/routes/clients/chiffre-du-jour-pur';
import { readFileSync } from 'node:fs';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

/* ── La règle ─────────────────────────────────────────────────────────── */
const JOUR = '2026-10-24';
const rdv = (o: Partial<RdvDuChiffre>): RdvDuChiffre => ({ date: JOUR, status: 'confirmé', rituelXof: 50000, resteRituelXof: 50000, ...o });
dit('une journee : deux rituels, une Gamme posee ; un paye d avance, l autre a venir', {
  nombre: 2, attenduXof: 129000, rituelsXof: 120000, gammeXof: 9000, encaisseXof: 76000, resteXof: 53000,
}, chiffreAttenduDuJour([
  rdv({ rituelXof: 67000, resteRituelXof: 0, gamme: [{ id: 'p-huile', qty: 1, prixXof: 9000, regleeAt: '2026-10-24' }] }),
  rdv({ rituelXof: 53000, resteRituelXof: 53000 }),
], JOUR));
dit('les annules et les autres jours ne comptent pas', { nombre: 1, attenduXof: 50000, rituelsXof: 50000, gammeXof: 0, encaisseXof: 0, resteXof: 50000 },
  chiffreAttenduDuJour([rdv({}), rdv({ status: 'annulé' }), rdv({ date: '2026-10-25' })], JOUR));
dit('une Gamme a regler reste a encaisser ; un acompte deja recu se lit dans le reste du rituel', { nombre: 1, attenduXof: 64000, rituelsXof: 50000, gammeXof: 14000, encaisseXof: 20000, resteXof: 44000 },
  chiffreAttenduDuJour([rdv({ resteRituelXof: 30000, gamme: [{ id: 'p-brume', qty: 2, prixXof: 7000 }] })], JOUR));
dit('un honore impaye compte, un reste plus grand que le rituel ne deborde pas', [50000, 50000],
  (() => { const j = chiffreAttenduDuJour([rdv({ status: 'honoré', resteRituelXof: 90000 })], JOUR); return [j.attenduXof, j.resteXof]; })());
dit('une journee vide : zero partout', { nombre: 0, attenduXof: 0, rituelsXof: 0, gammeXof: 0, encaisseXof: 0, resteXof: 0 }, chiffreAttenduDuJour([], JOUR));

/* ── Les écrans ──────────────────────────────────────────────────────── */
const tableau = sansCommentaires('src/apps/trone/routes/pilotage/Dashboard.tsx');
dit('le tableau de bord le dit en tete du carnet du jour, sur les rendez-vous du jour', [true, true], [
  tableau.includes('const j = chiffreAttenduDuJour(todayRows.map((a) => ({ date: a.date, status: a.status, rituelXof: apptNetXof(a, byId), resteRituelXof: apptDueXof(a, byId), gamme: a.gamme, })), today);'),
  tableau.includes('Attendu aujourd’hui')]);
const carnet = sansCommentaires('src/apps/trone/routes/clients/Carnet.tsx');
dit('le Carnet en fait une tuile, avec le meme calcul', [true, true], [
  carnet.includes('jour: chiffreAttenduDuJour(vivants.map((a) => ({ date: a.date, status: a.status, rituelXof: apptNetXof(a, byId), resteRituelXof: apptDueXof(a, byId), gamme: a.gamme, })), todayISO()),'),
  carnet.includes('Attendu · aujourd’hui')]);
const rituel = sansCommentaires('src/apps/trone/routes/clients/actions.tsx');
dit('« Ce qu elle doit » dit le rituel et chaque ligne de Gamme, reglee ou a regler', [true, true, true], [
  rituel.includes('{gammeDuRdvXof > 0 ? ('),
  rituel.includes("{l.regleeAt ? `réglée le ${frShortAn(l.regleeAt)}` : 'à régler'}"),
  rituel.includes('{fmtMoney(net + gammeDuRdvXof, currency)}')]);
dit('... deja encaisse compte la Gamme reglee, le total du ce qu il en reste', [true, true], [
  rituel.includes('−{fmtMoney(alreadyPaid + gammeRegleeXof, currency)}'),
  rituel.includes('{fmtMoney(due + gammeARegler, currency)}')]);

console.log(`\n${n - ko}/${n} epreuves : le chiffre du jour et ce qu elle doit.`);
if (ko) console.log(`${ko} ECHEC(S).`);
