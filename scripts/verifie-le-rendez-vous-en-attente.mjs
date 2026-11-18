import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/* LE RENDEZ-VOUS EN ATTENTE, EPROUVE - 17 novembre 2026.
   `node scripts/verifie-le-rendez-vous-en-attente.mjs` : le banc
   (verifie-le-rendez-vous-en-attente.harnais.ts), dans un processus fils. Il
   importe la VRAIE fonction demande-submit : esbuild remplace ses imports
   `npm:` par une base, un Meta et un Deno simules. Rien ne touche la vraie
   base, aucun message ne part.
   `--prouve` : chaque faute est posee une a une dans le vrai fichier (dans
   l'original ET dans ses copies quand la regle est recopiee : c'est la regle
   qui doit crier, pas la comparaison des copies), copie gardee, restauration
   dans un finally, empreintes comparees ; le banc doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const HARNAIS = path.join(racine, 'scripts/verifie-le-rendez-vous-en-attente.harnais.ts');

const fauxModules = {
  name: 'faux-du-banc',
  setup(b) {
    b.onResolve({ filter: /^(npm:|https:\/\/esm\.sh)/ }, (a) => ({ path: a.path, namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, (a) => ({
      loader: 'js',
      contents: /supabase-js/.test(a.path)
        ? 'export const createClient = (...a) => globalThis.__faux.client(...a);'
        : 'export default { setVapidDetails() {}, async sendNotification() { return {}; } };',
    }));
  },
};

async function lanceLeBanc() {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-rendez-vous-en-attente-'));
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [HARNAIS], bundle: true, format: 'esm', platform: 'node', target: 'es2022',
      outfile: sortie, logLevel: 'silent', plugins: [fauxModules], loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
    });
    return spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
  } catch (e) {
    return { status: 3, stdout: '', stderr: String(e?.message ?? e) };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

const PUR = 'src/shared/rendez-vous-en-attente-pur.ts';
const DS = 'supabase/functions/demande-submit/index.ts';
const CONF = 'supabase/functions/confirmation-rdv/index.ts';
const WH = 'supabase/functions/whatsapp-webhook/index.ts';
const SQL = 'supabase/migrations/0222_le_rendez_vous_en_attente.sql';
const DEPL = 'supabase/migrations/0223_deplacer_sous_le_verrou.sql';
const GARDE = 'supabase/migrations/0224_ma_couronne_passe_par_le_serveur.sql';
/** La regle recopiee : l'original et ses deux copies, ensemble. */
const REGLE = [PUR, DS, CONF];

/** [ce qui casse, le ou les fichiers, le texte juste, le texte faux] */
const PANNES = [
  /* ── Les deux heures ── */
  ['les deux heures deviennent trois', REGLE, 'export const DELAI_DE_L_ATTENTE_MS = 2 * 3_600_000;', 'export const DELAI_DE_L_ATTENTE_MS = 3 * 3_600_000;'],
  ['la place se libere avant son echeance', REGLE, 'return Number.isFinite(t) && Number.isFinite(maintenantMs) && t <= maintenantMs;', 'return Number.isFinite(t) && Number.isFinite(maintenantMs) && t - 120_000 <= maintenantMs;'],
  ['la base libere sans regarder l echeance', SQL, "       and a.data->>'attenduJusquAu' <= maintenant\n", ''],
  ['la base libere une place deja confirmee', SQL, '       and public.rdv_en_attente(a.data)\n', ''],
  ['la naissance oublie de taire les rappels', REGLE, '{ suggereLe: new Date(maintenantMs).toISOString(), attenduJusquAu:', "{ suggereLe: '', attenduJusquAu:"],
  /* ── Son oui, et l'acompte ── */
  ['un oui sans l acompte recu fait ferme', REGLE, '  return acompteAttendu(a) <= 0 || a.depositConfirmed === true;\n}', '  return true;\n}'],
  ['son oui ne laisse pas le temps de regler l acompte', REGLE, '  const sursis = maintenantMs + SURSIS_DE_L_ACOMPTE_MS;', '  const sursis = 0;'],
  ['un autre numero confirme pour elle', DS, "    if (String(a.cleDuNumero ?? '') !== cle) return json({ pris: true, etat: 'numero-etranger' });\n", ''],
  ['la reponse s ouvre sans la cle service', DS, "async function reponseALAttente(req: Request, body: Record<string, unknown>): Promise<Response> {\n  if (!appelDuServeur(req)) return json({ error: 'reserve' }, 401);\n", 'async function reponseALAttente(req: Request, body: Record<string, unknown>): Promise<Response> {\n'],
  /* ── « Je confirme », écrit, pour toutes ses places (18 novembre 2026) ── */
  ['un « je confirme » ecrit ne confirme aucune de ses places', DS, "    if (siennes.length > 1) return geste === 'ok' ? await confirmeSesPlaces(numero, siennes) : json({ pris: false });", '    if (siennes.length > 1) return json({ pris: false });'],
  ['un « je confirme » ecrit ne confirme que la premiere de ses places', DS, '  for (const place of places) {\n    let ligne: RdvDuSite | null = place;', '  for (const place of places.slice(0, 1)) {\n    let ligne: RdvDuSite | null = place;'],
  ['la reference citee confirme toutes ses places', DS, '    if (citee) return [citee];', "    if (citee) return lignes.filter((x) => etatDeLAttente(x.data) === 'sans-reponse');"],
  ['un « je confirme » ecrit confirme une place deja rendue', DS, "      if (etatDeLAttente(a) !== 'sans-reponse') break;\n", ''],
  ['la phrase ne dit qu une de ses places', REGLE, "\\n${lignes.join('\\n')}\\nLa Maison vous attend.`;", "\\n${lignes.slice(0, 1).join('\\n')}\\nLa Maison vous attend.`;"],
  /* ── La bascule ── */
  ['la bascule ne regarde pas l approbation', DS, "  return (modeles as { nom?: unknown; etat?: unknown }[]).some((m) => m?.nom === nom && String(m?.etat ?? '').toUpperCase() === 'APPROVED') ? nom : '';", '    return nom;'],
  ['un refus du modele laisse la place en attente', DS, '    if (attenteNonPartie(partie)) {', '    if (false) {'],
  /* ── Un message qui ne part pas, ou n'arrive pas (18 novembre 2026) ── */
  ['un echec de l envoi laisse la place en attente', DS, "const attenteNonPartie = (partie: string): boolean => partie !== 'envoyé' && partie !== 'en-cours';", "const attenteNonPartie = (partie: string): boolean => partie === 'refus-du-modele';"],
  ['un envoi trop lent qui echoue laisse la place en attente', DS, '          if (!attenteNonPartie(fin) || !(await confirmeSansAttente(posee))) return;', '          return;'],
  ['la porte du message non remis s ouvre sans la cle service', DS, "async function attenteNonRemise(req: Request, body: Record<string, unknown>): Promise<Response> {\n  if (!appelDuServeur(req)) return json({ error: 'reserve' }, 401);\n", 'async function attenteNonRemise(req: Request, body: Record<string, unknown>): Promise<Response> {\n'],
  ['un message non remis confirme une place qui a deja repondu', DS, "    if (!ligne || etatDeLAttente(ligne.data) !== 'sans-reponse') return false;", '    if (!ligne) return false;'],
  ['le message non remis ne confirme rien', DS, "  if (!apptId || !(await confirmeSansAttente(apptId))) return json({ pris: false });", "  if (!apptId || !apptId) return json({ pris: false });"],
  ['le webhook ne rend pas le message non remis', WH, '      attentesNonRemises.add(String(ligne.data.apptId));\n', ''],
  /* ── Les plafonds ── */
  ['trois places en attente deviennent quatre', REGLE, 'export const EN_ATTENTE_PAR_NUMERO = 3;', 'export const EN_ATTENTE_PAR_NUMERO = 4;'],
  ['le rendez-vous oublie la cle du numero qui l a pris', DS, '      cleDuNumero: cleDuNumero(telephone),\n      ...(naissance ?', '      ...(naissance ?'],
  ['le plafond par adresse oublie', DS, "    if (!(await allowRate(ip, 'places_du_jour', POSES_PAR_ADRESSE_ET_PAR_JOUR, 24 * 60))) return json({ error: 'trop_de_demandes' }, 429);\n", ''],
  ['la base laisse cinq poses en devenir six', SQL, '    if coalesce(poses_du_jour, 0) >= 5 then', '    if coalesce(poses_du_jour, 0) >= 6 then'],
  ['la base oublie les places en attente', SQL, "    if btrim(coalesce(p_rdv->>'attenduJusquAu', '')) <> '' and coalesce(en_attente, 0) >= 3 then", '    if false then'],
  ['la base efface le jour meme d Opale', SQL, "            and coalesce(p_rdv->>'poseePar', '') = 'Opale'\n", ''],
  ['la base pose avant 08:30', SQL, '  if debut is null or debut < 510 then\n    return jsonb_build_object(\'ok\', false, \'raison\', \'creneau_hors_ouverture\');\n  end if;\n  duree := public.duree_du_rdv(p_rdv);', '  duree := public.duree_du_rdv(p_rdv);'],
  ['le debit se lit puis s ecrit, hors verrou', SQL, "  perform pg_advisory_xact_lock(hashtext('debit:' || seau), hashtext(cle));\n", ''],
  /* ── La cle du numero ── */
  ['la cle du numero garde le 01', REGLE, "  return d.length === 13 && d.startsWith('22901') ? `229${d.slice(5)}` : d;", '  return d;'],
  ['le code se compte au numero tape', DS, "    .in('data->>telephone', numerosDeLaMemePersonne(telephone))\n    .eq('data->>code', code)", "    .eq('data->>telephone', telephone)\n    .eq('data->>code', code)"],
  /* ── Le doublon ── */
  ['le doublon rend la reference a quiconque', DS, '    const sien = !!cleDuDepot && meme.data?.cleDuDepot === cleDuDepot;', '    const sien = true;'],
  ['une place liberee reste un doublon', DS, "    for (const r of (lus ?? []) as { id: string; data?: any }[]) if (r.data && r.data.status !== 'annulé') rdvsConnus.set(r.id, r.data);", '    for (const r of (lus ?? []) as { id: string; data?: any }[]) if (r.data) rdvsConnus.set(r.id, r.data);'],
  /* ── L'heure et la duree ── */
  ['la grille accepte toute heure', DS, '    && !heureSurLaGrille({ openMin: ouverture.openMin, closeMin: ouverture.closeMin, debutMin: debutDemande,', '    && false && !heureSurLaGrille({ openMin: ouverture.openMin, closeMin: ouverture.closeMin, debutMin: debutDemande,'],
  ['la duree oublie le calibre', DS, 'const verdict = laPlaceTient({ ...agenda, sieges: places, services: auCalibre, categories: famillesDuSite },', 'const verdict = laPlaceTient({ ...agenda, sieges: places, services: agenda.services, categories: famillesDuSite },'],
  /* ── Le défaisage (GBÀTÀ™) ── */
  ['le defaisage reste ferme en ligne', DS, 'services: auCalibre, categories: famillesDuSite },', 'services: auCalibre },'],
  ['toute famille a part se reserve en ligne', REGLE, 'ATELIERS_DU_DEFAISAGE.includes(c.id) && !c.parentId ?', '!c.parentId ?'],
  ['un defaisage range sous la restauration se reserve', REGLE, 'ATELIERS_DU_DEFAISAGE.includes(c.id) && !c.parentId ?', 'ATELIERS_DU_DEFAISAGE.includes(c.id) ?'],
  ['le coefficient de duree ne se lit pas', REGLE, '  return Math.max(15, Math.round((base * tranche.durCoef) / 15) * 15);', '  return base;'],
  ['le site dit ferme un prix au calibre annonce', 'src/apps/revelateur/ilots/Reserver.tsx', '  const prixFlou = prixAuCalibre || choisies.some(', '  const prixFlou = choisies.some('],
  /* ── Les deplacements ── */
  ['un rendez-vous se deplace trois fois', [PUR, DS, CONF], 'export const DEPLACEMENTS_AU_PLUS = 2;', 'export const DEPLACEMENTS_AU_PLUS = 3;'],
  ['la base deplace hors du verrou des poses', DEPL, "  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || p_date));\n", ''],
  /* ── Les autres surfaces ── */
  ['confirmation-rdv confirme une place en attente', CONF, '    .filter((a) => !estEnAttente(a));', '    .filter((a) => !!a);'],
  ['le webhook garde le bouton d une place en attente', WH, "    if (typeof rdv.attenduJusquAu === 'string' && rdv.attenduJusquAu.trim()) {", '    if (false) {'],
  ['la relance J-3 de rappels-j1 vise une place prise en ligne', 'supabase/functions/rappels-j1/index.ts', '&& !a.autreMomentDemandeLe && !a.attenduJusquAu);', '&& !a.autreMomentDemandeLe);'],
  ['le comptoir est prevenu d une place prise en ligne comme d une suggestion', 'supabase/functions/rappels-j1/index.ts', '.filter((a) => estSuggere(a) && !a.attenduJusquAu)', '.filter((a) => estSuggere(a))'],
  ['la relance du depot vise une place prise en ligne', 'src/shared/reservation-express.ts', '&& !a.autreMomentDemandeLe && !a.attenduJusquAu);', '&& !a.autreMomentDemandeLe);'],
  ['Ma Couronne dit « Propose par la Maison » a une place prise en ligne', 'src/apps/couronne/MesRendezVous.tsx', '=> estSuggere(a) && etatDeLAttente(a) === null;', '=> estSuggere(a);'],
  ['la carte du prochain rituel dit « Suggere » a une place prise en ligne', 'src/apps/trone/routes/vente/SonProchainRituel.tsx', 'estSuggere(rdvMontre) && etatDeLAttente(rdvMontre) === null ?', 'estSuggere(rdvMontre) ?'],
  ['la formule dit proposee une place prise en ligne', 'src/shared/abonnee-pur.ts', "if (estSuggere(a) && !a.attenduJusquAu) return 'proposee';", "if (estSuggere(a)) return 'proposee';"],
  ['le Carnet range une place en attente parmi les confirmes', 'src/apps/trone/routes/clients/Carnet.tsx', "garde: (a) => a.status === 'confirmé' && !estSuggere(a) && !estEnAttente(a) }", "garde: (a) => a.status === 'confirmé' && !estSuggere(a) }"],
  /* ── Ma Couronne ── */
  ['Ma Couronne se confirme elle-meme', DS, '  const ferme = !regard && (acompteXof <= 0 || acompteRecu);', '  const ferme = true;'],
  ['Ma Couronne reserve pour la tete d une autre', DS, '  if (!laSienne) {', '  if (false) {'],
  ['Ma Couronne refuse la fiche adoptee de la cliente', DS, "  const laSienne = pour === uid || (!!fiche && String(fiche.authUserId ?? '') === uid);", '  const laSienne = pour === uid;'],
  ['Ma Couronne prend une fiche qui porte un autre compte', DS, "  const laSienne = pour === uid || (!!fiche && String(fiche.authUserId ?? '') === uid);", "  const laSienne = pour === uid || (!!fiche && String(fiche.authUserId ?? '') !== '');"],
  ['Ma Couronne ne reconnait pas le payeur designe par sa fiche', DS, "      payeParElle = String((ficheDuPayeur?.data as { authUserId?: unknown } | null | undefined)?.authUserId ?? '') === uid;", '      payeParElle = false;'],
  ['Ma Couronne reserve pour une majeure de sa famille', DS, '    if (!fiche || fiche.archived === true || !mineur || !payeParElle) {', '    if (!fiche || fiche.archived === true || !payeParElle) {'],
  ['Ma Couronne garde la duree de son ecran', DS, '  const dureeMin = Math.max(dureeDuServeur, Math.min(dureeVue, dureeDuServeur * 2));', '  const dureeMin = dureeVue || dureeDuServeur;'],
  ['une serie se pose a moitie', DS, '    await defais();\n', ''],
  ['Ma Couronne croit le paiement d un autre rendez-vous', DS, "    if (p && p.status === 'success' && String(p.partnerId ?? '') === idPaye) verseXof", "    if (p && p.status === 'success') verseXof"],
  ['le juge de Ma Couronne ne compare qu a l ouverture', DS, '  if (debut < Math.max(fenetre.openMin, PREMIER_RENDEZ_VOUS_MIN) || fin > fenetre.closeMin) return false;', '  if (debut < fenetre.openMin || fin > fenetre.closeMin) return false;'],
  ['la base laisse une cliente se confirmer', GARDE, "    if coalesce(new.data->>'status', '') = 'confirmé' then\n      new.data := jsonb_set(new.data, '{status}', '\"en attente\"'::jsonb);\n    end if;\n\n    -- L'ARGENT", "    -- L'ARGENT"],
  /* ── La ligne déjà là, et la marque du comptoir (0224, 18 novembre 2026) ── */
  ['la base repasse en attente un rendez-vous que Ma Couronne repousse', GARDE, '    if exists (select 1 from public.appointments a where a.id = new.id) then\n      return new;\n    end if;\n', ''],
  ['une cliente monte son rendez-vous en confirme par une mise a jour', GARDE, "    if coalesce(new.data->>'status', '') = 'confirmé' and coalesce(old.data->>'status', '') <> 'confirmé' then", '    if false then'],
  ['une cliente pose la marque du comptoir par une mise a jour', GARDE, "'remiseDuComptoirXof', 'dureeMin',\n                               'suggereLe', 'attenduJusquAu', 'cleDuNumero', 'placeLibereeLe', 'deplacements',\n                               'ouiNoteParLeComptoir'] loop", "'remiseDuComptoirXof', 'dureeMin',\n                               'suggereLe', 'attenduJusquAu', 'cleDuNumero', 'placeLibereeLe', 'deplacements'] loop"],
  /* ── Jamais pendant la séance ; le oui du comptoir tient (0222, 18 novembre 2026) ── */
  ['la place se libere pendant la seance', REGLE, '  if (debut === null || debut <= minuteDePortoNovo(maintenantMs)) return false;', '  if (debut === null) return false;'],
  ['une place sans jour lisible se libere', REGLE, '  if (debut === null || debut <= minuteDePortoNovo(maintenantMs)) return false;', '  if (debut !== null && debut <= minuteDePortoNovo(maintenantMs)) return false;'],
  ['l heure de Porto-Novo se lit en UTC', REGLE, 'export const minuteDePortoNovo = (ms: number): string => new Date(ms + 3_600_000).toISOString()', 'export const minuteDePortoNovo = (ms: number): string => new Date(ms).toISOString()'],
  ['le oui du comptoir laisse la place se liberer', REGLE, '  if (!estEnAttente(a) || ouiDuComptoir(a) || !Number.isFinite(maintenantMs)) return false;', '  if (!estEnAttente(a) || !Number.isFinite(maintenantMs)) return false;'],
  ['la base libere pendant la seance', SQL, "       and (a.data->>'date') || ' ' || (a.data->>'time') > ici\n", ''],
  ['la base lit l heure en UTC', SQL, "  ici        text := to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD HH24:MI');", "  ici        text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI');"],
  ['la base libere une place dont le comptoir a note le oui', SQL, "       and not (btrim(coalesce(a.data->>'confirmeeParLaClienteLe', '')) <> ''\n                and coalesce(a.data->'ouiNoteParLeComptoir' = 'true'::jsonb, false))\n", ''],
  ['le Carnet promet une liberation qui n aura pas lieu', PUR, "  const jusqua = seLibere ? heureDeCotonouDite(a.attenduJusquAu) : '';", '  const jusqua = heureDeCotonouDite(a.attenduJusquAu);'],
];

const fichiersDe = (x) => (Array.isArray(x) ? x : [x]);
const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (!process.argv.includes('--prouve')) {
  const r = await lanceLeBanc();
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status ?? 1;
} else {
  const propre = await lanceLeBanc();
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); console.log(propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.flatMap((p) => fichiersDe(p[1])))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  let muettes = 0;
  try {
    for (const [nom, cibles, a, b] of PANNES) {
      let introuvable = '';
      for (const f of fichiersDe(cibles)) {
        const brut = gardes[f].toString('utf8');
        const crlf = brut.includes('\r\n');
        const texte = brut.replace(/\r\n/g, '\n');
        if (texte.split(a).length !== 2) { introuvable = f; break; }
        const casse = texte.replace(a, () => b);
        writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      }
      try {
        if (introuvable) { console.log(`INTROUVABLE ${nom} (${introuvable})`); muettes++; continue; }
        const r = await lanceLeBanc();
        const premier = ((r.stdout ?? '').match(/^ECHEC.*$/m) ?? [''])[0].slice(6, 80);
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE   ${nom}${premier ? ` (${premier})` : ''}`);
      } finally {
        for (const f of fichiersDe(cibles)) writeFileSync(path.join(racine, f), gardes[f]);
      }
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(`\n${PANNES.length - muettes}/${PANNES.length} pannes criees${intacts ? ', fichiers restaures a l identique' : ', FICHIERS ALTERES'}.`);
  process.exitCode = muettes || !intacts ? 1 : 0;
}
