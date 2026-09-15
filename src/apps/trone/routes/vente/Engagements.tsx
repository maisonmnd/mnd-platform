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
import { fmtMoney } from '../../../../shared/currency';
import { uid, useStore } from '../../../../shared/store';
import { useStaff } from '../../../../shared/auth';
import { maisonNom, maisonVille } from '../../../../shared/identite';
import { contratPdf } from '../../../../shared/pdf';
import {
  useCashboxes, useExpenses, usePaymentMethods, moyensAOffrir, expenseCategoriesStore,
} from '../../../../shared/finance';
import { useFournisseurs } from '../../../../shared/stock';
import {
  useEngagements, useDevisRecus, useVersementsEngagement, litLesDossiers, bilanDesEngagements,
  numeroEngagementSuivant, jourLongDit, decaleLeJour, devisDeBase, estVerse,
  pourquoiOnNeRetientPas, avertitAvantDeRetenir, retenirLeDevis,
  pourquoiOnNeVersePas, avertitAvantDeVerser, dechargeInvalide, texteDeLaDecharge,
  effacementDeLIdentite, identiteAEffacer, depenseDuVersement, CATEGORIE_PROPOSEE, ETAT_DIT,
  devisExpire, devisExpireBientot,
  totalDeLaLigne, totalDesLignes, pourquoiLaLigneNeVautPas, ligneDeLaSaisie, lignesDeLaSaisie,
  quantiteDite, LIGNE_VIDE, type LigneSaisie,
  type Engagement, type DevisRecu, type Versement, type Decharge, type LectureDuDossier,
  type PieceDuDossier, type EtatDossier,
} from '../../../../shared/engagements';
import { deposeDansLeCoffre, adresseDuCoffre, retireDuCoffre } from '../../../../shared/engagements-coffre';
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

const enFrancs = (s: string): number => parseInt(s.replace(/[^0-9]/g, '') || '0', 10);

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
function ChoisirUnePiece({ libelle, onFichier, disabled, variant = 'ghost' }: {
  libelle: string;
  onFichier: (f: File) => void;
  disabled?: boolean;
  variant?: 'ghost' | 'copper' | 'indigo';
}) {
  const champ = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant={variant} size="sm" disabled={disabled} onClick={() => champ.current?.click()}>{libelle}</Button>
      <input
        ref={champ}
        type="file"
        accept="image/*,application/pdf"
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
  objet: string;
  note: string;
};

export default function Engagements() {
  const { branch, currency } = useBranch();
  const me = useStaff();
  const monNom = me?.name?.trim() || undefined;
  const estDirection = useEstDirection();
  const [engagements, setEngagements] = useEngagements();
  const [devis] = useDevisRecus();
  const [versements] = useVersementsEngagement();
  const [fournisseurs] = useFournisseurs();
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
    ? { id: e.id, fournisseurId: e.fournisseurId ?? '', prestataire: e.prestataire, metier: e.metier ?? '', objet: e.objet, note: e.note ?? '' }
    : { fournisseurId: '', prestataire: '', metier: '', objet: '', note: '' });

  const enregistreLeDossier = () => {
    if (!form) return;
    const prestataire = form.prestataire.trim();
    const objet = form.objet.trim();
    if (!prestataire) { toast('Nommez le prestataire, tel qu’il signera la décharge.'); return; }
    if (!objet) { toast('Dites ce que la Maison commande : l’agencement du salon, l’enseigne.'); return; }
    const champs = {
      prestataire, objet,
      fournisseurId: form.fournisseurId || undefined,
      metier: form.metier.trim() || undefined,
      note: form.note.trim() || undefined,
    };
    if (form.id) {
      setEngagements((prev) => prev.map((x) => (x.id === form.id ? { ...x, ...champs } : x)));
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
                    setForm({ ...form, fournisseurId: ev.target.value, prestataire: f ? f.nom : form.prestataire });
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
            <Field label="Ce que la Maison commande">
              <Input value={form.objet} placeholder="Agencement du salon" onChange={(ev) => setForm({ ...form, objet: ev.target.value })} />
            </Field>
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
          <span className="v">{fmtMoney(bilan.resteXof, currency)}</span>
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
                <span className="eng-carte__sous">{e.prestataire}{e.metier ? ` · ${e.metier}` : ''}</span>
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
                {l.etat === 'en-cours' && <><b>{fmtMoney(l.resteXof, currency)}</b><span>reste à payer</span></>}
                {l.etat === 'devis' && <><b>{pluriel(l.devis.length, 'devis', 'devis')}</b><span>à comparer</span></>}
                {l.etat === 'solde' && <><b>{fmtMoney(l.verseXof, currency)}</b><span>versés</span></>}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ══ LE DOSSIER ══════════════════════════════════════════════════════════ */

type FormDevis = {
  numeroPrestataire: string;
  recuLe: string;
  avecValidite: boolean;
  valableJusquau: string;
  /** Le montant tapé à la main — ne sert que s'il n'y a aucune ligne. */
  montant: string;
  lignes: LigneSaisie[];
  avenant: boolean;
  fichier: File | null;
};

type FormVersement = {
  id?: string;
  mode: 'prevoir' | 'verser';
  libelle: string;
  montant: string;
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
  const [, setExpenses] = useExpenses();
  const [cashboxes] = useCashboxes();
  const [moyensPoses] = usePaymentMethods();
  const [categories] = useStore(expenseCategoriesStore);
  const aujourdhui = todayISO();
  const caisses = cashboxes.filter((c) => c.branchId === branch.id && (!c.currency || c.currency === currency));
  const base = devisDeBase(l.devis);
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

  const patch = (fn: (x: Engagement) => Engagement) =>
    setEngagements((prev) => prev.map((x) => (x.id === e.id ? fn(x) : x)));

  /* ── LES DEVIS ─────────────────────────────────────────────────────── */
  const ouvreLeDevis = () => setFormDevis({
    numeroPrestataire: '', recuLe: aujourdhui, avecValidite: true, valableJusquau: decaleLeJour(aujourdhui, 30),
    montant: '', lignes: [LIGNE_VIDE], avenant: !!base, fichier: null,
  });

  const enregistreLeDevis = async () => {
    if (!formDevis) return;
    const f = formDevis;
    const lignes = lignesDeLaSaisie(f.lignes);
    for (const [i, x] of lignes.entries()) {
      const pourquoi = pourquoiLaLigneNeVautPas(x);
      if (pourquoi) { toast(`Ligne ${i + 1} : ${pourquoi}`); return; }
    }
    /* LES LIGNES FONT LE MONTANT. Sans ligne, le montant tapé vaut : un devis
       reçu sans détail existe, et le refuser le laisserait dans le téléphone. */
    const montant = lignes.length > 0 ? totalDesLignes(lignes) : enFrancs(f.montant);
    if (montant <= 0) {
      toast(lignes.length > 0 ? 'Le total des lignes doit dépasser zéro.' : 'Écrivez le montant du devis, ou détaillez ses lignes.');
      return;
    }
    if (f.avecValidite && f.valableJusquau < f.recuLe) { toast('Un devis ne peut pas expirer avant d’avoir été reçu.'); return; }
    setOccupe(true);
    let fichier: DevisRecu['fichier'];
    if (f.fichier) {
      const p = await deposeDansLeCoffre(branch.id, e.id, 'devis', f.fichier);
      if (!p) {
        setOccupe(false);
        toast('Le fichier du devis n’a pas pu être déposé. Réessayez, ou retirez-le pour enregistrer sans.');
        return;
      }
      fichier = p;
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
    montant: v ? String(v.montantXof) : '',
    avecEcheance: !!v?.prevuLe || !v,
    prevuLe: v?.prevuLe ?? decaleLeJour(aujourdhui, 30),
    jour: aujourdhui,
    cashbox: v?.cashbox ?? caisses[0]?.name ?? '',
    method: v?.method ?? 'Espèces',
    category: categorieParDefaut,
    subcategory: '',
  });

  const enregistreLeVersement = () => {
    if (!formVers) return;
    const f = formVers;
    const montant = enFrancs(f.montant);
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

    const pourquoi = pourquoiOnNeVersePas({ montantXof: montant, estDirection, retenuXof: l.retenuXof, cashbox: f.cashbox });
    if (pourquoi) { toast(pourquoi); return; }
    const verse: Versement = {
      ...socle, libelle, montantXof: montant,
      verseLe: f.jour, versePar: monNom, method: f.method, cashbox: f.cashbox,
    };
    /* LA DÉPENSE ET LE VERSEMENT S'ÉCRIVENT D'UN SEUL GESTE. Demander deux
       saisies garantit qu'une manquera un jour, et la caisse ne tomberait
       plus juste. */
    const depense = depenseDuVersement(e, verse, { category: f.category, subcategory: f.subcategory });
    const v: Versement = { ...verse, expenseId: depense.id };
    setExpenses((prev) => [depense, ...prev]);
    setVersements((prev) => (existant ? prev.map((x) => (x.id === v.id ? v : x)) : [v, ...prev]));
    setFormVers(null);
    setDechargeDe(v.id);
    toast(`Versé. ${fmtMoney(montant, currency)} sortent de « ${f.cashbox} », la dépense est au journal.`);
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
  const lignesSaisies = formDevis ? lignesDeLaSaisie(formDevis.lignes) : [];
  const avecLignes = lignesSaisies.length > 0;
  const totalSaisi = totalDesLignes(lignesSaisies);
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
          <span>{e.prestataire}{e.metier ? ` · ${e.metier}` : ''} · {ETAT_DIT[l.etat]}</span>
        </div>
        <div className="eng-ecran__corps">
          <div className="eng-kpi">
            <div>
              <span className="l">Retenu au devis</span>
              <span className="v">{l.retenuXof > 0 ? fmtMoney(l.retenuXof, currency) : 'Rien encore'}</span>
              <span className="c">
                {base ? `devis du ${jourDit(base.recuLe)}` : 'aucun devis retenu'}
                {l.depassementXof > 0 ? ` · dont ${fmtMoney(l.depassementXof, currency)} d’avenant` : ''}
              </span>
            </div>
            <div>
              <span className="l">Déjà versé</span>
              <span className="v">{fmtMoney(l.verseXof, currency)}</span>
              <span className="c">{pluriel(nVerses, 'versement')}, {pluriel(nDecharges, 'décharge')}</span>
            </div>
            <div className="eng-kpi__reste">
              <span className="l">Reste à payer</span>
              <span className="v">{fmtMoney(l.resteXof, currency)}</span>
              <span className="c">{prochain ? `prochain : ${prochain.libelle.charAt(0).toLowerCase()}${prochain.libelle.slice(1)}` : l.etat === 'solde' ? 'dossier soldé' : 'aucun versement prévu'}</span>
            </div>
          </div>
          {l.tropVerseXof > 0 && (
            <div className="eng-mur">
              <b>{fmtMoney(l.tropVerseXof, currency)} versés au-delà du devis retenu.</b> À récupérer, ou à déduire
              d’un prochain avenant : taire ce trop-versé ferait perdre cet argent.
            </div>
          )}
          {l.depassementXof > 0 && (
            <p className="eng-legende">
              <b>Le devis de base a été dépassé de {fmtMoney(l.depassementXof, currency)}.</b> Un dépassement
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
          {!ferme && <Button variant="ghost" size="sm" onClick={ouvreLeDevis}>+ Devis reçu</Button>}
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
                    <tr className={`${d.etat === 'retenu' ? 'is-retenu' : ''}${d.lignes?.length ? ' a-des-lignes' : ''}`}>
                      <td>
                        {d.numeroPrestataire || 'sans numéro'}
                        {(d.description || d.avenant) && (
                          <span className="sous">{d.avenant ? 'avenant' : ''}{d.avenant && d.description ? ' · ' : ''}{d.description}</span>
                        )}
                      </td>
                      <td>{jourDit(d.recuLe)}</td>
                      <td>
                        {!d.valableJusquau ? <span className="eng-doux">sans date</span>
                          : expire ? <b className="eng-brique">expiré le {jourDit(d.valableJusquau)}</b>
                            : bientot ? <b className="eng-ambre">{jourDit(d.valableJusquau)}, bientôt</b>
                              : jourDit(d.valableJusquau)}
                      </td>
                      <td className="num">{fmtMoney(d.montantXof, currency)}</td>
                      <td>
                        {d.etat === 'retenu' && <Pastille ton="ok">retenu</Pastille>}
                        {d.etat === 'recu' && <Pastille ton="att">à trancher</Pastille>}
                        {d.etat === 'ecarte' && <Pastille ton="non">écarté</Pastille>}
                        {d.etat === 'remplace' && <Pastille ton="non">remplacé</Pastille>}
                      </td>
                      <td className="eng-gestes">
                        {d.fichier && <button type="button" className="eng-lien" onClick={() => void ouvreLaPiece(d.fichier!.chemin)}>Le fichier</button>}
                        {estDirection && !ferme && d.etat !== 'retenu' && (
                          <Button variant={d.etat === 'recu' ? 'copper' : 'ghost'} size="sm" onClick={() => setARetenir(d)}>Retenir</Button>
                        )}
                      </td>
                    </tr>
                    {/* CE QU'IL COMPREND, sous sa ligne : comparer deux devis,
                        c'est comparer leurs lignes, pas deux totaux. */}
                    {d.lignes && d.lignes.length > 0 && (
                      <tr className={`eng-detail${d.etat === 'retenu' ? ' is-retenu' : ''}`}>
                        <td colSpan={6}>
                          <table className="eng-lignes">
                            <tbody>
                              {d.lignes.map((x, i) => (
                                <tr key={i}>
                                  <td>{x.description}</td>
                                  <td className="num">{quantiteDite(x.quantite)} ×</td>
                                  <td className="num">{fmtMoney(x.prixUnitaireXof, currency)}</td>
                                  <td className="num"><b>{fmtMoney(totalDeLaLigne(x), currency)}</b></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
                      </td>
                      <td>{verse ? [v.method, v.cashbox ? `caisse ${v.cashbox}` : ''].filter(Boolean).join(' · ') : <span className="eng-doux">pas encore versé</span>}</td>
                      <td className="num">{fmtMoney(v.montantXof, currency)}</td>
                      <td>
                        {!verse && <Pastille ton="att">prévu, non versé</Pastille>}
                        {verse && !prouve && <Pastille ton="non">en attente de décharge</Pastille>}
                        {prouve && v.decharge?.mode === 'ecran' && <Pastille ton="ok">signée à l’écran</Pastille>}
                        {prouve && v.decharge?.mode === 'papier' && <Pastille ton="ok">rapportée signée</Pastille>}
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
              <ChoisirUnePiece libelle="Remplacer" disabled={occupe} onFichier={(f) => void deposeLIdentite(f)} />
              <button type="button" className="eng-lien eng-lien--doux" disabled={occupe} onClick={() => void retireLIdentite()}>Effacer</button>
            </span>
          </div>
        ) : (
          <div className="eng-piece">
            <span className="eng-doux">Aucune pièce d’identité. Une photo lisible des deux faces, ou un PDF.</span>
            <ChoisirUnePiece libelle="Déposer sa pièce" disabled={occupe} onFichier={(f) => void deposeLIdentite(f)} />
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
        <Modal title={formDevis.avenant && base ? 'Un avenant reçu.' : 'Un devis reçu.'} onClose={() => setFormDevis(null)} width={560}>
          <div className="eng-formulaire">
            <div className="eng-deux">
              <Field label="Son numéro à lui">
                <Input value={formDevis.numeroPrestataire} autoFocus placeholder="DV-0231" onChange={(ev) => setFormDevis({ ...formDevis, numeroPrestataire: ev.target.value })} />
              </Field>
              <Field label={avecLignes ? 'Le montant · calculé' : 'Le montant'}>
                {avecLignes
                  ? <Input value={fmtMoney(totalSaisi, currency)} disabled title="Le total des lignes, calculé par le Trône" />
                  : <Input inputMode="numeric" value={formDevis.montant} placeholder="ou détaillez les lignes" onChange={(ev) => setFormDevis({ ...formDevis, montant: ev.target.value })} />}
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
            <div className="eng-lignes-saisie">
              <span className="mnd-field__label">Ce qu’il comprend</span>
              <div className="eng-ligne eng-ligne--tete" aria-hidden="true">
                <span>Description</span><span>Quantité</span><span>Prix unitaire</span><span>Total</span><span />
              </div>
              {formDevis.lignes.map((x, i) => {
                const lue = ligneDeLaSaisie(x);
                const remplie = !!(x.description.trim() || x.prix.trim());
                const illisible = remplie && (Number.isNaN(lue.quantite) || Number.isNaN(lue.prixUnitaireXof));
                return (
                  <div key={i} className="eng-ligne">
                    <Input aria-label={`Ligne ${i + 1}, description`} value={x.description} placeholder="Madrier" onChange={(ev) => changeLaLigne(i, 'description', ev.target.value)} />
                    <Input aria-label={`Ligne ${i + 1}, quantité`} inputMode="decimal" value={x.quantite} onChange={(ev) => changeLaLigne(i, 'quantite', ev.target.value)} />
                    <Input aria-label={`Ligne ${i + 1}, prix unitaire`} inputMode="numeric" value={x.prix} placeholder="25 000" onChange={(ev) => changeLaLigne(i, 'prix', ev.target.value)} />
                    <span className={`eng-ligne__total${illisible ? ' eng-brique' : ''}`}>
                      {illisible ? 'à corriger' : remplie ? fmtMoney(totalDeLaLigne(lue), currency) : ''}
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
                <span>Total du devis<b>{fmtMoney(avecLignes ? totalSaisi : enFrancs(formDevis.montant), currency)}</b></span>
              </div>
            </div>
            {base && (
              <label className="eng-coche">
                <input type="checkbox" checked={formDevis.avenant} onChange={(ev) => setFormDevis({ ...formDevis, avenant: ev.target.checked })} />
                C’est un avenant : il s’ajoute au devis retenu, il ne le remplace pas
              </label>
            )}
            <div className="eng-piece">
              <span className={formDevis.fichier ? '' : 'eng-doux'}>{formDevis.fichier ? formDevis.fichier.name : 'Le fichier qu’il a envoyé, PDF ou photo.'}</span>
              <span className="eng-gestes">
                <ChoisirUnePiece libelle={formDevis.fichier ? 'Changer' : 'Joindre'} onFichier={(f) => setFormDevis({ ...formDevis, fichier: f })} />
                {formDevis.fichier && <button type="button" className="eng-lien eng-lien--doux" onClick={() => setFormDevis({ ...formDevis, fichier: null })}>Retirer</button>}
              </span>
            </div>
            <div className="eng-actions">
              <Button variant="ghost" onClick={() => setFormDevis(null)}>Annuler</Button>
              <Button variant="copper" disabled={occupe} onClick={() => void enregistreLeDevis()}>{occupe ? 'Dépôt…' : 'Ranger le devis'}</Button>
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
                <b>{fmtMoney(aRetenir.montantXof, currency)}</b>
              </div>
              {avert && <div className="eng-mur">{avert}</div>}
              <p className="eng-legende">
                {aRetenir.avenant
                  ? `Le retenu passera à ${fmtMoney(l.retenuXof + aRetenir.montantXof, currency)}. Les autres devis ne bougent pas.`
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
        const montant = enFrancs(formVers.montant);
        const avert = formVers.mode === 'verser'
          ? avertitAvantDeVerser({ montantXof: montant, retenuXof: l.retenuXof, dejaVerseXof: l.verseXof })
          : null;
        const sous = categories.find((c) => c.name === formVers.category)?.subs ?? [];
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
                <Field label="Le montant">
                  <Input inputMode="numeric" value={formVers.montant} onChange={(ev) => setFormVers({ ...formVers, montant: ev.target.value })} />
                </Field>
              </div>
              {l.retenuXof > 0 && (
                <p className="eng-legende">
                  Retenu {fmtMoney(l.retenuXof, currency)}, déjà versé {fmtMoney(l.verseXof, currency)}, reste {fmtMoney(l.resteXof, currency)}.
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
                      <Select value={formVers.cashbox} onChange={(ev) => setFormVers({ ...formVers, cashbox: ev.target.value })}>
                        {caisses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Le jour">
                      <ChampDeDate compact sens="arriere" value={formVers.jour} onChange={(iso) => setFormVers({ ...formVers, jour: iso })} />
                    </Field>
                  </div>
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
        />
      )}

      {aEffacer && (
        <Modal title="Effacer ce versement." onClose={() => setAEffacer(null)} width={480}>
          <div className="eng-formulaire">
            <div className="eng-recap">
              <span>{aEffacer.libelle}<span className="sous">{estVerse(aEffacer) ? `versé le ${jourDit(aEffacer.verseLe)}` : 'prévu, non versé'}</span></span>
              <b>{fmtMoney(aEffacer.montantXof, currency)}</b>
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
              {l.verseXof > 0 ? ` ${fmtMoney(l.verseXof, currency)} ont déjà été versés : gardez-en les décharges.` : ''}
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

function ModaleDeLaDecharge({ lecture, versement, rang, onClose }: {
  lecture: LectureDuDossier;
  versement: Versement;
  rang: number;
  onClose: () => void;
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
  });

  /** LE PAPIER. Signé, c'est son exemplaire ; sans signature, c'est la
      décharge qu'il emporte et rapporte signée. Le même texte dans les deux
      cas, parce que c'est le même engagement. */
  const imprime = async (signature: string, qui: string, jour: string) => {
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
      });
    } catch {
      toast('Le PDF n’a pas pu être produit.');
    }
  };

  const signeALEcran = async () => {
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
              <Button variant="copper" onClick={() => void imprime(posee.signature.signature, posee.signature.signePar, posee.signature.at)}>Son exemplaire en PDF</Button>
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
                  <Button variant="copper" onClick={() => void signeALEcran()}>Enregistrer la décharge</Button>
                </div>
              </>
            ) : (
              <>
                <p className="eng-legende">
                  Imprimez-la, il l’emporte. Quand elle revient signée, photographiez-la ici. D’ici là, le versement
                  reste en attente de décharge, et cela se voit.
                </p>
                <div className="eng-actions">
                  <Button variant="ghost" onClick={() => void imprime('', e.prestataire, versement.verseLe ?? aujourdhui)}>Imprimer la décharge</Button>
                  <ChoisirUnePiece variant="copper" libelle={occupe ? 'Dépôt…' : 'Elle est revenue : la photographier'} disabled={occupe} onFichier={(f) => void rapporteLaPhoto(f)} />
                </div>
              </>
            )}
            <p className="eng-legende">{fmtMoney(versement.montantXof, currency)} versés le {jourLongDit(versement.verseLe)}.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
