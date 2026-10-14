import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Modal, Select, Textarea, toast } from '../../../../../ds/components';
import { useBranch } from '../../../../../shared/branches';
import { fmtMoney } from '../../../../../shared/currency';
import { resteDuPar, usePrets } from '../../../../../shared/foyer';
import {
  ARRIVEE_DEFAUT, ETAPES_DU_DEPART, QUAND_DANS_L_ARRIVEE, TYPES_DE_DEPART,
  ajouteJours, avancementDeLArrivee, dateDite, dernierJourPropose, ecartEnJours, estPartie, etapesDArrivee, soldeDeToutCompte,
  type Depart, type Entretien, type QuandDansLArrivee, type TypeDeDepart,
} from '../../../../../shared/rh-pur';
import { modelesDArriveeStore, nouvelleLigneRh, useModelesDArrivee, useRegistreRh, useReglagesRh } from '../../../../../shared/rh';
import { staffStore, useFonctions, useStaff, type StaffMember } from '../data';
import { congeBalance, parametersFor, useLeave } from '../payroll';
import { Coche, Repliee, aujourdhuiRh, useQuiEcrit } from './_ui';
import { prepareLaLettre, type ModeleRh } from './lettres';

/* ══ ARRIVÉES ET DÉPARTS — 14 octobre 2026 ════════════════════════════
   L'arrivée : la liste du premier mois, cochée au fil des jours, réglable
   par fonction. Le départ : préavis, solde de tout compte, certificat,
   matériel, accès, entretien, puis la fiche S'ARCHIVE. « Retirer » effaçait
   la fiche, la pièce d'identité et les lettres de prêt ; un ancien employé
   peut demander une attestation des années plus tard. */

const metsAJour = (id: string, patch: Partial<StaffMember>) =>
  staffStore.set((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

export default function RhArriveesDeparts() {
  const { branch } = useBranch();
  const [staff] = useStaff();
  const [modeles] = useModelesDArrivee();
  const { moi } = useQuiEcrit();
  const navigate = useNavigate();
  const registre = useRegistreRh();
  const jour = aujourdhuiRh();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [depart, setDepart] = useState<StaffMember | 'choisir' | null>(null);
  const [reglerListe, setReglerListe] = useState(false);
  const [voirParties, setVoirParties] = useState(false);
  const equipe = staff.filter((m) => m.branchId === branch.id);
  const actives = equipe.filter((m) => !estPartie(m, jour));
  const parties = equipe.filter((m) => estPartie(m, jour)).sort((a, b) => (b.archiveeLe ?? '').localeCompare(a.archiveeLe ?? ''));
  const arrivees = actives.filter((m) => {
    if (!m.since) return false;
    const n = ecartEnJours(m.since, jour);
    const a = avancementDeLArrivee(m, modeles);
    return n <= 90 && n >= -60 && (a.faites < a.total || n <= 30);
  });
  const departs = actives.filter((m) => m.depart);
  const ouvreLaLettre = (modele: ModeleRh, fiche: StaffMember) => {
    const id = prepareLaLettre({ modele, fiche, branchId: branch.id, moi });
    navigate('/secretariat', { state: { onglet: 'documents', ouvre: id } });
  };
  const planifie = (fiche: StaffMember, type: Entretien['type'], prevuLe: string) => {
    if (registre.some((l) => l.genre === 'entretien' && l.staffId === fiche.id && l.type === type)) { toast('Cet entretien est déjà au calendrier des entretiens.'); return; }
    nouvelleLigneRh<Entretien>({ genre: 'entretien', branchId: branch.id, staffId: fiche.id, type, prevuLe, par: moi });
    toast(`Posé au ${dateDite(prevuLe)}, dans Entretiens.`);
  };

  return (
    <div className="sad-onglet">
      <div className="sad-outils">
        <span className="sad-doux">{arrivees.length} arrivée{arrivees.length > 1 ? 's' : ''} · {departs.length} départ{departs.length > 1 ? 's' : ''} en cours</span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => setReglerListe(true)}>Régler la liste par fonction</Button>
          <Button variant="copper" onClick={() => setDepart('choisir')}>+ Préparer un départ</Button>
        </span>
      </div>

      <p className="sad-mois">Les arrivées</p>
      {arrivees.length === 0 && <div className="sec-vide">Aucune arrivée en cours. Une place préparée dans « Le personnel » (date d’entrée) paraît ici avec sa liste du premier mois.</div>}
      <div className="sad-liste">
        {arrivees.map((m) => {
          const a = avancementDeLArrivee(m, modeles);
          const etapes = etapesDArrivee(m.role, !!m.auFauteuil, modeles);
          const bascule = (cle: string) => metsAJour(m.id, { integration: { ...(m.integration ?? {}), [cle]: m.integration?.[cle] ? '' : jour } });
          return (
            <Repliee key={m.id} ouverte={ouvert === m.id} surBascule={() => setOuvert(ouvert === m.id ? null : m.id)}
              num={m.since ? dateDite(m.since) : 'à dater'} titre={m.name} sous={m.role}
              badge={`${a.faites} / ${a.total}`} fait={a.faites === a.total}>
              <div className="rh-etapes">
                {(Object.keys(QUAND_DANS_L_ARRIVEE) as QuandDansLArrivee[]).map((q) => {
                  const ici = etapes.filter((e) => e.quand === q);
                  if (!ici.length) return null;
                  return (
                    <div key={q} className="rh-etape">
                      <h4>{QUAND_DANS_L_ARRIVEE[q]}</h4>
                      <div className="rh-coches">
                        {ici.map((e) => <Coche key={e.cle} fait={m.integration?.[e.cle] || undefined} texte={e.texte} surBascule={() => bascule(e.cle)} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="sec-actions">
                <Button size="sm" variant="ghost" onClick={() => ouvreLaLettre('contrat-travail', m)}>Préparer le contrat</Button>
                {m.since && <Button size="sm" variant="ghost" onClick={() => planifie(m, 'trente-jours', ajouteJours(m.since, 30))}>Poser le point à 30 jours</Button>}
                {m.finEssai && <Button size="sm" variant="ghost" onClick={() => planifie(m, 'fin-essai', m.finEssai as string)}>Poser l’entretien de fin d’essai</Button>}
              </div>
            </Repliee>
          );
        })}
      </div>

      <p className="sad-mois">Les départs</p>
      {departs.length === 0 && <div className="sec-vide">Aucun départ en cours.</div>}
      <div className="sad-liste">
        {departs.map((m) => {
          const d = m.depart as Depart;
          const faites = ETAPES_DU_DEPART.filter((e) => d.etapes[e.cle]).length;
          return (
            <Repliee key={m.id} ouverte={false} surBascule={() => setDepart(m)}
              num={`dernier jour ${dateDite(d.dernierJour)}`} titre={`${TYPES_DE_DEPART[d.type]} · ${m.name}`}
              sous={d.courrier ? `Courrier ${d.courrier}` : m.role}
              badge={`${faites} / ${ETAPES_DU_DEPART.length}`} urgent={ecartEnJours(jour, d.dernierJour) <= 7} />
          );
        })}
      </div>

      {parties.length > 0 && (
        <>
          <button type="button" className="sad-lien" onClick={() => setVoirParties(!voirParties)}>{voirParties ? 'Cacher' : 'Voir'} les {parties.length} ancienne{parties.length > 1 ? 's' : ''} de la Maison</button>
          {voirParties && (
            <div className="sad-liste">
              {parties.map((m) => (
                <div key={m.id} className="sad-ligne">
                  <div className="sad-ligne__tete" style={{ cursor: 'default' }}>
                    <span className="sad-ligne__num">partie le {dateDite(m.archiveeLe)}</span>
                    <span className="sad-ligne__quoi"><b>{m.name}</b><small>{m.role}{m.depart ? ` · ${TYPES_DE_DEPART[m.depart.type]}` : ''}</small></span>
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="sad-lien" onClick={() => ouvreLaLettre('certificat-fin-contrat', m)}>Certificat</button>
                      <button type="button" className="sad-lien" onClick={() => metsAJour(m.id, { archiveeLe: undefined })}>Réintégrer</button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {depart === 'choisir' && <ChoisirLaPersonne actives={actives.filter((m) => !m.depart)} onClose={() => setDepart(null)} onChoix={(m) => setDepart(m)} />}
      {depart && depart !== 'choisir' && <FicheDuDepart fiche={staff.find((x) => x.id === depart.id) ?? depart} onClose={() => setDepart(null)} ouvreLaLettre={ouvreLaLettre} />}
      {reglerListe && <ListeParFonction onClose={() => setReglerListe(false)} />}
    </div>
  );
}

function ChoisirLaPersonne({ actives, onClose, onChoix }: { actives: StaffMember[]; onClose: () => void; onChoix: (m: StaffMember) => void }) {
  const [id, setId] = useState(actives[0]?.id ?? '');
  return createPortal(
    <Modal title="Préparer un départ" onClose={onClose} width={460}>
      <div className="sad-form">
        <Field label="Qui part"><Select value={id} onChange={(e) => setId(e.target.value)}>{actives.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}</Select></Field>
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="copper" disabled={!id} onClick={() => { const m = actives.find((x) => x.id === id); if (m) onChoix(m); }}>Continuer</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

function FicheDuDepart({ fiche, onClose, ouvreLaLettre }: { fiche: StaffMember; onClose: () => void; ouvreLaLettre: (m: ModeleRh, f: StaffMember) => void }) {
  const { currency } = useBranch();
  const [reglages] = useReglagesRh();
  const [conges] = useLeave();
  const [prets] = usePrets();
  const jour = aujourdhuiRh();
  const d0 = fiche.depart;
  const [type, setType] = useState<TypeDeDepart>(d0?.type ?? 'demission');
  const [annonceLe, setAnnonceLe] = useState(d0?.annonceLe ?? jour);
  const propose = dernierJourPropose(annonceLe, fiche.role, reglages);
  const [dernierJour, setDernierJour] = useState(d0?.dernierJour ?? propose ?? '');
  const [courrier, setCourrier] = useState(d0?.courrier ?? '');
  const [etapes, setEtapes] = useState<Record<string, string>>(d0?.etapes ?? {});
  const [entretien, setEntretien] = useState(d0?.entretien ?? '');
  const p = parametersFor(jour.slice(0, 7));
  const solde = soldeDeToutCompte({
    baseXof: fiche.salaireXof,
    congesRestants: fiche.since ? congeBalance(fiche.since, conges, fiche.id, p.congesJoursParMois).solde : 0,
    resteDuPretXof: resteDuPar(Array.isArray(prets) ? prets : [], fiche.id),
  });
  const depart = (): Depart => ({ type, annonceLe, dernierJour, courrier: courrier.trim() || undefined, etapes, entretien: entretien.trim() || undefined });
  const garde = () => {
    if (!dernierJour) { toast('Quel est son dernier jour ?'); return; }
    metsAJour(fiche.id, { depart: depart() });
    toast('Départ gardé.');
    onClose();
  };
  const archive = () => {
    if (!dernierJour) { toast('Quel est son dernier jour ?'); return; }
    metsAJour(fiche.id, { depart: depart(), archiveeLe: dernierJour <= jour ? dernierJour : jour });
    toast(`${fiche.name} passe aux anciennes de la Maison. Coupez son accès dans Accès & rôles si ce n’est fait.`, 7000);
    onClose();
  };
  return createPortal(
    <Modal title={`Le départ de ${fiche.name}`} onClose={onClose} width={640}>
      <div className="sad-form">
        <div className="tr-grid tr-grid--3" style={{ gap: 12 }}>
          <Field label="Départ"><Select value={type} onChange={(e) => setType(e.target.value as TypeDeDepart)}>{(Object.keys(TYPES_DE_DEPART) as TypeDeDepart[]).map((t) => <option key={t} value={t}>{TYPES_DE_DEPART[t]}</option>)}</Select></Field>
          <Field label="Annoncé le"><Input type="date" value={annonceLe} onChange={(e) => setAnnonceLe(e.target.value)} /></Field>
          <Field label="Dernier jour"><Input type="date" value={dernierJour} onChange={(e) => setDernierJour(e.target.value)} /></Field>
        </div>
        <p className="sad-doux">
          {propose ? <>Préavis réglé pour « {fiche.role} » : dernier jour proposé le {dateDite(propose)} <button type="button" className="sad-lien" onClick={() => setDernierJour(propose)}>le poser</button>.</>
            : <>Le préavis de « {fiche.role} » n’est pas réglé : <span className="rh-a-confirmer">à confirmer avec le comptable</span>.</>}
        </p>
        <Field label="Numéro du courrier (lettre reçue ou remise)"><Input value={courrier} onChange={(e) => setCourrier(e.target.value)} placeholder="A-2026-021" /></Field>
        <div className="rh-coches">
          {ETAPES_DU_DEPART.map((e) => (
            <Coche key={e.cle} fait={etapes[e.cle] || undefined} texte={e.texte} surBascule={() => setEtapes({ ...etapes, [e.cle]: etapes[e.cle] ? '' : jour })} />
          ))}
        </div>
        <div className="rh-garde">
          <b>Solde de tout compte, ses éléments</b><br />
          Congés non pris : {solde.congesJours} jour{solde.congesJours > 1 ? 's' : ''}, soit environ {fmtMoney(solde.indemniteCongesEstimeeXof, currency)} (estimation, base ÷ 26 jours : <span className="rh-a-confirmer">à confirmer avec le comptable</span>).<br />
          Reste dû sur son prêt : {fmtMoney(solde.resteDuPretXof, currency)}, selon l’engagement signé.<br />
          Le salaire du dernier mois passe par le run de paie.
        </div>
        <Field label="Entretien de départ : ses mots, tels quels (direction seule)"><Textarea rows={3} value={entretien} onChange={(e) => setEntretien(e.target.value)} /></Field>
        <div className="sec-actions">
          {type === 'demission' && <Button size="sm" variant="ghost" onClick={() => { garde(); ouvreLaLettre('acceptation-demission', fiche); }}>Lettre : acceptation de démission</Button>}
          <Button size="sm" variant="ghost" onClick={() => { garde(); ouvreLaLettre('certificat-fin-contrat', fiche); }}>Certificat de travail</Button>
        </div>
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          {d0 && <Button variant="ghost" onClick={() => { metsAJour(fiche.id, { depart: undefined }); toast('Départ annulé.'); onClose(); }}>Annuler le départ</Button>}
          <Button variant="ghost" onClick={archive}>Archiver la fiche</Button>
          <Button variant="copper" onClick={garde}>Garder</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

function ListeParFonction({ onClose }: { onClose: () => void }) {
  const [fonctions] = useFonctions();
  const [modeles] = useModelesDArrivee();
  const [fonction, setFonction] = useState(fonctions[0] ?? '');
  const choisies = modeles[fonction];
  const actives = new Set(choisies && choisies.length ? choisies : ARRIVEE_DEFAUT.map((e) => e.cle));
  const bascule = (cle: string) => {
    const s = new Set(actives);
    if (s.has(cle)) s.delete(cle); else s.add(cle);
    modelesDArriveeStore.set((prev) => ({ ...prev, [fonction]: ARRIVEE_DEFAUT.map((e) => e.cle).filter((k) => s.has(k)) }));
  };
  return createPortal(
    <Modal title="La liste du premier mois, par fonction" onClose={onClose} width={560}>
      <div className="sad-form">
        <Field label="Fonction"><Select value={fonction} onChange={(e) => setFonction(e.target.value)}>{fonctions.map((f) => <option key={f} value={f}>{f}</option>)}</Select></Field>
        {!(choisies && choisies.length) && <p className="sad-doux">Pas encore réglée : la liste par défaut s’applique (sans les étapes du fauteuil pour qui n’y est pas).</p>}
        <div className="rh-coches">
          {ARRIVEE_DEFAUT.map((e) => (
            <label key={e.cle} className="rh-coche"><input type="checkbox" checked={actives.has(e.cle)} onChange={() => bascule(e.cle)} /><span>{e.texte} <small>· {QUAND_DANS_L_ARRIVEE[e.quand].toLowerCase()}</small></span></label>
          ))}
        </div>
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}><Button variant="copper" onClick={onClose}>Fermer</Button></div>
      </div>
    </Modal>,
    document.body,
  );
}
