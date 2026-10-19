import { Fragment, useMemo, useRef, useState } from 'react';
import { Button, Field, Input, Modal, Select, alerte, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { appointmentsStore, estampilleLesPoses, useAppointments } from '../../../../shared/agenda';
import { clientsStore, ensureInitiePersona, useClients } from '../../../../shared/clients';
import { useServices } from '../../../../shared/catalog';
import { cashboxesStore, useCashboxes } from '../../../../shared/finance';
import { demandeAClaude, photoPourClaude } from '../../../../shared/ia-maison';
import { marqueDeLaSerie } from '../../../../shared/serie';
import {
  MOYENS_DU_CAHIER, MOYEN_DIT, caisseDuRattrapage, consigneDuCahier, decisionParDefaut, ficheAvecLeSurnom,
  inscriptionDeLaPage, lectureDeLaPage, nomLu, rapproche, SCHEMA_DE_LA_PAGE,
  type DecisionDeLigne, type LigneRapprochee, type MoyenDuCahier, type PageLue,
} from '../../../../shared/ia-cahier-pur';
import { ChampDeDate, ClientPicker, frJourAn, todayISO, useServicesById } from './_shared';
import { OptionsPrestations } from '../_ui';
import { emettreLaPieceDuRituelRegle } from './actions';

/* ══ RATTRAPER UN CAHIER — 19 octobre 2026 ═══════════════════════════════
   Maquette NKQMiMMY… validée (« Tout me va ») : « vous photographiez une
   page, Claude lit chaque ligne et la compare à ce que le Trône sait déjà.
   Ce qui y est déjà ne se double pas ; le reste s'inscrit d'un geste, avec
   les avances et les restes dus. Tout part dans "Années passées", daté du
   jour de la page. Aucun message ne part. »

   QUATRE TEMPS, ET RIEN NE S'ÉCRIT AVANT LE QUATRIÈME : la photo, la lecture
   (Claude, par `ia-maison`), le tableau (chaque ligne dans une case cuivre
   « à vérifier », modifiable), puis « Inscrire N lignes ». Les règles sont
   dans `shared/ia-cahier-pur` ; ici, l'écran et les magasins.

   CE QUI PART CHEZ CLAUDE : la photo et la consigne. Pas une fiche, pas un
   nom : le rapprochement se fait au Trône. CE QUI NE PART JAMAIS : un reçu,
   un avis, une relance. Les rituels sont datés du jour de la page, les
   pièces aussi ; la date du rituel juge (mémoire « retard invisible aux
   clientes »), et le cahier refuse les pages d'octobre 2026 et après. */

type Etape = 'photo' | 'lecture' | 'tableau' | 'inscrit';
const LIBRE = '__libre__';

const th: React.CSSProperties = {
  textAlign: 'left', padding: '7px 10px', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase',
  color: 'var(--ink-soft)', fontWeight: 500, whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '7px 10px', borderTop: '1px solid var(--hairline)', verticalAlign: 'top', fontSize: 12.5 };
const lien: React.CSSProperties = {
  cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit',
  fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)', textDecoration: 'underline',
};
const pastille = (fond: string, encre: string, bord: string): React.CSSProperties => ({
  display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 10.5, letterSpacing: '.06em',
  background: fond, color: encre, border: `1px solid ${bord}`, whiteSpace: 'nowrap',
});

export function RattraperUnCahier({ onClose }: { onClose: () => void }) {
  const { branch, currency } = useBranch();
  const [tousLesClients] = useClients();
  const [tousLesRdv] = useAppointments();
  const [services] = useServices();
  const byId = useServicesById();
  const [caisses] = useCashboxes();
  const fichesDIci = useMemo(() => tousLesClients.filter((c) => c.branchId === branch.id), [tousLesClients, branch.id]);
  const rdvDIci = useMemo(() => tousLesRdv.filter((a) => a.branchId === branch.id), [tousLesRdv, branch.id]);
  const catalogue = useMemo(() => services.map((s) => ({ id: s.id, name: s.name })), [services]);

  const [etape, setEtape] = useState<Etape>('photo');
  const [image, setImage] = useState<{ base64: string; mime: string; apercu: string } | null>(null);
  const [page, setPage] = useState<PageLue | null>(null);
  const [datePage, setDatePage] = useState('');
  const [decisions, setDecisions] = useState<Record<string, DecisionDeLigne | undefined>>({});
  /* La ligne dont on cherche la fiche au carnet (« Rattacher »). */
  const [rattache, setRattache] = useState('');
  const [maitre, setMaitre] = useState('');
  const [erreur, setErreur] = useState('');
  const [bilan, setBilan] = useState<{ n: number; pieces: number; recu: number; reste: number; caisse: string; fiches: number } | null>(null);
  const champFichier = useRef<HTMLInputElement>(null);
  const aujourdhui = todayISO();

  /* LE RAPPROCHEMENT SE REFAIT QUAND LA DATE CHANGE : « déjà au Trône » dépend
     du jour de la page, et la Maison peut le corriger à la main. */
  const lignes = useMemo<LigneRapprochee[]>(
    () => (page ? rapproche({ date: datePage || null, lignes: page.lignes }, fichesDIci, rdvDIci, catalogue) : []),
    [page, datePage, fichesDIci, rdvDIci, catalogue],
  );
  const decisionDe = (l: LigneRapprochee): DecisionDeLigne => decisions[l.cle] ?? decisionParDefaut(l);
  const pose = (cle: string, d: Partial<DecisionDeLigne>, l: LigneRapprochee) =>
    setDecisions((prev) => ({ ...prev, [cle]: { ...(prev[cle] ?? decisionParDefaut(l)), ...d } }));
  const retenues = lignes.filter((l) => l.etat !== 'deja' && decisionDe(l).geste !== 'ecarter');
  const caisse = datePage ? caisseDuRattrapage({ datePage, aujourdhui, boxes: caisses, branchId: branch.id }) : null;
  const inconnuesSansGeste = lignes.filter((l) => l.etat === 'inconnue' && decisionDe(l).geste === 'ecarter').length;

  const choisirLaPhoto = async (f: File | undefined) => {
    if (!f) return;
    setErreur('');
    try {
      const img = await photoPourClaude(f);
      setImage({ ...img, apercu: `data:${img.mime};base64,${img.base64}` });
    } catch {
      setErreur('Cette photo ne se lit pas : reprenez-la en JPEG ou PNG.');
    }
  };

  const lirePage = async () => {
    if (!image) return;
    setEtape('lecture');
    setErreur('');
    /* LA CONSIGNE ET LA PHOTO, RIEN D'AUTRE : aucun nom de cliente ne part. */
    const r = await demandeAClaude<unknown>({
      chantier: 'cahier',
      usage: 'image',
      systeme: consigneDuCahier({ aujourdhui }),
      messages: [{ role: 'user', content: 'Voici la page du cahier. Rends la date de la page et chaque ligne, dans la forme demandée.' }],
      images: [{ base64: image.base64, mime: image.mime }],
      schema: SCHEMA_DE_LA_PAGE,
      maxTokens: 3500,
    });
    if (!r.ok) { setErreur(r.message); setEtape('photo'); return; }
    const lue = lectureDeLaPage(r.data, aujourdhui);
    if (!lue) { setErreur('Claude n’a pas rendu une page lisible : reprenez la photo, plus près et bien éclairée.'); setEtape('photo'); return; }
    setPage(lue);
    setDatePage(lue.date ?? '');
    setDecisions({});
    setRattache('');
    setEtape('tableau');
  };

  const pageSuivante = () => {
    setImage(null); setPage(null); setDatePage(''); setDecisions({}); setRattache(''); setErreur(''); setBilan(null);
    setEtape('photo');
  };

  /* ══ LE SEUL ENDROIT QUI ÉCRIT ═══════════════════════════════════════ */
  const inscrire = () => {
    if (!page) return;
    const marque = marqueDeLaSerie(uid());
    const p = inscriptionDeLaPage({
      datePage, aujourdhui, branchId: branch.id, boxes: caisses, lignes, decisions,
      fiches: fichesDIci, services: catalogue, persona: ensureInitiePersona(), marque, nouvelId: uid, maitre: maitre || undefined,
    });
    if (!p.ok) { alerte(p.refus); return; }
    if (p.rendezVous.length === 0) { toast('Rien à inscrire sur cette page.'); return; }
    /* La caisse du rattrapage, née au besoin ; rangée, elle revient par son
       identifiant plutôt que de naître en double. */
    for (const n of p.caissesACreer) {
      cashboxesStore.set((prev) => (prev.some((b) => b.id === n.id)
        ? prev.map((b) => (b.id === n.id ? { ...b, archiveeLe: undefined } : b))
        : [...prev, n]));
    }
    if (p.fiches.length > 0) clientsStore.set((prev) => [...prev, ...p.fiches]);
    if (p.surnoms.length > 0) {
      clientsStore.set((prev) => prev.map((c) => p.surnoms.filter((s) => s.clienteId === c.id).reduce((acc, s) => ficheAvecLeSurnom(acc, s.dit), c)));
    }
    appointmentsStore.set((prev) => [...prev, ...estampilleLesPoses(p.rendezVous)]);
    /* LA PIÈCE NAÎT AVEC LE RITUEL, comme pour la saisie en série : datée du
       jour de la page, ses versements montent dessus avec leur caisse ; un
       reste dû la laisse « à régler », visible au Carnet. Un rituel à zéro
       (offert) n'émet rien. */
    let pieces = 0;
    for (const a of appointmentsStore.get()) {
      if (!p.rendezVous.some((n) => n.id === a.id)) continue;
      if ((a.priceXof ?? 0) <= 0) continue;
      if (emettreLaPieceDuRituelRegle(a, byId, branch.id).ok) pieces += 1;
    }
    setBilan({ n: p.rendezVous.length, pieces, recu: p.totalRecu, reste: p.totalReste, caisse: p.caisse, fiches: p.fiches.length });
    setEtape('inscrit');
    toast(`${p.rendezVous.length} rituel${p.rendezVous.length > 1 ? 's' : ''} inscrit${p.rendezVous.length > 1 ? 's' : ''} · ${fmtMoney(p.totalRecu, currency)} dans « ${p.caisse} »${p.totalReste > 0 ? ` · ${fmtMoney(p.totalReste, currency)} restent dus` : ''}.`);
  };

  const etatDit = (l: LigneRapprochee) => {
    if (l.etat === 'deja') {
      return <span style={pastille('var(--surface-2, #FAF8F5)', 'var(--ink-soft)', 'var(--hairline)')} title={l.deja ? `Rendez-vous du ${frJourAn(l.deja.date.slice(0, 10))} déjà au carnet` : ''}>déjà au Trône</span>;
    }
    if (l.etat === 'inconnue') return <span style={pastille('var(--brique-50, #FBF0ED)', 'var(--trv-error, #96412E)', 'var(--trv-error, #96412E)')}>inconnue</span>;
    return <span style={pastille('var(--copper-50, #F9EFE7)', 'var(--copper-700)', 'var(--copper-300)')}>à inscrire</span>;
  };

  return (
    <Modal title="Rattraper un cahier" onClose={onClose} width={1060}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          Vous photographiez une page du cahier ; Claude lit chaque ligne, le Trône la compare à ce qu’il sait déjà.
          Rien ne s’inscrit avant « Inscrire ». Tout se date du jour de la page, et aucun message ne part aux clientes.
        </div>

        {(etape === 'photo' || etape === 'lecture') && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                ref={champFichier}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => { void choisirLaPhoto(e.target.files?.[0]); e.target.value = ''; }}
              />
              <Button variant={image ? 'ghost' : 'copper'} onClick={() => champFichier.current?.click()} disabled={etape === 'lecture'}>
                {image ? 'Changer la photo' : 'Photographier une page'}
              </Button>
              {image && (
                <Button variant="copper" onClick={() => void lirePage()} disabled={etape === 'lecture'}>
                  {etape === 'lecture' ? 'Claude lit la page…' : 'Lire la page'}
                </Button>
              )}
              {erreur && (
                <div role="alert" style={{ fontSize: 12.5, color: 'var(--trv-error, #96412E)', lineHeight: 1.5 }}>{erreur}</div>
              )}
              <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                Une page à la fois, à plat, bien éclairée, la date visible. Les lignes barrées sont ignorées.
                Les pages d’octobre 2026 et après ne se rattrapent pas ici : elles se comptent au comptoir.
              </div>
            </div>
            {image && (
              <img
                src={image.apercu}
                alt="La page photographiée"
                style={{ flex: '1 1 320px', maxWidth: 420, maxHeight: 360, objectFit: 'contain', border: '1px solid var(--hairline)', borderRadius: 3, background: 'var(--surface-2, #FAF8F5)' }}
              />
            )}
          </div>
        )}

        {etape === 'tableau' && page && (
          <>
            <div className="tr-grid tr-grid--3" style={{ gap: 10 }}>
              <Field label="La date de la page">
                <ChampDeDate value={datePage} onChange={setDatePage} max={aujourdhui} ariaLabel="La date de la page" />
              </Field>
              <Field label="Le maître">
                <Select value={maitre} onChange={(e) => setMaitre(e.target.value)}>
                  <option value="">La Maison (inconnu)</option>
                  {branch.masters.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
              </Field>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                {image && <img src={image.apercu} alt="La page" style={{ maxHeight: 64, maxWidth: '100%', objectFit: 'contain', border: '1px solid var(--hairline)', borderRadius: 3 }} />}
              </div>
            </div>

            {(page.defauts.length > 0 || page.remarque) && (
              <div style={{ border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 3, background: 'var(--copper-50, #F9EFE7)', padding: '9px 12px', fontSize: 12, lineHeight: 1.55, color: 'var(--color-indigo)' }}>
                {page.remarque && <div>Claude remarque : {page.remarque}</div>}
                {page.defauts.map((d, i) => <div key={i}>· {d}</div>)}
              </div>
            )}

            {lignes.length === 0 ? (
              <div className="mnd-muted" style={{ fontSize: 12.5 }}>Aucune ligne lisible sur cette page.</div>
            ) : (
              <div style={{ border: '1px solid var(--hairline)', borderRadius: 3, maxHeight: '46vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <th style={{ width: 30 }} />
                      <th style={th}>Cliente</th>
                      <th style={th}>Rituel</th>
                      <th style={{ ...th, textAlign: 'right' }}>Argent</th>
                      <th style={th}>Moyen</th>
                      <th style={th}>État</th>
                    </tr>
                    {lignes.map((l) => {
                      const d = decisionDe(l);
                      const ecartee = d.geste === 'ecarter';
                      const montant = d.montant ?? l.ligne.montant;
                      const total = d.total ?? l.ligne.total;
                      const reste = Math.max(0, (total ?? montant) - montant);
                      const rituelChoisi = d.rituelId === undefined ? (l.rituel?.id ?? LIBRE) : (d.rituelId ?? LIBRE);
                      const fiche = d.geste === 'fiche' ? fichesDIci.find((c) => c.id === (d.clienteId ?? l.cliente?.id)) : undefined;
                      const estompee = l.etat === 'deja' || ecartee;
                      return (
                        <Fragment key={l.cle}>
                          <tr style={{ opacity: estompee ? 0.55 : 1, background: l.etat === 'inconnue' && ecartee ? 'var(--brique-50, #FBF0ED)' : undefined }}>
                            <td style={td}>
                              {l.etat !== 'deja' && (l.cliente || d.geste !== 'ecarter') && (
                                <input
                                  type="checkbox"
                                  checked={!ecartee}
                                  aria-label={`Inscrire la ligne de ${nomLu(l.ligne)}`}
                                  style={{ accentColor: 'var(--color-copper)' }}
                                  onChange={() => (ecartee
                                    ? pose(l.cle, { geste: 'fiche', clienteId: l.cliente?.id }, l)
                                    : pose(l.cle, { geste: 'ecarter' }, l))}
                                />
                              )}
                            </td>
                            <td style={td}>
                              {d.geste === 'fiche' && fiche ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  <b style={{ color: 'var(--color-indigo)' }}>{fiche.name}</b>
                                  {(l.comment && l.comment !== 'exact') || !l.cliente || l.cliente.id !== fiche.id ? (
                                    <span className="mnd-muted" style={{ fontSize: 11 }}>
                                      lu « {nomLu(l.ligne)} »{l.ligne.mention ? ` (${l.ligne.mention})` : ''}
                                      {l.comment === 'surnom' ? ' · surnom retenu' : l.comment === 'initiale' ? ' · par l’initiale' : l.comment === 'proche' ? ' · une lettre près' : ''}
                                      {' · '}
                                      <button type="button" style={lien} onClick={() => setRattache(l.cle)}>pas elle ?</button>
                                    </span>
                                  ) : l.ligne.mention ? <span className="mnd-muted" style={{ fontSize: 11 }}>({l.ligne.mention})</span> : null}
                                </div>
                              ) : d.geste === 'nouvelle' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  <b style={{ color: 'var(--copper-700)' }}>{nomLu(l.ligne)}</b>
                                  <span className="mnd-muted" style={{ fontSize: 11 }}>
                                    fiche à créer, cliente depuis le {datePage ? frJourAn(datePage) : 'jour de la page'} ·{' '}
                                    <button type="button" style={lien} onClick={() => pose(l.cle, { geste: 'ecarter' }, l)}>annuler</button>
                                  </span>
                                </div>
                              ) : d.geste === 'passage' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  <b>{nomLu(l.ligne)}</b>
                                  <span className="mnd-muted" style={{ fontSize: 11 }}>
                                    de passage, sans fiche ·{' '}
                                    <button type="button" style={lien} onClick={() => pose(l.cle, { geste: 'ecarter' }, l)}>annuler</button>
                                  </span>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                  <b>{nomLu(l.ligne)}</b>
                                  {l.ligne.mention && <span className="mnd-muted" style={{ fontSize: 11 }}>({l.ligne.mention})</span>}
                                  {l.etat === 'inconnue' && (
                                    <>
                                      {l.candidats.length > 1 && (
                                        <span style={{ fontSize: 11, color: 'var(--color-indigo)' }}>
                                          désigne {l.candidats.length} fiches :{' '}
                                          {l.candidats.map((c) => (
                                            <button key={c.id} type="button" style={{ ...lien, marginRight: 8 }} onClick={() => pose(l.cle, { geste: 'fiche', clienteId: c.id }, l)}>{c.name}</button>
                                          ))}
                                        </span>
                                      )}
                                      {rattache === l.cle ? (
                                        <div style={{ minWidth: 220 }}>
                                          <ClientPicker
                                            value=""
                                            placeholder="Chercher sa fiche…"
                                            onChange={(id) => { if (id) pose(l.cle, { geste: 'fiche', clienteId: id }, l); setRattache(''); }}
                                          />
                                        </div>
                                      ) : (
                                        <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                          <button type="button" style={lien} onClick={() => pose(l.cle, { geste: 'nouvelle' }, l)}>Créer sa fiche</button>
                                          <button type="button" style={lien} onClick={() => setRattache(l.cle)}>Rattacher à une fiche</button>
                                          <button type="button" style={lien} onClick={() => pose(l.cle, { geste: 'passage' }, l)}>De passage</button>
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                              {rattache === l.cle && d.geste === 'fiche' && (
                                <div style={{ minWidth: 220, marginTop: 6 }}>
                                  <ClientPicker
                                    value=""
                                    placeholder="Chercher sa fiche…"
                                    onChange={(id) => { if (id) pose(l.cle, { geste: 'fiche', clienteId: id }, l); setRattache(''); }}
                                  />
                                </div>
                              )}
                            </td>
                            <td style={td}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <Select
                                  value={rituelChoisi}
                                  aria-label="Le rituel du catalogue"
                                  disabled={estompee}
                                  style={{ padding: '4px 8px', fontSize: 12, maxWidth: 260 }}
                                  onChange={(e) => pose(l.cle, { rituelId: e.target.value === LIBRE ? null : e.target.value }, l)}
                                >
                                  <option value={LIBRE}>Libellé libre · « {l.ligne.rituel} »</option>
                                  <OptionsPrestations services={services} />
                                </Select>
                                {rituelChoisi !== LIBRE && (
                                  <span className="mnd-muted" style={{ fontSize: 11 }}>lu « {l.ligne.rituel} »</span>
                                )}
                              </div>
                            </td>
                            <td style={{ ...td, textAlign: 'right' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                                <Input
                                  inputMode="numeric"
                                  aria-label="L’argent reçu ce jour-là"
                                  disabled={estompee}
                                  value={String(montant)}
                                  onChange={(e) => pose(l.cle, { montant: Math.max(0, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0) }, l)}
                                  style={{ width: 104, textAlign: 'right', padding: '4px 8px', fontSize: 12, borderColor: 'var(--copper-300)', background: 'var(--copper-50, #F9EFE7)' }}
                                />
                                {(l.ligne.avance || total !== undefined) && (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--copper-700)' }}>
                                    sur
                                    <Input
                                      inputMode="numeric"
                                      aria-label="Le prix du rituel"
                                      disabled={estompee}
                                      value={total !== undefined ? String(total) : ''}
                                      placeholder="prix ?"
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10);
                                        pose(l.cle, { total: Number.isFinite(v) ? v : undefined }, l);
                                      }}
                                      style={{ width: 92, textAlign: 'right', padding: '3px 6px', fontSize: 11.5 }}
                                    />
                                    {reste > 0 && <span>reste {fmtMoney(reste, currency)}</span>}
                                    {l.ligne.avance && total === undefined && <span>avance, prix à préciser</span>}
                                  </span>
                                )}
                                {l.ligne.note && <span className="mnd-muted" style={{ fontSize: 11, textAlign: 'right' }}>{l.ligne.note}</span>}
                                {l.voisin && l.etat !== 'deja' && (
                                  <span style={{ fontSize: 11, color: 'var(--copper-700)', textAlign: 'right' }}>
                                    un rituel du {frJourAn(l.voisin.date.slice(0, 10))} est déjà au Trône pour un autre montant
                                  </span>
                                )}
                                {l.doublonDansLaPage && <span style={{ fontSize: 11, color: 'var(--copper-700)' }}>même ligne plus haut dans la page</span>}
                              </div>
                            </td>
                            <td style={td}>
                              <Select
                                value={d.moyen ?? l.ligne.moyen}
                                aria-label="Le moyen de règlement"
                                disabled={estompee}
                                style={{ padding: '4px 8px', fontSize: 12, borderColor: (d.moyen ?? l.ligne.moyen) === 'inconnu' ? 'var(--copper-300)' : undefined }}
                                onChange={(e) => pose(l.cle, { moyen: e.target.value as MoyenDuCahier }, l)}
                              >
                                {MOYENS_DU_CAHIER.map((m) => <option key={m} value={m}>{MOYEN_DIT[m]}</option>)}
                              </Select>
                            </td>
                            <td style={td}>{etatDit(l)}</td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
              <span style={{ fontSize: 12, lineHeight: 1.5, color: caisse && !caisse.ok ? 'var(--trv-error, #96412E)' : 'var(--ink-soft)', flex: '1 1 320px' }}>
                {!datePage ? 'Indiquez la date de la page pour savoir où va l’argent.'
                  : caisse && caisse.ok ? `${caisse.pourquoi} Caisse : « ${caisse.caisse} ».`
                    : caisse?.refus}
                {inconnuesSansGeste > 0 && ` ${inconnuesSansGeste} inconnue${inconnuesSansGeste > 1 ? 's' : ''} attend${inconnuesSansGeste > 1 ? 'ent' : ''} un geste : créer sa fiche, rattacher, ou de passage.`}
              </span>
              <Button variant="ghost" onClick={onClose}>Écarter la page</Button>
              <Button variant="ghost" onClick={pageSuivante}>Page suivante</Button>
              <Button variant="copper" disabled={retenues.length === 0 || !datePage || !caisse || !caisse.ok} onClick={inscrire}>
                Inscrire {retenues.length} ligne{retenues.length > 1 ? 's' : ''}
              </Button>
            </div>
          </>
        )}

        {etape === 'inscrit' && bilan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 3, padding: '12px 14px', fontSize: 13, lineHeight: 1.7, color: 'var(--color-indigo)' }}>
              <b>{bilan.n} rituel{bilan.n > 1 ? 's' : ''}</b> inscrit{bilan.n > 1 ? 's' : ''} au {frJourAn(datePage)}, honoré{bilan.n > 1 ? 's' : ''}, {bilan.pieces} pièce{bilan.pieces > 1 ? 's' : ''} émise{bilan.pieces > 1 ? 's' : ''}.<br />
              {fmtMoney(bilan.recu, currency)} dans « {bilan.caisse} »{bilan.reste > 0 ? <> · <b>{fmtMoney(bilan.reste, currency)}</b> restent dus, visibles au Carnet</> : ''}.
              {bilan.fiches > 0 && <><br />{bilan.fiches} fiche{bilan.fiches > 1 ? 's' : ''} ouverte{bilan.fiches > 1 ? 's' : ''} au carnet (segment Prospect, à compléter).</>}
              <br />Aucun message n’est parti. La page se retire d’un geste dans « Saisir en série › Les séries posées ».
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={onClose}>Fermer</Button>
              <Button variant="copper" onClick={pageSuivante}>Page suivante</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
