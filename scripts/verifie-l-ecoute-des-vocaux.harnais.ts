/* OPALE ÉCOUTE LES VOCAUX, ÉPROUVÉ · 18 novembre 2026.
   `node scripts/verifie-l-ecoute-des-vocaux.mjs` (et `--prouve`).

   « Opale doit être en mesure d'écouter, de comprendre les audios et de
   répondre directement » (Yéman). Claude n'entend pas un son : la réception
   passe le vocal à Whisper chez Groq (le moteur de VoxBubble, clé à part
   GROQ_API_KEY), écrit sa transcription sur le message, et Opale la lit.
   Choix de Yéman : un vocal que la Maison n'a pas compris fait passer la
   main SANS RIEN DIRE.

   Chaque attente est écrite à la main, d'après la règle. Textes inventés.
   Sortie ASCII : la console de Windows. */
import { readFileSync } from 'node:fs';
import {
  MOTEUR_DU_VOCAL, SIGNES_D_UNE_TRANSCRIPTION_AU_PLUS, lisLaTranscription, nomPourLeMoteur, texteDuVocal, vocalPasCompris,
} from '../src/shared/ecoute-du-vocal-pur';
import { consigneDOpale, contexteDOpale, vocalIncomprisDansLeTour, type ContexteDOpale } from '../src/shared/opale-pur';

let ko = 0; let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const LE = '2026-11-18T09:28:00.000Z';
const juge = (r: unknown) => { const t = lisLaTranscription(r, LE); return [t.compris, t.texte, t.langue ?? null, t.motif ?? null]; };

/* ── 1. Compris : du français ou de l'anglais, des mots ── */
dit('un vocal en francais : compris, son texte, « fr »', [true, 'Bonjour, je voudrais un rendez-vous samedi pour mon resserrage.', 'fr', null],
  juge({ text: '  Bonjour, je voudrais un rendez-vous   samedi pour mon resserrage. ', language: 'french', segments: [{ no_speech_prob: 0.02 }, { no_speech_prob: 0.05 }] }));
dit('la langue dite en code ou en majuscules : « fr »', ['fr', 'fr'], [lisLaTranscription({ text: 'Merci beaucoup', language: 'fr' }, LE).langue, lisLaTranscription({ text: 'Merci beaucoup', language: 'French' }, LE).langue]);
dit('un vocal en anglais : compris, « en »', [true, 'Hello, can I come on Saturday?', 'en', null], juge({ text: 'Hello, can I come on Saturday?', language: 'english' }));
dit('le moteur et l instant sont notes', [MOTEUR_DU_VOCAL, LE], [lisLaTranscription({ text: 'Oui', language: 'fr' }, LE).moteur, lisLaTranscription({ text: 'Oui', language: 'fr' }, LE).le]);
dit('un long vocal se coupe a la longueur permise', SIGNES_D_UNE_TRANSCRIPTION_AU_PLUS, lisLaTranscription({ text: 'a'.repeat(5000), language: 'fr' }, LE).texte.length);

/* ── 2. Pas compris, et pourquoi : jamais un texte qu'Opale pourrait croire ── */
dit('une autre langue (le yoruba, le fon pris pour autre chose) : pas compris, « langue », sans texte', [false, '', 'yoruba', 'langue'], juge({ text: 'E kaaro, se daadaa ni', language: 'yoruba' }));
dit('une langue absente : pas compris, « langue »', [false, '', null, 'langue'], juge({ text: 'Mi nyi dekpe' }));
dit('rien dit, ou des points : « vide »', [[false, 'vide'], [false, 'vide']],
  [juge({ text: '', language: 'french' }), juge({ text: ' ... ', language: 'french' })].map((x) => [x[0], x[3]]));
dit('le moteur n entend pas de parole (moyenne au-dela de 0,6) : « bruit »', [false, '', 'fr', 'bruit'], juge({ text: 'Euh', language: 'french', segments: [{ no_speech_prob: 0.9 }, { no_speech_prob: 0.7 }] }));
dit('... mais un segment douteux parmi des nets reste compris', true, lisLaTranscription({ text: 'Je serai la a dix heures', language: 'french', segments: [{ no_speech_prob: 0.9 }, { no_speech_prob: 0.05 }, { no_speech_prob: 0.05 }] }, LE).compris);
dit('les sous-titres que Whisper ecrit sur du silence : « bruit »', [[false, 'bruit'], [false, 'bruit']],
  [juge({ text: 'Sous-titres realises par la communaute d\'Amara.org', language: 'french' }), juge({ text: "Merci d'avoir regarde cette video !", language: 'french' })].map((x) => [x[0], x[3]]));
dit('une reponse illisible du moteur : « illisible »', [[false, 'illisible'], [false, 'illisible']], [juge(null), juge('du texte')].map((x) => [x[0], x[3]]));
dit('pas compris, construit a la main : sans texte, avec son motif', { compris: false, texte: '', motif: 'moteur', moteur: MOTEUR_DU_VOCAL, le: LE }, vocalPasCompris('moteur', LE));

/* ── 3. La lecture d'une ligne de la base, le nom pour le moteur ── */
dit('texteDuVocal : le texte compris, rien sinon, rien d une ligne sans transcription', ['Je confirme', '', '', ''],
  [texteDuVocal({ compris: true, texte: ' Je confirme ' }), texteDuVocal({ compris: false, texte: 'Je confirme' }), texteDuVocal(undefined), texteDuVocal('Je confirme')]);
dit('le nom pour le moteur : garde son extension, sinon celle de son format (ogg par defaut)', ['vocal.ogg', 'vocal.ogg', 'vocal.mp3', 'note.m4a'],
  [nomPourLeMoteur('vocal.ogg', 'audio/ogg'), nomPourLeMoteur('vocal', 'audio/ogg; codecs=opus'), nomPourLeMoteur('', 'audio/mpeg'), nomPourLeMoteur('note', 'audio/mp4')]);

/* ── 4. Opale : elle lit la transcription, et passe la main pour un vocal incompris ── */
dit('un vocal sans transcription comprise dans ses nouveaux messages : la main passe', [true, true, false, false], [
  vocalIncomprisDansLeTour([{ type: 'audio' }]),
  vocalIncomprisDansLeTour([{ type: 'text' }, { type: 'audio', transcription: '  ' }]),
  vocalIncomprisDansLeTour([{ type: 'audio', transcription: 'Je viens samedi' }]),
  vocalIncomprisDansLeTour([{ type: 'text' }, { type: 'image' }]),
]);
const c: ContexteDOpale = {
  maintenantMs: Date.parse(LE), aujourdhui: '2026-11-18', heureDuJour: '10 h', reouverture: null, heures: [], fiches: [], rdvs: [], connaitLeLieu: false,
  adresse: 'Ilot 130-F', liens: { catalogue: 'c', creation: 'cr', reparation: 'r' }, paiements: [], offres: [], catalogue: ['sv · Lavage · 8 000 F'],
  fil: [{ sens: 'entrant', texte: 'un message vocal', type: 'audio', quand: '2026-11-17T19:51:00Z' }],
  nouveaux: [{ sens: 'entrant', texte: 'un message vocal', type: 'audio', quand: LE, transcription: 'Bonjour, je voudrais savoir le prix du resserrage.' }],
  nomDe: (x) => x,
};
const ctx = contexteDOpale(c);
dit('le contexte : sa transcription entre guillemets ; un vieux vocal sans elle reste « [un message vocal] »', [true, true],
  [ctx.includes('[un message vocal ; sa transcription automatique : « Bonjour, je voudrais savoir le prix du resserrage. »]'), ctx.includes('Elle : [un message vocal]')]);
const consigne = consigneDOpale();
dit('la consigne : elle repond aux vocaux transcrits, sans dire qu elle les a lus ; elle ne demande plus de les ecrire', [true, false, true],
  [consigne.includes('LES VOCAUX : la Maison les écoute pour toi.'), consigne.includes('Un vocal ou une vidéo : tu ne les entends pas'), consigne.includes('sans dire que tu l’as lu ni écouté')]);

/* ── 5. La lettre : la reception, l'automate, le Trone ── */
const webhook = sansCommentaires(lis('supabase/functions/whatsapp-webhook/index.ts'));
const automate = sansCommentaires(lis('supabase/functions/whatsapp-automate/index.ts'));
const ecran = sansCommentaires(lis('src/apps/trone/routes/clients/LesConversations.tsx'));
dit('la reception ecoute le vocal range, avec la cle a part, et l ecrit sur le message', [true, true, true, true], [
  webhook.includes("const cleDuMoteur = Deno.env.get('GROQ_API_KEY') ?? '';"),
  webhook.includes("if (e.media.genre === 'audio' && cleDuMoteur) vocaux.set(e.waId, await ecouteLeVocal(lu.octets, type, nom, cleDuMoteur));"),
  webhook.includes('...(vocaux.has(e.waId) ? { transcription: vocaux.get(e.waId) } : {}),'),
  webhook.indexOf('vocaux.set(e.waId, await ecouteLeVocal(') < webhook.indexOf("await sb.from('messages_wa')\n      .upsert(lignes"),
]);
dit('... par le moteur de VoxBubble, sa reponse detaillee, les mots de la Maison souffles', [true, true, true], [
  webhook.includes("corps.append('model', MOTEUR_DU_VOCAL);"), webhook.includes("corps.append('response_format', 'verbose_json');"), webhook.includes("corps.append('prompt', MOTS_SOUFFLES);"),
]);
const journalDuVocal = (webhook.match(/dis\('vocal · [^']*', \{[^}]*\}\)/g) ?? []).join(' ');
dit('... et son journal ne dit jamais le texte', [true, false], [journalDuVocal.length > 0, /texte:|t\.texte\b(?!\.length)/.test(journalDuVocal)]);
dit('Opale lit la transcription dans son fil et ses nouveaux messages', [true, true, true], [
  automate.includes("...(d.type === 'audio' && texteDuVocal(d.transcription) ? { transcription: texteDuVocal(d.transcription) } : {}),"),
  automate.includes("...(m.type === 'audio' && texteDuVocal(m.transcription) ? { transcription: texteDuVocal(m.transcription) } : {}),"),
  automate.includes('...(d.transcription ? { transcription: d.transcription } : {}),'),
]);
dit('un vocal incompris : la main passe sans un mot, avec l alerte, et Claude n est pas appele', [true, true, true, true], [
  /const vocalIncompris = !finDuRituel && !o\.relance && vocalIncomprisDansLeTour\(nouveaux\);\s*if \(vocalIncompris\) \{\s*issue\.silence = true;\s*issue\.issue = \{ genre: 'main', motif: motifDuFilDOpale\('media'\) \};\s*issue\.alerte = alerteDeLAutomate\(/.test(automate),
  /* Le toucher d'une place et « Changer l'heure » se servent aussi sans Claude (19 novembre 2026). */
  automate.includes('let secours = !claude && !finDuRituel && !vocalIncompris && !parLeCode;'),
  automate.includes('if (claude && !finDuRituel && !vocalIncompris && !parLeCode) {'),
  automate.indexOf('const vocalIncompris =') > automate.indexOf('const nouveaux: MessageDuFilDOpale[]'),
]);
dit('le Trone montre la transcription sous le vocal, ou pourquoi elle manque', [true, true], [
  ecran.includes("{m?.sens === 'entrant' && m.type === 'audio' && m.transcription && ("), ecran.includes('<i>Transcription automatique</i>'),
]);
dit('pas de tiret cadratin dans le pur', false, lis('src/shared/ecoute-du-vocal-pur.ts').includes(String.fromCharCode(0x2014)));

console.log(ko === 0 ? `\nL ecoute des vocaux tient (${n} controles).` : `\n${ko} controle(s) en echec sur ${n}.`);
process.exitCode = ko === 0 ? 0 : 1;
