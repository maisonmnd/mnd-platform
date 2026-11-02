/* L'ACCORD DES NOUVELLES DEMANDÉ SUR WHATSAPP, ÉPROUVÉ — `node scripts/verifie-l-accord-whatsapp.mjs`.

   Maquette « Nouvelles par WhatsApp » (Q6aGAyTUKKJc6c2roJgHhN), choix de Yéman
   au sélecteur le 2 novembre 2026 : une seule fois, après « Oui, je viens »
   et après un reçu, dans la fenêtre de 24 heures ; deux nouvelles par mois au
   plus. La règle (src/shared/accord-whatsapp-pur.ts), le reçu du Trône
   (src/shared/recu-whatsapp.ts) et la copie du webhook. Fiches inventées.
   Sortie ASCII : la console de Windows. */
import {
  QUESTION_DE_L_ACCORD, BOUTONS_DE_L_ACCORD, BOUTON_ACCORD_OUI, BOUTON_ACCORD_NON, PLAFOND_DES_NOUVELLES_PAR_MOIS,
  doitDemanderLAccord, accordDuBouton, nouvellesDuMois, promesseTenue,
} from '../src/shared/accord-whatsapp-pur';
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
};

/* 1. La question et ses boutons. */
dit('A1 la question promet deux messages par mois et STOP', true, /Deux messages par mois au plus, et STOP/.test(QUESTION_DE_L_ACCORD));
dit('A2 la voix de la Maison : ni salon, ni point d exclamation, ni tiret long', [false, false, false],
  [/salon/i.test(QUESTION_DE_L_ACCORD), /!/.test(QUESTION_DE_L_ACCORD), /—/.test(QUESTION_DE_L_ACCORD)]);
dit('A3 deux boutons de vingt signes au plus', [2, true], [BOUTONS_DE_L_ACCORD.length, BOUTONS_DE_L_ACCORD.every((b) => b.titre.length <= 20)]);
dit('A4 le plafond promis est deux', 2, PLAFOND_DES_NOUVELLES_PAR_MOIS);

/* 2. Quand elle se pose, et quand jamais. */
const neuve = { segments: [] as string[] };
const o = (moment: 'oui-je-viens' | 'recu', fenetreOuverte = true, estEnfant = false) => ({ moment, fenetreOuverte, estEnfant });
dit('A5 une fiche neuve, apres Oui je viens : oui', true, doitDemanderLAccord(neuve, o('oui-je-viens')).oui);
dit('A6 une fiche neuve, apres un recu : oui', true, doitDemanderLAccord(neuve, o('recu')).oui);
dit('A7 deja oui : jamais', 'deja-repondu', (doitDemanderLAccord({ nouvelles: { oui: true, le: '2026-10-01', par: 'comptoir' } }, o('recu')) as { pourquoi: string }).pourquoi);
dit('A8 deja non : jamais', 'deja-repondu', (doitDemanderLAccord({ nouvelles: { oui: false, le: '2026-10-01', par: 'whatsapp' } }, o('recu')) as { pourquoi: string }).pourquoi);
dit('A9 STOP : jamais', 'stop', (doitDemanderLAccord({ nouvelles: { oui: false, le: '2026-10-01', par: 'stop' } }, o('recu')) as { pourquoi: string }).pourquoi);
dit('A10 deja demandee sur WhatsApp : jamais, meme sans reponse', 'deja-demande', (doitDemanderLAccord({ nouvellesDemandeesLe: '2026-11-01' }, o('oui-je-viens')) as { pourquoi: string }).pourquoi);
dit('A11 archivee : jamais', 'archivee', (doitDemanderLAccord({ archived: true }, o('recu')) as { pourquoi: string }).pourquoi);
dit('A12 enfant mineur : jamais', 'enfant', (doitDemanderLAccord(neuve, o('recu', true, true)) as { pourquoi: string }).pourquoi);
dit('A13 fiche Enfant : jamais', 'enfant', (doitDemanderLAccord({ segments: ['Enfant'] }, o('oui-je-viens')) as { pourquoi: string }).pourquoi);
dit('A14 fenetre fermee : jamais', 'fenetre', (doitDemanderLAccord(neuve, o('recu', false)) as { pourquoi: string }).pourquoi);
dit('A15 un autre moment : jamais', 'moment', (doitDemanderLAccord(neuve, { moment: 'confirmation' as 'recu', fenetreOuverte: true, estEnfant: false }) as { pourquoi: string }).pourquoi);

/* 3. La reponse. */
dit('A16 oui : accord date, source whatsapp', { oui: true, le: '2026-11-03', par: 'whatsapp' }, accordDuBouton(BOUTON_ACCORD_OUI, '2026-11-03T09:15:00.000Z'));
dit('A17 non : refus date, source whatsapp', { oui: false, le: '2026-11-03', par: 'whatsapp' }, accordDuBouton(BOUTON_ACCORD_NON, '2026-11-03T09:15:00.000Z'));
dit('A18 un autre bouton : rien', null, accordDuBouton('GERARD:x:oui', '2026-11-03T09:15:00.000Z'));

/* 4. La promesse des deux messages par mois. */
const t0 = Date.parse('2026-11-30T10:00:00Z');
const jours = (j: number) => new Date(t0 - j * 86_400_000).toISOString();
const envois = [
  { genre: 'envie', quand: jours(3), statut: 'envoyé' },
  { genre: 'garder', quand: jours(2), statut: 'envoyé' },
  { genre: 'rappel', quand: jours(1), statut: 'envoyé' },
  { genre: 'fetes', quand: jours(10), statut: 'annulé' },
  { genre: 'endormie', quand: jours(31), statut: 'envoyé' },
];
dit('A19 garder, rappel et annule ne comptent pas ; trente et un jours non plus', 1, nouvellesDuMois(envois, t0));
dit('A20 une seule ce mois : la promesse permet une de plus', true, promesseTenue(nouvellesDuMois(envois, t0)));
dit('A21 deux ce mois : plus rien', false, promesseTenue(nouvellesDuMois([...envois, { genre: 'place', quand: jours(5), statut: 'envoyé' }], t0)));

/* 5. Le recu du Trone. */
const recu = readFileSync('src/shared/recu-whatsapp.ts', 'utf8');
dit('A22 la question suit un recu parti en mot libre seulement', true, /if \(r\.ok\) void demandeLAccordApresLeRecu\(o\.client, o\.parQui\);\s*\n\s*if \(!r\.ok && \/fenêtre\/i\.test\(r\.erreur\)\)/.test(recu));
dit('A23 le moment est le recu, la fenetre ouverte, l enfant juge par son age', true, /doitDemanderLAccord\(fiche, \{ moment: 'recu', fenetreOuverte: true, estEnfant: estMineur\(fiche, aujourdhui\) \}\)/.test(recu));
dit('A24 une cle unique par personne : deux postes ne la posent pas deux fois', true, recu.includes('cleUnique: `accord-nouvelles-${fiche.id}`'));
dit('A25 la fiche garde le jour de la question, seulement si elle est partie', true, /if \(!r\.ok\) return false;\s*\n\s*clientsStore\.set\(\(prev\) => prev\.map\(\(c\) => \(c\.id === fiche\.id \? \{ \.\.\.c, nouvellesDemandeesLe: aujourdhui \} : c\)\)\);/.test(recu));

/* 6. La copie du webhook, a l identique. */
const borne = (t: string) => {
  const a = t.indexOf('/* ⟨accord-whatsapp⟩ */');
  const b = t.indexOf('/* ⟨/accord-whatsapp⟩ */');
  return a >= 0 && b > a ? t.slice(a, b).replace(/\r\n/g, '\n').replace(/^export /gm, '') : null;
};
const original = borne(readFileSync('src/shared/accord-whatsapp-pur.ts', 'utf8'));
const copie = borne(readFileSync('supabase/functions/whatsapp-webhook/index.ts', 'utf8'));
dit('A26 le webhook porte le bloc de l accord', true, copie !== null);
dit('A27 le bloc du webhook est celui du depot, mot pour mot', true, copie !== null && original !== null && copie === original);

console.log(`\n${n - ko}/${n} epreuves tenues${ko ? ` ; ${ko} en echec` : ''}.`);
