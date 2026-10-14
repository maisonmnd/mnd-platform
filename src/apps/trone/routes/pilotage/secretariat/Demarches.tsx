import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Modal, Textarea, toast } from '../../../../../ds/components';
import { pieces, useSecretariat } from '../../../../../shared/secretariat';
import { uid } from '../../../../../shared/store';
import {
  aujourdhui, basculeEtape, contactsDe, courriersDe, demarchesDe, effaceLaLigne, nouvelleDemarche, retouche, termineLaDemarche,
} from '../../../../../shared/secretariat-admin';
import {
  anneesCloses, dateCourte, enAttenteDUneReponse, estFige, ETATS_DEMARCHE, montantDit, tientLeSecretariat, TYPES_DEMARCHE, voit,
  type Demarche, type Devise, type Qui, type TypeDemarche,
} from '../../../../../shared/secretariat-admin-pur';
import { CasePrivee, LesFichiers, rappel, Repliee } from './_admin';

/* ══ LES DÉMARCHES — 14 octobre 2026 ═════════════════════════════════
   Un dossier en cours (APIEX, OAPI, Meta, banque, un achat) : ses étapes à
   cocher, sa prochaine action datée, les lettres et le courrier qui en font
   partie, ses frais pour mémoire. La dépense, elle, s'inscrit aux Finances. */

export function LesDemarches({ qui, branchId, ouvreUnDocument }: { qui: Qui; branchId: string; ouvreUnDocument: (id: string) => void }) {
  const [lignes] = useSecretariat();
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [edite, setEdite] = useState<Demarche | 'neuve' | null>(null);
  const [finies, setFinies] = useState(false);
  const [etape, setEtape] = useState('');
  const [frais, setFrais] = useState({ libelle: '', montant: '', devise: 'XOF' as Devise });
  const jour = aujourdhui();
  const tient = tientLeSecretariat(qui);
  const closes = anneesCloses(lignes as { genre: string; annee?: unknown }[]);
  const docs = pieces(lignes);
  const courriers = courriersDe(lignes);
  const toutes = useMemo(() => demarchesDe(lignes).filter((d) => voit(d, qui)), [lignes, qui]);
  const enCours = toutes.filter((d) => d.etat === 'en-cours' || d.etat === 'en-attente').sort((a, b) => (a.prochaineLe ?? '9999').localeCompare(b.prochaineLe ?? '9999'));
  const closesListe = toutes.filter((d) => d.etat === 'terminee' || d.etat === 'abandonnee').sort((a, b) => (b.termineeLe ?? '').localeCompare(a.termineeLe ?? ''));
  const liste = finies ? closesListe : enCours;

  return (
    <div className="sad-onglet">
      <div className="sad-outils">
        <div className="mnd-segs">
          <button type="button" className={`mnd-seg${!finies ? ' is-active' : ''}`} onClick={() => { setFinies(false); setOuvert(null); }}>En cours · {enCours.length}</button>
          <button type="button" className={`mnd-seg${finies ? ' is-active' : ''}`} onClick={() => { setFinies(true); setOuvert(null); }}>Terminées · {closesListe.length}</button>
        </div>
        {tient && <Button variant="copper" onClick={() => setEdite('neuve')}>+ Nouvelle démarche</Button>}
      </div>
      {liste.length === 0 && <div className="sec-vide">{finies ? 'Aucune démarche terminée.' : 'Aucune démarche en cours. APIEX, OAPI, la banque, un achat : chacune a ses étapes.'}</div>}
      <div className="sad-liste">
        {liste.map((d) => {
          const faites = d.etapes.filter((e) => e.faiteLe).length;
          const rp = d.etat === 'en-cours' || d.etat === 'en-attente' ? rappel(d.prochaineLe, jour) : {};
          const fige = estFige(d, closes, qui.direction);
          const ecrit = tient && !fige;
          const liees = courriers.filter((c) => c.demarcheId === d.id && voit(c, qui));
          const total = d.frais.reduce((m, f) => { m[f.devise] = (m[f.devise] ?? 0) + f.montant; return m; }, {} as Record<string, number>);
          return (
            <Repliee
              key={d.id} ouverte={ouvert === d.id} surBascule={() => { setOuvert(ouvert === d.id ? null : d.id); setEtape(''); }}
              num={TYPES_DEMARCHE[d.type]}
              titre={d.titre}
              sous={[d.aupres ? `auprès de ${d.aupres}` : '', d.etapes.length ? `${faites} étape${faites > 1 ? 's' : ''} sur ${d.etapes.length}` : '', d.prochaine ? `ensuite : ${d.prochaine}` : '', d.prive ? 'privé' : ''].filter(Boolean).join(' · ') || undefined}
              badge={rp.badge ?? (d.etat === 'terminee' && d.termineeLe ? `terminée le ${dateCourte(d.termineeLe)}` : ETATS_DEMARCHE[d.etat])}
              urgent={rp.urgent} fait={d.etat === 'terminee'}
            >
              {d.etapes.length > 0 && (
                <ol className="sad-etapes">
                  {d.etapes.map((e) => (
                    <li key={e.id}>
                      <label className="sad-case"><input type="checkbox" checked={!!e.faiteLe} disabled={!ecrit} onChange={() => basculeEtape(d, e.id)} /> {e.texte}{e.faiteLe ? <small> · faite le {dateCourte(e.faiteLe)}</small> : null}</label>
                    </li>
                  ))}
                </ol>
              )}
              {ecrit && (
                <div className="sad-ajout-ligne">
                  <Input value={etape} onChange={(e) => setEtape(e.target.value)} placeholder="Une étape de plus" aria-label="Nouvelle étape" />
                  <Button size="sm" variant="ghost" onClick={() => { if (!etape.trim()) return; retouche(d, { etapes: [...d.etapes, { id: uid(), texte: etape.trim() }] }); setEtape(''); }}>Ajouter</Button>
                </div>
              )}
              <dl className="sad-fiche">
                <dt>Prochaine action</dt>
                <dd>{ecrit ? (
                  <div className="sad-ajout-ligne">
                    <Input defaultValue={d.prochaine ?? ''} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (d.prochaine ?? '')) retouche(d, { prochaine: v || undefined }); }} placeholder="Relancer, déposer, payer…" aria-label="Prochaine action" />
                    <Input type="date" defaultValue={d.prochaineLe ?? ''} onBlur={(e) => { if (e.target.value !== (d.prochaineLe ?? '')) retouche(d, { prochaineLe: e.target.value || undefined }); }} aria-label="Date de la prochaine action" style={{ maxWidth: 170 }} />
                  </div>
                ) : `${d.prochaine ?? 'rien de dit'}${d.prochaineLe ? `, le ${dateCourte(d.prochaineLe)}` : ''}`}</dd>
                {(d.pieceIds.length > 0 || ecrit) && <><dt>Lettres</dt><dd>
                  <div className="sad-fichiers">
                    {d.pieceIds.map((id) => { const p = docs.find((x) => x.id === id); return p ? <button key={id} type="button" className="sec-puce" onClick={() => ouvreUnDocument(id)}>{p.numero ?? `Brouillon : ${p.titre}`}</button> : null; })}
                    {ecrit && (
                      <select className="mnd-input" value="" onChange={(e) => { if (e.target.value) retouche(d, { pieceIds: [...d.pieceIds, e.target.value] }); }} aria-label="Lier un document" style={{ maxWidth: 260 }}>
                        <option value="">+ Lier un document du registre</option>
                        {docs.filter((p) => !d.pieceIds.includes(p.id) && p.entite !== 'perso').slice(-40).reverse().map((p) => <option key={p.id} value={p.id}>{p.numero ?? 'brouillon'} · {p.titre}</option>)}
                      </select>
                    )}
                  </div>
                </dd></>}
                {liees.length > 0 && <><dt>Courrier</dt><dd>{liees.map((c) => `${c.numero} (${c.correspondant})`).join(' · ')}</dd></>}
                <dt>Frais</dt><dd>
                  {d.frais.length ? d.frais.map((f, i) => <div key={i}>{f.libelle} · {montantDit(f.montant, f.devise)} · {dateCourte(f.le)}</div>) : <span className="sad-doux">Aucun.</span>}
                  {Object.keys(total).length > 1 || d.frais.length > 1 ? <div><b>Total : {Object.entries(total).map(([k, v]) => montantDit(v, k as Devise)).join(' + ')}</b></div> : null}
                  {ecrit && (
                    <div className="sad-ajout-ligne">
                      <Input value={frais.libelle} onChange={(e) => setFrais({ ...frais, libelle: e.target.value })} placeholder="RCCM, timbre, transport…" aria-label="Frais" />
                      <Input inputMode="decimal" value={frais.montant} onChange={(e) => setFrais({ ...frais, montant: e.target.value })} placeholder="Montant" aria-label="Montant" style={{ maxWidth: 120 }} />
                      <select className="mnd-input" value={frais.devise} onChange={(e) => setFrais({ ...frais, devise: e.target.value as Devise })} style={{ maxWidth: 80 }}><option value="XOF">F</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
                      <Button size="sm" variant="ghost" onClick={() => {
                        const n = parseFloat(frais.montant.replace(',', '.'));
                        if (!frais.libelle.trim() || !Number.isFinite(n)) { toast('Un libellé et un montant.'); return; }
                        retouche(d, { frais: [...d.frais, { libelle: frais.libelle.trim(), montant: n, devise: frais.devise, le: jour }] });
                        setFrais({ libelle: '', montant: '', devise: frais.devise });
                        toast('Noté ici pour mémoire ; la dépense s’inscrit aux Finances.');
                      }}>Noter</Button>
                      <Button size="sm" variant="ghost" onClick={() => navigate('/depenses')}>Aux dépenses</Button>
                    </div>
                  )}
                </dd>
                {d.note && <><dt>Note</dt><dd>{d.note}</dd></>}
              </dl>
              <LesFichiers ligne={d} peutAjouter={ecrit} />
              {fige && <p className="sad-doux">Son année est close : cette démarche ne bouge plus.</p>}
              {ecrit && (
                <div className="sec-actions">
                  {d.etat === 'en-cours' && <Button size="sm" variant="ghost" onClick={() => {
                    const p = enAttenteDUneReponse(d, jour);
                    retouche(d, p);
                    toast(`En attente d’une réponse ; ${p.prochaine ?? 'la suite'} le ${dateCourte(p.prochaineLe)}.`, 6000);
                  }}>C’est envoyé, en attente</Button>}
                  {d.etat === 'en-attente' && <Button size="sm" variant="ghost" onClick={() => retouche(d, { etat: 'en-cours' })}>Reprendre</Button>}
                  {(d.etat === 'en-cours' || d.etat === 'en-attente') && <Button size="sm" variant="copper" onClick={() => { termineLaDemarche(d); toast('Démarche terminée.'); setOuvert(null); }}>Terminée</Button>}
                  {(d.etat === 'en-cours' || d.etat === 'en-attente') && <Button size="sm" variant="ghost" onClick={() => retouche(d, { etat: 'abandonnee' })}>Abandonnée</Button>}
                  {(d.etat === 'terminee' || d.etat === 'abandonnee') && <Button size="sm" variant="ghost" onClick={() => retouche(d, { etat: 'en-cours', termineeLe: undefined })}>Rouvrir</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setEdite(d)}>Modifier</Button>
                  {qui.direction && <Button size="sm" variant="ghost" onClick={() => { effaceLaLigne(d); toast('Démarche effacée.'); }}>Effacer</Button>}
                </div>
              )}
            </Repliee>
          );
        })}
      </div>
      {edite && <FicheDeLaDemarche qui={qui} branchId={branchId} demarche={edite === 'neuve' ? undefined : edite} onClose={() => setEdite(null)} />}
    </div>
  );
}

function FicheDeLaDemarche({ qui, branchId, demarche, onClose }: { qui: Qui; branchId: string; demarche?: Demarche; onClose: () => void }) {
  const [lignes] = useSecretariat();
  const contacts = contactsDe(lignes);
  const [titre, setTitre] = useState(demarche?.titre ?? '');
  const [type, setType] = useState<TypeDemarche>(demarche?.type ?? 'administration');
  const [aupres, setAupres] = useState(demarche?.aupres ?? '');
  const [etapes, setEtapes] = useState('');
  const [prochaine, setProchaine] = useState(demarche?.prochaine ?? '');
  const [prochaineLe, setProchaineLe] = useState(demarche?.prochaineLe ?? '');
  const [note, setNote] = useState(demarche?.note ?? '');
  const [prive, setPrive] = useState(!!demarche?.prive);
  const garde = () => {
    if (!titre.trim()) { toast('Comment s’appelle cette démarche ?'); return; }
    const contactId = contacts.find((k) => k.nom.toLowerCase() === aupres.trim().toLowerCase())?.id;
    const champs = { titre: titre.trim(), type, aupres: aupres.trim(), contactId, prochaine: prochaine.trim() || undefined, prochaineLe: prochaineLe || undefined, note: note.trim() || undefined };
    if (demarche) retouche(demarche, { ...champs, prive: prive || undefined });
    else nouvelleDemarche({ branchId, par: qui.moi, ...champs, etapes: etapes.split('\n').map((x) => x.trim()).filter(Boolean), prive });
    onClose();
  };
  return createPortal(
    <Modal title={demarche ? 'Modifier la démarche' : 'Nouvelle démarche'} onClose={onClose} width={620}>
      <div className="sad-form">
        <Field label="La démarche"><Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Dépôt des marques à l’OAPI, ouverture du compte…" /></Field>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Genre">
            <select className="mnd-input" value={type} onChange={(e) => setType(e.target.value as TypeDemarche)}>
              {(Object.keys(TYPES_DEMARCHE) as TypeDemarche[]).map((k) => <option key={k} value={k}>{TYPES_DEMARCHE[k]}</option>)}
            </select>
          </Field>
          <Field label="Auprès de">
            <Input value={aupres} onChange={(e) => setAupres(e.target.value)} list="sad-contacts-d" placeholder="APIEX, la banque…" />
            <datalist id="sad-contacts-d">{contacts.map((k) => <option key={k.id} value={k.nom} />)}</datalist>
          </Field>
        </div>
        {!demarche && <Field label="Les étapes (une par ligne)"><Textarea value={etapes} onChange={(e) => setEtapes(e.target.value)} rows={4} placeholder={'Réunir les pièces\nDéposer le dossier\nPayer les frais\nRecevoir la réponse'} /></Field>}
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Prochaine action"><Input value={prochaine} onChange={(e) => setProchaine(e.target.value)} /></Field>
          <Field label="Le"><Input type="date" value={prochaineLe} onChange={(e) => setProchaineLe(e.target.value)} /></Field>
        </div>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
        <CasePrivee qui={qui} value={prive} onChange={setPrive} />
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="copper" onClick={garde}>{demarche ? 'Garder' : 'Ouvrir la démarche'}</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
