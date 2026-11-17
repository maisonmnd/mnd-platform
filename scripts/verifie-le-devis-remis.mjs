import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LE DEVIS SE REMET AU RENDEZ-VOUS, EPROUVE — 17 novembre 2026.
   `node scripts/verifie-le-devis-remis.mjs`
   `BANC_PGLITE=<dossier qui porte node_modules/@electric-sql/pglite> node scripts/verifie-le-devis-remis.mjs`
   (la migration 0219 se joue alors pour de vrai ; sans lui, cette partie saute et le dit)

   Le banc (`verifie-le-devis-remis.harnais.ts`) tourne dans un PROCESSUS FILS ;
   son dossier temporaire s'efface dans un `finally`.

   `--prouve` remet chaque faute UNE A UNE et exige que le banc crie, sur le
   bon constat (« ECHEC #<n> »). LA FAUTE NE S'ECRIT JAMAIS DANS LE DEPOT :
   elle est servie a esbuild au chargement du fichier, et au banc quand il lit
   une source ; l'empreinte md5 de chaque fichier est comparee avant et apres,
   dans un `finally`. Une faute dont le texte ne se trouve plus (exactement
   une fois) fait echouer la preuve : elle ne prouverait rien. Les fautes de
   la base (`pglite`) exigent PGlite. `--seulement=<n>` ne rejoue que les
   fautes du constat n. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');
const seulement = Number((process.argv.find((a) => a.startsWith('--seulement=')) ?? '').split('=')[1]) || 0;

const R = 'src/shared/devis-remis-pur.ts';
const C = 'src/shared/devis-de-la-cliente-pur.ts';
const G = 'src/shared/gestes-conversation.ts';
const FA = 'src/apps/trone/routes/vente/Factures.tsx';
const GE = 'src/apps/trone/routes/clients/_gestes.tsx';
const CO = 'src/apps/trone/routes/clients/ComposeurWhatsApp.tsx';
const TA = 'src/apps/couronne/Tabs.tsx';
const RE = 'src/shared/devis-remis.ts';
const RD = 'src/apps/trone/routes/vente/RemiseDuDevis.tsx';
const MI = 'supabase/migrations/0219_le_devis_remis_au_rendez_vous.sql';

const FAUTES = [
  /* #1 : le devis d'une consultation. */
  { n: 1, fichier: R, avant: "    if (c.visio?.tenueLe || visios.some((v) => v.statut === 'tenue')) return { ok: true, par: 'visio' };", apres: "    if (c.visio?.tenueLe || visios.some((v) => v.statut !== 'annulée')) return { ok: true, par: 'visio' };" },
  { n: 1, fichier: R, avant: "    if (rdv?.status === 'honoré') return { ok: true, par: privee ? 'privee' : 'rendez-vous' };", apres: "    if (rdv) return { ok: true, par: privee ? 'privee' : 'rendez-vous' };" },
  { n: 1, fichier: R, avant: '    if (privee && (c.temoins?.length ?? 0) > 0) return', apres: '    if ((c.temoins?.length ?? 0) > 0) return' },
  { n: 1, fichier: R, avant: "    if (c.visio?.tenueLe || visios.some((v) => v.statut === 'tenue')) return { ok: true, par: 'visio' };", apres: "    if (visios.some((v) => v.statut === 'tenue')) return { ok: true, par: 'visio' };" },
  { n: 1, fichier: R, avant: "      ...(c.visio?.statut ? [{ id: c.visio.id, consultationId: c.id, statut: c.visio.tenueLe ? 'tenue' : c.visio.statut, debut: c.visio.debut }] : []),\n", apres: '' },
  { n: 1, fichier: R, avant: "    if (privee && !c.rdvId && c.momentRefuse) return", apres: "    if (false) return" },
  { n: 1, fichier: R, avant: '    /* La privée d\'avant le Carnet : les locks témoins se photographient devant elle. */\n', apres: '    if (privee && !!c.momentRefuse) return { ok: true, par: \'privee\' };\n' },
  { n: 1, fichier: R, avant: "      ...ctx.visios.filter((v) => v.consultationId === c.id || (!!c.visio && !!v.id && v.id === c.visio.id)),", apres: '      ...ctx.visios,' },
  { n: 1, fichier: R, avant: "    if (!c) return { ok: false, raison: 'Sa consultation est introuvable : rien ne dit que le rendez-vous a eu lieu.' };", apres: "    if (!c) return { ok: true, par: 'visio' };" },
  { n: 1, fichier: R, avant: 'const DECALAGE_DE_COTONOU_MS = 60 * 60_000;', apres: 'const DECALAGE_DE_COTONOU_MS = 0;' },
  /* #2 : le devis fait au Trone. */
  { n: 2, fichier: R, avant: "a.status === 'honoré' && tetes.includes(a.clientId)", apres: "a.status !== 'annulé' && tetes.includes(a.clientId)" },
  { n: 2, fichier: R, avant: "a.status === 'honoré' && tetes.includes(a.clientId)", apres: "a.status === 'honoré'" },
  { n: 2, fichier: R, avant: "  if (tetes.length === 0) return { ok: false, raison: 'Sans fiche cliente, rien ne dit qu’elle est venue à la Maison.' };", apres: '' },
  { n: 2, fichier: R, avant: "v.statut === 'tenue' && numeros.includes(huit(v.telephone))", apres: 'numeros.includes(huit(v.telephone))' },
  { n: 2, fichier: R, avant: "v.statut === 'tenue' && numeros.includes(huit(v.telephone))", apres: "v.statut === 'tenue'" },
  /* #3 : hors regle, deja remis. */
  { n: 3, fichier: R, avant: "  if (horsRegle(d)) return { ok: true, par: 'hors-regle' };\n  if (estRemis(d)) return { ok: true, par: 'deja-remis' };", apres: "  if (horsRegle(d)) return { ok: true, par: 'hors-regle' };" },
  { n: 3, fichier: R, avant: "  if (horsRegle(d)) return { ok: true, par: 'hors-regle' };\n  if (estRemis(d)) return { ok: true, par: 'deja-remis' };", apres: "  if (estRemis(d)) return { ok: true, par: 'deja-remis' };" },
  { n: 3, fichier: R, avant: "export const LE_JOUR_DE_LA_REMISE = '2026-11-17';", apres: "export const LE_JOUR_DE_LA_REMISE = '2026-11-18';" },
  { n: 3, fichier: R, avant: "const ETATS_PARTIS = ['envoyée', 'acceptée', 'confirmé', 'payée'];", apres: "const ETATS_PARTIS = ['estimé', 'envoyée', 'acceptée', 'confirmé', 'payée'];" },
  { n: 3, fichier: R, avant: "  horsRegle(d) || (d.status !== 'brouillon' && estRemis(d));", apres: '  horsRegle(d) || estRemis(d);' },
  { n: 3, fichier: R, avant: "/^\\d{4}-\\d{2}-\\d{2}/.test(String(d.date ?? '')) && ", apres: '' },
  /* #4 : ce que le Trone affiche, la marque. */
  { n: 4, fichier: R, avant: "  if (d.status === 'brouillon') return null;\n  if (e.etat === 'attend')", apres: "  if (e.etat === 'attend')" },
  { n: 4, fichier: R, avant: '    remisLe: d.remisLe || quand,', apres: '    remisLe: quand,' },
  { n: 4, fichier: R, avant: "  return r.ok ? { etat: 'a-remettre' } : { etat: 'attend', raison: r.raison };", apres: "  return { etat: 'a-remettre' };" },
  /* #5 : quinze jours. */
  { n: 5, fichier: R, avant: 'export const VALIDITE_DU_DEVIS_JOURS = 15;', apres: 'export const VALIDITE_DU_DEVIS_JOURS = 30;' },
  { n: 5, fichier: R, avant: '  if (horsRegle(d) || !estRemis(d) || !ETATS_QUI_PERIMENT.includes(d.status)) return false;', apres: '  if (horsRegle(d) || !ETATS_QUI_PERIMENT.includes(d.status)) return false;' },
  { n: 5, fichier: R, avant: '  if (horsRegle(d) || !estRemis(d) || !ETATS_QUI_PERIMENT.includes(d.status)) return false;', apres: '  if (horsRegle(d) || !estRemis(d)) return false;' },
  { n: 5, fichier: R, avant: '  return !!fin && aujourdhui > fin;', apres: '  return !!fin && aujourdhui >= fin;' },
  { n: 5, fichier: R, avant: "  plusJours(jourDeLInstant(d.remisLe) || String(d.date ?? '').slice(0, 10), VALIDITE_DU_DEVIS_JOURS);", apres: "  plusJours(String(d.date ?? '').slice(0, 10), VALIDITE_DU_DEVIS_JOURS);" },
  { n: 5, fichier: R, avant: '  !estPerime({ ...apres, status: avant.status }, aujourdhui);', apres: '  !estPerime(apres, aujourdhui);' },
  { n: 5, fichier: R, avant: "  return v ? { ...papier, note: `${papier.note ? `${papier.note}\\n` : ''}${v}.` } : papier;", apres: '  return papier;' },
  /* #6 : ce qu'elle voit. */
  { n: 6, fichier: C, avant: '  && remisAElle(d);', apres: ';' },
  { n: 6, fichier: C, avant: '  if (!remisAElle(d) || perime(d, aujourdhui)) return null;', apres: '  if (perime(d, aujourdhui)) return null;' },
  { n: 6, fichier: C, avant: '  if (!remisAElle(d) || perime(d, aujourdhui)) return null;', apres: '  if (!remisAElle(d)) return null;' },
  { n: 6, fichier: C, avant: '  if (perime(d, aujourdhui)) return MOT_DU_DEVIS_PERIME;', apres: '' },
  { n: 6, fichier: 'src/apps/couronne/i18n/en-devis.ts', avant: "  'Ce devis a dépassé ses quinze jours. Écrivez à la Maison : elle le renouvelle.':", apres: "  'Ce devis a depasse ses quinze jours.':" },
  /* #7 : un devis par consultation, la deduction une fois. */
  { n: 7, fichier: R, avant: '    .filter((p) => p.consultationId === consultationId && p.id !== saufId)', apres: '    .filter((p) => p.consultationId === consultationId)' },
  { n: 7, fichier: R, avant: '    .filter((p) => p.consultationId === consultationId && p.id !== saufId)', apres: '    .filter((p) => p.id !== saufId)' },
  { n: 7, fichier: R, avant: "  if ((d.discountLabel ?? '').includes(LIBELLE_DE_LA_CONSULTATION_DEDUITE)) return {};", apres: '' },
  { n: 7, fichier: R, avant: '    globalDiscountXof: deja + deduction.globalDiscountXof,', apres: '    globalDiscountXof: deduction.globalDiscountXof,' },
  /* #8 : l'acompte juste. */
  { n: 8, fichier: C, avant: ' - Math.max(0, remiseXof || 0));', apres: ');' },
  { n: 8, fichier: C, avant: ' - Math.max(0, l.discountXof || 0)));', apres: '));' },
  { n: 8, fichier: C, avant: '  const f = total / sous;', apres: '  const f = 1 - (remisePct || 0) / 100;' },
  { n: 8, fichier: R, avant: "  if (!rdv || rdv.depositConfirmed || rdv.status === 'annulé' || rdv.status === 'honoré') return 0;", apres: '  if (!rdv) return 0;' },
  { n: 8, fichier: R, avant: "  if (horsRegle(d) || d.status !== 'confirmé') return 0;", apres: '  if (horsRegle(d)) return 0;' },
  /* #9 : le geste « Son devis ». */
  { n: 9, fichier: G, avant: "(devis ? devisFerme : 'Aucun devis n’attend de réponse.')", apres: "(devis ? null : 'Aucun devis n’attend de réponse.')" },
  { n: 9, fichier: G, avant: '    piece: devis && !devisFerme ? {', apres: '    piece: devis ? {' },
  { n: 9, fichier: G, avant: '    compose: devis && !devisFerme\n', apres: '    compose: devis\n' },
  /* #10 : la porte des Factures (la règle sans écran), puis les branchements. */
  { n: 10, fichier: R, avant: '    if (refus) { o.dit(refus); return null; }', apres: '    if (refus) { o.dit(refus); }' },
  { n: 10, fichier: R, avant: '    const refus = motifHorsRegle ? null : fermeAuDevis(d);', apres: '    const refus = null as string | null;' },
  { n: 10, fichier: R, avant: '    if (estRemis(d) && !motifHorsRegle) return d;\n', apres: '' },
  { n: 10, fichier: R, avant: '    o.ecris(d.id, marque);\n', apres: '' },
  { n: 10, fichier: R, avant: '    const marque = marqueDeLaRemise(d, o.maintenant(), o.qui, motifHorsRegle);', apres: '    const marque = marqueDeLaRemise(d, o.maintenant(), o.qui);' },
  { n: 10, fichier: R, avant: '    return r.ok ? null : `À remettre au rendez-vous. ${r.raison}`;', apres: '    return null;' },
  { n: 10, fichier: R, avant: '    if (estPerime(d, aujourdhui)) return `Ce devis valait jusqu’au ${jourEnClair(dernierJourValable(d))} : renouvelez-le avant de l’envoyer.`;\n', apres: '' },
  { n: 10, fichier: R, avant: "    if (!estRemis(d)) return 'Remettez d’abord le devis à la cliente : il se confirme ensuite.';\n", apres: '' },
  { n: 10, fichier: R, avant: '    if (estPerime(d, aujourdhui)) return `Il valait jusqu’au ${jourEnClair(dernierJourValable(d))} : renouvelez-le avant de le confirmer.`;\n', apres: '' },
  { n: 10, fichier: R, avant: "    (!horsRegle(d) && !estRemis(d) ? 'Remettez d’abord le devis à la cliente.' : null);", apres: '    (null);' },
  { n: 10, fichier: R, avant: "      if (deja) return `Cette consultation a déjà son devis (${deja.number ?? ''}) : modifiez-le plutôt.`;\n", apres: '' },
  { n: 10, fichier: R, avant: "      if (!estRemis(d)) return 'Ce devis n’est pas encore remis à la cliente : remettez-le d’abord, il se confirme ensuite.';\n", apres: '' },
  { n: 10, fichier: R, avant: '      if (avant && !seConfirmeTelQuel(avant, d, aujourdhui)) {', apres: '      if (false as boolean) {' },
  { n: 10, fichier: R, avant: "    if (d.status === 'confirmé' && avant?.status !== 'confirmé') {", apres: "    if (d.status === 'confirmé') {" },
  { n: 10, fichier: R, avant: '  if (!o.ferme || avance) {', apres: '  if (!o.ferme) {' },
  { n: 10, fichier: R, avant: '  const note = !deja.note?.trim() || deja.note === o.motEstime ? o.motFerme : deja.note;', apres: '  const note = o.motFerme;' },
  { n: 10, fichier: R, avant: '...avecLaDeduction(deja, o.deduction), note } as T,', apres: '...(o.deduction ?? {}), note } as T,' },
  { n: 10, fichier: R, avant: "    return { piece: deja, enEdition: false, mot:", apres: "    return { piece: deja, enEdition: true, mot:" },
  { n: 10, fichier: FA, avant: "    const doc = remise.sortLeDevis(selected);\n    if (!doc) return;\n    await invoicePdf(avecLaValidite(buildPdfData(doc), doc));\n    if (porte === 'trone') {", apres: "    const doc = selected;\n    if (!doc) return;\n    await invoicePdf(avecLaValidite(buildPdfData(doc), doc));\n    if (porte === 'trone') {" },
  { n: 10, fichier: FA, avant: "    const doc = remise.sortLeDevis(selected);\n    if (!doc) return;\n    await invoicePdf(avecLaValidite(buildPdfData(doc), doc));\n    setWaHint('PDF téléchargé.');", apres: "    const doc = selected;\n    if (!doc) return;\n    await invoicePdf(avecLaValidite(buildPdfData(doc), doc));\n    setWaHint('PDF téléchargé.');" },
  { n: 10, fichier: FA, avant: '    if (selected && !remise.sortLeDevis(selected)) return;\n', apres: '' },
  { n: 10, fichier: FA, avant: '                    {versLApp && !remise.fermeAuDevis(selected) && (', apres: '                    {versLApp && (' },
  { n: 10, fichier: FA, avant: " disabled={!!remise.fermeAuDevis(selected)} title={remise.fermeAuDevis(selected) ?? undefined} onClick={() => void sendWhatsApp('trone')}", apres: " onClick={() => void sendWhatsApp('trone')}" },
  { n: 10, fichier: FA, avant: ' disabled={!!remise.fermeAuDevis(selected)} title={remise.fermeAuDevis(selected) ?? undefined} onClick={printDoc}', apres: ' onClick={printDoc}' },
  { n: 10, fichier: FA, avant: ' disabled={!!remise.fermeAuDevis(selected)} title={remise.fermeAuDevis(selected) ?? undefined} onClick={() => void downloadPdf()}', apres: ' onClick={() => void downloadPdf()}' },
  { n: 10, fichier: FA, avant: ' disabled={!!remise.fermeALaConfirmation(selected)} title={remise.fermeALaConfirmation(selected) ?? undefined}', apres: '' },
  { n: 10, fichier: FA, avant: '                  disabled={!!remise.fermeALaFacture(selected)}\n', apres: '' },
  { n: 10, fichier: FA, avant: '    if (refusDeLaRemise) { toast(refusDeLaRemise); return; }', apres: '    if (refusDeLaRemise) { toast(refusDeLaRemise); }' },
  { n: 10, fichier: FA, avant: '    qui: monNomFil,\n', apres: '' },
  { n: 10, fichier: FA, avant: "    neuf: editing?.mode === 'new' ? editing.draft : null,", apres: '    neuf: null,' },
  { n: 10, fichier: FA, avant: ' setWaHint(mot); toast(mot); },', apres: ' setWaHint(mot); },' },
  { n: 10, fichier: FA, avant: '              <PanneauDeLaRemise d={selected} porte={remise} estDirection={estDirection} dit={setWaHint} surRenouveler={openEdit} />\n', apres: '' },
  { n: 10, fichier: FA, avant: '          <PastilleDeLaRemise d={d} porte={remise} />\n', apres: '' },
  { n: 10, fichier: FA, avant: 'devis.globalDiscountPct, devis.globalDiscountXof ?? 0);', apres: 'devis.globalDiscountPct);' },
  { n: 10, fichier: FA, avant: '              <LienDeLAcompte d={selected} rdvs={appointments} appel={appelOf(selected)} telephone={clientOf(selected)?.phone} />\n', apres: '' },
  { n: 10, fichier: RD, avant: '  const lien = acompte > 0 ? lienPaiementMomo(acompte) : null;', apres: '  const lien = lienPaiementMomo(acompte);' },
  { n: 10, fichier: RD, avant: '<Button variant="ghost" size="sm" disabled title={e.raison}>Remettre le devis</Button>', apres: '<Button variant="ghost" size="sm" onClick={remet}>Remettre le devis</Button>' },
  { n: 10, fichier: RD, avant: '    if (!estDirection) return;\n', apres: '' },
  { n: 10, fichier: RD, avant: '        {estDirection && (\n          <button className="trv-linkbtn trv-linkbtn--muted"', apres: '        {(\n          <button className="trv-linkbtn trv-linkbtn--muted"' },
  { n: 10, fichier: RD, avant: '    const deja = pieceDeLaConsultation(invoicesStore.get(), neuf.consultationId, neuf.id);', apres: '    const deja = undefined as Invoice | undefined;' },
  { n: 10, fichier: RD, avant: 'return porteDeLaRemise<Invoice>(useContexteDeLaRemise(), todayISO(),', apres: 'return porteDeLaRemise<Invoice>({ consultations: [], visios: [], rdvs: [] }, todayISO(),' },
  { n: 10, fichier: RD, avant: "  const mot = estPerime(d, porte.aujourdhui) ? 'périmé' : pastilleDeLaRemise(d, e);", apres: "  const mot = estPerime(d, porte.aujourdhui) ? 'périmé' : null;" },
  { n: 10, fichier: GE, avant: '            if (!r.ok) devisFerme = `À remettre au rendez-vous. ${r.raison}`;', apres: '' },
  { n: 10, fichier: CO, avant: "      if (doc.kind === 'devis') remetsLeDevis(doc.id);", apres: '' },
  { n: 10, fichier: RE, avant: 'i.id === id && !horsRegle(i) && !estRemis(i)', apres: 'i.id === id' },
  { n: 10, fichier: TA, avant: "(estCommandeBoutique(i) || (i.kind === 'devis' && lisibleParElle(i))) && i.status !== 'brouillon'", apres: "(i.kind === 'devis' || estCommandeBoutique(i)) && i.status !== 'brouillon'" },
  { n: 10, fichier: TA, avant: '                  : a.depositConfirmed && (a.depositXof ?? 0) > 0', apres: '                  : true' },
  { n: 10, fichier: TA, avant: 'attendElle(x, todayIso())', apres: 'attendElle(x)' },
  /* #11 : le texte de la migration. */
  { n: 11, fichier: MI, avant: "collate \"C\" < '2026-11-17'", apres: "collate \"C\" < '2026-11-30'" },
  { n: 11, fichier: MI, avant: 'v_base + 15;', apres: 'v_base + 30;' },
  { n: 11, fichier: MI, avant: 'as restrictive for select to authenticated', apres: 'for select to authenticated' },
  { n: 11, fichier: MI, avant: '  before insert or update or delete on public.invoices', apres: '  before update on public.invoices' },
  { n: 11, fichier: MI, avant: 'language plpgsql security invoker set search_path = public as $$\ndeclare\n  v_avant text;', apres: 'language plpgsql security definer set search_path = public as $$\ndeclare\n  v_avant text;' },
  /* #12 : la migration jouee dans PGlite. */
  { n: 12, pglite: true, fichier: MI, avant: "          and coalesce(d->>'status', '') in ('envoyée', 'acceptée', 'confirmé', 'payée')", apres: "          and coalesce(d->>'status', '') in ('estimé', 'à valider', 'envoyée', 'acceptée', 'confirmé', 'payée')" },
  { n: 12, pglite: true, fichier: MI, avant: "      coalesce(d->>'status', '') <> 'brouillon'\n      and (", apres: '      true\n      and (' },
  { n: 12, pglite: true, fichier: MI, avant: "        coalesce(d->>'remisLe', '') <> ''\n        or (", apres: '        true\n        or (' },
  { n: 12, pglite: true, fichier: MI, avant: "    or coalesce(jsonb_typeof(d->'boutique'), '') = 'object'\n    or (", apres: '    or (' },
  { n: 12, pglite: true, fichier: MI, avant: '  using (public.is_staff() or public.piece_lisible_par_elle(data));', apres: '  using (true);' },
  { n: 12, pglite: true, fichier: MI, avant: '  using (public.is_staff() or public.piece_lisible_par_elle(data));', apres: '  using (public.piece_lisible_par_elle(data));' },
  { n: 12, pglite: true, fichier: MI, avant: "  if tg_op = 'DELETE' then\n    return null;", apres: "  if tg_op = 'DELETE' then\n    return old;" },
  { n: 12, pglite: true, fichier: MI, avant: '  new.data := old.data;\n  new.branch_id := old.branch_id;', apres: '  new.branch_id := old.branch_id;' },
  { n: 12, pglite: true, fichier: MI, avant: '  new.data := old.data;\n  new.branch_id := old.branch_id;', apres: '  new.data := old.data;' },
  { n: 12, pglite: true, fichier: MI, avant: '     and not public.devis_perime(old.data) then', apres: '     then' },
  { n: 12, pglite: true, fichier: MI, avant: "          and (v_avant = 'envoyée' or (v_avant = 'à valider' and coalesce(old.data->>'aValiderPar', '') = 'cliente')) then", apres: "          and (v_avant = 'envoyée' or v_avant = 'à valider') then" },
  { n: 12, pglite: true, fichier: MI, avant: "    if v_avant = 'estimé' and v_apres = 'à valider' then", apres: "    if v_apres = 'à valider' or v_apres = 'confirmé' then" },
  { n: 12, pglite: true, fichier: MI, avant: "    new.data := (new.data - 'aValiderPar') || jsonb_build_object('status', 'acceptée');", apres: "    new.data := new.data || jsonb_build_object('status', 'acceptée');" },
  { n: 12, pglite: true, fichier: MI, avant: "    if coalesce(new.data->>'kind', '') <> 'devis' then\n      return null;", apres: "    if coalesce(new.data->>'kind', '') <> 'devis' then\n      return new;" },
  { n: 12, pglite: true, fichier: MI, avant: '    if exists (select 1 from public.invoices i where i.id = new.id) then\n      return new;\n    end if;\n', apres: '' },
  { n: 12, pglite: true, fichier: MI, avant: "    if coalesce(new.data->>'status', '') not in ('brouillon', 'envoyée') then", apres: '    if false then' },
  { n: 12, pglite: true, fichier: MI, avant: "    new.data := new.data - 'boutique' - 'consultationId'", apres: "    new.data := new.data - 'consultationId'" },
  { n: 12, pglite: true, fichier: MI, avant: '  if public.ecriture_de_la_maison() then\n    return coalesce(new, old);        -- comptoir, serveur, fonction du serveur : plein droit\n  end if;\n\n  if tg_op', apres: '  if tg_op' },
  { n: 12, pglite: true, fichier: MI, avant: 'grant execute on function public.piece_lisible_par_elle(jsonb) to authenticated, service_role;', apres: 'grant execute on function public.piece_lisible_par_elle(jsonb) to service_role;' },
  { n: 12, pglite: true, fichier: MI, avant: "      v_base := ((d->>'remisLe')::timestamptz at time zone 'Africa/Porto-Novo')::date;", apres: "      v_base := left(d->>'date', 10)::date;" },
  { n: 12, pglite: true, fichier: MI, avant: "  if not public.piece_lisible_par_elle(d) then\n    return false;", apres: "  if false then\n    return false;" },
];

const md5 = (rel) => createHash('md5').update(readFileSync(path.join(racine, rel))).digest('hex');

const BANNIERE = `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { href: '', hash: '' }, setTimeout: () => 0, setInterval() { return 0; }, clearInterval() {} };
globalThis.document = { body: { dataset: {}, appendChild() {} }, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {} }, remove() {} }), querySelectorAll: () => [] };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`;

async function banc(faute) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-devis-remis-'));
  const sortie = path.join(dossier, 'harnais.mjs');
  try {
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-le-devis-remis.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
      loader: { '.css': 'empty' },
      external: ['@electric-sql/pglite'],
      plugins: faute ? [{
        name: 'la-faute-du-devis',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = path.relative(racine, args.path).split(path.sep).join('/');
            if (rel !== faute.fichier) return undefined;
            const contents = readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n').split(faute.avant).join(faute.apres);
            return { contents, loader: rel.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) };
          });
        },
      }] : [],
      define: {
        'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }),
        __FAUTE__: JSON.stringify(faute ? { fichier: faute.fichier, avant: faute.avant, apres: faute.apres } : null),
      },
      banner: { js: BANNIERE },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8', env: process.env });
    return { status: r.status, sortie: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (!prouve) {
  const r = await banc(null);
  process.stdout.write(r.sortie);
  process.exitCode = r.status ?? 1;
} else {
  const avecPGlite = !!process.env.BANC_PGLITE;
  const liste = FAUTES.filter((f) => !seulement || f.n === seulement);
  let tiennent = 0; let sautees = 0;
  for (const f of liste) {
    if (f.pglite && !avecPGlite) {
      sautees++;
      console.log(`SAUTE faute #${f.n} ${f.avant.slice(0, 60).replace(/[^\x20-\x7e]/g, '?')} : PGlite absent`);
      continue;
    }
    const texte = readFileSync(path.join(racine, f.fichier), 'utf8').replace(/\r\n/g, '\n');
    const fois = texte.split(f.avant).length - 1;
    const avant = md5(f.fichier);
    let verdict;
    try {
      if (fois !== 1) {
        verdict = `LA FAUTE NE SE POSE PLUS (${fois} occurrence(s) du texte)`;
      } else {
        const r = await banc(f);
        const ligne = r.sortie.split(/\r?\n/).find((l) => l.startsWith(`ECHEC #${f.n} `));
        verdict = r.status !== 0 && ligne ? `crie (${ligne.slice(0, 110)})` : `NE CRIE PAS (statut ${r.status})`;
      }
    } finally {
      if (md5(f.fichier) !== avant) verdict = `LE FICHIER A CHANGE PENDANT LA PREUVE (${verdict})`;
    }
    const ok = verdict.startsWith('crie');
    if (ok) tiennent++;
    console.log(`${ok ? 'OK   ' : 'ECHEC'} faute #${f.n} ${f.avant.slice(0, 60).replace(/[^\x20-\x7e]/g, '?')} : ${verdict}`);
  }
  console.log(`${tiennent}/${liste.length - sautees} fautes font crier le banc${sautees ? ` (${sautees} sautees, PGlite absent)` : ''}.`);
  if (tiennent !== liste.length - sautees || sautees > 0) process.exitCode = 1;
}
