/* LES ENGAGEMENTS — 15 septembre 2026.

   « Un prestataire menuisier veut me réaliser un devis immobilier pour le
   salon de coiffure. Où stocker mes devis, mes validations et les avances
   reçues avec signature et décharge. Réserve un espace pour télécharger la
   carte d'identité » (Yéman). Maquette `public/maquette-les-engagements.html`,
   validée.

   CET ÉCRAN NE CALCULE RIEN. Ce qui est retenu, versé, ce qui reste et ce qui
   manque de preuve vit dans `shared/engagements.ts`, éprouvé par
   `verifie-engagements` ; la cloche et le Tableau de bord lisent le même
   lecteur (`litLesDossiers`). L'écran montre, et pose les gestes.

   CE QUE LA BASE TIENT, ET QUE L'ÉCRAN NE FAIT QUE REFLÉTER (0099) : le
   comptoir saisit un devis et prévoit un versement, la direction retient et
   verse ; une décharge posée ne se réécrit plus ; la pièce d'identité ne
   s'ouvre qu'à la direction. Cacher un bouton n'est pas une barrière — la
   barrière est en base, le bouton caché évite seulement un refus. */

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal, Segs, Select, Textarea, toast } from '../../../../ds/components';
import { ChampDeDate } from '../../../../ds/dates';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, rateToXof } from '../../../../shared/currency';
import { DEVISES, arrondiDans, decimalesDe } from '../../../../shared/lettres';
import { uid, useStore } from '../../../../shared/store';
import { useStaff } from '../../../../shared/auth';
import { maisonNom, maisonVille } from '../../../../shared/identite';
import { contratPdf } from '../../../../shared/pdf';
import {
  useCashboxes, useExpenses, usePaymentMethods, moyensAOffrir, expenseCategoriesStore, cashboxCurrency,
} from '../../../../shared/finance';
import { useFournisseurs } from '../../../../shared/stock';
import {
  useEngagements, useDevisRecus, useVersementsEngagement, litLesDossiers, bilanDesEngagements,
  numeroEngagementSuivant, jourLongDit, decaleLeJour, devisDeBase, estVerse,
  pourquoiOnNeRetientPas, avertitAvantDeRetenir, retenirLeDevis,
  pourquoiOnNeVersePas, avertitAvantDeVerser, dechargeInvalide, texteDeLaDecharge,
  effacementDeLIdentite, identiteAEffacer, depenseDuVersement, CATEGORIE_PROPOSEE, ETAT_DIT,
  telephoneDuPrestataire, poseLaLivraison, marqueLivre, valeurDeLaLivraison, ditLaLivraison,
  devisExpire, devisExpireBientot, travauxAVenir,
  totalDeLaLigne, totalDesLignes, pourquoiLaLigneNeVautPas, ligneDeLaSaisie, lignesDeLaSaisie,
  quantiteDite, LIGNE_VIDE, type LigneSaisie,
  pourquoiOnNeModifiePas, avertitAvantDeCorriger, corrigeLeDevis,
  pourquoiLaDechargeNePeutPasSeFaire, FORMATS_DE_L_IDENTITE,
  lisLeNombre, argentDuVersement, pourquoiLaDeviseNeChangePas, sommeDite, restesDits, retenuXof,
  DEVISE_DE_LA_MAISON,
  type Engagement, type DevisRecu, type Versement, type Decharge, type LectureDuDossier,
  type PieceDuDossier, type EtatDossier,
} from '../../../../shared/engagements';
import { deposeDansLeCoffre, adresseDuCoffre, retireDuCoffre, imageDuCoffre } from '../../../../shared/engagements-coffre';
import { useAuth } from '../../../../shared/auth';
import { signeLeMessage } from '../../../../shared/identite';
import {
  useMessagesWa, messagesWaStore, fenetreDe, numeroWa, MODELE_VERSEMENT, type MessageWa,
} from '../../../../shared/conversations';
import { envoieSurWhatsApp, fichierDeLaPieceRecue } from '../../../../shared/whatsapp';
import { useEstDirection } from '../_vie';
import { ToileDeSignature } from '../_signature';
import { todayISO } from '../finances/_shared';
import './engagements.css';

/** La version du texte de la décharge. Elle se range avec la signature : le
    jour où le texte change, on saura lequel a été signé. */
const VERSION_DECHARGE = 'decharge-2026-09-15';

/** Dix mégaoctets, le plafond du compartiment (0099). Le dire avant l'envoi
    évite un refus muet au bout d'une minute de téléversement. */
const TAILLE_MAX = 10 * 1024 * 1024;

/** LIRE UN MONTANT TAPÉ, dans la monnaie du dossier : « 25 000 », « 12,35 ».
    Zéro pour ce qui ne se lit pas ; c'est le refus, ensuite, qui le dit. */
const montantTape = (s: string, devise: string): number => {
  const n = lisLeNombre(s, devise);
  return Number.isFinite(n) && n > 0 ? arrondiDans(n, devise) : 0;
};

/** CE QUE LA MAIN A TAPÉ dans un champ facultatif : rien (`undefined`), ou
    un nombre, lisible ou non. Le juge fait la différence entre les deux. */
const saisieFacultative = (s: string, devise: string): number | undefined =>
  (s.trim() === '' ? undefined : lisLeNombre(s, devise));

/** « euros », « francs CFA » — pour dire la monnaie d'un dossier. */
const nomDeLaDevise = (code: string): string => DEVISES[code]?.plusieurs ?? code;

/** Les monnaies qu'un dossier peut prendre : le franc d'abord. */
const DEVISES_A_OFFRIR: string[] =
  [DEVISE_DE_LA_MAISON, ...Object.keys(DEVISES).filter((c) => c !== DEVISE_DE_LA_MAISON)];

/** OUVRIR UNE PIÈCE DU COFFRE. L'onglet s'ouvre AVANT d'attendre le lien :
    ouvert après, le navigateur le prend pour une fenêtre surgissante et le
    bloque. Le lien vaut une heure, et se redemande à chaque ouverture. */
async function ouvreLaPiece(chemin: string): Promise<void> {
  const onglet = window.open('', '_blank');
  if (!onglet) { toast('Le navigateur a bloqué l’onglet. Autorisez les fenêtres pour le Trône.'); return; }
  const url = await adresseDuCoffre(chemin);
  if (!url) {
    onglet.close();
    toast('La pièce n’a pas pu s’ouvrir. Vos droits ne le permettent peut-être pas.');
    return;
  }
  onglet.opener = null;
  onglet.location.href = url;
}

/** Choisir un fichier depuis l'appareil — une photo prise sur le moment, ou
    un PDF reçu. */
function ChoisirUnePiece({ libelle, onFichier, disabled, variant = 'ghost', accept = 'image/*,application/pdf' }: {
  libelle: string;
  onFichier: (f: File) => void;
  disabled?: boolean;
  variant?: 'ghost' | 'copper' | 'indigo';
  accept?: string;
}) {
  const champ = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant={variant} size="sm" disabled={disabled} onClick={() => champ.current?.click()}>{libelle}</Button>
      <input
        ref={champ}
        type="file"
        accept={accept}
        hidden
        onChange={(ev) => {
          const f = ev.target.files?.[0];
          ev.target.value = '';
          if (!f) return;
          if (f.size > TAILLE_MAX) { toast('La pièce dépasse 10 Mo. Photographiez-la plus petit, ou envoyez le PDF.'); return; }
          onFichier(f);
        }}
      />
    </>
  );
}

const Pastille = ({ ton, children }: { ton: 'ok' | 'att' | 'non' | 'neutre'; children: ReactNode }) => (
  <span className={`eng-pastille eng-pastille--${ton}`}>{children}</span>
);

const TON_DE_L_ETAT: Record<EtatDossier, 'ok' | 'att' | 'non' | 'neutre'> = {
  'en-cours': 'att', devis: 'neutre', solde: 'ok', abandonne: 'non',
};

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;

/* ══ L'ÉCRAN ═════════════════════════════════════════════════════════════ */

type FormDossier = {
  id?: string;
  fournisseurId: string;
  prestataire: string;
  metier: string;
  /** Sur sa fiche fournisseur quand il en a une, sinon sur le dossier. */
  telephone: string;
  objet: string;
  note: string;
  /** La monnaie du dossier — celle de la Maison, sauf choix contraire. */
  devise: string;
};

export default function Engagements() {
  const { branch, currency } = useBranch();
  const me = useStaff();
  const monNom = me?.name?.trim() || undefined;
  const estDirection = useEstDirection();
  const [engagements, setEngagements] = useEngagements();
  const [devis] = useDevisRecus();
  const [versements] = useVersementsEngagement();
  const [fournisseurs, setFournisseurs] = useFournisseurs();
  const [params, setParams] = useSearchParams();
  const aujourdhui = todayISO();

  const lectures = useMemo(
    () => litLesDossiers(engagements, devis, versements, branch.id, aujourdhui),
    [engagements, devis, versements, branch.id, aujourdhui],
  );
  const bilan = useMemo(() => bilanDesEngagements(lectures), [lectures]);
  const ouvert = lectures.find((l) => l.engagement.id === params.get('id'));
  const fournisseursIci = fournisseurs.filter((f) => f.branchId === branch.id && f.actif !== false);

  const [form, setForm] = useState<FormDossier | null>(null);

  /* ══ LA PIÈCE D'IDENTITÉ S'EFFACE À SON TERME ═════════════════════════
     Un an après la fermeture du dossier (décision du 15 septembre). C'est la
     direction qui l'efface, parce qu'elle seule en a le droit en base : le
     geste se fait donc à sa prochaine visite de l'écran, sans qu'elle ait à y
     penser. Le fichier part par l'API de stockage, qui le retire réellement ;
     la ligne ne s'allège qu'une fois le fichier parti. */
  const effacements = useRef(new Set<string>());
  useEffect(() => {
    if (!estDirection) return;
    for (const l of lectures) {
      const e = l.engagement;
      if (!e.identite || effacements.current.has(e.id)) continue;
      if (!identiteAEffacer(e, l.devis, l.versements, aujourdhui)) continue;
      effacements.current.add(e.id);
      const chemin = e.identite.chemin;
      void retireDuCoffre([chemin]).then((ok) => {
        if (!ok) return;
        setEngagements((prev) => prev.map((x) => {
          if (x.id !== e.id) return x;
          const { identite: _partie, ...reste } = x;
          return reste;
        }));
        toast(`La pièce d’identité du dossier ${e.numero} a été effacée, un an après sa fermeture.`);
      });
    }
  }, [estDirection, lectures, aujourdhui, setEngagements]);

  const ouvreLeFormulaire = (e?: Engagement) => setForm(e
    ? { id: e.id, fournisseurId: e.fournisseurId ?? '', prestataire: e.prestataire, metier: e.metier ?? '', telephone: telephoneDuPrestataire(e, fournisseurs) ?? '', objet: e.objet, note: e.note ?? '', devise: e.devise ?? DEVISE_DE_LA_MAISON }
    : { fournisseurId: '', prestataire: '', metier: '', telephone: '', objet: '', note: '', devise: DEVISE_DE_LA_MAISON });

  /* LA MONNAIE D'UN DOSSIER NE CHANGE PLUS après son premier montant : on ne
     réinterprète pas des sommes déjà rangées. */
  const lectureDuForm = form?.id ? lectures.find((l) => l.engagement.id === form.id) : undefined;
  const verrouDevise = lectureDuForm
    ? pourquoiLaDeviseNeChangePas({ devis: lectureDuForm.devis, versements: lectureDuForm.versements })
    : null;

  const enregistreLeDossier = () => {
    if (!form) return;
    const prestataire = form.prestataire.trim();
    const objet = form.objet.trim();
    if (!prestataire) { toast('Nommez le prestataire, tel qu’il signera la décharge.'); return; }
    if (!objet) { toast('Dites ce que la Maison commande : l’agencement du salon, l’enseigne.'); return; }
    /* LE TÉLÉPHONE (17 septembre 2026) : sur la fiche fournisseur quand il y
       en a une, et le dossier n'en garde pas de copie ; sur le dossier sinon. */
    const telephone = form.telephone.trim();
    if (form.fournisseurId) {
      setFournisseurs((prev) => prev.map((f) => (f.id === form.fournisseurId && (f.telephone?.trim() ?? '') !== telephone
        ? { ...f, telephone: telephone || undefined }
        : f)));
    }
    const champs = {
      prestataire, objet,
      fournisseurId: form.fournisseurId || undefined,
      metier: form.metier.trim() || undefined,
      telephone: form.fournisseurId ? undefined : telephone || undefined,
      note: form.note.trim() || undefined,
      /* Le franc ne s'écrit pas : absente, c'est lui. */
      devise: form.devise && form.devise !== DEVISE_DE_LA_MAISON ? form.devise : undefined,
    };
    if (form.id) {
      setEngagements((prev) => prev.map((x) => (x.id === form.id
        ? { ...x, ...champs, devise: verrouDevise ? x.devise : champs.devise }
        : x)));
      setForm(null);
      toast('Dossier corrigé.');
      return;
    }
    /* LE NUMÉRO SE COMPTE SUR TOUTE LA MAISON, pas sur la branche : deux
       salons qui auraient chacun leur ENG-2026-001 se confondraient au
       premier échange avec un prestataire qui travaille pour les deux. */
    const e: Engagement = {
      id: `eng-${uid()}`,
      branchId: branch.id,
      numero: numeroEngagementSuivant(engagements, Number(aujourdhui.slice(0, 4))),
      creeLe: aujourdhui,
      creePar: monNom,
      ...champs,
    };
    setEngagements((prev) => [e, ...prev]);
    setForm(null);
    setParams({ id: e.id });
    toast(`Dossier ${e.numero} ouvert. Rangez-y son premier devis.`);
  };

  return (
    <div className="eng">
      <PageHead
        eyebrow="Vente"
        title="Les engagements"
        sub="Ce que la Maison commande à un prestataire : ses devis, le oui, les avances et leurs décharges."
        actions={<Button variant="copper" onClick={() => ouvreLeFormulaire()}>+ Nouvel engagement</Button>}
      />

      {/* LES PIÈCES REÇUES PAR WHATSAPP QUI ATTENDENT UN DOSSIER : un devis
          photographié par un prestataire qui a deux chantiers ouverts, ou
          aucun. La direction choisit. */}
      {!ouvert && estDirection && (
        <PiecesARanger lectures={lectures} branchId={branch.id} aujourdhui={aujourdhui} />
      )}

      {ouvert
        ? (
          <LeDossier
            lecture={ouvert}
            onRetour={() => setParams({})}
            onModifier={() => ouvreLeFormulaire(ouvert.engagement)}
          />
        )
        : <LaListe lectures={lectures} bilan={bilan} currency={currency} onOuvre={(id) => setParams({ id })} />}

      {form && (
        <Modal title={form.id ? 'Corriger le dossier.' : 'Nouvel engagement.'} onClose={() => setForm(null)} width={560}>
          <div className="eng-formulaire">
            {fournisseursIci.length > 0 && (
              <Field label="Sa fiche fournisseur, s’il en a une">
                <Select
                  value={form.fournisseurId}
                  onChange={(ev) => {
                    const f = fournisseursIci.find((x) => x.id === ev.target.value);
                    setForm({ ...form, fournisseurId: ev.target.value, prestataire: f ? f.nom : form.prestataire, telephone: f?.telephone?.trim() || form.telephone });
                  }}
                >
                  <option value="">Un nom seul, sans fiche</option>
                  {fournisseursIci.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </Select>
              </Field>
            )}
            <div className="eng-deux">
              <Field label="Le prestataire">
                <Input value={form.prestataire} autoFocus placeholder="Menuiserie K." onChange={(ev) => setForm({ ...form, prestataire: ev.target.value })} />
              </Field>
              <Field label="Son métier">
                <Input value={form.metier} placeholder="menuisier" onChange={(ev) => setForm({ ...form, metier: ev.target.value })} />
              </Field>
            </div>
            {/* SON TÉLÉPHONE — 17 septembre 2026 : « rajouter le numéro de
                téléphone sur cette fiche » (Yéman). */}
            <Field label="Son téléphone">
              <Input inputMode="tel" value={form.telephone} onChange={(ev) => setForm({ ...form, telephone: ev.target.value })} />
            </Field>
            {form.fournisseurId && (
              <p className="eng-legende">Il s’écrit sur sa fiche fournisseur : un seul numéro pour une même maison.</p>
            )}
            <Field label="Ce que la Maison commande">
              <Input value={form.objet} placeholder="Agencement du salon" onChange={(ev) => setForm({ ...form, objet: ev.target.value })} />
            </Field>
            {/* ── LA MONNAIE DU DOSSIER — 15 septembre 2026 ──────────────
                « Me permettre de payer des prestataires en devises » (Yéman).
                Devis, versements et reste se lisent dans cette monnaie ; chaque
                versement dit à côté ce qu'il coûte en francs. */}
            <Field label="La monnaie du dossier">
              <Select
                value={form.devise}
                disabled={!!verrouDevise}
                title={verrouDevise ?? undefined}
                onChange={(ev) => setForm({ ...form, devise: ev.target.value })}
              >
                {DEVISES_A_OFFRIR.map((c) => (
                  <option key={c} value={c}>{c} · {nomDeLaDevise(c)}{c === DEVISE_DE_LA_MAISON ? ' · la Maison' : ''}</option>
                ))}
              </Select>
            </Field>
            {verrouDevise
              ? <p className="eng-legende">{verrouDevise}</p>
              : form.devise !== DEVISE_DE_LA_MAISON && (
                <p className="eng-legende">
                  Le devis et les versements se compteront en {nomDeLaDevise(form.devise)}. À chaque versement, le Trône
                  demandera ce qu’il coûte en francs, au taux du jour : c’est ce coût qui entre aux Dépenses.
                </p>
              )}
            <Field label="Une note">
              <Textarea rows={2} value={form.note} onChange={(ev) => setForm({ ...form, note: ev.target.value })} />
            </Field>
            <div className="eng-actions">
              <Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button>
              <Button variant="copper" onClick={enregistreLeDossier}>{form.id ? 'Enregistrer' : 'Ouvrir le dossier'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ══ LA LISTE ════════════════════════════════════════════════════════════ */

function LaListe({ lectures, bilan, currency, onOuvre }: {
  lectures: LectureDuDossier[];
  bilan: ReturnType<typeof bilanDesEngagements>;
  currency: string;
  onOuvre: (id: string) => void;
}) {
  if (lectures.length === 0) {
    return (
      <div className="eng-vide">
        <b>Aucun engagement encore.</b>
        Un engagement, c’est ce que la Maison commande à un prestataire : le menuisier, l’imprimeur,
        celui qui pose l’enseigne. Son dossier range ses devis pour les comparer, le oui de la direction,
        les avances et leurs décharges, et sa pièce d’identité.
      </div>
    );
  }
  return (
    <>
      <div className="eng-kpi">
        <div>
          <span className="l">En cours</span>
          <span className="v">{bilan.enCours}</span>
          <span className="c">{bilan.enCours > 1 ? 'dossiers où il reste à payer' : 'dossier où il reste à payer'}</span>
        </div>
        <div className="eng-kpi__reste">
          <span className="l">Reste à payer</span>
          {/* DEVISE PAR DEVISE : on n'additionne pas des euros et des francs. */}
          <span className="v">{restesDits(bilan.restes, currency)}</span>
          <span className="c">ce que la Maison doit encore</span>
        </div>
        <div className={bilan.sansDecharge > 0 ? 'eng-kpi__alerte' : ''}>
          <span className="l">Sans décharge</span>
          <span className="v">{bilan.sansDecharge}</span>
          <span className="c">{bilan.sansDecharge > 0 ? 'argent sorti dont rien ne prouve l’arrivée' : 'chaque franc versé est prouvé'}</span>
        </div>
      </div>

      <div className="eng-liste">
        {lectures.map((l) => {
          const e = l.engagement;
          return (
            <button key={e.id} type="button" className={`eng-carte${l.etat === 'solde' || l.etat === 'abandonne' ? ' is-ferme' : ''}`} onClick={() => onOuvre(e.id)}>
              <span className="eng-carte__qui">
                <span className="eng-carte__numero">{e.numero}</span>
                <span className="eng-carte__objet">{e.objet}</span>
                <span className="eng-carte__sous">
                  {e.prestataire}{e.metier ? ` · ${e.metier}` : ''}{l.devise !== DEVISE_DE_LA_MAISON ? ` · en ${nomDeLaDevise(l.devise)}` : ''}
                </span>
                {(l.sansDecharge.length > 0 || l.expires.length > 0 || l.expirentBientot.length > 0) && (
                  <span className="eng-carte__alertes">
                    {l.sansDecharge.length > 0 && <Pastille ton="non">{pluriel(l.sansDecharge.length, 'versement')} sans décharge</Pastille>}
                    {l.expirentBientot.length > 0 && <Pastille ton="att">un devis expire bientôt</Pastille>}
                    {l.expires.length > 0 && <Pastille ton="non">{l.expires.length > 1 ? 'des devis ont expiré' : 'un devis a expiré'}</Pastille>}
                  </span>
                )}
              </span>
              <span className="eng-carte__combien">
                <Pastille ton={TON_DE_L_ETAT[l.etat]}>{ETAT_DIT[l.etat]}</Pastille>
                {l.etat === 'en-cours' && <><b>{sommeDite(l.resteXof, l.devise, currency)}</b><span>reste à payer</span></>}
                {l.etat === 'devis' && <><b>{pluriel(l.devis.length, 'devis', 'devis')}</b><span>à comparer</span></>}
                {l.etat === 'solde' && <><b>{sommeDite(l.verseXof, l.devise, currency)}</b><span>versés</span></>}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ══ LES PIÈCES REÇUES PAR WHATSAPP, À RANGER — 15 septembre 2026 ═══════
   Maquette `public/maquette-lequipe-sur-whatsapp.html`, validée. Le webhook
   range seul une pièce quand le prestataire n'a qu'un dossier ouvert ; sinon
   elle attend ici. Ranger = relire la pièce du compartiment `whatsapp`, la
   déposer dans le coffre du dossier, et l'inscrire comme devis reçu, À ZÉRO :
   personne ne lit le montant à la place de la direction. */
function PiecesARanger({ lectures, branchId, aujourdhui }: {
  lectures: LectureDuDossier[];
  branchId: string;
  aujourdhui: string;
}) {
  const [messages] = useMessagesWa();
  const [, setDevis] = useDevisRecus();
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [occupe, setOccupe] = useState<string | null>(null);
  const aRanger = messages.filter((m) => m.sens === 'entrant' && m.tiroir === 'prestataires'
    && m.piece?.chemin && !m.rangeDans && (!m.branchId || m.branchId === branchId));
  const ouverts = lectures.filter((l) => l.etat === 'devis' || l.etat === 'en-cours');
  if (aRanger.length === 0) return null;

  const range = async (m: MessageWa) => {
    const engId = choix[m.id];
    if (!engId || !m.piece) { toast('Choisissez le dossier où ranger cette pièce.'); return; }
    setOccupe(m.id);
    const f = await fichierDeLaPieceRecue(m.piece);
    if (!f) { setOccupe(null); toast('La pièce n’a pas pu être relue. Vos droits ne le permettent peut-être pas.'); return; }
    const p = await deposeDansLeCoffre(branchId, engId, 'devis', f);
    setOccupe(null);
    if (!p) { toast('La pièce n’a pas pu être déposée au dossier.'); return; }
    const d: DevisRecu = {
      id: `dvr-${uid()}`, branchId, engagementId: engId,
      recuLe: m.quand.slice(0, 10) || aujourdhui, montantXof: 0, etat: 'recu',
      description: `Reçu par WhatsApp, à saisir${m.texte && m.texte !== m.piece.nom ? ` · ${m.texte.slice(0, 200)}` : ''}`,
      fichier: p,
      recuParWhatsApp: { waId: m.waId ?? m.id, quand: m.quand },
    };
    setDevis((prev) => [d, ...prev]);
    messagesWaStore.set((prev) => prev.map((x) => (x.id === m.id ? { ...x, rangeDans: engId } : x)));
    toast('Pièce rangée au dossier, comme devis à saisir.');
  };
  /* CE N'EST PAS UN DEVIS : on l'écarte, elle reste lisible dans le fil. */
  const ecarte = (m: MessageWa) =>
    messagesWaStore.set((prev) => prev.map((x) => (x.id === m.id ? { ...x, rangeDans: '-' } : x)));

  return (
    <section className="eng-bloc">
      <div className="eng-bloc__tete">
        <div>
          <h3>{pluriel(aRanger.length, 'pièce reçue', 'pièces reçues')} par WhatsApp, à ranger</h3>
          <p>
            Un prestataire a envoyé un devis en photo, et il a plusieurs dossiers ouverts avec la Maison, ou
            aucun. Choisissez le dossier : la pièce y entre comme devis <b>à saisir</b>, personne ne lit le
            montant à votre place.
          </p>
        </div>
      </div>
      <div className="eng-defile">
        <table className="eng-table">
          <thead><tr><th>Reçue le</th><th>De</th><th>La pièce</th><th>Le dossier</th><th /></tr></thead>
          <tbody>
            {aRanger.map((m) => (
              <tr key={m.id}>
                <td>{jourLongDit(m.quand.slice(0, 10))}</td>
                <td>{m.nomProfil ?? `+${m.numero}`}{m.texte && m.texte !== m.piece?.nom ? <span className="sous">{m.texte.slice(0, 80)}</span> : null}</td>
                <td>{m.piece?.nom}</td>
                <td>
                  {ouverts.length === 0
                    ? <span className="eng-doux">aucun dossier ouvert : ouvrez-en un d’abord</span>
                    : (
                      <Select value={choix[m.id] ?? ''} onChange={(ev) => setChoix((c) => ({ ...c, [m.id]: ev.target.value }))}>
                        <option value="">Choisir…</option>
                        {ouverts.map((l) => <option key={l.engagement.id} value={l.engagement.id}>{l.engagement.numero} · {l.engagement.objet} · {l.engagement.prestataire}</option>)}
                      </Select>
                    )}
                </td>
                <td className="eng-gestes">
                  <Button variant="copper" size="sm" disabled={occupe !== null || !choix[m.id]} onClick={() => void range(m)}>
                    {occupe === m.id ? 'Rangement…' : 'Ranger'}
                  </Button>
                  <button type="button" className="eng-lien eng-lien--doux" onClick={() => ecarte(m)}>Ce n’est pas un devis</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ══ LE DOSSIER ══════════════════════════════════════════════════════════ */

type FormDevis = {
  /** Présent : on corrige ce devis-là. Absent : on en range un nouveau. */
  id?: string;
  numeroPrestataire: string;
  recuLe: string;
  avecValidite: boolean;
  valableJusquau: string;
  /** Le montant tapé à la main — ne sert que s'il n'y a aucune ligne. */
  montant: string;
  lignes: LigneSaisie[];
  /** Le résumé des travaux à venir, rangé dans `description`. */
  resume: string;
  avenant: boolean;
  fichier: File | null;
};

type FormVersement = {
  id?: string;
  mode: 'prevoir' | 'verser';
  libelle: string;
  /** Dans la monnaie du dossier. */
  montant: string;
  /** Ce que cela coûte à la Maison, en francs — quand le dossier est en devise. */
  cout: string;
  /** Ce qui sort du tiroir — quand la caisse compte dans une troisième monnaie. */
  tiroir: string;
  avecEcheance: boolean;
  prevuLe: string;
  jour: string;
  cashbox: string;
  method: string;
  category: string;
  subcategory: string;
};

function LeDossier({ lecture, onRetour, onModifier }: {
  lecture: LectureDuDossier;
  onRetour: () => void;
  onModifier: () => void;
}) {
  const l = lecture;
  const e = l.engagement;
  const { branch, currency } = useBranch();
  const me = useStaff();
  const monNom = me?.name?.trim() || undefined;
  const estDirection = useEstDirection();
  const [, setEngagements] = useEngagements();
  const [, setDevis] = useDevisRecus();
  const [, setVersements] = useVersementsEngagement();
  const [expenses, setExpenses] = useExpenses();
  const [cashboxes] = useCashboxes();
  const [moyensPoses] = usePaymentMethods();
  const [categories] = useStore(expenseCategoriesStore);
  const aujourdhui = todayISO();
  /* LA MONNAIE DU DOSSIER — tout ce qui s'affiche ici se lit dedans. */
  const devise = l.devise;
  const enDevise = devise !== DEVISE_DE_LA_MAISON;
  const dit = (x: number) => sommeDite(x, devise, currency);
  /* TOUTES LES CAISSES DE LA BRANCHE : celles qui comptent dans la monnaie du
     dossier d'abord, puis celles en francs, puis les autres. Un dossier en
     euros se paie d'un tiroir en euros quand il y en a un, d'un tiroir en
     francs sinon, et d'un tiroir en dollars seulement si on le choisit. */
  const caisses = useMemo(() => {
    const rang = (c: (typeof cashboxes)[number]): number =>
      (cashboxCurrency(c) === devise ? 0 : cashboxCurrency(c) === DEVISE_DE_LA_MAISON ? 1 : 2);
    return cashboxes
      .filter((c) => c.branchId === branch.id)
      .sort((a, b) => rang(a) - rang(b));
  }, [cashboxes, branch.id, devise]);
  const base = devisDeBase(l.devis);
  const travaux = travauxAVenir(l.devis);
  const ferme = l.etat === 'abandonne';

  const [formDevis, setFormDevis] = useState<FormDevis | null>(null);
  const [aRetenir, setARetenir] = useState<DevisRecu | null>(null);
  const [formVers, setFormVers] = useState<FormVersement | null>(null);
  const [dechargeDe, setDechargeDe] = useState<string | null>(null);
  const [aEffacer, setAEffacer] = useState<Versement | null>(null);
  const [abandon, setAbandon] = useState(false);
  const [occupe, setOccupe] = useState(false);

  /* L'année ne se répète pas quand c'est celle du jour : un tableau qui dit
     « 2026 » sur chaque ligne se lit moins bien, et ne dit rien de plus. */
  const annee = aujourdhui.slice(0, 4);
  const jourDit = (iso?: string) => (!iso ? '' : iso.slice(0, 4) === annee ? jourLongDit(iso).replace(/ \d{4}$/, '') : jourLongDit(iso));

  /* ══ LE VERSEMENT S'ANNONCE SUR WHATSAPP — 15 septembre 2026 ═════════
     Maquette `public/maquette-lequipe-sur-whatsapp.html`, validée. La Maison
     prévient le prestataire, avec deux boutons : « Oui, bien reçu » et
     « Pas encore ». Sa réponse revient sur le versement, par le webhook.
     LE BOUTON EST UNE TRACE, PAS UNE SIGNATURE : la décharge reste la preuve.

     LE NUMÉRO EST CELUI DE SA FICHE FOURNISSEUR, liée au dossier : un
     dossier qui ne porte qu'un nom n'a personne à qui écrire. Dans la
     fenêtre de 24 heures, un message à boutons ; hors fenêtre, le modèle
     `versement_engagement`, que Meta facture. */
  const { session } = useAuth();
  const [messagesWa] = useMessagesWa();
  const [fournisseurs] = useFournisseurs();
  const telephone = telephoneDuPrestataire(e, fournisseurs);
  const numeroDuPrestataire = numeroWa(telephone);
  const previensDuVersement = async (v: Versement) => {
    if (!numeroDuPrestataire) {
      toast('Aucun numéro : liez le dossier à sa fiche fournisseur, avec son téléphone.');
      return;
    }
    setOccupe(true);
    const montant = dit(v.montantXof);
    const boutons = [
      { id: `RECU:${v.id}`, titre: 'Oui, bien reçu' },
      { id: `PASENCORE:${v.id}`, titre: 'Pas encore' },
    ];
    const fen = fenetreDe(messagesWa.filter((x) => numeroWa(x.numero) === numeroDuPrestataire), Date.now());
    const parQui = session?.user?.email ?? undefined;
    const r = fen.ouverte
      ? await envoieSurWhatsApp({
        numero: numeroDuPrestataire, boutons, branchId: branch.id, parQui,
        texte: signeLeMessage(`${maisonNom()} vous a versé ${montant} pour ${e.objet} (${v.libelle}). L’avez-vous bien reçu ?`),
      })
      : await envoieSurWhatsApp({
        numero: numeroDuPrestataire, boutons, branchId: branch.id, parQui,
        modele: MODELE_VERSEMENT, variables: [maisonNom(), montant, e.objet],
      });
    setOccupe(false);
    if (r.ok) {
      setVersements((prev) => prev.map((x) => (x.id === v.id ? { ...x, prevenuLe: new Date().toISOString(), prevenuParModele: !fen.ouverte } : x)));
      toast('Le prestataire est prévenu sur WhatsApp. Sa réponse paraîtra sur ce versement.');
    } else {
      toast(`Non prévenu : ${r.erreur}`);
    }
  };

  const patch = (fn: (x: Engagement) => Engagement) =>
    setEngagements((prev) => prev.map((x) => (x.id === e.id ? fn(x) : x)));

  /* ── LES DEVIS ─────────────────────────────────────────────────────── */
  const ouvreLeDevis = (d?: DevisRecu) => setFormDevis(d
    ? {
      id: d.id,
      numeroPrestataire: d.numeroPrestataire ?? '',
      recuLe: d.recuLe,
      avecValidite: !!d.valableJusquau,
      valableJusquau: d.valableJusquau ?? decaleLeJour(d.recuLe, 30),
      /* UN DEVIS SANS LIGNES garde son montant tapé ; un devis détaillé se
         rouvre ligne à ligne, et c'est le total qui refait le montant. */
      montant: d.lignes?.length ? '' : quantiteDite(d.montantXof),
      lignes: d.lignes?.length
        ? d.lignes.map((x) => ({ description: x.description, quantite: quantiteDite(x.quantite), prix: quantiteDite(x.prixUnitaireXof) }))
        : [LIGNE_VIDE],
      resume: d.description ?? '',
      avenant: !!d.avenant,
      fichier: null,
    }
    : {
      numeroPrestataire: '', recuLe: aujourdhui, avecValidite: true, valableJusquau: decaleLeJour(aujourdhui, 30),
      montant: '', lignes: [LIGNE_VIDE], resume: '', avenant: !!base, fichier: null,
    });

  const enregistreLeDevis = async () => {
    if (!formDevis) return;
    const f = formDevis;
    const existant = f.id ? l.devis.find((x) => x.id === f.id) : undefined;
    if (existant) {
      const refus = pourquoiOnNeModifiePas({ devis: existant, estDirection });
      if (refus) { toast(refus); return; }
    }
    const lignes = lignesDeLaSaisie(f.lignes, devise);
    for (const [i, x] of lignes.entries()) {
      const pourquoi = pourquoiLaLigneNeVautPas(x);
      if (pourquoi) { toast(`Ligne ${i + 1} : ${pourquoi}`); return; }
    }
    /* LES LIGNES FONT LE MONTANT. Sans ligne, le montant tapé vaut : un devis
       reçu sans détail existe, et le refuser le laisserait dans le téléphone. */
    const montant = lignes.length > 0 ? totalDesLignes(lignes, devise) : montantTape(f.montant, devise);
    if (montant <= 0) {
      toast(lignes.length > 0 ? 'Le total des lignes doit dépasser zéro.' : 'Écrivez le montant du devis, ou détaillez ses lignes.');
      return;
    }
    if (f.avecValidite && f.valableJusquau < f.recuLe) { toast('Un devis ne peut pas expirer avant d’avoir été reçu.'); return; }
    setOccupe(true);
    /* UN FICHIER REMPLACÉ NE S'EFFACE PAS DU COFFRE : c'est la pièce que le
       prestataire a réellement envoyée, et la trace de la base pointe encore
       vers elle. */
    let fichier: DevisRecu['fichier'] = existant?.fichier;
    if (f.fichier) {
      const p = await deposeDansLeCoffre(branch.id, e.id, 'devis', f.fichier);
      if (!p) {
        setOccupe(false);
        toast('Le fichier du devis n’a pas pu être déposé. Réessayez, ou retirez-le pour enregistrer sans.');
        return;
      }
      fichier = p;
    }
    if (existant) {
      setDevis((prev) => corrigeLeDevis(prev, existant.id, {
        numeroPrestataire: f.numeroPrestataire.trim() || undefined,
        recuLe: f.recuLe,
        valableJusquau: f.avecValidite ? f.valableJusquau : undefined,
        montantXof: montant,
        lignes: lignes.length > 0 ? lignes : undefined,
        description: f.resume.trim() || undefined,
        avenant: base && base.id !== existant.id && f.avenant ? true : undefined,
        fichier,
      }, monNom, aujourdhui));
      setOccupe(false);
      setFormDevis(null);
      toast(existant.etat === 'retenu'
        ? 'Devis retenu corrigé. La base garde la version d’avant.'
        : 'Devis corrigé.');
      return;
    }
    const d: DevisRecu = {
      id: `dvr-${uid()}`,
      branchId: branch.id,
      engagementId: e.id,
      numeroPrestataire: f.numeroPrestataire.trim() || undefined,
      recuLe: f.recuLe,
      valableJusquau: f.avecValidite ? f.valableJusquau : undefined,
      montantXof: montant,
      lignes: lignes.length > 0 ? lignes : undefined,
      description: f.resume.trim() || undefined,
      etat: 'recu',
      avenant: base && f.avenant ? true : undefined,
      fichier,
    };
    setDevis((prev) => [d, ...prev]);
    setOccupe(false);
    setFormDevis(null);
    toast(estDirection ? 'Devis rangé. Il attend votre décision.' : 'Devis rangé. La direction décidera de le retenir.');
  };

  const retiens = () => {
    if (!aRetenir) return;
    const pourquoi = pourquoiOnNeRetientPas({ devis: aRetenir, tous: l.devis, estDirection });
    if (pourquoi) { toast(pourquoi); return; }
    setDevis((prev) => retenirLeDevis(prev, aRetenir.id, monNom, aujourdhui));
    toast(aRetenir.avenant
      ? 'Avenant retenu. Il s’ajoute au devis de base.'
      : 'Devis retenu. Les autres propositions restent au dossier.');
    setARetenir(null);
  };

  /* ── LES VERSEMENTS ────────────────────────────────────────────────── */
  const categorieParDefaut = categories.some((c) => c.name === CATEGORIE_PROPOSEE)
    ? CATEGORIE_PROPOSEE
    : (categories[0]?.name ?? 'Divers');

  const ouvreLeVersement = (mode: FormVersement['mode'], v?: Versement) => setFormVers({
    id: v?.id,
    mode,
    libelle: v?.libelle ?? (l.versements.length === 0 ? 'Avance à la commande' : ''),
    montant: v ? quantiteDite(v.montantXof) : '',
    cout: '',
    tiroir: '',
    avecEcheance: !!v?.prevuLe || !v,
    prevuLe: v?.prevuLe ?? decaleLeJour(aujourdhui, 30),
    jour: aujourdhui,
    cashbox: v?.cashbox ?? caisses[0]?.name ?? '',
    method: v?.method ?? 'Espèces',
    category: categorieParDefaut,
    subcategory: '',
  });

  /* LES TROIS MONNAIES D'UN VERSEMENT — ce qu'il reçoit, ce que ça coûte,
     ce qui sort du tiroir. Le juge est pur (`argentDuVersement`) ; ici on
     lui donne la caisse choisie et ce que la main a tapé. */
  const caisseDe = (f: FormVersement) => caisses.find((c) => c.name === f.cashbox);
  const argentDe = (f: FormVersement, montant: number, caisse = caisseDe(f)) => {
    const deviseDuTiroir = caisse ? cashboxCurrency(caisse) : DEVISE_DE_LA_MAISON;
    return argentDuVersement({
      montant, devise, deviseDuTiroir,
      coutSaisi: saisieFacultative(f.cout, DEVISE_DE_LA_MAISON),
      tiroirSaisi: saisieFacultative(f.tiroir, deviseDuTiroir),
      tauxIndicatif: rateToXof,
    });
  };

  const enregistreLeVersement = () => {
    if (!formVers) return;
    const f = formVers;
    const montant = montantTape(f.montant, devise);
    const libelle = f.libelle.trim();
    if (!libelle) { toast('Dites ce que c’est : une avance, un deuxième versement, le solde.'); return; }
    const existant = f.id ? l.versements.find((x) => x.id === f.id) : undefined;
    const socle: Versement = existant ?? { id: `ver-${uid()}`, branchId: branch.id, engagementId: e.id, libelle, montantXof: montant };

    if (f.mode === 'prevoir') {
      if (montant <= 0) { toast('Un versement sans montant ne se pose pas.'); return; }
      const v: Versement = { ...socle, libelle, montantXof: montant, prevuLe: f.avecEcheance ? f.prevuLe : undefined };
      setVersements((prev) => (existant ? prev.map((x) => (x.id === v.id ? v : x)) : [v, ...prev]));
      setFormVers(null);
      toast('Versement prévu. Il ne sort de la caisse que le jour où on le verse.');
      return;
    }

    const argent = argentDe(f, montant);
    /* LA CAISSE DOIT EXISTER ENCORE : un versement prévu garde le nom d'une
       caisse qui a pu être renommée depuis, et payer d'un tiroir qui n'existe
       plus écrirait une dépense orpheline, sans monnaie. */
    if (!caisseDe(f)) { toast('Cette caisse n’existe plus : choisissez d’où sort l’argent.'); return; }
    const pourquoi = pourquoiOnNeVersePas({
      montantXof: montant, estDirection, retenuXof: l.retenuXof, cashbox: f.cashbox,
      coutXof: enDevise ? argent.coutXof : undefined,
      tiroir: argent.demandeLeTiroir ? argent.tiroir : undefined,
    });
    if (pourquoi) { toast(pourquoi); return; }
    const verse: Versement = {
      ...socle, libelle, montantXof: montant,
      verseLe: f.jour, versePar: monNom, method: f.method, cashbox: f.cashbox,
    };
    /* LA DÉPENSE ET LE VERSEMENT S'ÉCRIVENT D'UN SEUL GESTE. Demander deux
       saisies garantit qu'une manquera un jour, et la caisse ne tomberait
       plus juste. C'est la dépense qui porte le coût en francs et ce que le
       tiroir a perdu ; le versement ne les recopie pas. */
    const depense = depenseDuVersement(
      e, verse, { category: f.category, subcategory: f.subcategory },
      { coutXof: argent.coutXof, fx: argent.fx, devise: enDevise ? devise : undefined },
    );
    const v: Versement = { ...verse, expenseId: depense.id };
    setExpenses((prev) => [depense, ...prev]);
    setVersements((prev) => (existant ? prev.map((x) => (x.id === v.id ? v : x)) : [v, ...prev]));
    setFormVers(null);
    setDechargeDe(v.id);
    const sorti = argent.deviseDuTiroir === devise ? dit(montant) : sommeDite(argent.tiroir, argent.deviseDuTiroir, currency);
    toast(`Versé. ${sorti} sortent de « ${f.cashbox} », la dépense${enDevise ? ` de ${fmtMoney(argent.coutXof, currency)}` : ''} est au journal.`);
  };

  const effaceLeVersement = () => {
    if (!aEffacer) return;
    const v = aEffacer;
    if (v.expenseId) setExpenses((prev) => prev.filter((x) => x.id !== v.expenseId));
    if (v.decharge?.mode === 'papier') void retireDuCoffre([v.decharge.photo.chemin]);
    setVersements((prev) => prev.filter((x) => x.id !== v.id));
    setAEffacer(null);
    toast(v.expenseId ? 'Versement effacé, et sa dépense avec lui.' : 'Versement prévu effacé.');
  };

  /* ── LES PIÈCES ────────────────────────────────────────────────────── */
  const deposeLIdentite = async (f: File) => {
    setOccupe(true);
    const p = await deposeDansLeCoffre(branch.id, e.id, 'identite', f);
    setOccupe(false);
    if (!p) { toast('La pièce n’a pas pu être déposée.'); return; }
    const ancienne = e.identite?.chemin;
    patch((x) => ({ ...x, identite: { ...p, deposeLe: aujourdhui, deposePar: monNom } }));
    /* UNE SEULE CARTE PAR DOSSIER : la précédente ne reste pas derrière. */
    if (ancienne) void retireDuCoffre([ancienne]);
    toast('Pièce d’identité rangée. Seule la direction l’ouvre.');
  };

  const retireLIdentite = async () => {
    if (!e.identite) return;
    setOccupe(true);
    const ok = await retireDuCoffre([e.identite.chemin]);
    setOccupe(false);
    if (!ok) { toast('La pièce n’a pas pu être retirée du coffre.'); return; }
    patch((x) => {
      const { identite: _partie, ...reste } = x;
      return reste;
    });
    toast('Pièce d’identité effacée du coffre.');
  };

  const deposeUnePiece = async (f: File) => {
    setOccupe(true);
    const p = await deposeDansLeCoffre(branch.id, e.id, 'chantier', f);
    setOccupe(false);
    if (!p) { toast('La pièce n’a pas pu être déposée.'); return; }
    const rangee: PieceDuDossier = { ...p, deposeLe: aujourdhui, deposePar: monNom };
    patch((x) => ({ ...x, pieces: [...(x.pieces ?? []), rangee] }));
    toast('Pièce rangée au dossier.');
  };

  const retireUnePiece = async (p: PieceDuDossier) => {
    setOccupe(true);
    const ok = await retireDuCoffre([p.chemin]);
    setOccupe(false);
    if (!ok) { toast('La pièce n’a pas pu être retirée du coffre.'); return; }
    patch((x) => ({ ...x, pieces: (x.pieces ?? []).filter((y) => y.chemin !== p.chemin) }));
  };

  /* CE QUE LE FORMULAIRE DU DEVIS A DÉJÀ CALCULÉ. Une ligne illisible pèse
     zéro ici, et le refus dit laquelle à l'enregistrement. */
  const lignesSaisies = formDevis ? lignesDeLaSaisie(formDevis.lignes, devise) : [];
  const avecLignes = lignesSaisies.length > 0;
  const totalSaisi = totalDesLignes(lignesSaisies, devise);
  /* LE MONTANT DU DEVIS EN COURS DE SAISIE : les lignes, sinon ce qui est tapé. */
  const montantDuDevis = avecLignes ? totalSaisi : (formDevis ? montantTape(formDevis.montant, devise) : 0);
  const devisEnCours = formDevis?.id ? l.devis.find((d) => d.id === formDevis.id) : undefined;
  const avertCorrection = devisEnCours && formDevis
    ? avertitAvantDeCorriger({
      devis: devisEnCours,
      nouveauMontantXof: montantDuDevis,
      tous: l.devis,
      versements: l.versements,
      devise,
    })
    : null;
  /* Des centimes se tapent en euros, jamais en francs. */
  const clavierDuMontant = decimalesDe(devise) === 2 ? 'decimal' : 'numeric';
  const changeLaLigne = (i: number, champ: keyof LigneSaisie, valeur: string) =>
    setFormDevis((f) => (f ? { ...f, lignes: f.lignes.map((y, j) => (j === i ? { ...y, [champ]: valeur } : y)) } : f));

  const versementDeLaDecharge = dechargeDe ? l.versements.find((v) => v.id === dechargeDe) : undefined;
  const nVerses = l.versements.filter(estVerse).length;
  const nDecharges = nVerses - l.sansDecharge.length;
  const prochain = l.versements.find((v) => !estVerse(v));
  const effacement = effacementDeLIdentite(e, l.devis, l.versements);

  return (
    <div className="eng-dossier">
      <div className="eng-barre">
        <Button variant="ghost" size="sm" onClick={onRetour}>Tous les engagements</Button>
        <span className="eng-barre__droite">
          <Button variant="ghost" size="sm" onClick={onModifier}>Corriger le dossier</Button>
          {estDirection && (ferme
            ? <Button variant="ghost" size="sm" onClick={() => patch((x) => { const { abandonneLe: _a, ...r } = x; return r; })}>Rouvrir</Button>
            : <Button variant="ghost" size="sm" onClick={() => setAbandon(true)}>Abandonner</Button>)}
        </span>
      </div>

      <section className="eng-ecran">
        <div className="eng-ecran__tete">
          <b>{e.numero} · {e.objet}</b>
          <span>
            {e.prestataire}{e.metier ? ` · ${e.metier}` : ''}
            {telephone ? <> · <a className="eng-tel" href={`tel:${telephone.replace(/\s+/g, '')}`}>{telephone}</a></> : null}
            {enDevise ? ` · en ${nomDeLaDevise(devise)}` : ''} · {ETAT_DIT[l.etat]}
          </span>
        </div>
        <div className="eng-ecran__corps">
          <div className="eng-kpi">
            <div>
              <span className="l">Retenu au devis</span>
              <span className="v">{l.retenuXof > 0 ? dit(l.retenuXof) : 'Rien encore'}</span>
              <span className="c">
                {base ? `devis du ${jourDit(base.recuLe)}` : 'aucun devis retenu'}
                {l.depassementXof > 0 ? ` · dont ${dit(l.depassementXof)} d’avenant` : ''}
              </span>
            </div>
            <div>
              <span className="l">Déjà versé</span>
              <span className="v">{dit(l.verseXof)}</span>
              <span className="c">{pluriel(nVerses, 'versement')}, {pluriel(nDecharges, 'décharge')}</span>
            </div>
            <div className="eng-kpi__reste">
              <span className="l">Reste à payer</span>
              <span className="v">{dit(l.resteXof)}</span>
              <span className="c">{prochain ? `prochain : ${prochain.libelle.charAt(0).toLowerCase()}${prochain.libelle.slice(1)}` : l.etat === 'solde' ? 'dossier soldé' : 'aucun versement prévu'}</span>
            </div>
            {/* LA LIVRAISON ATTENDUE — 17 septembre 2026 : « pour tout devis
                validé et avancé ». La tuile presse quand la date est passée,
                ou quand le dossier est avancé sans date. */}
            <div className={l.livraison && (l.livraison.enRetard || l.livraison.aPoser) ? 'eng-kpi__alerte' : undefined}>
              <span className="l">Livraison attendue</span>
              <span className="v">{l.livraison ? valeurDeLaLivraison(l.livraison) : 'Pas encore'}</span>
              <span className="c">{l.livraison ? ditLaLivraison(l.livraison) : 'après le devis retenu'}</span>
            </div>
          </div>
          {l.livraison && !ferme && (
            <div className="eng-livraison">
              {l.livraison.livreLe ? (
                <>
                  <span className="eng-livraison__mot">Livré le {jourLongDit(l.livraison.livreLe)}</span>
                  <Button variant="ghost" size="sm" onClick={() => setDevis((prev) => marqueLivre(prev, l.livraison!.devis.id, undefined))}>Pas encore livré, en fait</Button>
                </>
              ) : l.livraison.quand ? (
                <>
                  <span className="eng-livraison__mot">Livraison attendue le</span>
                  <ChampDeDate compact sens="avant" value={l.livraison.quand} ariaLabel="Livraison attendue" onChange={(iso) => setDevis((prev) => poseLaLivraison(prev, l.livraison!.devis.id, iso))} />
                  <Button variant="ghost" size="sm" onClick={() => setDevis((prev) => poseLaLivraison(prev, l.livraison!.devis.id, undefined))}>Retirer la date</Button>
                  <Button variant="copper" size="sm" onClick={() => setDevis((prev) => marqueLivre(prev, l.livraison!.devis.id, aujourdhui))}>Livré aujourd’hui</Button>
                </>
              ) : (
                <>
                  <span className="eng-livraison__mot">{l.livraison.aPoser ? 'Le devis est retenu et avancé : quand livre-t-il ?' : 'Quand livre-t-il ?'}</span>
                  <Button variant={l.livraison.aPoser ? 'copper' : 'ghost'} size="sm" onClick={() => setDevis((prev) => poseLaLivraison(prev, l.livraison!.devis.id, decaleLeJour(aujourdhui, 7)))}>Poser la date attendue</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDevis((prev) => marqueLivre(prev, l.livraison!.devis.id, aujourdhui))}>Déjà livré</Button>
                </>
              )}
            </div>
          )}
          {/* LES TRAVAUX À VENIR, EN TÊTE DU DOSSIER : on ouvre un chantier
              pour savoir ce qui va s'y faire avant de savoir combien il reste. */}
          {travaux.length > 0 && (
            <div className="eng-travaux">
              <span className="eng-travaux__titre">Les travaux à venir</span>
              {travaux.map(({ devis: d, texte }) => (
                <p key={d.id}>
                  {travaux.length > 1 && (
                    <span className="eng-travaux__source">
                      {d.avenant
                        ? `Avenant du ${jourDit(d.recuLe)}`
                        : `Devis ${d.numeroPrestataire ? `${d.numeroPrestataire} ` : ''}du ${jourDit(d.recuLe)}`}
                    </span>
                  )}
                  {texte}
                </p>
              ))}
            </div>
          )}
          {l.tropVerseXof > 0 && (
            <div className="eng-mur">
              <b>{dit(l.tropVerseXof)} versés au-delà du devis retenu.</b> À récupérer, ou à déduire
              d’un prochain avenant : taire ce trop-versé ferait perdre cet argent.
            </div>
          )}
          {l.depassementXof > 0 && (
            <p className="eng-legende">
              <b>Le devis de base a été dépassé de {dit(l.depassementXof)}.</b> Un dépassement
              qui ne se nomme pas passe pour le prix convenu.
            </p>
          )}
          {e.note && <p className="eng-legende">{e.note}</p>}
        </div>
      </section>

      {/* ── SES DEVIS ── */}
      <section className="eng-bloc">
        <div className="eng-bloc__tete">
          <div>
            <h3>Ses devis</h3>
            <p>Plusieurs propositions, une seule retenue. Un devis écarté reste : c’est la preuve qu’on a comparé.</p>
          </div>
          {!ferme && <Button variant="ghost" size="sm" onClick={() => ouvreLeDevis()}>+ Devis reçu</Button>}
        </div>
        {l.devis.length === 0 ? (
          <p className="eng-rien">Aucun devis rangé. Son numéro, sa validité et son fichier se gardent ici, PDF ou photo.</p>
        ) : (
          <div className="eng-defile">
            <table className="eng-table">
              <thead>
                <tr><th>Son numéro</th><th>Reçu le</th><th>Valable jusqu’au</th><th className="num">Montant</th><th>État</th><th /></tr>
              </thead>
              <tbody>
                {l.devis.map((d) => {
                  const expire = devisExpire(d, aujourdhui);
                  const bientot = devisExpireBientot(d, aujourdhui);
                  return (
                    <Fragment key={d.id}>
                    <tr className={`${d.etat === 'retenu' ? 'is-retenu' : ''}${d.lignes?.length || d.description ? ' a-des-lignes' : ''}`}>
                      <td>
                        {d.numeroPrestataire || 'sans numéro'}
                        {d.avenant && <span className="sous">avenant</span>}
                        {d.corrigeLe && (
                          <span className="sous">corrigé le {jourDit(d.corrigeLe)}{d.corrigePar ? ` par ${d.corrigePar}` : ''}</span>
                        )}
                      </td>
                      <td>{jourDit(d.recuLe)}</td>
                      <td>
                        {!d.valableJusquau ? <span className="eng-doux">sans date</span>
                          : expire ? <b className="eng-brique">expiré le {jourDit(d.valableJusquau)}</b>
                            : bientot ? <b className="eng-ambre">{jourDit(d.valableJusquau)}, bientôt</b>
                              : jourDit(d.valableJusquau)}
                      </td>
                      <td className="num">{dit(d.montantXof)}</td>
                      <td>
                        {d.etat === 'retenu' && <Pastille ton="ok">retenu</Pastille>}
                        {d.etat === 'recu' && <Pastille ton="att">à trancher</Pastille>}
                        {d.etat === 'ecarte' && <Pastille ton="non">écarté</Pastille>}
                        {d.etat === 'remplace' && <Pastille ton="non">remplacé</Pastille>}
                      </td>
                      <td className="eng-gestes">
                        {d.fichier && <button type="button" className="eng-lien" onClick={() => void ouvreLaPiece(d.fichier!.chemin)}>Le fichier</button>}
                        {!ferme && !pourquoiOnNeModifiePas({ devis: d, estDirection }) && (
                          <button type="button" className="eng-lien" onClick={() => ouvreLeDevis(d)}>Corriger</button>
                        )}
                        {estDirection && !ferme && d.etat !== 'retenu' && (
                          <Button variant={d.etat === 'recu' ? 'copper' : 'ghost'} size="sm" onClick={() => setARetenir(d)}>Retenir</Button>
                        )}
                      </td>
                    </tr>
                    {/* CE QU'IL COMPREND, sous sa ligne : comparer deux devis,
                        c'est comparer leurs lignes, pas deux totaux. */}
                    {(d.description || (d.lignes && d.lignes.length > 0)) && (
                      <tr className={`eng-detail${d.etat === 'retenu' ? ' is-retenu' : ''}`}>
                        <td colSpan={6}>
                          {d.description && (
                            <p className="eng-resume">
                              <span>Les travaux à venir</span>
                              {d.description}
                            </p>
                          )}
                          {d.lignes && d.lignes.length > 0 && (
                            <table className="eng-lignes">
                              <tbody>
                                {d.lignes.map((x, i) => (
                                  <tr key={i}>
                                    <td>{x.description}</td>
                                    <td className="num">{quantiteDite(x.quantite)} ×</td>
                                    <td className="num">{dit(x.prixUnitaireXof)}</td>
                                    <td className="num"><b>{dit(totalDeLaLigne(x, devise))}</b></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!estDirection && l.devis.some((d) => d.etat === 'recu') && (
          <p className="eng-legende">Retenir un devis engage la Maison : la direction seule le fait.</p>
        )}
      </section>

      {/* ── L'ARGENT, ET SA PREUVE ── */}
      <section className="eng-bloc">
        <div className="eng-bloc__tete">
          <div>
            <h3>L’argent, et sa preuve</h3>
            <p>Une avance sans décharge n’est pas une avance : c’est de l’argent sorti dont rien ne dit qu’il est arrivé.</p>
          </div>
          {!ferme && (
            <span className="eng-bloc__gestes">
              <Button variant="ghost" size="sm" onClick={() => ouvreLeVersement('prevoir')}>+ Prévoir</Button>
              {estDirection && (
                <Button variant="copper" size="sm" disabled={l.retenuXof <= 0 || caisses.length === 0} onClick={() => ouvreLeVersement('verser')}>
                  Verser
                </Button>
              )}
            </span>
          )}
        </div>
        {l.versements.length === 0 ? (
          <p className="eng-rien">
            {l.retenuXof > 0
              ? 'Rien de versé ni de prévu. Prévoyez l’échéancier convenu : l’avance, le versement à mi-chantier, le solde.'
              : 'On ne verse pas avant d’avoir dit oui : retenez d’abord un devis.'}
          </p>
        ) : (
          <div className="eng-defile">
            <table className="eng-table">
              <thead>
                <tr><th>Le jour</th><th>Ce que c’est</th><th>Comment</th><th className="num">Montant</th><th>Sa décharge</th><th /></tr>
              </thead>
              <tbody>
                {l.versements.map((v) => {
                  const verse = estVerse(v);
                  const prouve = verse && !dechargeInvalide(v.decharge);
                  return (
                    <tr key={v.id}>
                      <td>{verse ? jourDit(v.verseLe) : v.prevuLe ? <span className="eng-doux">prévu le {jourDit(v.prevuLe)}</span> : <span className="eng-doux">à convenir</span>}</td>
                      <td>
                        {v.libelle}
                        {v.versePar && <span className="sous">remis par {v.versePar}</span>}
                        {v.prevenuLe && <span className="sous">prévenu par WhatsApp le {jourDit(v.prevenuLe.slice(0, 10))}{v.prevenuParModele ? ' (modèle)' : ''}</span>}
                      </td>
                      <td>
                        {verse ? [v.method, v.cashbox ? `caisse ${v.cashbox}` : ''].filter(Boolean).join(' · ') : <span className="eng-doux">pas encore versé</span>}
                        {/* CE QUE ÇA A COÛTÉ, ET CE QUI EST SORTI, lus sur la
                            dépense liée : c'est elle qui fait foi, et c'est
                            là que la direction corrige un taux. */}
                        {verse && (() => {
                          const dep = v.expenseId ? expenses.find((x) => x.id === v.expenseId) : undefined;
                          if (!dep) return null;
                          const dits = [
                            dep.fx && dep.fx.code !== devise ? `${sommeDite(dep.fx.amount, dep.fx.code, currency)} sortis du tiroir` : '',
                            enDevise ? `soit ${fmtMoney(dep.amountXof, currency)} pour la Maison` : '',
                          ].filter(Boolean);
                          return dits.length > 0 ? <span className="sous">{dits.join(' · ')}</span> : null;
                        })()}
                      </td>
                      <td className="num">{dit(v.montantXof)}</td>
                      <td>
                        {!verse && <Pastille ton="att">prévu, non versé</Pastille>}
                        {verse && !prouve && <Pastille ton="non">en attente de décharge</Pastille>}
                        {prouve && v.decharge?.mode === 'ecran' && <Pastille ton="ok">signée à l’écran</Pastille>}
                        {prouve && v.decharge?.mode === 'papier' && <Pastille ton="ok">rapportée signée</Pastille>}
                        {/* CE QU'IL A RÉPONDU SUR WHATSAPP — une trace, pas une preuve. */}
                        {v.recuLe && <Pastille ton="ok">reçu, dit-il, le {jourDit(v.recuLe.slice(0, 10))}</Pastille>}
                        {v.contesteLe && !v.recuLe && <Pastille ton="non">il dit ne pas l’avoir reçu</Pastille>}
                      </td>
                      <td className="eng-gestes">
                        {!verse && estDirection && !ferme && (
                          <Button variant="copper" size="sm" disabled={l.retenuXof <= 0 || caisses.length === 0} onClick={() => ouvreLeVersement('verser', v)}>Verser</Button>
                        )}
                        {!verse && !ferme && (
                          <button type="button" className="eng-lien" onClick={() => ouvreLeVersement('prevoir', v)}>Corriger</button>
                        )}
                        {verse && (
                          <Button variant={prouve ? 'ghost' : 'copper'} size="sm" onClick={() => setDechargeDe(v.id)}>
                            {prouve ? 'La décharge' : 'Faire la décharge'}
                          </Button>
                        )}
                        {verse && estDirection && (
                          <button
                            type="button"
                            className="eng-lien"
                            disabled={occupe}
                            title={numeroDuPrestataire ? 'Lui annoncer le versement sur WhatsApp, avec deux boutons de réponse' : 'Liez le dossier à une fiche fournisseur avec son téléphone'}
                            onClick={() => void previensDuVersement(v)}
                          >
                            {v.prevenuLe ? 'Reprévenir' : 'Prévenir par WhatsApp'}
                          </button>
                        )}
                        {estDirection && <button type="button" className="eng-lien eng-lien--doux" onClick={() => setAEffacer(v)}>Effacer</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="eng-garde">
          <b>L’argent sort par la porte des Dépenses.</b> Chaque versement EST une dépense, avec sa caisse et son
          moyen : il entre au journal du jour et pèse sur le résultat du mois. Le dossier tient la preuve, pas une
          seconde comptabilité.
        </div>
      </section>

      {/* ── LA PIÈCE D'IDENTITÉ ── */}
      <section className="eng-bloc">
        <div className="eng-bloc__tete">
          <div>
            <h3>Sa pièce d’identité</h3>
            <p>
              Elle sert à savoir qui la Maison paie, et à le prouver en cas de litige. La direction seule l’ouvre,
              par un lien qui expire en une heure ; elle s’efface un an après la fermeture du dossier.
              Dites-le au prestataire : il a le droit de savoir à quoi sert la copie de sa carte.
            </p>
          </div>
        </div>
        {!estDirection ? (
          <p className="eng-rien">{e.identite ? 'Une pièce est rangée. Elle est réservée à la direction.' : 'Réservée à la direction : c’est elle qui la dépose.'}</p>
        ) : e.identite ? (
          <div className="eng-piece">
            <span>
              <b>{e.identite.nom}</b>
              <span className="sous">
                déposée le {jourDit(e.identite.deposeLe)}{e.identite.deposePar ? ` par ${e.identite.deposePar}` : ''}
                {' · '}{effacement ? `s’effacera le ${jourLongDit(effacement)}` : 'gardée tant que le dossier vit'}
              </span>
            </span>
            <span className="eng-gestes">
              <Button variant="ghost" size="sm" onClick={() => void ouvreLaPiece(e.identite!.chemin)}>Ouvrir</Button>
              <ChoisirUnePiece libelle="Remplacer" accept={FORMATS_DE_L_IDENTITE} disabled={occupe} onFichier={(f) => void deposeLIdentite(f)} />
              <button type="button" className="eng-lien eng-lien--doux" disabled={occupe} onClick={() => void retireLIdentite()}>Effacer</button>
            </span>
          </div>
        ) : (
          <div className="eng-piece">
            <span className="eng-doux">Aucune pièce d’identité. Une photo lisible, JPEG ou PNG : elle figure sur chaque décharge.</span>
            <ChoisirUnePiece libelle="Déposer sa pièce" accept={FORMATS_DE_L_IDENTITE} disabled={occupe} onFichier={(f) => void deposeLIdentite(f)} />
          </div>
        )}
      </section>

      {/* ── CE QU'ON RANGE À CÔTÉ ── */}
      <section className="eng-bloc">
        <div className="eng-bloc__tete">
          <div>
            <h3>Ce qu’on range à côté</h3>
            <p>Ses attestations, un plan, les photos du chantier. Le même coffre, sans adresse publique.</p>
          </div>
          <ChoisirUnePiece libelle="+ Une pièce" disabled={occupe} onFichier={(f) => void deposeUnePiece(f)} />
        </div>
        {(e.pieces ?? []).length === 0 ? (
          <p className="eng-rien">Rien de rangé.</p>
        ) : (
          (e.pieces ?? []).map((p) => (
            <div key={p.chemin} className="eng-piece">
              <span>
                <b>{p.nom}</b>
                <span className="sous">le {jourDit(p.deposeLe)}{p.deposePar ? ` par ${p.deposePar}` : ''}</span>
              </span>
              <span className="eng-gestes">
                <Button variant="ghost" size="sm" onClick={() => void ouvreLaPiece(p.chemin)}>Ouvrir</Button>
                {estDirection && <button type="button" className="eng-lien eng-lien--doux" disabled={occupe} onClick={() => void retireUnePiece(p)}>Effacer</button>}
              </span>
            </div>
          ))
        )}
      </section>

      {/* ══ LES MODALES ══ */}

      {formDevis && (
        <Modal
          title={devisEnCours
            ? (devisEnCours.etat === 'retenu' ? 'Corriger le devis retenu.' : 'Corriger le devis.')
            : formDevis.avenant && base ? 'Un avenant reçu.' : 'Un devis reçu.'}
          onClose={() => setFormDevis(null)}
          width={680}
        >
          <div className="eng-formulaire">
            <div className="eng-deux">
              <Field label="Son numéro à lui">
                <Input value={formDevis.numeroPrestataire} autoFocus placeholder="DV-0231" onChange={(ev) => setFormDevis({ ...formDevis, numeroPrestataire: ev.target.value })} />
              </Field>
              <Field label={avecLignes ? `Le montant · calculé` : `Le montant · ${devise}`}>
                {avecLignes
                  ? <Input value={dit(totalSaisi)} disabled title="Le total des lignes, calculé par le Trône" />
                  : <Input inputMode={clavierDuMontant} value={formDevis.montant} placeholder="ou détaillez les lignes" onChange={(ev) => setFormDevis({ ...formDevis, montant: ev.target.value })} />}
              </Field>
            </div>
            <div className="eng-deux">
              <Field label="Reçu le">
                <ChampDeDate compact sens="arriere" value={formDevis.recuLe} onChange={(iso) => setFormDevis({ ...formDevis, recuLe: iso })} />
              </Field>
              <Field label={formDevis.avecValidite ? 'Valable jusqu’au' : 'Sa validité'}>
                {formDevis.avecValidite
                  ? <ChampDeDate compact sens="avant" value={formDevis.valableJusquau} onChange={(iso) => setFormDevis({ ...formDevis, valableJusquau: iso })} />
                  : <span className="eng-doux">le devis ne porte pas de date</span>}
              </Field>
            </div>
            <label className="eng-coche">
              <input type="checkbox" checked={!formDevis.avecValidite} onChange={(ev) => setFormDevis({ ...formDevis, avecValidite: !ev.target.checked })} />
              Le devis ne dit pas jusqu’à quand il vaut
            </label>
            <Field label="Les travaux à venir · le résumé">
              <Textarea
                rows={3}
                value={formDevis.resume}
                placeholder="Agencement du salon : deux étagères, portes moustiquaires, pose en six semaines"
                onChange={(ev) => setFormDevis({ ...formDevis, resume: ev.target.value })}
              />
            </Field>
            <div className="eng-lignes-saisie">
              <span className="mnd-field__label">Ce qu’il comprend</span>
              <div className="eng-ligne eng-ligne--tete" aria-hidden="true">
                <span>Description</span><span>Quantité</span><span>Prix unitaire · {devise}</span><span>Total</span><span />
              </div>
              {formDevis.lignes.map((x, i) => {
                const lue = ligneDeLaSaisie(x, devise);
                const remplie = !!(x.description.trim() || x.prix.trim());
                const illisible = remplie && (Number.isNaN(lue.quantite) || Number.isNaN(lue.prixUnitaireXof));
                return (
                  <div key={i} className="eng-ligne">
                    <Input aria-label={`Ligne ${i + 1}, description`} value={x.description} placeholder="Madrier" onChange={(ev) => changeLaLigne(i, 'description', ev.target.value)} />
                    <Input aria-label={`Ligne ${i + 1}, quantité`} inputMode="decimal" value={x.quantite} onChange={(ev) => changeLaLigne(i, 'quantite', ev.target.value)} />
                    <Input aria-label={`Ligne ${i + 1}, prix unitaire`} inputMode={clavierDuMontant} value={x.prix} placeholder={enDevise ? '12,50' : '25 000'} onChange={(ev) => changeLaLigne(i, 'prix', ev.target.value)} />
                    <span className={`eng-ligne__total${illisible ? ' eng-brique' : ''}`}>
                      {illisible ? 'à corriger' : remplie ? dit(totalDeLaLigne(lue, devise)) : ''}
                    </span>
                    <button
                      type="button"
                      className="eng-ligne__retire"
                      aria-label={`Retirer la ligne ${i + 1}`}
                      disabled={formDevis.lignes.length === 1}
                      onClick={() => setFormDevis({ ...formDevis, lignes: formDevis.lignes.filter((_, j) => j !== i) })}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <div className="eng-ligne__pied">
                <button type="button" className="eng-lien" onClick={() => setFormDevis({ ...formDevis, lignes: [...formDevis.lignes, LIGNE_VIDE] })}>
                  + Une ligne
                </button>
                <span>Total du devis<b>{dit(montantDuDevis)}</b></span>
              </div>
            </div>
            {base && base.id !== devisEnCours?.id && devisEnCours?.etat !== 'retenu' && (
              <label className="eng-coche">
                <input type="checkbox" checked={formDevis.avenant} onChange={(ev) => setFormDevis({ ...formDevis, avenant: ev.target.checked })} />
                C’est un avenant : il s’ajoute au devis retenu, il ne le remplace pas
              </label>
            )}
            <div className="eng-piece">
              <span className={formDevis.fichier || devisEnCours?.fichier ? '' : 'eng-doux'}>
                {formDevis.fichier
                  ? formDevis.fichier.name
                  : devisEnCours?.fichier ? `${devisEnCours.fichier.nom} · déjà rangé` : 'Le fichier qu’il a envoyé, PDF ou photo.'}
              </span>
              <span className="eng-gestes">
                <ChoisirUnePiece libelle={formDevis.fichier || devisEnCours?.fichier ? 'Remplacer' : 'Joindre'} onFichier={(f) => setFormDevis({ ...formDevis, fichier: f })} />
                {formDevis.fichier && <button type="button" className="eng-lien eng-lien--doux" onClick={() => setFormDevis({ ...formDevis, fichier: null })}>Retirer</button>}
              </span>
            </div>
            {devisEnCours?.etat === 'retenu' && (
              <div className={avertCorrection ? 'eng-mur' : 'eng-garde'}>
                {avertCorrection ?? (
                  <><b>Ce devis est retenu.</b> La correction s’enregistre à votre nom, et la base garde la version d’avant.</>
                )}
              </div>
            )}
            <div className="eng-actions">
              <Button variant="ghost" onClick={() => setFormDevis(null)}>Annuler</Button>
              <Button variant="copper" disabled={occupe} onClick={() => void enregistreLeDevis()}>
                {occupe ? 'Dépôt…' : devisEnCours ? 'Enregistrer la correction' : 'Ranger le devis'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {aRetenir && (() => {
        const avert = avertitAvantDeRetenir(aRetenir, aujourdhui);
        const autres = l.devis.filter((d) => d.id !== aRetenir.id && d.etat === 'recu').length;
        return (
          <Modal title={aRetenir.avenant ? 'Retenir cet avenant.' : 'Retenir ce devis.'} onClose={() => setARetenir(null)} width={500}>
            <div className="eng-formulaire">
              <div className="eng-recap">
                <span>{aRetenir.numeroPrestataire || 'Devis sans numéro'}<span className="sous">reçu le {jourDit(aRetenir.recuLe)}</span></span>
                <b>{dit(aRetenir.montantXof)}</b>
              </div>
              {avert && <div className="eng-mur">{avert}</div>}
              <p className="eng-legende">
                {aRetenir.avenant
                  ? `Le retenu passera à ${dit(retenuXof([...l.devis.filter((d) => d.id !== aRetenir.id), { ...aRetenir, etat: 'retenu' }]))}. Les autres devis ne bougent pas.`
                  : [
                    base ? `Le devis retenu jusqu’ici sera marqué remplacé.` : '',
                    autres > 0 ? `${pluriel(autres, 'autre devis', 'autres devis')} en attente ${autres > 1 ? 'seront écartés' : 'sera écarté'}, sans être effacés.` : '',
                    'Le oui engage la Maison, et la base garde qui l’a donné.',
                  ].filter(Boolean).join(' ')}
              </p>
              <div className="eng-actions">
                <Button variant="ghost" onClick={() => setARetenir(null)}>Annuler</Button>
                <Button variant="copper" onClick={retiens}>Retenir</Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {formVers && (() => {
        const montant = montantTape(formVers.montant, devise);
        const avert = formVers.mode === 'verser'
          ? avertitAvantDeVerser({ montantXof: montant, retenuXof: l.retenuXof, dejaVerseXof: l.verseXof, devise })
          : null;
        const sous = categories.find((c) => c.name === formVers.category)?.subs ?? [];
        const argent = argentDe(formVers, montant);
        return (
          <Modal
            title={formVers.mode === 'verser' ? 'Verser au prestataire.' : formVers.id ? 'Corriger le versement prévu.' : 'Prévoir un versement.'}
            onClose={() => setFormVers(null)}
            width={580}
          >
            <div className="eng-formulaire">
              <div className="eng-deux">
                <Field label="Ce que c’est">
                  <Input value={formVers.libelle} autoFocus placeholder="Avance à la commande" onChange={(ev) => setFormVers({ ...formVers, libelle: ev.target.value })} />
                </Field>
                <Field label={`Le montant · ${devise}`}>
                  {/* UN MONTANT QUI CHANGE EFFACE LE COÛT ET LE TIROIR TAPÉS : ils
                      valaient pour l'ancien montant, pas pour celui-ci. */}
                  <Input inputMode={clavierDuMontant} value={formVers.montant} onChange={(ev) => setFormVers({ ...formVers, montant: ev.target.value, cout: '', tiroir: '' })} />
                </Field>
              </div>
              {l.retenuXof > 0 && (
                <p className="eng-legende">
                  Retenu {dit(l.retenuXof)}, déjà versé {dit(l.verseXof)}, reste {dit(l.resteXof)}.
                </p>
              )}

              {formVers.mode === 'prevoir' ? (
                <>
                  <label className="eng-coche">
                    <input type="checkbox" checked={formVers.avecEcheance} onChange={(ev) => setFormVers({ ...formVers, avecEcheance: ev.target.checked })} />
                    Une date est convenue
                  </label>
                  {formVers.avecEcheance && (
                    <Field label="Prévu le">
                      <ChampDeDate compact sens="avant" value={formVers.prevuLe} onChange={(iso) => setFormVers({ ...formVers, prevuLe: iso })} />
                    </Field>
                  )}
                </>
              ) : (
                <>
                  <div className="eng-deux">
                    <Field label="D’où sort l’argent">
                      <Select value={formVers.cashbox} onChange={(ev) => setFormVers({ ...formVers, cashbox: ev.target.value, tiroir: '' })}>
                        {caisses.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}{cashboxCurrency(c) !== DEVISE_DE_LA_MAISON ? ` · ${cashboxCurrency(c)}` : ''}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Le jour">
                      <ChampDeDate compact sens="arriere" value={formVers.jour} onChange={(iso) => setFormVers({ ...formVers, jour: iso })} />
                    </Field>
                  </div>
                  {/* ── LES AUTRES MONNAIES DU VERSEMENT — 15 septembre 2026 ──
                      Le taux indicatif pré-remplit, la main corrige au taux
                      réellement pratiqué, et c'est la main qui fait foi. */}
                  {argent.demandeLeCout && (
                    <Field label="Ce que cela coûte à la Maison · francs">
                      <Input
                        inputMode="numeric"
                        value={formVers.cout}
                        placeholder={String(argent.suggestionCout)}
                        onChange={(ev) => setFormVers({ ...formVers, cout: ev.target.value })}
                      />
                      <span className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
                        C’est ce coût qui entre aux Dépenses. Rempli au taux indicatif de la Maison
                        ({rateToXof(devise).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} F pour 1 {devise}), corrigez-le au taux
                        réellement pratiqué, il fait foi.
                        {montant > 0 && argent.coutXof > 0 && ` Ici : ${(argent.coutXof / montant).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} F par ${devise}.`}
                      </span>
                    </Field>
                  )}
                  {argent.demandeLeTiroir && (
                    <Field label={`Ce qui sort du tiroir · ${argent.deviseDuTiroir}`}>
                      <Input
                        inputMode="decimal"
                        value={formVers.tiroir}
                        placeholder={quantiteDite(argent.suggestionTiroir)}
                        onChange={(ev) => setFormVers({ ...formVers, tiroir: ev.target.value })}
                      />
                      <span className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
                        « {formVers.cashbox} » compte ses billets en {argent.deviseDuTiroir}. Écrivez ce qui en sort réellement.
                      </span>
                    </Field>
                  )}
                  {/* LA CAISSE COMPTE DANS LA MONNAIE DU DOSSIER : rien à demander,
                      elle perd exactement ce qu'il reçoit. */}
                  {enDevise && argent.deviseDuTiroir === devise && montant > 0 && (
                    <p className="eng-legende">
                      « {formVers.cashbox} » compte en {devise} : elle perd {dit(montant)}.
                    </p>
                  )}
                  <Field label="Par quel moyen">
                    <Select value={formVers.method} onChange={(ev) => setFormVers({ ...formVers, method: ev.target.value })}>
                      {moyensAOffrir(moyensPoses, formVers.method).map((m) => <option key={m} value={m}>{m}</option>)}
                    </Select>
                  </Field>
                  <div className="eng-deux">
                    <Field label="Rangé en dépense sous">
                      <Select value={formVers.category} onChange={(ev) => setFormVers({ ...formVers, category: ev.target.value, subcategory: '' })}>
                        {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Précisément">
                      <Select value={formVers.subcategory} onChange={(ev) => setFormVers({ ...formVers, subcategory: ev.target.value })}>
                        <option value="">Sans précision</option>
                        {sous.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </Field>
                  </div>
                  {avert && <div className="eng-mur">{avert}</div>}
                  {!e.identite && (
                    <div className="eng-mur">
                      <b>Sa pièce d’identité n’est pas déposée.</b> Elle figure sur chaque décharge : sans elle, la
                      décharge ne pourra pas se faire. Déposez-la au dossier avant de lui remettre l’argent.
                    </div>
                  )}
                  <div className="eng-garde">
                    <b>Le Trône écrira deux choses d’un geste.</b> La dépense, dans la caisse choisie, et le versement
                    au dossier. La décharge s’ouvre juste après : faites-la signer tant qu’il est là.
                  </div>
                </>
              )}
              <div className="eng-actions">
                <Button variant="ghost" onClick={() => setFormVers(null)}>Annuler</Button>
                <Button variant="copper" onClick={enregistreLeVersement}>{formVers.mode === 'verser' ? 'Verser' : 'Prévoir'}</Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {versementDeLaDecharge && (
        <ModaleDeLaDecharge
          lecture={l}
          versement={versementDeLaDecharge}
          rang={l.versements.filter(estVerse).findIndex((v) => v.id === versementDeLaDecharge.id) + 1}
          onClose={() => setDechargeDe(null)}
          onDeposeLIdentite={deposeLIdentite}
          depotEnCours={occupe}
        />
      )}

      {aEffacer && (
        <Modal title="Effacer ce versement." onClose={() => setAEffacer(null)} width={480}>
          <div className="eng-formulaire">
            <div className="eng-recap">
              <span>{aEffacer.libelle}<span className="sous">{estVerse(aEffacer) ? `versé le ${jourDit(aEffacer.verseLe)}` : 'prévu, non versé'}</span></span>
              <b>{dit(aEffacer.montantXof)}</b>
            </div>
            <p className="eng-legende">
              {aEffacer.expenseId
                ? 'Sa dépense sera effacée avec lui, et la caisse retrouvera ce montant. Si la décharge a été signée, elle part aussi : la trace de la base, elle, garde tout.'
                : 'Il n’était pas encore versé : rien ne bouge dans les caisses.'}
            </p>
            <div className="eng-actions">
              <Button variant="ghost" onClick={() => setAEffacer(null)}>Garder</Button>
              <Button variant="copper" onClick={effaceLeVersement}>Effacer</Button>
            </div>
          </div>
        </Modal>
      )}

      {abandon && (
        <Modal title="Abandonner ce dossier." onClose={() => setAbandon(false)} width={480}>
          <div className="eng-formulaire">
            <p className="eng-legende">
              Le dossier se ferme sans se solder : ses devis et ses versements restent, et il se rouvre d’un geste.
              {l.verseXof > 0 ? ` ${dit(l.verseXof)} ont déjà été versés : gardez-en les décharges.` : ''}
            </p>
            <div className="eng-actions">
              <Button variant="ghost" onClick={() => setAbandon(false)}>Garder ouvert</Button>
              <Button variant="copper" onClick={() => { patch((x) => ({ ...x, abandonneLe: aujourdhui })); setAbandon(false); }}>Abandonner</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ══ LA DÉCHARGE ═════════════════════════════════════════════════════════

   DEUX FAÇONS DE LA TENIR (décision du 15 septembre) : il signe au doigt,
   devant vous, au moment où il reçoit l'argent ; ou il emporte la décharge
   imprimée, la rapporte signée au stylo, et on la photographie. C'est souvent
   la seconde qui arrive sur un chantier. */

function ModaleDeLaDecharge({ lecture, versement, rang, onClose, onDeposeLIdentite, depotEnCours }: {
  lecture: LectureDuDossier;
  versement: Versement;
  rang: number;
  onClose: () => void;
  /** Déposer sa pièce sans quitter la décharge : c'est là qu'on s'aperçoit
      qu'elle manque. */
  onDeposeLIdentite: (f: File) => Promise<void>;
  depotEnCours: boolean;
}) {
  const e = lecture.engagement;
  const { branch, currency } = useBranch();
  const me = useStaff();
  const monNom = me?.name?.trim() || undefined;
  const [, setVersements] = useVersementsEngagement();
  const base = devisDeBase(lecture.devis);
  const aujourdhui = todayISO();
  const posee = !dechargeInvalide(versement.decharge) ? versement.decharge : undefined;
  const [mode, setMode] = useState<Decharge['mode']>('ecran');
  const [signePar, setSignePar] = useState(e.prestataire);
  const [trace, setTrace] = useState('');
  const [occupe, setOccupe] = useState(false);
  const estDirection = useEstDirection();

  /* ── SA PIÈCE, CHARGÉE UNE FOIS À L'OUVERTURE ─────────────────────────
     La même image sert l'aperçu et le PDF : ce qu'on voit à l'écran est ce
     qui part sur le papier. Seule la direction la charge ; la base refuserait
     de toute façon le lien aux autres. */
  const cheminDeLaPiece = e.identite?.chemin;
  const [piece, setPiece] = useState<{ donnees: string; ratio: number } | null>(null);
  const [lecturePiece, setLecturePiece] = useState<'attente' | 'prete' | 'illisible'>('attente');
  useEffect(() => {
    setPiece(null);
    setLecturePiece('attente');
    if (!estDirection || !cheminDeLaPiece) return;
    let vivant = true;
    void imageDuCoffre(cheminDeLaPiece).then((img) => {
      if (!vivant) return;
      setPiece(img);
      setLecturePiece(img ? 'prete' : 'illisible');
    });
    return () => { vivant = false; };
  }, [cheminDeLaPiece, estDirection]);

  const refusDeLaPiece = pourquoiLaDechargeNePeutPasSeFaire({ identite: e.identite, estDirection });
  const bloque = refusDeLaPiece
    ?? (lecturePiece === 'attente' ? 'Sa pièce d’identité se charge.'
      : lecturePiece === 'illisible' ? 'Sa pièce d’identité ne se lit pas comme une photo : déposez-la en JPEG ou en PNG.'
        : null);

  const signataire = posee?.mode === 'ecran' ? posee.signature.signePar : (signePar.trim() || e.prestataire);
  const texte = texteDeLaDecharge({
    prestataire: signataire,
    metier: e.metier,
    maison: maisonNom(),
    montantXof: versement.montantXof,
    libelle: versement.libelle,
    objet: e.objet,
    devisNumero: base?.numeroPrestataire,
    devisDate: base?.recuLe,
    /* « SEPT CENTS EUROS », pas « francs CFA » : la décharge dit la monnaie
       du dossier, celle qu'il a reçue. */
    devise: lecture.devise,
  });

  /** LE PAPIER. Signé, c'est son exemplaire ; sans signature, c'est la
      décharge qu'il emporte et rapporte signée. Le même texte dans les deux
      cas, parce que c'est le même engagement. */
  const imprime = async (signature: string, qui: string, jour: string) => {
    /* TOUJOURS AVEC SA PIÈCE : une décharge qui sortirait sans elle serait
       exactement celle qu'on a décidé de ne plus faire. */
    if (bloque || !piece) { toast(bloque ?? 'Sa pièce d’identité manque.'); return; }
    try {
      await contratPdf({
        houseName: maisonNom(), ville: branch.city, villeDuSiege: maisonVille(),
        titre: 'Décharge',
        sousTitre: `${e.numero} · versement ${rang}`,
        qualiteSignataire: 'Reçu la somme ci-dessus, signature :',
        entete: [
          texte,
          '',
          `Versé le ${jourLongDit(versement.verseLe)}${versement.method ? `, ${versement.method}` : ''}${versement.cashbox ? `, caisse ${versement.cashbox}` : ''}.`,
          ...(versement.versePar ? [`Remis par ${versement.versePar}.`] : []),
        ],
        articles: [],
        signataire: qui,
        jourLisible: jourLongDit(jour),
        signature,
        pied: `Décharge · ${e.numero} · ${versement.libelle}`,
        filename: `decharge-${e.numero.toLowerCase()}-${rang}.pdf`,
        piece: { legende: 'Pièce d’identité du prestataire', donnees: piece.donnees, ratio: piece.ratio },
      });
    } catch {
      toast('Le PDF n’a pas pu être produit.');
    }
  };

  const signeALEcran = async () => {
    /* LA DÉCHARGE NE S'ENREGISTRE PAS SANS SA PIÈCE : elle serait posée, et
       figée par la base, sans le papier qui la montre. */
    if (bloque) { toast(bloque); return; }
    if (!signePar.trim()) { toast('Écrivez le nom de qui signe.'); return; }
    if (trace.length < 64) { toast('Faites-le signer dans le cadre.'); return; }
    const d: Decharge = {
      mode: 'ecran',
      signature: { at: aujourdhui, signePar: signePar.trim(), signature: trace, version: VERSION_DECHARGE },
    };
    const pourquoi = dechargeInvalide(d);
    if (pourquoi) { toast(pourquoi); return; }
    setVersements((prev) => prev.map((x) => (x.id === versement.id ? { ...x, decharge: d } : x)));
    await imprime(trace, signePar.trim(), aujourdhui);
    toast('Décharge signée. Remettez-lui son exemplaire.');
    onClose();
  };

  const rapporteLaPhoto = async (f: File) => {
    setOccupe(true);
    const photo = await deposeDansLeCoffre(branch.id, e.id, 'decharge', f);
    setOccupe(false);
    if (!photo) { toast('La photo n’a pas pu être déposée.'); return; }
    const d: Decharge = { mode: 'papier', photo, recueLe: aujourdhui, recuePar: monNom };
    setVersements((prev) => prev.map((x) => (x.id === versement.id ? { ...x, decharge: d } : x)));
    toast('Décharge rangée. Le versement est prouvé.');
    onClose();
  };

  return (
    <Modal title={posee ? 'La décharge.' : 'Faire la décharge.'} onClose={onClose} width={620}>
      <div className="eng-formulaire">
        <div className="eng-decharge">
          <div className="eng-decharge__titre">Décharge · {e.numero} · versement {rang}</div>
          <p>{texte}</p>
          <div className="eng-decharge__piece">
            <span className="eng-decharge__legende">Pièce d’identité du prestataire</span>
            {piece
              ? <img src={piece.donnees} alt="Pièce d’identité du prestataire" />
              : (
                <span className="eng-decharge__trace">
                  {!e.identite ? 'pièce non déposée'
                    : !estDirection ? 'réservée à la direction'
                      : lecturePiece === 'illisible' ? 'photo illisible' : 'chargement'}
                </span>
              )}
          </div>
          <div className="eng-decharge__pied">
            <span>
              Fait à {branch.city || maisonVille()}, le {jourLongDit(posee?.mode === 'ecran' ? posee.signature.at : versement.verseLe)}
              {versement.versePar && <><br />Remis par {versement.versePar}</>}
            </span>
            {posee?.mode === 'ecran'
              ? <img className="eng-decharge__signature" src={posee.signature.signature} alt={`Signature de ${posee.signature.signePar}`} />
              : <span className="eng-decharge__trace">{posee?.mode === 'papier' ? 'signée sur papier' : 'sa signature'}</span>}
          </div>
        </div>

        {posee?.mode === 'ecran' && (
          <>
            <p className="eng-legende">Signée à l’écran le {jourLongDit(posee.signature.at)} par {posee.signature.signePar}. Elle ne se réécrit plus.</p>
            <div className="eng-actions">
              <Button variant="ghost" onClick={onClose}>Fermer</Button>
              <Button variant="copper" disabled={!!bloque} title={bloque ?? undefined} onClick={() => void imprime(posee.signature.signature, posee.signature.signePar, posee.signature.at)}>Son exemplaire en PDF</Button>
            </div>
          </>
        )}

        {posee?.mode === 'papier' && (
          <>
            <p className="eng-legende">Rapportée signée le {jourLongDit(posee.recueLe)}{posee.recuePar ? `, rangée par ${posee.recuePar}` : ''}. Elle ne se réécrit plus.</p>
            <div className="eng-actions">
              <Button variant="ghost" onClick={onClose}>Fermer</Button>
              <Button variant="copper" onClick={() => void ouvreLaPiece(posee.photo.chemin)}>Voir la photo</Button>
            </div>
          </>
        )}

        {!posee && refusDeLaPiece && (
          <div className="eng-mur">
            <b>{refusDeLaPiece}</b>
            {!estDirection && ' Vous pouvez en revanche ranger la photo d’une décharge revenue signée : elle porte déjà la pièce, imprimée.'}
            {estDirection && !e.identite && (
              <span className="eng-gestes" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                <ChoisirUnePiece
                  variant="copper"
                  libelle={depotEnCours ? 'Dépôt…' : 'Déposer sa pièce'}
                  accept={FORMATS_DE_L_IDENTITE}
                  disabled={depotEnCours}
                  onFichier={(f) => void onDeposeLIdentite(f)}
                />
              </span>
            )}
          </div>
        )}
        {!posee && (
          <>
            <Segs
              options={[
                { value: 'ecran', label: 'Il signe à l’écran' },
                { value: 'papier', label: 'Il la rapporte signée' },
              ]}
              value={mode}
              onChange={setMode}
            />

            {mode === 'ecran' ? (
              <>
                <Field label="Qui signe">
                  <Input value={signePar} onChange={(ev) => setSignePar(ev.target.value)} />
                </Field>
                <ToileDeSignature onChange={setTrace} invite="Passez-lui l’écran, il signe au doigt." />
                <div className="eng-actions">
                  <Button variant="ghost" onClick={onClose}>Plus tard</Button>
                  <Button variant="copper" disabled={!!bloque} title={bloque ?? undefined} onClick={() => void signeALEcran()}>Enregistrer la décharge</Button>
                </div>
              </>
            ) : (
              <>
                <p className="eng-legende">
                  Imprimez-la, il l’emporte. Quand elle revient signée, photographiez-la ici. D’ici là, le versement
                  reste en attente de décharge, et cela se voit.
                </p>
                <div className="eng-actions">
                  <Button variant="ghost" disabled={!!bloque} title={bloque ?? undefined} onClick={() => void imprime('', e.prestataire, versement.verseLe ?? aujourdhui)}>Imprimer la décharge</Button>
                  <ChoisirUnePiece variant="copper" libelle={occupe ? 'Dépôt…' : 'Elle est revenue : la photographier'} disabled={occupe} onFichier={(f) => void rapporteLaPhoto(f)} />
                </div>
              </>
            )}
            <p className="eng-legende">{sommeDite(versement.montantXof, lecture.devise, currency)} versés le {jourLongDit(versement.verseLe)}.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
