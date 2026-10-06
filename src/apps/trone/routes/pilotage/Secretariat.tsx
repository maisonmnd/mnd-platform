import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PageHead } from '../_ui';
import { useEstDirection } from '../_vie';
import { Button, Field, Input, Modal, toast } from '../../../../ds/components';
import { useAuth, useStaff } from '../../../../shared/auth';
import { useBranch } from '../../../../shared/branches';
import { maisonNom } from '../../../../shared/identite';
import {
  effaceLaPiece, enregistreLesMentions, entreprises, mentionsDe, nouvellePiece, pieces, profils, signatairesDe, useSecretariat,
} from '../../../../shared/secretariat';
import { ACIA, dateDite, ifuPlausible, supprimable, type Entite, type Entreprise, type Piece } from '../../../../shared/secretariat-pur';
import { FAMILLES, MODELES, type Famille } from '../../../../shared/secretariat-modeles';
import { Editeur } from './secretariat/Editeur';
import { MaSignature, NouvelleEntreprise } from './secretariat/Signatures';
import './pilotage.css';

/* ══ LE SECRÉTARIAT — 6 octobre 2026 (maquette StpDQGL3HE1nHyyjSRNU9r validée) ══

   « Can I have an editor for documents on the Trône ? » (Yéman). Tout ce qui
   sort de la Maison sur papier à en-tête, au même endroit, dans l'ordre :
   lettres, attestations, notes, contrats, dossier OAPI, lettres personnelles.

   UNE SÉRIE DE NUMÉROS PAR NOM, qui ne se mélangent jamais : MND-DOC pour
   Maison MND, ACIA pour ACIA 1, une série par entreprise créée à l'instant,
   PERSO-xx pour les lettres personnelles. Le numéro se donne à la dernière
   signature ; un document signé ne bouge plus, une correction prend un
   nouveau numéro qui dit lequel elle remplace.

   Les quatre choix du 6 octobre : chacun ne pose que SA signature ; pas
   d'assistant pour rédiger ; les modèles juridiques sont marqués « à faire
   relire » ; les lettres personnelles ne sont vues que de la direction. */

type Filtre = 'tous' | 'mnd' | 'acia' | 'autre' | 'perso' | 'brouillons' | 'signes';

const ETAT: Record<Piece['etat'], string> = { brouillon: 'Brouillon', 'a-signer': 'En signature', signe: 'Signé', annule: 'Annulé' };

export default function Secretariat() {
  const [lignes] = useSecretariat();
  const { session } = useAuth();
  const moi = session?.user?.id ?? '';
  const tete = useStaff();
  const { branch } = useBranch();
  const direction = useEstDirection();
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [cherche, setCherche] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [signature, setSignature] = useState(false);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [mentions, setMentions] = useState(false);

  const ents = entreprises(lignes);
  const nomDe = (p: Piece): string =>
    p.entite === 'mnd' ? maisonNom()
      : p.entite === 'acia' ? ACIA.nom
        : p.entite === 'autre' ? (ents.find((e) => e.id === p.entrepriseId)?.nom ?? 'Autre entreprise')
          : (profils(lignes).find((x) => x.userId === p.auteurId)?.nom ?? 'Personnelle');

  /* La base ne rend pas les lettres personnelles hors direction (0116) ;
     l'écran ne les montre pas non plus, même restées dans un cache. */
  const visibles = useMemo(
    () => pieces(lignes).filter((p) => direction || p.entite !== 'perso').sort((a, b) => b.creeLe.localeCompare(a.creeLe)),
    [lignes, direction],
  );
  const q = cherche.trim().toLowerCase();
  const liste = visibles.filter((p) => {
    if (filtre === 'brouillons' && p.etat !== 'brouillon' && p.etat !== 'a-signer') return false;
    if (filtre === 'signes' && p.etat !== 'signe') return false;
    if ((filtre === 'mnd' || filtre === 'acia' || filtre === 'autre' || filtre === 'perso') && p.entite !== filtre) return false;
    if (!q) return true;
    return [p.numero, p.titre, p.objet, p.destinataire, nomDe(p)].some((t) => (t ?? '').toLowerCase().includes(q));
  });

  const FILTRES: { v: Filtre; l: string; si?: boolean }[] = [
    { v: 'tous', l: 'Tous' }, { v: 'mnd', l: maisonNom() }, { v: 'acia', l: ACIA.nom }, { v: 'autre', l: 'Autres entreprises' },
    { v: 'perso', l: 'Personnelles', si: direction }, { v: 'brouillons', l: 'Brouillons' }, { v: 'signes', l: 'Signés' },
  ];

  if (ouvert) {
    return <Editeur pieceId={ouvert} direction={direction} onClose={() => setOuvert(null)} surOuvre={setOuvert} />;
  }

  const aSaSignature = signatairesDe(lignes).some((s) => s.userId === moi && s.aSaSignature);

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Direction"
        title="Le secrétariat"
        sub="Lettres, attestations, notes, contrats : tout ce qui sort sur papier à en-tête, numéroté et signé."
        actions={(
          <>
            {direction && <Button variant="ghost" onClick={() => setMentions(true)}>Mentions de l’en-tête</Button>}
            <Button variant="ghost" onClick={() => setSignature(true)}>{aSaSignature ? 'Ma signature' : 'Déposer ma signature'}</Button>
            <Button variant="copper" onClick={() => setNouveau(true)}>+ Nouveau document</Button>
          </>
        )}
      />

      <div className="sec-filtres">
        <Input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Chercher : Moov, attestation, OAPI…" aria-label="Chercher un document" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTRES.filter((f) => f.si !== false).map((f) => (
            <button key={f.v} type="button" className={`sec-puce${filtre === f.v ? ' sec-puce--on' : ''}`} aria-pressed={filtre === f.v} onClick={() => setFiltre(f.v)}>{f.l}</button>
          ))}
        </div>
      </div>

      {liste.length === 0 ? (
        <div className="sec-vide">
          {visibles.length === 0
            ? <>Aucun document encore. Commencez par <b>+ Nouveau document</b> ; déposez d’abord votre signature si vous allez signer.</>
            : 'Aucun document ne répond à ce filtre.'}
        </div>
      ) : (
        <div className="sec-registre" role="list">
          {liste.map((p) => (
            <div key={p.id} role="listitem" className="sec-rangee">
            <button type="button" className="sec-ligne" onClick={() => setOuvert(p.id)}>
              <span className="sec-ligne__num">{p.numero ?? 'sans numéro'}</span>
              <span className={`sec-ligne__nom sec-ligne__nom--${p.entite}`}>{nomDe(p)}</span>
              <span className="sec-ligne__titre">{p.titre}{p.remplace ? ` · remplace ${p.remplace}` : ''}</span>
              <span className="sec-ligne__pour">{p.destinataire.split('\n')[0]?.replace(/\[À COMPLÉTER\]/g, '…') || '·'}</span>
              <span className="sec-ligne__date">{dateDite(p.date)}</span>
              <span className={`sec-etat sec-etat--${p.etat}`}>{ETAT[p.etat]}</span>
            </button>
            {/* SUPPRIMER UN BROUILLON, d'ici — 6 octobre 2026. La direction
                seule (la base réserve l'effacement, 0116) ; deux clics, le
                second confirme. Un document signé ne se supprime pas : il
                s'annule depuis le document, et reste barré au registre. */}
            {direction && supprimable(p) && (
              <div className="sec-ligne__geste">
                {aSupprimer === p.id ? (
                  <>
                    <button type="button" className="sec-supprimer sec-supprimer--oui" onClick={() => { effaceLaPiece(p); setASupprimer(null); toast('Brouillon supprimé.'); }}>Confirmer</button>
                    <button type="button" className="sec-supprimer" onClick={() => setASupprimer(null)}>Non</button>
                  </>
                ) : (
                  <button type="button" className="sec-supprimer" aria-label={`Supprimer le brouillon « ${p.titre} »`} onClick={() => setASupprimer(p.id)}>Supprimer</button>
                )}
              </div>
            )}
            </div>
          ))}
        </div>
      )}

      {nouveau && (
        <NouveauDocument
          direction={direction}
          branchId={branch.id}
          moi={moi}
          nomParDefaut={tete?.name ?? ''}
          entreprisesConnues={ents}
          onClose={() => setNouveau(false)}
          surCree={(id) => { setNouveau(false); setOuvert(id); }}
        />
      )}
      {mentions && direction && <MentionsDeLEnTete branchId={branch.id} onClose={() => setMentions(false)} />}
      {signature && moi && (
        <MaSignature userId={moi} branchId={branch.id} nomParDefaut={tete?.name ?? ''} direction={direction} onClose={() => setSignature(false)} />
      )}
    </div>
  );
}

/* ══ NOUVEAU DOCUMENT — au nom de qui, et quel modèle (maquette, écran 2) ══
   Le choix de l'entité décide de tout le reste : en-tête, pied, tampon,
   encre, série de numéros. */

function NouveauDocument({ direction, branchId, moi, nomParDefaut, entreprisesConnues, onClose, surCree }: {
  direction: boolean; branchId: string; moi: string; nomParDefaut: string;
  entreprisesConnues: Entreprise[]; onClose: () => void; surCree: (id: string) => void;
}) {
  const [lignes] = useSecretariat();
  const [entite, setEntite] = useState<Entite>('mnd');
  const [entrepriseId, setEntrepriseId] = useState<string>(entreprisesConnues[0]?.id ?? '');
  const [creation, setCreation] = useState(false);
  const [famille, setFamille] = useState<Famille>('lettres');

  const familles = FAMILLES.filter((f) => (entite === 'perso' ? f.cle === 'perso' || f.cle === 'libre' : f.cle !== 'perso'));
  const familleVue = familles.some((f) => f.cle === famille) ? famille : familles[0].cle;
  const modeles = MODELES.filter((m) => m.famille === familleVue);

  const choisis = (modele: string) => {
    if (!moi) { toast('Connectez-vous pour écrire un document.'); return; }
    const fiche = signatairesDe(lignes).find((s) => s.userId === moi);
    const profil = profils(lignes).find((x) => x.userId === moi);
    let signataires: Piece['signataires'] = [];
    if (entite === 'autre') {
      const e = entreprisesConnues.find((x) => x.id === entrepriseId);
      if (!e) { toast('Choisissez ou créez l’entreprise.'); return; }
      signataires = [{ userId: 'entreprise', nom: e.signataire || e.nom, qualite: '' }];
    } else if (entite === 'perso') {
      signataires = [{ userId: moi, nom: profil?.nom ?? fiche?.nom ?? nomParDefaut, qualite: '' }];
    } else if (fiche) {
      signataires = [{ userId: moi, nom: fiche.nom, qualite: fiche.qualite }];
    }
    const p = nouvellePiece({ branchId, entite, entrepriseId: entite === 'autre' ? entrepriseId : undefined, modele, auteurId: moi, signataires });
    surCree(p.id);
  };

  const ENTITES: { v: Entite; l: string; si?: boolean }[] = [
    { v: 'mnd', l: maisonNom() }, { v: 'acia', l: ACIA.nom }, { v: 'autre', l: 'Autre entreprise' }, { v: 'perso', l: 'Personnelle', si: direction },
  ];

  return createPortal(
    <Modal title="Nouveau document" onClose={onClose} width={760}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <div className="mnd-eyebrow" style={{ marginBottom: 6 }}>Au nom de</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ENTITES.filter((x) => x.si !== false).map((x) => (
              <button key={x.v} type="button" className={`sec-puce${entite === x.v ? ' sec-puce--on' : ''}`} aria-pressed={entite === x.v} onClick={() => setEntite(x.v)}>{x.l}</button>
            ))}
          </div>
          {entite === 'autre' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {entreprisesConnues.map((e) => (
                <button key={e.id} type="button" className={`sec-puce${entrepriseId === e.id ? ' sec-puce--on' : ''}`} aria-pressed={entrepriseId === e.id} onClick={() => setEntrepriseId(e.id)}>{e.nom}</button>
              ))}
              <button type="button" className="sec-puce" onClick={() => setCreation(true)}>+ Créer une entreprise</button>
            </div>
          )}
          <p className="mnd-muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            {entite === 'mnd' && 'En-tête Maison MND, tampon de la Maison, série MND-DOC.'}
            {entite === 'acia' && 'En-tête ACIA 1 seul, rien de Maison MND ; série ACIA.'}
            {entite === 'autre' && 'Son nom, ses mentions et son tampon dessiné à l’instant ; sa propre série de numéros.'}
            {entite === 'perso' && 'À votre nom, sans en-tête d’entreprise ni tampon : elle n’engage pas l’entreprise. Vue de la direction seule.'}
          </p>
        </div>

        <div className="sec-choix">
          <div className="sec-choix__familles">
            {familles.map((f) => (
              <button key={f.cle} type="button" className={`sec-famille${familleVue === f.cle ? ' sec-famille--on' : ''}`} onClick={() => setFamille(f.cle)}>
                <b>{f.titre}</b>
                <span>{f.dit}</span>
              </button>
            ))}
          </div>
          <div className="sec-choix__modeles">
            {modeles.map((m) => (
              <button key={m.cle} type="button" className="sec-modele" onClick={() => choisis(m.cle)}>
                <b>{m.titre}</b>
                {m.aRelire && <span className="sec-a-relire">à faire relire</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      {creation && (
        <NouvelleEntreprise
          branchId={branchId}
          onClose={() => setCreation(false)}
          surCree={(e) => { setEntrepriseId(e.id); setEntite('autre'); }}
        />
      )}
    </Modal>,
    document.body,
  );
}

/* ══ LES MENTIONS DE L'EN-TÊTE — 6 octobre 2026 (« rajouter l'IFU ») ══════
   RCCM et IFU de Maison MND et d'ACIA 1, TAPÉS par la direction : le Trône
   n'en invente aucun. Ils s'impriment au pied des lettres de Maison MND et
   sous le nom d'ACIA 1. Un document déjà signé garde les mentions du jour
   de sa signature. */
function MentionsDeLEnTete({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const [lignes] = useSecretariat();
  const mnd = mentionsDe(lignes, 'mnd');
  const acia = mentionsDe(lignes, 'acia');
  const [mndRccm, setMndRccm] = useState(mnd?.rccm ?? '');
  const [mndIfu, setMndIfu] = useState(mnd?.ifu ?? '');
  const [aciaRccm, setAciaRccm] = useState(acia?.rccm || ACIA.rccm);
  const [aciaIfu, setAciaIfu] = useState(acia?.ifu ?? '');
  const avis = (ifu: string) => (ifu.trim() && !ifuPlausible(ifu)
    ? <span style={{ fontSize: 12, color: 'var(--copper-700)' }}>Un IFU du Bénin compte 13 chiffres : vérifiez-le avant de garder.</span>
    : null);

  const garde = () => {
    enregistreLesMentions({ branchId, entite: 'mnd', rccm: mndRccm, ifu: mndIfu });
    enregistreLesMentions({ branchId, entite: 'acia', rccm: aciaRccm, ifu: aciaIfu });
    toast('Mentions gardées : elles s’impriment sur les prochains documents.');
    onClose();
  };

  return createPortal(
    <Modal title="Mentions de l’en-tête" onClose={onClose} width={620}>
      <div style={{ display: 'grid', gap: 16 }}>
        <p className="mnd-muted" style={{ fontSize: 13, margin: 0 }}>
          Tapez-les telles qu’elles figurent sur vos papiers officiels. Les documents déjà signés gardent celles du jour de leur signature.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="mnd-eyebrow">{maisonNom()} · au pied des lettres</div>
          <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
            <Field label="RCCM"><Input value={mndRccm} onChange={(e) => setMndRccm(e.target.value)} placeholder="RB/COT/…" /></Field>
            <Field label="IFU"><Input value={mndIfu} onChange={(e) => setMndIfu(e.target.value)} inputMode="numeric" placeholder="13 chiffres" /></Field>
          </div>
          {avis(mndIfu)}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="mnd-eyebrow">{ACIA.nom} · sous le nom</div>
          <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
            <Field label="RCCM"><Input value={aciaRccm} onChange={(e) => setAciaRccm(e.target.value)} /></Field>
            <Field label="IFU"><Input value={aciaIfu} onChange={(e) => setAciaIfu(e.target.value)} inputMode="numeric" placeholder="13 chiffres" /></Field>
          </div>
          {avis(aciaIfu)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="copper" onClick={garde}>Garder les mentions</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
