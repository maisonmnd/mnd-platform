import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { PageHead } from '../_ui';
import { useEstDirection } from '../_vie';
import { Button, Field, Input, Modal, toast } from '../../../../ds/components';
import { useAuth, useStaff } from '../../../../shared/auth';
import { useBranch } from '../../../../shared/branches';
import { maisonEmployeur, maisonNom } from '../../../../shared/identite';
import {
  effaceLaPiece, enregistreLesMentions, entreprises, mentionsDe, migreLesMentionsDeLaMaison, nouvellePiece, pieces, profils, signatairesDe, useSecretariat,
} from '../../../../shared/secretariat';
import { ACIA, dateDite, ifuPlausible, mentionsDuJourDe, supprimable, type Entite, type Entreprise, type Piece } from '../../../../shared/secretariat-pur';
import { entiteDeLaPiece, FAMILLES, MODELES, PIECES_D_EMPLOYEUR, type Famille } from '../../../../shared/secretariat-modeles';
import { Editeur } from './secretariat/Editeur';
import { MaSignature, NouvelleEntreprise } from './secretariat/Signatures';
import { LesPapiers } from './secretariat/Papiers';
import { LeDossierDeBourse } from './secretariat/Bourse';
import { MARQUE_HEBERGEANT } from '../../../../shared/bourse';
import { REGISTRE_MAISON_MND } from '../../../../shared/registre';
import { courriersDe } from '../../../../shared/secretariat-admin';
import { tientLeSecretariat } from '../../../../shared/secretariat-admin-pur';
import { AtelierDuPdf, useQui, type OuvertureDuPdf } from './secretariat/_admin';
import { Aujourdhui } from './secretariat/Aujourdhui';
import { LeCourrierDeLaMaison } from './secretariat/Courrier';
import { LEcheancier } from './secretariat/Echeancier';
import { LesContrats } from './secretariat/Contrats';
import { LesDemarches } from './secretariat/Demarches';
import { LesContacts } from './secretariat/Contacts';
import { LesArchives } from './secretariat/Archives';
import { RedigerDUnePhrase, remplisLaPiece } from './secretariat/RedigerDUnePhrase';
import type { LettreProposee } from '../../../../shared/ia-lettre-pur';
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
type Onglet = 'jour' | 'courrier' | 'echeances' | 'contrats' | 'demarches' | 'contacts' | 'documents' | 'papiers' | 'bourse' | 'archives';

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
  /* LE REGISTRE DE LA MAISON (10 octobre 2026) : à la première ouverture par
     la direction, les numéros d'ACIA 1 posés sous Maison MND passent au
     registre de la Maison. Une fois par poste ; morte fin 2026. */
  useEffect(() => { if (direction) migreLesMentionsDeLaMaison(); }, [direction]);

  const ents = entreprises(lignes);
  /* L'hébergeant du dossier de bourse est un particulier gardé en fiche : ce
     n'est ni une entreprise du classeur ni un en-tête à choisir (7 octobre). */
  const entsVisibles = ents.filter((e) => e.dossier !== MARQUE_HEBERGEANT);
  /* LES PAPIERS, SECOND ONGLET (6 octobre 2026) : la direction seule, comme
     la base le veut (0117). On y arrive aussi depuis À faire. */
  const location = useLocation();
  /* LE SECRÉTARIAT ADMINISTRATIF (14 octobre 2026, maquette TChByryY…) :
     dix onglets, montrés selon qui l'on est. Qui tient le secrétariat (la
     direction, ou le rôle donné dans Accès & rôles) ouvre sur « Aujourd'hui » ;
     les autres gardent les documents, les contacts, et le courrier qui leur
     est confié. La base tient la même règle (0129). */
  const qui = useQui();
  const tient = tientLeSecretariat(qui);
  const confie = courriersDe(lignes).some((c) => !!moi && c.traitePar === moi);
  const ONGLETS: { k: Onglet; l: string; si: boolean }[] = [
    { k: 'jour', l: 'Aujourd’hui', si: tient }, { k: 'courrier', l: 'Le courrier', si: tient || confie },
    { k: 'echeances', l: 'L’échéancier', si: tient }, { k: 'contrats', l: 'Contrats', si: tient },
    { k: 'demarches', l: 'Démarches', si: tient }, { k: 'contacts', l: 'Contacts', si: true },
    { k: 'documents', l: 'Les documents', si: true }, { k: 'papiers', l: 'Les papiers', si: direction },
    { k: 'bourse', l: 'Bourse scolaire', si: direction }, { k: 'archives', l: 'Archives', si: tient },
  ];
  const ongletsVus = ONGLETS.filter((o) => o.si);
  const [choisi, setChoisi] = useState<Onglet | null>(null);
  const onglet: Onglet = choisi && ongletsVus.some((o) => o.k === choisi) ? choisi : tient ? 'jour' : 'documents';
  useEffect(() => {
    const voulu = (location.state as { onglet?: string } | null)?.onglet;
    if (voulu) setChoisi(voulu as Onglet);
    /* UNE LETTRE PRÉPARÉE AILLEURS S'OUVRE ICI (direction des RH, 14 octobre
       2026) : certificat de travail, avertissement, demande d'explication. */
    const aOuvrir = (location.state as { ouvre?: string } | null)?.ouvre;
    if (aOuvrir) setOuvert(aOuvrir);
  }, [location.state]);
  const va = (o: string) => { setChoisi(o as Onglet); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const vueDesPapiers = onglet === 'papiers' && direction;
  /* LE DOSSIER DE BOURSE, TROISIÈME ONGLET (7 octobre 2026) : la direction seule. */
  const vueDeLaBourse = onglet === 'bourse' && direction;
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

  /* SIGNER UN PDF DE L'ORDINATEUR (15 octobre 2026) : reçu par e-mail, on le
     signe ici, puis la copie se range sur la ligne qui convient. Ses crochets
     viennent AVANT l'ouverture d'un document (16 octobre : placés après le
     « return <Editeur> », ils faisaient tomber l'écran à chaque document
     ouvert, erreur React n° 300). */
  const [pdfASigner, setPdfASigner] = useState<OuvertureDuPdf | null>(null);
  const champPdf = useRef<HTMLInputElement>(null);

  if (ouvert) {
    return <Editeur pieceId={ouvert} direction={direction} onClose={() => setOuvert(null)} surOuvre={setOuvert} />;
  }

  const aSaSignature = signatairesDe(lignes).some((s) => s.userId === moi && s.aSaSignature);
  const ouvreUnPdf = async (f: File | undefined) => {
    if (!f) return;
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) { toast('Choisissez un PDF.'); return; }
    if (f.size > 10 * 1024 * 1024) { toast('Ce PDF dépasse 10 Mo.'); return; }
    setPdfASigner({ octets: new Uint8Array(await f.arrayBuffer()), nom: f.name });
  };
  const peutSignerUnPdf = qui.direction || qui.titulaire;

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Direction"
        title="Le secrétariat"
        sub={onglet === 'documents'
          ? 'Lettres, attestations, notes, contrats : tout ce qui sort sur papier à en-tête, numéroté et signé.'
          : 'Le courrier, les dates à tenir, les contrats, les démarches et les papiers de la Maison, au même endroit.'}
        actions={(
          <>
            {peutSignerUnPdf && <Button variant="ghost" onClick={() => champPdf.current?.click()}>Signer un PDF</Button>}
            {peutSignerUnPdf && <input ref={champPdf} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { void ouvreUnPdf(e.target.files?.[0]); e.target.value = ''; }} />}
            {onglet === 'documents' && <>
            {direction && <Button variant="ghost" onClick={() => setMentions(true)}>Mentions de l’en-tête</Button>}
            <Button variant="ghost" onClick={() => setSignature(true)}>{aSaSignature ? 'Ma signature' : 'Déposer ma signature'}</Button>
            <Button variant="copper" onClick={() => setNouveau(true)}>+ Nouveau document</Button>
            </>}
          </>
        )}
      />

      {ongletsVus.length > 1 && (
        <div className="sec-onglets sad-onglets" role="tablist" aria-label="Le secrétariat">
          {ongletsVus.map((o) => (
            <button key={o.k} type="button" role="tab" aria-selected={onglet === o.k} className={`sec-onglet${onglet === o.k ? ' sec-onglet--on' : ''}`} onClick={() => setChoisi(o.k)}>{o.l}</button>
          ))}
        </div>
      )}

      {onglet === 'jour' ? <Aujourdhui qui={qui} va={va} ouvreUnDocument={setOuvert} />
      : onglet === 'courrier' ? <LeCourrierDeLaMaison qui={qui} branchId={branch.id} ouvreUnDocument={setOuvert} />
      : onglet === 'echeances' ? <LEcheancier qui={qui} branchId={branch.id} va={va} />
      : onglet === 'contrats' ? <LesContrats qui={qui} branchId={branch.id} ouvreUnDocument={setOuvert} />
      : onglet === 'demarches' ? <LesDemarches qui={qui} branchId={branch.id} ouvreUnDocument={setOuvert} />
      : onglet === 'contacts' ? <LesContacts qui={qui} branchId={branch.id} />
      : onglet === 'archives' ? <LesArchives qui={qui} branchId={branch.id} />
      : vueDeLaBourse ? (
        <LeDossierDeBourse branchId={branch.id} moi={moi} nomMaison={maisonNom()} surOuvre={setOuvert} />
      ) : vueDesPapiers ? (
        <LesPapiers
          branchId={branch.id}
          qui={tete?.name ?? 'La direction'}
          titulairesEntreprises={[
            { cle: 'ent:mnd', nom: maisonNom(), genre: 'entreprise' },
            { cle: 'ent:acia', nom: ACIA.nom, genre: 'entreprise' },
            ...entsVisibles.map((e) => ({ cle: `ent:${e.id}`, nom: e.nom, genre: 'entreprise' as const })),
          ]}
          suggestions={signatairesDe(lignes).filter((s) => s.userId !== 'entreprise').map((s) => s.nom)}
        />
      ) : (<>
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
      </>)}

      {nouveau && (
        <NouveauDocument
          direction={direction}
          branchId={branch.id}
          moi={moi}
          nomParDefaut={tete?.name ?? ''}
          entreprisesConnues={entsVisibles}
          entiteDeDepart={entiteDuFiltre(filtre, direction)}
          onClose={() => setNouveau(false)}
          surCree={(id) => { setNouveau(false); setOuvert(id); }}
        />
      )}
      {mentions && direction && <MentionsDeLEnTete branchId={branch.id} onClose={() => setMentions(false)} />}
      {signature && moi && (
        <MaSignature userId={moi} branchId={branch.id} nomParDefaut={tete?.name ?? ''} direction={direction} onClose={() => setSignature(false)} />
      )}
      <AtelierDuPdf ouverture={pdfASigner} onClose={() => setPdfASigner(null)} />
    </div>
  );
}

/* ══ NOUVEAU DOCUMENT — au nom de qui, et quel modèle (maquette, écran 2) ══
   Le choix de l'entité décide de tout le reste : en-tête, pied, tampon,
   encre, série de numéros. */

/* LE FILTRE DU REGISTRE SUIT DANS « NOUVEAU DOCUMENT » — 6 octobre 2026.
   « Quand on choisit une société sur la première page, lors de la sélection
   du modèle ça ne retient pas la sélection » (Yéman). Le registre filtré sur
   ACIA 1 ouvrait « Nouveau document » sur Maison MND : on écrivait au mauvais
   nom sans s'en apercevoir. Le filtre d'une société devient le « Au nom de »
   de départ ; « Tous », « Brouillons », « Signés » laissent Maison MND. */
export const entiteDuFiltre = (f: string, direction: boolean): Entite =>
  f === 'acia' ? 'acia' : f === 'autre' ? 'autre' : f === 'perso' && direction ? 'perso' : 'mnd';

function NouveauDocument({ direction, branchId, moi, nomParDefaut, entreprisesConnues, entiteDeDepart, onClose, surCree }: {
  direction: boolean; branchId: string; moi: string; nomParDefaut: string;
  entreprisesConnues: Entreprise[]; entiteDeDepart: Entite; onClose: () => void; surCree: (id: string) => void;
}) {
  const [lignes] = useSecretariat();
  const [entite, setEntite] = useState<Entite>(entiteDeDepart);
  const [entrepriseId, setEntrepriseId] = useState<string>(entreprisesConnues[0]?.id ?? '');
  const [creation, setCreation] = useState(false);
  const [famille, setFamille] = useState<Famille>('lettres');

  const familles = FAMILLES.filter((f) => (entite === 'perso' ? f.cle === 'perso' || f.cle === 'libre' : f.cle !== 'perso'));
  const familleVue = familles.some((f) => f.cle === famille) ? famille : familles[0].cle;
  const modeles = MODELES.filter((m) => m.famille === familleVue);

  /* RÉDIGÉE D'UNE PHRASE (19 octobre 2026) : la proposition de Claude passe
     par ce même chemin (nouvellePiece, au registre qu'elle a choisi), puis
     remplit le brouillon ; l'éditeur la montre cuivre « à vérifier ». */
  const choisis = (modele: string, proposition?: { lettre: LettreProposee; phrase: string }) => {
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
    /* Une pièce d'employeur se fait au nom de l'employeur réglé (relecture
       du 10 octobre 2026, voir PIECES_D_EMPLOYEUR) : on le dit, sans bloquer. */
    const auNomDe = entiteDeLaPiece(entite, modele, maisonEmployeur());
    if (auNomDe !== entite) toast(`Pièce d’employeur : faite au nom de ${ACIA.nom}, l’employeur de l’équipe tant que le comptable n’a rien décidé.`);
    const p = nouvellePiece({ branchId, entite: auNomDe, entrepriseId: auNomDe === 'autre' ? entrepriseId : undefined, modele, auteurId: moi, signataires });
    if (proposition) remplisLaPiece(p, proposition.lettre, proposition.phrase);
    surCree(p.id);
  };
  const entrepriseChoisie = entreprisesConnues.find((e) => e.id === entrepriseId);
  const nomAuNomDe = entite === 'mnd' ? maisonNom() : entite === 'acia' ? ACIA.nom : (entrepriseChoisie?.nom ?? 'l’entreprise');

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
            {entite === 'mnd' && entiteDeLaPiece('mnd', PIECES_D_EMPLOYEUR[0], maisonEmployeur()) === 'acia' && ` Les pièces d’employeur (équipe, attestation et contrat de travail) se font au nom de ${ACIA.nom}, l’employeur de l’équipe.`}
            {entite === 'acia' && 'En-tête ACIA 1 seul, rien de Maison MND ; série ACIA.'}
            {entite === 'autre' && 'Son nom, ses mentions et son tampon dessiné à l’instant ; sa propre série de numéros.'}
            {entite === 'perso' && 'À votre nom, sans en-tête d’entreprise ni tampon : elle n’engage pas l’entreprise. Vue de la direction seule.'}
          </p>
        </div>

        {/* Pas pour une lettre personnelle : elle n'est pas au nom de la Maison.
            Pour une autre entreprise, une fois choisie : sinon la lettre
            rédigée (et payée) ne trouverait pas où se poser. */}
        {entite !== 'perso' && (entite !== 'autre' || !!entrepriseChoisie) && <RedigerDUnePhrase auNomDe={nomAuNomDe} surLettre={(lettre, phrase) => choisis(lettre.registre, { lettre, phrase })} />}

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
  /* Vides, ils prennent le registre de la Maison (10 octobre 2026), comme
     ACIA 1 prend son RCCM connu ; un numéro d'ACIA 1 resté sous Maison MND
     s'y montre déjà corrigé : la direction voit ce qui s'imprimera. */
  const duJour = mentionsDuJourDe('mnd', mnd);
  const [mndRccm, setMndRccm] = useState(duJour?.rccm || REGISTRE_MAISON_MND.rccm);
  const [mndIfu, setMndIfu] = useState(duJour?.ifu || REGISTRE_MAISON_MND.ifu);
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
            <Field label="RCCM"><Input value={mndRccm} onChange={(e) => setMndRccm(e.target.value)} /></Field>
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
