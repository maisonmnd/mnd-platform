import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Input, Modal, Select, Textarea, toast } from '../../../../../ds/components';
import { useBranch } from '../../../../../shared/branches';
import { lienWaMe } from '../../../../../shared/conversations';
import { maisonNom } from '../../../../../shared/identite';
import {
  COLONNES_DU_RECRUTEMENT, ETAPES_DE_CANDIDATURE, NIVEAUX, SOURCES, GARDE_DES_CANDIDATURES_MOIS,
  candidaturesAEffacer, dateDite,
  type Candidature, type EtapeDeCandidature, type Niveau, type Poste, type SourceDeCandidature,
} from '../../../../../shared/rh-pur';
import { effaceLaLigneRh, nouvelleLigneRh, retoucheRh, useRegistreRh, useReglagesRh } from '../../../../../shared/rh';
import { useFonctions } from '../data';
import { aujourdhuiRh, useQuiEcrit } from './_ui';
import { useFamillesDesGestes } from './familles';

/* ══ LE RECRUTEMENT — 14 octobre 2026 ═════════════════════════════════
   Un poste ouvert, les candidatures en colonnes (reçue, appel, essai
   pratique, décision), l'essai noté sur la grille des gestes, une réponse à
   chacune. Une candidature non retenue se PROPOSE à l'effacement après la
   durée de garde : rien ne part seul. */

export default function RhRecrutement({ preparerUneArrivee }: { preparerUneArrivee: (nom: string, telephone?: string) => void }) {
  const { branch } = useBranch();
  const { moi } = useQuiEcrit();
  const registre = useRegistreRh();
  const [reglages] = useReglagesRh();
  const jour = aujourdhuiRh();
  const postes = registre.filter((l): l is Poste => l.genre === 'poste' && l.branchId === branch.id);
  const candidatures = registre.filter((l): l is Candidature => l.genre === 'candidature' && l.branchId === branch.id);
  const ouverts = postes.filter((p) => !p.fermeLe);
  const [poste, setPoste] = useState<Poste | 'neuf' | null>(null);
  const [cand, setCand] = useState<Candidature | 'neuve' | null>(null);
  const aEffacer = candidaturesAEffacer(candidatures, reglages, jour);
  const actives = candidatures.filter((c) => COLONNES_DU_RECRUTEMENT.includes(c.etape));
  const closes = candidatures.filter((c) => !COLONNES_DU_RECRUTEMENT.includes(c.etape));

  return (
    <div className="sad-onglet">
      <div className="sad-outils">
        <span className="sad-doux">{ouverts.length} poste{ouverts.length > 1 ? 's' : ''} ouvert{ouverts.length > 1 ? 's' : ''} · {actives.length} candidature{actives.length > 1 ? 's' : ''} en cours</span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => setCand('neuve')}>+ Candidature</Button>
          <Button variant="copper" onClick={() => setPoste('neuf')}>+ Ouvrir un poste</Button>
        </span>
      </div>
      {ouverts.map((p) => (
        <div key={p.id} className="sad-ligne">
          <button type="button" className="sad-ligne__tete" onClick={() => setPoste(p)}>
            <span className="sad-ligne__num">depuis le {dateDite(p.ouvertLe)}</span>
            <span className="sad-ligne__quoi"><b>{p.titre}</b><small>{p.fonction}{p.contrat ? ` · ${p.contrat}` : ''}{p.fourchette ? ` · ${p.fourchette}` : ''}</small></span>
            <span className="sad-badge">{candidatures.filter((c) => c.posteId === p.id).length} candidature(s)</span>
          </button>
        </div>
      ))}
      <div className="rh-colonnes">
        {COLONNES_DU_RECRUTEMENT.map((e) => {
          const ici = actives.filter((c) => c.etape === e);
          return (
            <div key={e} className="rh-colonne">
              <h4><span>{ETAPES_DE_CANDIDATURE[e]}</span><span>{ici.length}</span></h4>
              {ici.map((c) => (
                <button key={c.id} type="button" className="rh-fichette" onClick={() => setCand(c)}>
                  <b>{c.nom}</b>
                  <small>{SOURCES[c.source]}{c.recommandeePar ? ` (${c.recommandeePar})` : ''} · {dateDite(c.recueLe)}</small>
                  {c.prochainLe ? <small>suite le {dateDite(c.prochainLe)}</small> : null}
                </button>
              ))}
              {ici.length === 0 && <span className="sad-doux">Personne.</span>}
            </div>
          );
        })}
      </div>
      {aEffacer.length > 0 && (
        <div className="rh-garde">
          {aEffacer.length} candidature{aEffacer.length > 1 ? 's' : ''} non retenue{aEffacer.length > 1 ? 's' : ''}, répondue{aEffacer.length > 1 ? 's' : ''} il y a plus de {reglages.candidatureGardeeMois ?? GARDE_DES_CANDIDATURES_MOIS} mois.{' '}
          <button type="button" className="sad-lien" onClick={() => { aEffacer.forEach(effaceLaLigneRh); toast('Effacées : la Maison ne garde pas les données de qui n’y travaille pas.'); }}>Les effacer</button>
        </div>
      )}
      {closes.length > 0 && (
        <p className="sad-doux">Déjà tranchées : {closes.map((c) => `${c.nom} (${ETAPES_DE_CANDIDATURE[c.etape].toLowerCase()})`).join(', ')}.</p>
      )}
      <p className="sad-doux">Une apprenante certifiée de l’Académie MND entre ici avec la source « Académie MND ». L’essai pratique se note sur la même grille que les compétences de l’équipe.</p>
      {poste && <FicheDuPoste poste={poste === 'neuf' ? undefined : poste} onClose={() => setPoste(null)} branchId={branch.id} par={moi} />}
      {cand && <FicheDeCandidature c={cand === 'neuve' ? undefined : cand} postes={ouverts} onClose={() => setCand(null)} branchId={branch.id} par={moi} preparerUneArrivee={preparerUneArrivee} />}
    </div>
  );
}

function FicheDuPoste({ poste, onClose, branchId, par }: { poste?: Poste; onClose: () => void; branchId: string; par: string }) {
  const [fonctions] = useFonctions();
  const [titre, setTitre] = useState(poste?.titre ?? '');
  const [fonction, setFonction] = useState(poste?.fonction ?? fonctions[0] ?? '');
  const [contrat, setContrat] = useState(poste?.contrat ?? 'CDI');
  const [fourchette, setFourchette] = useState(poste?.fourchette ?? '');
  const [annonce, setAnnonce] = useState(poste?.annonce ?? '');
  const garde = () => {
    if (!titre.trim()) { toast('Quel poste ?'); return; }
    const champs = { titre: titre.trim(), fonction, contrat, fourchette: fourchette.trim() || undefined, annonce: annonce.trim() || undefined };
    if (poste) retoucheRh(poste, champs); else nouvelleLigneRh<Poste>({ genre: 'poste', branchId, ouvertLe: aujourdhuiRh(), par, ...champs });
    onClose();
  };
  const copie = async () => {
    try { await navigator.clipboard.writeText(annonce); toast('Annonce copiée.'); } catch { toast('Sélectionnez le texte pour le copier.'); }
  };
  return createPortal(
    <Modal title={poste ? 'Le poste' : 'Ouvrir un poste'} onClose={onClose} width={600}>
      <div className="sad-form">
        <Field label="Le poste"><Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Praticienne au fauteuil" /></Field>
        <div className="tr-grid tr-grid--3" style={{ gap: 12 }}>
          <Field label="Fonction"><Select value={fonction} onChange={(e) => setFonction(e.target.value)}>{fonctions.map((f) => <option key={f} value={f}>{f}</option>)}</Select></Field>
          <Field label="Contrat"><Select value={contrat} onChange={(e) => setContrat(e.target.value)}><option>CDI</option><option>CDD</option><option>apprentissage</option><option>prestataire</option></Select></Field>
          <Field label="Salaire de départ"><Input value={fourchette} onChange={(e) => setFourchette(e.target.value)} placeholder="ou une fourchette" /></Field>
        </div>
        <Field label="L’annonce"><Textarea rows={5} value={annonce} onChange={(e) => setAnnonce(e.target.value)} placeholder={`${maisonNom()} recrute…`} /></Field>
        <p className="sad-doux">L’annonce dit le salaire de départ ou la fourchette, jamais un prix de la carte.</p>
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          {poste && !poste.fermeLe && <Button variant="ghost" onClick={() => { retoucheRh(poste, { fermeLe: aujourdhuiRh() }); onClose(); }}>Fermer le poste</Button>}
          {annonce.trim() && <Button variant="ghost" onClick={() => void copie()}>Copier l’annonce</Button>}
          <Button variant="copper" onClick={garde}>{poste ? 'Garder' : 'Ouvrir le poste'}</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

function FicheDeCandidature({ c, postes, onClose, branchId, par, preparerUneArrivee }: {
  c?: Candidature; postes: Poste[]; onClose: () => void; branchId: string; par: string;
  preparerUneArrivee: (nom: string, telephone?: string) => void;
}) {
  const familles = useFamillesDesGestes();
  const [nom, setNom] = useState(c?.nom ?? '');
  const [telephone, setTelephone] = useState(c?.telephone ?? '');
  const [source, setSource] = useState<SourceDeCandidature>(c?.source ?? 'whatsapp');
  const [recommandeePar, setRecommandeePar] = useState(c?.recommandeePar ?? '');
  const [posteId, setPosteId] = useState(c?.posteId ?? postes[0]?.id ?? '');
  const [etape, setEtape] = useState<EtapeDeCandidature>(c?.etape ?? 'recue');
  const [prochainLe, setProchainLe] = useState(c?.prochainLe ?? '');
  const [essaiLe, setEssaiLe] = useState(c?.essai?.le ?? '');
  const [essaiFamille, setEssaiFamille] = useState(c?.essai?.famille ?? '');
  const [essaiNiveau, setEssaiNiveau] = useState<Niveau | ''>(c?.essai?.niveau ?? '');
  const [essaiNote, setEssaiNote] = useState(c?.essai?.note ?? '');
  const [note, setNote] = useState(c?.note ?? '');
  const champs = (): Omit<Candidature, 'id' | 'creeLe' | 'creePar' | 'genre' | 'branchId' | 'recueLe'> => ({
    nom: nom.trim(), telephone: telephone.trim() || undefined, source, recommandeePar: recommandeePar.trim() || undefined,
    posteId: posteId || undefined, etape, prochainLe: prochainLe || undefined,
    essai: essaiLe || essaiFamille || essaiNiveau || essaiNote ? { le: essaiLe || undefined, famille: essaiFamille || undefined, niveau: essaiNiveau || undefined, note: essaiNote.trim() || undefined } : undefined,
    note: note.trim() || undefined,
  });
  const garde = (patch?: Partial<Candidature>) => {
    if (!nom.trim()) { toast('Son nom ?'); return null; }
    const ch = { ...champs(), ...patch };
    return c ? retoucheRh(c, ch) : nouvelleLigneRh<Candidature>({ genre: 'candidature', branchId, recueLe: aujourdhuiRh(), par, ...ch });
  };
  const nonRetenue = () => {
    const l = garde({ etape: 'non-retenue', reponduLe: aujourdhuiRh() });
    if (!l) return;
    const msg = `Bonjour ${nom.trim().split(' ')[0]}, merci pour votre candidature à ${maisonNom()}. Nous ne pouvons pas y donner suite aujourd’hui ; nous gardons votre nom quelques mois, au cas où un poste s’ouvrirait. Bonne continuation.`;
    const lien = lienWaMe(telephone, msg);
    if (lien) window.open(lien, '_blank', 'noopener'); else toast('Réponse notée. Pas de numéro : prévenez-la de vive voix.');
    onClose();
  };
  const retenue = () => {
    const l = garde({ etape: 'retenue', reponduLe: aujourdhuiRh() });
    if (!l) return;
    onClose();
    preparerUneArrivee(nom.trim(), telephone.trim() || undefined);
  };
  return createPortal(
    <Modal title={c ? c.nom : 'Nouvelle candidature'} onClose={onClose} width={640}>
      <div className="sad-form">
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Nom"><Input value={nom} onChange={(e) => setNom(e.target.value)} /></Field>
          <Field label="Téléphone"><Input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="01 …" /></Field>
        </div>
        <div className="tr-grid tr-grid--3" style={{ gap: 12 }}>
          <Field label="Source"><Select value={source} onChange={(e) => setSource(e.target.value as SourceDeCandidature)}>{(Object.keys(SOURCES) as SourceDeCandidature[]).map((s) => <option key={s} value={s}>{SOURCES[s]}</option>)}</Select></Field>
          <Field label="Recommandée par"><Input value={recommandeePar} onChange={(e) => setRecommandeePar(e.target.value)} disabled={source !== 'recommandation'} /></Field>
          <Field label="Poste"><Select value={posteId} onChange={(e) => setPosteId(e.target.value)}><option value="">Candidature libre</option>{postes.map((p) => <option key={p.id} value={p.id}>{p.titre}</option>)}</Select></Field>
        </div>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Où elle en est"><Select value={etape} onChange={(e) => setEtape(e.target.value as EtapeDeCandidature)}>{COLONNES_DU_RECRUTEMENT.map((e) => <option key={e} value={e}>{ETAPES_DE_CANDIDATURE[e]}</option>)}</Select></Field>
          <Field label="Suite prévue le"><Input type="date" value={prochainLe} onChange={(e) => setProchainLe(e.target.value)} /></Field>
        </div>
        <div className="tre-sec-label">L’essai pratique</div>
        <div className="tr-grid tr-grid--3" style={{ gap: 12 }}>
          <Field label="Le"><Input type="date" value={essaiLe} onChange={(e) => setEssaiLe(e.target.value)} /></Field>
          <Field label="Geste"><Select value={essaiFamille} onChange={(e) => setEssaiFamille(e.target.value)}><option value="">À choisir</option>{familles.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}</Select></Field>
          <Field label="Niveau vu"><Select value={essaiNiveau} onChange={(e) => setEssaiNiveau(e.target.value as Niveau | '')}><option value="">Pas encore</option>{(Object.keys(NIVEAUX) as Niveau[]).map((n) => <option key={n} value={n}>{NIVEAUX[n]}</option>)}</Select></Field>
        </div>
        <Field label="Ce qu’on a vu"><Textarea rows={2} value={essaiNote} onChange={(e) => setEssaiNote(e.target.value)} /></Field>
        <Field label="Note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="sad-doux">Le modèle sait d’avance que c’est un essai, et une maîtresse de la Maison reprend la main si besoin.</p>
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          {c && <Button variant="ghost" onClick={nonRetenue}>Non retenue, lui répondre</Button>}
          {c && <Button variant="ghost" onClick={retenue}>Retenue, préparer sa place</Button>}
          <Button variant="copper" onClick={() => { if (garde()) onClose(); }}>Garder</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
