import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Card, Eyebrow, Field, Input, Select, Textarea, toast } from '../../../../ds/components';
import { Toggle } from '../equipe/ui';
import { autoConfigStore, type AutoConfig } from '../equipe/data';
import { useBranch } from '../../../../shared/branches';
import { currencyByCode } from '../../../../shared/geo';
import { useSettings, type DayHours } from '../../../../shared/settings';
import { useCrownStyles, useSegments, renameSegment, clientsStore } from '../../../../shared/clients';
import { useServices, servicesStore } from '../../../../shared/catalog';
import { usePaymentMethods, paymentMethodsStore, invoicesStore } from '../../../../shared/finance';
import { appointmentsStore, wipeAppointments } from '../../../../shared/agenda';
import { createStore, useStore } from '../../../../shared/store';
import { downloadBackup, restoreBackup, LAST_BACKUP_KEY, type RestoreReport } from '../../backup';
import { resetAllPaidInvoices } from '../clients/actions';
import { factoryResetServer, activateBlankAndReload, replaceHouseFromFile } from '../../houseReset';
import '../equipe/equipe.css'; // styles des composants partagés (Toggle, tre-*)
import { ERP_DOMAINS, useStaff } from '../equipe/data';
import { useExceptionsHoraires, usePointageConfig, assurerCodeDuJour, type HoraireException } from '../equipe/payroll';
import { useBlocages, type Blocage } from '../../../../shared/blocages';
import { uid } from '../../../../shared/store';
import './systeme.css';

/* Système · Paramètres — jours & heures d'ouverture, accès ERP du personnel par
   rubrique de domaine (codes d'accès envoyables), et les liens d'automatisation. */

type FieldRow = { l: string; v: string };
type ToggleRow = { k: string; l: string; sub: string };

/* ---------- Identité de la Maison & rituel par défaut — champs éditables ----------
   Persistés en localStorage (clé `mnd_house_identity`) via le magasin partagé.
   Ces réglages ne trouvaient pas de foyer dans `settings` (bascules) ni dans
   `houseSettingsStore` (Record<string, boolean>) : on leur donne un magasin dédié. */
type HouseIdentity = {
  nom: string;
  raison: string;
  fuseau: string;
  dureeRituel: string;
  fenetreAnnulation: string;
};

const DEFAULT_IDENTITY: HouseIdentity = {
  nom: 'Maison MND',
  raison: 'MND SARL · RCCM COT-B-2021',
  fuseau: 'Cotonou · GMT+1',
  dureeRituel: '2 h 30',
  fenetreAnnulation: '48 h avant',
};

const houseIdentityStore = createStore<HouseIdentity>('mnd_house_identity', DEFAULT_IDENTITY);
import { bindDocument } from '../../../../shared/sync';
bindDocument(houseIdentityStore, 'mnd_house_identity'); // synchronisé Supabase (multi-appareils)
const useHouseIdentity = () => useStore(houseIdentityStore);

const FUSEAU_OPTIONS = [
  'Cotonou · GMT+1', 'Abidjan · GMT', 'Lomé · GMT', 'Dakar · GMT',
  'Lagos · GMT+1', 'Douala · GMT+1', 'Paris · GMT+2',
];
const DUREE_OPTIONS = [
  '45 min', '1 h', '1 h 30', '2 h', '2 h 30', '3 h', '3 h 30', '4 h', '4 h 30', '5 h', '6 h',
];
const ANNULATION_OPTIONS = ['24 h avant', '48 h avant', '72 h avant', 'Aucune fenêtre'];

const RITUEL_TOGGLES: ToggleRow[] = [
  { k: 'rappel', l: 'Rappels automatiques', sub: 'SMS + WhatsApp · J-1 et H-2' },
];
const NOTIF_TOGGLES: ToggleRow[] = [
  { k: 'notifRdv', l: 'Nouveau rendez-vous', sub: 'au Maître concerné' },
  { k: 'notifStock', l: 'Seuil de réassort atteint', sub: 'à l’Atelier & à l’Accueil' },
  { k: 'notifPaie', l: 'Clôture de paie', sub: 'à la matriarche' },
  { k: 'notifCercle', l: 'Nouvelle introduction du Cercle', sub: 'à toute la Maison' },
];
const ACCES_TOGGLES: ToggleRow[] = [
  { k: 'auth', l: 'Double authentification', sub: 'requise pour les Maîtres' },
  { k: 'sauvegarde', l: 'Sauvegarde quotidienne', sub: 'chiffrée · conservée 90 jours' },
  { k: 'export', l: 'Export souverain autorisé', sub: 'la Maison peut tout emporter' },
];

const JOUR_LABEL: Record<string, string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi',
  ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche',
};

/* ----- Accès ERP · ce que chaque rang ouvre -----

   CE TABLEAU DISAIT AUTRE CHOSE QUE LE SYSTÈME. Il annonçait cinq rangs et
   sept domaines — Praticien·ne, Accueil, Académie — quand l'application en
   porte trois et six ; et il promettait qu'un maître ouvre le Pilotage et la
   Vente, alors qu'il n'atteint que son mois et son calendrier.

   Écrit en dur, il ne commandait rien : c'était une intention, pas une règle.
   Tant que rien n'appliquait les accès, l'écart ne se voyait pas. Depuis que
   la barre les applique, un tableau qui ment est pire qu'un tableau absent. */
const DOMAINS = ERP_DOMAINS;
type Role = { k: string; label: string; desc: string; perms: string[] };
const TOUS = ERP_DOMAINS.map((d) => d.k);
const ROLE_DEFS: Role[] = [
  { k: 'souverain', label: 'Souverain·e', desc: 'Accès total — la Maison entière.', perms: TOUS },
  { k: 'gerant', label: 'Gérant·e', desc: 'Pilote tout sauf l’âme système.', perms: TOUS.filter((k) => k !== 'systeme') },
  {
    k: 'maitre',
    label: 'Maître',
    desc: 'Mon mois et son calendrier, sans les montants. Le reste s’ouvre domaine par domaine, personne par personne, depuis Accès & personnel.',
    perms: [],
  },
];

function FieldRowView({ l, v }: FieldRow) {
  return (
    <div className="sys-row">
      <div className="sys-row__label">{l}</div>
      <span className="sys-row__value">{v}</span>
    </div>
  );
}

/** Ligne de réglage éditable — libellé (+ sous-titre) à gauche, contrôle à droite. */
function EditRow({ l, sub, children }: { l: string; sub?: string; children: ReactNode }) {
  return (
    <div className="sys-row">
      <div>
        <div className="sys-row__label">{l}</div>
        {sub && <div className="sys-row__sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

/* ---------- Sauvegarde de la Maison — exporter tout d'un geste, restaurer sans risque ----------
   Née de l'incident du 24 juil. 2026 (RDV et factures effacés du serveur). L'export
   photographie toutes les clés `mnd_*` ; la restauration n'AJOUTE que ce qui manque. */
function SauvegardeCard() {
  const [clients] = useStore(clientsStore);
  const [appts] = useStore(appointmentsStore);
  const [invoices] = useStore(invoicesStore);
  const [svcs] = useStore(servicesStore);
  const [lastAt, setLastAt] = useState<string | null>(() => localStorage.getItem(LAST_BACKUP_KEY));
  const [report, setReport] = useState<RestoreReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<'add' | 'update' | 'replace'>('add');

  const openPicker = (mode: 'add' | 'update' | 'replace') => {
    modeRef.current = mode;
    fileRef.current?.click();
  };

  const fmtLast = lastAt
    ? new Date(lastAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const staleDays = lastAt ? Math.floor((Date.now() - new Date(lastAt).getTime()) / 86_400_000) : null;
  const stale = staleDays !== null && staleDays >= 7;

  const doExport = () => {
    const { fileName } = downloadBackup();
    setLastAt(localStorage.getItem(LAST_BACKUP_KEY));
    setReport(null);
    toast(`Sauvegarde téléchargée — ${fileName}. Rangez-la en lieu sûr (Drive, clé USB…).`);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // permet de re-choisir le même fichier
    if (!f) return;
    const mode = modeRef.current;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await f.text());
    } catch {
      toast('Fichier illisible — ce n’est pas un JSON valide.');
      return;
    }
    if (mode === 'replace') {
      if (!window.confirm(
        'REMPLACER toute la Maison par ce fichier ?\n\n' +
        'Tout est vidé (serveur + ce poste), puis la Maison est reconstruite À L’IDENTIQUE ' +
        'du fichier — ajouts, mises à jour ET suppressions. Ce que contient la Maison ' +
        'aujourd’hui mais PAS le fichier sera perdu. (Idéal pour appliquer une migration.)',
      )) return;
      try {
        setReport(null);
        toast('Remplacement en cours — vidage puis rechargement…');
        await replaceHouseFromFile(parsed);
      } catch (err) {
        toast(`Remplacement impossible : ${err instanceof Error ? err.message : 'erreur.'}`);
      }
      return;
    }
    try {
      const rep = restoreBackup(parsed, { overwrite: mode === 'update' });
      setReport(rep);
      toast(
        mode === 'update'
          ? `${rep.totalAdded} fiche${rep.totalAdded > 1 ? 's' : ''} appliquée${rep.totalAdded > 1 ? 's' : ''} — les fiches existantes ont été mises à jour.`
          : rep.totalAdded > 0
            ? `${rep.totalAdded} enregistrement${rep.totalAdded > 1 ? 's' : ''} restauré${rep.totalAdded > 1 ? 's' : ''} — rien d'existant n'a été touché.`
            : 'Rien à restaurer — tout ce que contient ce fichier est déjà dans la Maison.',
      );
    } catch (err) {
      setReport(null);
      toast(`Restauration impossible : ${err instanceof Error ? err.message : 'fichier illisible.'}`);
    }
  };

  return (
    <Card className="sys-section" style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="sys-section__title">Sauvegarde de la Maison</div>
          <div className="sys-section__cap" style={{ maxWidth: 640 }}>
            Un geste, un fichier : clientes, rendez-vous, factures, catalogue, finances et réglages —
            toute la Maison dans un JSON à ranger en lieu sûr (Drive, clé USB, e-mail à soi-même).
            Faites-le chaque semaine. « Restaurer » n’ajoute que ce qui manque (sans rien écraser) ;
            « Mettre à jour » remplace en plus les fiches déjà présentes (même identifiant) ; « Remplacer »
            reconstruit toute la Maison À L’IDENTIQUE du fichier — avec suppressions — pour appliquer une migration.
          </div>
        </div>
        <span className="sys-badge-count">
          {clients.length} clientes · {appts.length} RDV · {invoices.length} factures · {svcs.length} prestations
        </span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <Button variant="copper" onClick={doExport}>Exporter toute la Maison (JSON)</Button>
        <Button variant="ghost" onClick={() => openPicker('add')}>Restaurer depuis un fichier…</Button>
        <Button variant="ghost" onClick={() => openPicker('update')}>Mettre à jour depuis un fichier (écrase l’existant)…</Button>
        <Button variant="ghost" onClick={() => openPicker('replace')}>Remplacer toute la Maison par un fichier…</Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => void onFile(e)}
          aria-label="Fichier de sauvegarde à restaurer"
        />
        <span className="sys-row__sub" style={stale ? { color: 'var(--copper-700)' } : undefined}>
          {fmtLast
            ? `Dernière sauvegarde sur ce poste : ${fmtLast}${stale ? ' — pensez à en refaire une.' : '.'}`
            : 'Aucune sauvegarde encore téléchargée sur ce poste.'}
        </span>
      </div>

      {report && (
        <div className="tre-inline-note" style={{ marginTop: 14 }}>
          <span className="mark">✦</span>
          <span>
            {report.totalAdded > 0 ? (
              <>
                Restauré depuis la sauvegarde
                {report.exportedAt ? ` du ${new Date(report.exportedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''} :{' '}
                {report.added.map((a) => `${a.n} ${a.label}`).join(' · ')}. Rien d’existant n’a été modifié.
              </>
            ) : (
              <>Ce fichier ne contient rien qui manque à la Maison — aucune écriture n’a été faite.</>
            )}
          </span>
        </div>
      )}
    </Card>
  );
}

/* ---------- Zone sensible — annuler tous les encaissements (repartir à zéro) ----------
   Supprime les factures PAYÉES de la branche et rembobine leurs rituels (impayés).
   Geste rare, explicite, à deux temps ; sauvegarde recommandée avant. */
function ResetEncaissementsCard() {
  const { branch } = useBranch();
  const [invoices] = useStore(invoicesStore);
  const [armed, setArmed] = useState(false);
  const paidCount = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée').length;

  const doReset = () => {
    const r = resetAllPaidInvoices(branch.id);
    setArmed(false);
    toast(
      r.invoices > 0
        ? `${r.invoices} facture${r.invoices > 1 ? 's' : ''} payée${r.invoices > 1 ? 's' : ''} supprimée${r.invoices > 1 ? 's' : ''} · ${r.appts} rituel${r.appts > 1 ? 's' : ''} remis à impayé${r.avoirsRestored ? ` · ${r.avoirsRestored} avoir${r.avoirsRestored > 1 ? 's' : ''} restauré${r.avoirsRestored > 1 ? 's' : ''}` : ''}. Ré-encaissez-les un à un.`
        : 'Aucune facture payée à annuler.',
    );
  };

  return (
    <Card className="sys-section" style={{ marginTop: 18, borderColor: 'var(--copper-300)' }}>
      <div className="sys-section__title" style={{ color: 'var(--copper-700)' }}>Zone sensible · annuler les encaissements</div>
      <div className="sys-section__cap" style={{ maxWidth: 660 }}>
        Supprime <b>toutes les factures payées</b> de {branch.name} et remet leurs rituels à <b>impayé</b> — pour
        repasser chaque paiement à la main. Les numéros de facture repartiront de zéro ; les avoirs consommés
        sont restaurés. <b>Exportez d’abord une sauvegarde</b> (carte ci-dessus) : sans elle, c’est irréversible.
        Les pourboires déjà saisis ne sont pas repris — vérifiez-les après.
      </div>
      <div style={{ marginTop: 14 }}>
        {!armed ? (
          <Button
            variant="ghost"
            style={{ color: 'var(--copper-700)', borderColor: 'var(--copper-300)' }}
            disabled={paidCount === 0}
            onClick={() => setArmed(true)}
          >
            {paidCount > 0 ? `Annuler ${paidCount} facture${paidCount > 1 ? 's' : ''} payée${paidCount > 1 ? 's' : ''}…` : 'Aucune facture payée à annuler'}
          </Button>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--copper-700)' }}>
              Supprimer {paidCount} facture{paidCount > 1 ? 's' : ''} payée{paidCount > 1 ? 's' : ''} et remettre leurs rituels à impayé ?
            </span>
            <Button variant="copper" onClick={doReset}>Oui, tout remettre à impayé</Button>
            <Button variant="ghost" onClick={() => setArmed(false)}>Annuler</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------- Zone sensible — VIDER tous les rendez-vous (repartir à zéro) ----------
   Effacement volontaire côté serveur (contourne le garde-fou anti-masse), puis
   rechargement pour ré-hydrater d'un serveur vide. Sauvegarde impérative avant. */
function ViderRdvCard() {
  const { branch } = useBranch();
  const [appts] = useStore(appointmentsStore);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  /* TOUS les rendez-vous, pas ceux de la branche courante : l'effacement ne
     filtre plus par branche (voir wipeAppointments), sinon ceux rattachés à une
     branche supprimée restaient au serveur. Compter par branche annonçait « 407
     rendez-vous » quand il y en avait 792 à effacer. */
  const count = appts.length;

  const doWipe = async () => {
    setBusy(true);
    try {
      const n = await wipeAppointments(branch.id);
      toast(`${n} rendez-vous supprimé${n > 1 ? 's' : ''}. La page se recharge sur un carnet vide…`);
      window.setTimeout(() => window.location.reload(), 1100);
    } catch (e) {
      setBusy(false);
      setArmed(false);
      toast(`Échec de la suppression : ${e instanceof Error ? e.message : 'serveur injoignable'}. Rien n’a été effacé.`);
    }
  };

  return (
    <Card className="sys-section" style={{ marginTop: 18, borderColor: 'var(--copper-300)' }}>
      <div className="sys-section__title" style={{ color: 'var(--copper-700)' }}>Zone sensible · vider tous les rendez-vous</div>
      <div className="sys-section__cap" style={{ maxWidth: 660 }}>
        Supprime <b>tous les rendez-vous</b> de {branch.name} — définitivement, côté serveur — pour repartir
        d’un carnet vide avant un nouvel import. <b>Exportez d’abord une sauvegarde</b> (carte plus haut) :
        sans elle, c’est irréversible. Les factures, clientes et le catalogue ne sont pas touchés.
      </div>
      <div style={{ marginTop: 14 }}>
        {!armed ? (
          <Button
            variant="ghost"
            style={{ color: 'var(--copper-700)', borderColor: 'var(--copper-300)' }}
            disabled={count === 0}
            onClick={() => setArmed(true)}
          >
            {count > 0 ? `Vider ${count} rendez-vous…` : 'Aucun rendez-vous à vider'}
          </Button>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: 'var(--copper-700)' }}>
              Supprimer définitivement {count} rendez-vous de {branch.name} ? (Avez-vous exporté la sauvegarde ?)
            </span>
            <Button variant="copper" onClick={() => void doWipe()} disabled={busy}>{busy ? 'Suppression…' : 'Oui, tout vider'}</Button>
            <Button variant="ghost" onClick={() => setArmed(false)} disabled={busy}>Annuler</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------- Zone sensible — RÉINITIALISER TOUTE LA MAISON (repartir à zéro) ----------
   Vide le serveur (tout sauf branches + accès) et pose le mode « Maison à blanc »
   pour ne pas repeupler. Double confirmation, sauvegarde impérative. */
function FactoryResetCard() {
  const [step, setStep] = useState(0); // 0 repos · 1 armé · 2 confirmation finale
  const [busy, setBusy] = useState(false);

  const doReset = async () => {
    setBusy(true);
    try {
      const failed = await factoryResetServer();
      if (failed.length) {
        setBusy(false);
        setStep(0);
        toast(`Réinitialisation incomplète — ${failed.length} table(s) en échec, rien n’a été touché en local. Réessayez. (${failed[0]})`);
        return;
      }
      toast('Maison réinitialisée. Rechargement sur une Maison vierge…');
      window.setTimeout(() => activateBlankAndReload(), 1200);
    } catch (e) {
      setBusy(false);
      setStep(0);
      toast(`Échec : ${e instanceof Error ? e.message : 'serveur injoignable'}. Rien n’a été effacé.`);
    }
  };

  return (
    <Card className="sys-section" style={{ marginTop: 18, borderColor: '#8f3b30' }}>
      <div className="sys-section__title" style={{ color: '#8f3b30' }}>Zone critique · réinitialiser toute la Maison</div>
      <div className="sys-section__cap" style={{ maxWidth: 680 }}>
        Efface <b>toutes les données</b> — clientes, rendez-vous, factures, finances, catalogue, équipe,
        réglages — pour repartir d’une Maison vierge avant un nouvel import. On conserve seulement vos
        <b> branches</b> et votre <b>compte d’accès</b>. <b>Exportez d’abord une sauvegarde</b> (tout en haut) :
        sans elle, c’est définitif. La sauvegarde froide de l’ancien ERP n’est pas touchée.
      </div>
      <div style={{ marginTop: 14 }}>
        {step === 0 && (
          <Button variant="ghost" style={{ color: '#8f3b30', borderColor: '#8f3b30' }} onClick={() => setStep(1)}>
            Tout réinitialiser…
          </Button>
        )}
        {step === 1 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: '#8f3b30' }}>
              Avez-vous <b>exporté la sauvegarde</b> ? Ceci efface tout, définitivement.
            </span>
            <Button variant="ghost" style={{ color: '#8f3b30', borderColor: '#8f3b30' }} onClick={() => setStep(2)}>J’ai ma sauvegarde — continuer</Button>
            <Button variant="ghost" onClick={() => setStep(0)}>Annuler</Button>
          </div>
        )}
        {step === 2 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: '#8f3b30', fontWeight: 600 }}>
              Dernière étape — effacer TOUTE la Maison maintenant ?
            </span>
            <Button variant="copper" onClick={() => void doReset()} disabled={busy}>{busy ? 'Effacement…' : 'Oui, tout effacer et repartir à zéro'}</Button>
            <Button variant="ghost" onClick={() => setStep(0)} disabled={busy}>Annuler</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── LA PAGE SE LIT PAR FAMILLES (13 août) ─────────────────────────────
   Quatorze cartes empilées dans l'ordre où elles étaient nées : les zones
   dangereuses au milieu, le calendrier éparpillé en trois endroits, et une
   grille à deux colonnes dont l'une finissait en désert d'écrans. Désormais :
   une seule colonne, sept familles annoncées par un intertitre cuivre, un
   sommaire collant pour sauter à la bonne, et les zones sensibles À LA FIN —
   là où on ne les croise pas par accident. */
const FAMILLES_SOMMAIRE = [
  { id: 'fam-maison', l: 'La Maison' },
  { id: 'fam-calendrier', l: 'Le calendrier' },
  { id: 'fam-catalogue', l: 'Catalogue & clientèle' },
  { id: 'fam-encaissement', l: 'L’encaissement' },
  { id: 'fam-equipe', l: 'L’équipe' },
  { id: 'fam-notifs', l: 'Notifications & automatisations' },
  { id: 'fam-donnees', l: 'Données & zones sensibles' },
];

/** L'intertitre d'une famille — le motif des mondes de la Caisse : un mot
    cuivre, un filet, et l'œil sait où il est. `scrollMarginTop` laisse la
    place du sommaire collant quand on saute à l'ancre. */
function Intertitre({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '34px 0 0', scrollMarginTop: 64 }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--copper-700)', whiteSpace: 'nowrap' }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--hairline)' }} aria-hidden="true" />
    </div>
  );
}

/** Le sommaire — collant sous le haut de page, il suit pendant qu'on défile.
    Des ancres, pas des onglets : la page reste UNE page, la recherche du
    navigateur voit tout, et un réglage se retrouve d'un geste. */
function SommaireParametres() {
  return (
    <nav
      aria-label="Sommaire des paramètres"
      style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'var(--color-ivoire)',
        display: 'flex', flexWrap: 'wrap', gap: 8,
        padding: '10px 0 12px', marginBottom: 4,
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      {FAMILLES_SOMMAIRE.map((f) => (
        <button
          key={f.id}
          type="button"
          className="tre-chip"
          onClick={() => document.getElementById(f.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          {f.l}
        </button>
      ))}
    </nav>
  );
}

export default function Parametres() {
  const [exceptions, setExceptions] = useExceptionsHoraires();
  const [blocages, setBlocages] = useBlocages();
  const [preuve, setPreuve] = usePointageConfig();
  const navigate = useNavigate();

  /* LE CODE DU JOUR NAÎT SEUL. On l'assure au premier regard porté sur cet
     écran ; le Comptoir fait de même de son côté, et la synchro les accorde. */
  const aujourdhuiIso = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    if (preuve.exigerPreuve) assurerCodeDuJour(preuve, aujourdhuiIso, setPreuve);
  }, [preuve, aujourdhuiIso, setPreuve]);
  const codeAujourdhui = preuve.codeDate === aujourdhuiIso ? (preuve.codeValeur ?? '') : '';
  const [equipe] = useStaff();
  const { branch, currency } = useBranch();
  const [settings, setSettings] = useSettings();
  const [autoCfgRaw, setAutoCfgRaw] = useStore(autoConfigStore);
  const [services] = useServices();
  const [identity, setIdentity] = useHouseIdentity();
  const [crownStyles, setCrownStyles] = useCrownStyles();
  const [segments, setSegments] = useSegments();
  const [payMethods] = usePaymentMethods();
  const [saved, setSaved] = useState(false);
  const [newStyle, setNewStyle] = useState('');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [newSeg, setNewSeg] = useState('');
  const [segEditIdx, setSegEditIdx] = useState<number | null>(null);
  const [segEditVal, setSegEditVal] = useState('');
  const [newPay, setNewPay] = useState('');
  const [payEditIdx, setPayEditIdx] = useState<number | null>(null);
  const [payEditVal, setPayEditVal] = useState('');

  const curName = currencyByCode(currency)?.name ?? currency;

  const toggle = (k: string) =>
    setSettings((s) => ({ ...s, toggles: { ...s.toggles, [k]: !s.toggles[k] } }));

  /** Écrit un champ d'identité / de rituel dans le magasin dédié (persistance immédiate). */
  const setIdent = (field: keyof HouseIdentity, val: string) =>
    setIdentity((s) => ({ ...s, [field]: val }));

  /** Acompte exigé en ligne (%) — borné 0–100, entier ; lu par Ma Couronne. */
  const setDepositPct = (raw: string) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
    setSettings((s) => ({ ...s, onlineDepositPct: n }));
  };

  /** Plafond de rendez-vous par jour — entier, 0 = sans limite ; lu par la réservation. */
  const setCapacite = (champ: 'maxRdvParJourMaitre' | 'maxRdvParJourMaison', raw: string) => {
    const n = Math.max(0, parseInt(raw.replace(/[^0-9]/g, ''), 10) || 0);
    setSettings((s) => ({ ...s, [champ]: n }));
  };

  /** Les noms qu'un blocage peut viser : ceux que portent les rendez-vous —
      les maîtres du catalogue d'abord, l'équipe en complément. */
  const maitresDuCalendrier = Array.from(new Set(
    [...services.map((s) => s.master), ...equipe.map((m) => m.name)].filter(Boolean),
  )).sort() as string[];

  /** Frais de livraison à domicile (XOF) — entier ≥ 0 ; lu par Ma Couronne · Gamme. */
  const setDeliveryFee = (raw: string) => {
    const n = Math.max(0, Math.round(Number(raw) || 0));
    setSettings((s) => ({ ...s, deliveryFeeXof: n }));
  };

  /* Acompte par prestation : la table `depositPctByService` fait foi. On la
     reconstruit une fois à partir des anciens réglages (liste + taux global)
     pour ne pas perdre le paramétrage existant à la bascule. */
  const depositMap: Record<string, number> =
    settings.depositPctByService
    ?? Object.fromEntries((settings.depositServiceIds ?? []).map((id) => [id, settings.onlineDepositPct ?? 30]));
  const depositIds = Object.keys(depositMap).filter((id) => (depositMap[id] ?? 0) > 0);

  /** Ajoute/retire une prestation de la table (au taux par défaut à l'ajout). */
  const toggleDepositService = (id: string) =>
    setSettings((s) => {
      const cur: Record<string, number> =
        s.depositPctByService
        ?? Object.fromEntries((s.depositServiceIds ?? []).map((x) => [x, s.onlineDepositPct ?? 30]));
      const next = { ...cur };
      if (id in next) delete next[id];
      else next[id] = s.onlineDepositPct ?? 30;
      return { ...s, depositPctByService: next };
    });

  /** Taux propre à une prestation (0–100). */
  const setDepositPctFor = (id: string, raw: string) =>
    setSettings((s) => {
      const cur: Record<string, number> =
        s.depositPctByService
        ?? Object.fromEntries((s.depositServiceIds ?? []).map((x) => [x, s.onlineDepositPct ?? 30]));
      const n = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
      return { ...s, depositPctByService: { ...cur, [id]: n } };
    });

  /* ----- Styles de couronne — liste éditable (trim + dédoublonnage) ----- */
  const normalizeStyles = (list: string[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of list) {
      const t = s.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  };
  const addStyle = () => {
    const t = newStyle.trim();
    if (!t) return;
    setCrownStyles((prev) => normalizeStyles([...prev, t]));
    setNewStyle('');
  };
  const startRename = (idx: number, current: string) => { setEditIdx(idx); setEditVal(current); };
  const commitRename = (idx: number) => {
    const t = editVal.trim();
    if (t) setCrownStyles((prev) => normalizeStyles(prev.map((s, i) => (i === idx ? t : s))));
    setEditIdx(null);
    setEditVal('');
  };
  const removeStyle = (idx: number, name: string) => {
    if (!window.confirm(`Retirer le style « ${name} » ? Il ne sera plus proposé au CRM ni à Ma Couronne.`)) return;
    setCrownStyles((prev) => prev.filter((_, i) => i !== idx));
    if (editIdx === idx) setEditIdx(null);
  };

  /* ----- Segments de clientèle — même gestion (ajout / renommage / retrait) ----- */
  const addSeg = () => {
    const t = newSeg.trim();
    if (!t) return;
    setSegments((prev) => normalizeStyles([...prev, t]));
    setNewSeg('');
  };
  const commitSegRename = (idx: number) => {
    const t = segEditVal.trim();
    /* `renameSegment` et non un simple map : le segment est recopié dans chaque
       fiche cliente. Renommer la seule liste laissait les fiches porter l'ancien
       libellé — orphelin, absent de la liste, introuvable au filtre. */
    if (t) renameSegment(segments[idx], t);
    setSegEditIdx(null);
    setSegEditVal('');
  };
  const removeSeg = (idx: number, name: string) => {
    if (!window.confirm(`Retirer le segment « ${name} » ? Il ne sera plus proposé dans le CRM (les fiches déjà taguées le gardent).`)) return;
    setSegments((prev) => prev.filter((_, i) => i !== idx));
    if (segEditIdx === idx) setSegEditIdx(null);
  };

  /* ----- Modes de paiement — même gestion (ajout / renommage / retrait) ----- */
  const addPay = () => {
    const t = newPay.trim();
    if (!t) return;
    paymentMethodsStore.set((prev) => normalizeStyles([...prev, t]));
    setNewPay('');
  };
  const commitPayRename = (idx: number) => {
    const t = payEditVal.trim();
    if (t) paymentMethodsStore.set((prev) => normalizeStyles(prev.map((s, i) => (i === idx ? t : s))));
    setPayEditIdx(null);
    setPayEditVal('');
  };
  const removePay = (idx: number, name: string) => {
    if (!window.confirm(`Retirer le mode de paiement « ${name} » ? Il ne sera plus proposé à l’encaissement (Factures & Académie).`)) return;
    paymentMethodsStore.set((prev) => prev.filter((_, i) => i !== idx));
    if (payEditIdx === idx) setPayEditIdx(null);
  };

  const setHour = (key: string, field: keyof DayHours, val: string | boolean) =>
    setSettings((s) => ({
      ...s,
      hours: s.hours.map((d) => (d.key === key ? { ...d, [field]: val } : d)),
    }));

  /* Les liens d'automatisation vivaient en DOUBLE : `settings.automations` ici et
     `autoConfigStore` dans Marketing — mêmes champs, jamais synchronisés, si bien
     que remplir l'un laissait l'autre vide. Marketing porte les automatisations
     elles-mêmes, donc son magasin fait foi ; Paramètres écrit désormais dedans.
     `settings.automations` n'est plus que la source d'une reprise unique. */
  const autoCfg: AutoConfig = {
    momoLink: autoCfgRaw.momoLink || settings.automations.momoLink,
    mapsLink: autoCfgRaw.mapsLink || settings.automations.mapsLink,
    reviewLink: autoCfgRaw.reviewLink || settings.automations.reviewLink,
    itineraire: autoCfgRaw.itineraire || settings.automations.itineraire,
  };
  const setAuto = (field: keyof AutoConfig, val: string) =>
    setAutoCfgRaw({ ...autoCfg, [field]: val });

  const openDays = useMemo(() => settings.hours.filter((d) => !d.closed).length, [settings.hours]);

  const save = () => { setSaved(true); window.setTimeout(() => setSaved(false), 2400); };

  const ToggleRows = ({ rows }: { rows: ToggleRow[] }) => (
    <>
      {rows.map((r) => (
        <div key={r.k} className="sys-row">
          <div>
            <div className="sys-row__label">{r.l}</div>
            <div className="sys-row__sub">{r.sub}</div>
          </div>
          <Toggle on={!!settings.toggles[r.k]} onToggle={() => toggle(r.k)} />
        </div>
      ))}
    </>
  );

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Système · La Maison"
        title="Paramètres."
        sub={`${branch.name} — les règles qui cadrent chaque rendez-vous, et les accès de ceux qui servent.`}
        actions={<Button variant="copper" onClick={save}>Enregistrer</Button>}
      />

      {saved && (
        <div className="tre-inline-note" style={{ marginBottom: 16 }}>
          <span className="mark">✦</span>
          <span>Paramètres enregistrés — la Maison retient vos réglages.</span>
        </div>
      )}

      <SommaireParametres />

      {/* ══ LA MAISON ═══════════════════════════════════════════════ */}
      <Intertitre id="fam-maison">La Maison</Intertitre>

      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div className="sys-section__title">Identité de la Maison</div>
          <div className="sys-section__cap">Ce que la Maison montre au monde.</div>
          <EditRow l="Nom de la Maison">
            <input
              className="sys-input"
              value={identity.nom}
              onChange={(e) => setIdent('nom', e.target.value)}
              aria-label="Nom de la Maison"
            />
          </EditRow>
          <EditRow l="Raison sociale">
            <input
              className="sys-input"
              value={identity.raison}
              onChange={(e) => setIdent('raison', e.target.value)}
              aria-label="Raison sociale"
            />
          </EditRow>
          <EditRow l="Fuseau horaire">
            <select
              className="sys-select"
              value={identity.fuseau}
              onChange={(e) => setIdent('fuseau', e.target.value)}
              aria-label="Fuseau horaire"
            >
              {FUSEAU_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </EditRow>
          <FieldRowView l="Devise de référence" v={`${curName} · ${currency}`} />
        </Card>

      {/* ── LES HEURES DU SALON ─────────────────────────────────────
          UNE SEULE CARTE, UNE SEULE DONNÉE. Il en existait deux : celle-ci,
          qui commande les créneaux réservables (`openingForIso`), et une autre
          branchée sur un second document jamais lu par la réservation. « Mon
          mois » lisait la seconde, restée à ses valeurs de départ, et
          annonçait 9 h quand la Maison ouvrait à 8 h.

          Deux sources d'horaires pour une seule maison, c'est une de trop.
          Celle-ci reste, et tout s'y branche : la réservation, l'amplitude du
          Calendrier, la ponctualité au pointage et les heures au-delà. */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
          <div>
            <div className="sys-section__title">Les heures du salon</div>
            <div className="sys-section__cap">
              Le salon n’accepte des rendez-vous que pendant ces plages. Elles décident aussi de
              l’amplitude du Calendrier, de l’heure à laquelle on est « à l’heure » au pointage,
              et de ce qui compte comme heure au-delà.
            </div>
          </div>
          <span className="sys-badge-count">{openDays} / 7 jours</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {settings.hours.map((d) => (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ width: 92, fontFamily: 'var(--font-sans)', fontSize: 13 }}>{JOUR_LABEL[d.key] ?? d.key}</span>
              <button
                className={`tre-chip ${d.closed ? '' : 'is-on'}`}
                onClick={() => setHour(d.key, 'closed', !d.closed)}
                style={{ fontSize: 11.5, minWidth: 78 }}
              >
                {d.closed ? 'Fermé' : 'Ouvert'}
              </button>
              {!d.closed && (
                <>
                  <Input value={d.open} onChange={(e) => setHour(d.key, 'open', e.target.value)} placeholder="08h00" style={{ width: 92, textAlign: 'center' }} />
                  <span className="mnd-muted" style={{ fontSize: 12 }}>→</span>
                  <Input value={d.close} onChange={(e) => setHour(d.key, 'close', e.target.value)} placeholder="20h30" style={{ width: 92, textAlign: 'center' }} />
                </>
              )}
              {d.closed && <span className="mnd-muted" style={{ fontSize: 12 }}>Fermé ce jour</span>}
            </div>
          ))}
        </div>

        <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.55 }}>
          Écris l’heure comme « 08h00 ». Le Calendrier couvre la plus large amplitude de la
          semaine : un seul jour ouvert à 8 h suffit à faire commencer la grille à 8 h.
        </div>
      </Card>

      {/* ══ LE CALENDRIER ═══════════════════════════════════════════
          Tout ce qui régit un rendez-vous, au même endroit : ses règles et
          son acompte, les journées qui dérogent, et les murs de la
          réservation en ligne. */}
      <Intertitre id="fam-calendrier">Le calendrier</Intertitre>

        <Card className="sys-section" style={{ marginTop: 18 }}>
          <div className="sys-section__title">Le rendez-vous & l’acompte</div>
          <div className="sys-section__cap">Les règles qui cadrent chaque rendez-vous — et ce que Ma Couronne exige à la réservation.</div>
          <EditRow l="Durée standard d’un rituel" sub="Le temps réservé au fauteuil par défaut.">
            <select
              className="sys-select"
              value={identity.dureeRituel}
              onChange={(e) => setIdent('dureeRituel', e.target.value)}
              aria-label="Durée standard d’un rituel"
            >
              {DUREE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </EditRow>
          <EditRow l="Fenêtre d’annulation" sub="Délai au-delà duquel l’acompte est retenu.">
            <select
              className="sys-select"
              value={identity.fenetreAnnulation}
              onChange={(e) => setIdent('fenetreAnnulation', e.target.value)}
              aria-label="Fenêtre d’annulation"
            >
              {ANNULATION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </EditRow>
          <div className="sys-row">
            <div>
              <div className="sys-row__label">Acompte exigé en ligne (%)</div>
              <div className="sys-row__sub">Ce que la cliente règle à la réservation sur Ma Couronne.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="sys-select"
                type="number"
                min={0}
                max={100}
                step={1}
                value={settings.onlineDepositPct}
                onChange={(e) => setDepositPct(e.target.value)}
                style={{ width: 78, textAlign: 'right', fontFamily: 'var(--font-serif)' }}
                aria-label="Acompte exigé en ligne en pourcentage"
              />
              <span className="sys-row__value">%</span>
            </div>
          </div>
          <div className="sys-row" style={{ display: 'block' }}>
            <div style={{ marginBottom: 8 }}>
              <div className="sys-row__label">Prestations exigeant un acompte</div>
              <div className="sys-row__sub">
                Sélectionnez les prestations, puis fixez le taux de CHACUNE — au Trône comme sur
                Ma Couronne. Aucune sélectionnée = aucun acompte, confirmation directe. Le taux
                ci-dessus ne sert plus que de valeur proposée à l’ajout.
              </div>
            </div>
            {services.length === 0 ? (
              <div className="sys-row__sub">Aucune prestation au catalogue.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {services.map((sv) => {
                    const on = depositIds.includes(sv.id);
                    return (
                      <button
                        key={sv.id}
                        type="button"
                        onClick={() => toggleDepositService(sv.id)}
                        style={{
                          border: `1px solid ${on ? 'var(--color-copper)' : 'var(--hairline)'}`,
                          borderRadius: 3,
                          padding: '7px 12px',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-sans)',
                          background: on ? 'var(--color-copper)' : 'var(--surface-card)',
                          color: on ? 'var(--color-ivoire)' : 'var(--ink)',
                        }}
                      >
                        {sv.name}
                      </button>
                    );
                  })}
                </div>

                {depositIds.length > 0 && (
                  <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                    <div className="sys-row__sub" style={{ marginBottom: 2 }}>Taux par prestation</div>
                    {depositIds.map((id) => {
                      const sv = services.find((x) => x.id === id);
                      if (!sv) return null; // prestation retirée du catalogue depuis
                      return (
                        <div
                          key={id}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 10, borderBottom: '1px solid var(--hairline)', paddingBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 13 }}>{sv.name}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              className="sys-select"
                              type="number"
                              min={0}
                              max={100}
                              value={depositMap[id] ?? 0}
                              onChange={(e) => setDepositPctFor(id, e.target.value)}
                              style={{ width: 78, textAlign: 'right', fontFamily: 'var(--font-serif)' }}
                              aria-label={`Acompte de ${sv.name} en pourcentage`}
                            />
                            <span className="sys-row__value">%</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          <ToggleRows rows={RITUEL_TOGGLES} />
        </Card>

      {/* ── LES JOURNÉES EXCEPTIONNELLES ────────────────────────────
          Un inventaire, une fermeture, une personne à qui l'on a demandé de
          venir plus tard. Sans elles, le pointage jugeait en retard quelqu'un
          qui faisait exactement ce qu'on lui avait demandé — et une prime se
          perdait sur un malentendu. */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div className="sys-section__title">Journées exceptionnelles</div>
        <div className="sys-section__cap">
          Un inventaire, une fermeture, une arrivée décalée pour une personne. Ce jour-là,
          l’horaire ci-dessous remplace celui de la semaine — et le pointage juge sur lui.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {exceptions.length === 0 && (
            <div className="mnd-muted" style={{ fontSize: 12.5 }}>
              Aucune. La semaine type s’applique tous les jours.
            </div>
          )}
          {[...exceptions].sort((a, b) => (a.date < b.date ? 1 : -1)).map((ex) => {
            const maj = (patch: Partial<HoraireException>) =>
              setExceptions(exceptions.map((x) => (x.id === ex.id ? { ...x, ...patch } : x)));
            return (
              <div key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: '1px solid var(--hairline)', borderRadius: 4, padding: '10px 12px' }}>
                <Input type="date" value={ex.date} onChange={(e) => maj({ date: e.target.value })} style={{ width: 150 }} />
                <Select
                  value={ex.staffId ?? ''}
                  onChange={(e) => maj({ staffId: e.target.value || undefined })}
                  style={{ width: 190 }}
                >
                  <option value="">Toute la Maison</option>
                  {equipe.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
                <button
                  className={`tre-chip ${ex.closed ? '' : 'is-on'}`}
                  onClick={() => maj({ closed: !ex.closed })}
                  style={{ fontSize: 11.5, minWidth: 78 }}
                >
                  {ex.closed ? 'Fermé' : 'Ouvert'}
                </button>
                {!ex.closed && (
                  <>
                    <Input value={ex.open ?? ''} onChange={(e) => maj({ open: e.target.value })} placeholder="10h00" style={{ width: 86, textAlign: 'center' }} />
                    <span className="mnd-muted" style={{ fontSize: 12 }}>→</span>
                    <Input value={ex.close ?? ''} onChange={(e) => maj({ close: e.target.value })} placeholder="19h00" style={{ width: 86, textAlign: 'center' }} />
                  </>
                )}
                <Input value={ex.note ?? ''} onChange={(e) => maj({ note: e.target.value })} placeholder="Inventaire" style={{ flex: 1, minWidth: 130 }} />
                <button
                  className="tre-link-btn tre-link-btn--danger"
                  onClick={() => setExceptions(exceptions.filter((x) => x.id !== ex.id))}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            className="tre-link-btn"
            onClick={() => setExceptions([
              ...exceptions,
              { id: `hx-${uid()}`, date: new Date().toISOString().slice(0, 10), open: '', close: '', closed: false },
            ])}
          >
            + Journée exceptionnelle
          </button>
        </div>

        <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.55 }}>
          Une heure laissée vide garde celle de la semaine : décaler la seule ouverture est donc
          possible sans retoucher la fermeture. Une exception nominative l’emporte sur celle de la
          Maison — le plus précis gagne. Une exception de la Maison ferme aussi la réservation
          en ligne ce jour-là : sa note peut être lue par les clientes, écris-la pour elles.
        </div>
      </Card>

      {/* ── LE CALENDRIER DE RÉSERVATION ────────────────────────────
          Ce que les horaires ne savent pas dire : combien de rendez-vous la
          Maison accepte par jour, et les murs posés à la main — une pause de
          midi, un maître absent. Ma Couronne lit ces deux registres pour ne
          jamais proposer un créneau qu'on refuserait. Le comptoir, lui, n'est
          pas bridé : poser un rendez-vous à la main reste un geste du
          personnel, qui voit son carnet. */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div className="sys-section__title">Le calendrier de réservation</div>
        <div className="sys-section__cap">
          Ce que la réservation en ligne peut proposer, au-delà des heures d’ouverture :
          le nombre de rendez-vous que la journée accepte, et les créneaux qu’on ferme à la main.
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12 }}>
          <Field label="Plafond par maître et par jour">
            <Input
              inputMode="numeric"
              value={String(settings.maxRdvParJourMaitre ?? 0)}
              onChange={(e) => setCapacite('maxRdvParJourMaitre', e.target.value)}
              style={{ width: 90, textAlign: 'right' }}
            />
          </Field>
          <Field label="Plafond pour toute la Maison, par jour">
            <Input
              inputMode="numeric"
              value={String(settings.maxRdvParJourMaison ?? 0)}
              onChange={(e) => setCapacite('maxRdvParJourMaison', e.target.value)}
              style={{ width: 90, textAlign: 'right' }}
            />
          </Field>
        </div>
        <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.55 }}>
          0 = sans limite. Le plafond compte les rendez-vous non annulés du jour : atteint,
          la réservation en ligne ne propose plus aucun créneau — même si des heures restent.
        </div>

        <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 16, paddingTop: 14 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>Créneaux bloqués</div>
          <div className="mnd-muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>
            Une pause de midi, un maître pris ailleurs : la plage disparaît de la réservation,
            comme si un rendez-vous l’occupait. Pour fermer une date entière à toute la Maison,
            préfère la journée exceptionnelle ci-dessus — une seule vérité par question.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {blocages.length === 0 && (
              <div className="mnd-muted" style={{ fontSize: 12.5 }}>Aucun créneau bloqué.</div>
            )}
            {[...blocages].sort((a, b) => (a.date < b.date ? 1 : -1)).map((bl) => {
              const maj = (patch: Partial<Blocage>) =>
                setBlocages(blocages.map((x) => (x.id === bl.id ? { ...x, ...patch } : x)));
              const journee = !bl.debut && !bl.fin;
              return (
                <div key={bl.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', border: '1px solid var(--hairline)', borderRadius: 4, padding: '10px 12px' }}>
                  <Input type="date" value={bl.date} onChange={(e) => maj({ date: e.target.value })} style={{ width: 150 }} />
                  <Select
                    value={bl.master ?? ''}
                    onChange={(e) => maj({ master: e.target.value || undefined })}
                    style={{ width: 190 }}
                  >
                    <option value="">Toute la Maison</option>
                    {maitresDuCalendrier.map((nom) => (
                      <option key={nom} value={nom}>{nom}</option>
                    ))}
                  </Select>
                  <button
                    className={`tre-chip ${journee ? 'is-on' : ''}`}
                    onClick={() => maj(journee ? { debut: '12h00', fin: '14h00' } : { debut: undefined, fin: undefined })}
                    style={{ fontSize: 11.5, minWidth: 106 }}
                  >
                    {journee ? 'Journée entière' : 'Une plage'}
                  </button>
                  {!journee && (
                    <>
                      <Input value={bl.debut ?? ''} onChange={(e) => maj({ debut: e.target.value })} placeholder="12h00" style={{ width: 86, textAlign: 'center' }} />
                      <span className="mnd-muted" style={{ fontSize: 12 }}>→</span>
                      <Input value={bl.fin ?? ''} onChange={(e) => maj({ fin: e.target.value })} placeholder="14h00" style={{ width: 86, textAlign: 'center' }} />
                    </>
                  )}
                  <Input value={bl.motif ?? ''} onChange={(e) => maj({ motif: e.target.value })} placeholder="Fermeture exceptionnelle" style={{ flex: 1, minWidth: 130 }} />
                  <button
                    className="tre-link-btn tre-link-btn--danger"
                    onClick={() => setBlocages(blocages.filter((x) => x.id !== bl.id))}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              className="tre-link-btn"
              onClick={() => setBlocages([
                ...blocages,
                { id: `blk-${uid()}`, branchId: branch?.id ?? '', date: new Date().toISOString().slice(0, 10) },
              ])}
            >
              + Bloquer un créneau
            </button>
          </div>

          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.55 }}>
            Le motif peut être lu par les clientes — écris ce qui peut se dire à une cliente,
            jamais les affaires de la maison. Une absence de plusieurs jours se pose jour par
            jour : on voit ce qu’on bloque.
          </div>
        </div>
      </Card>

      {/* LA SECONDE CARTE D'HORAIRES A ÉTÉ RETIRÉE le 6 août (même donnée
          montrée deux fois — une maison n'a qu'un horaire) ; la carte qui
          reste vit dans LA MAISON, en tête de page, depuis le 13 août. */}

      {/* ══ CATALOGUE & CLIENTÈLE ═══════════════════════════════════ */}
      <Intertitre id="fam-catalogue">Catalogue & clientèle</Intertitre>

      {/* ---------- Catalogue · styles de couronne ---------- */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
          <div>
            <div className="sys-section__title">Catalogue · styles de couronne</div>
            <div className="sys-section__cap">
              La liste des styles proposée partout — fiches CRM et Ma Couronne. Ajoutez, renommez, retirez ;
              les changements se propagent aussitôt.
            </div>
          </div>
          <span className="sys-badge-count">{crownStyles.length} style{crownStyles.length > 1 ? 's' : ''}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {crownStyles.map((s, i) => (
            <div key={`${s}-${i}`} className="sys-row sys-row--items">
              {editIdx === i ? (
                <>
                  <input
                    className="sys-select"
                    value={editVal}
                    autoFocus
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(i); if (e.key === 'Escape') setEditIdx(null); }}
                    style={{ flex: 1, marginRight: 12 }}
                    aria-label="Renommer le style"
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="copper" onClick={() => commitRename(i)}>Valider</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditIdx(null)}>Annuler</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="sys-row__label" style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{s}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="ghost" onClick={() => startRename(i, s)}>Renommer</Button>
                    <Button size="sm" variant="ghost" style={{ color: 'var(--copper-700)' }} onClick={() => removeStyle(i, s)}>Retirer</Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {crownStyles.length === 0 && (
            <div className="sys-row" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
              Aucun style pour l’instant — ajoutez le premier ci-dessous.
            </div>
          )}
        </div>

        <div className="sys-additem" style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Input
            value={newStyle}
            onChange={(e) => setNewStyle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addStyle(); }}
            placeholder="Nouveau style — ex. Microlocks"
            style={{ flex: 1 }}
          />
          <Button variant="copper" onClick={addStyle} disabled={!newStyle.trim()}>Ajouter</Button>
        </div>
      </Card>

      {/* ---------- CRM · segments de clientèle ---------- */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
          <div>
            <div className="sys-section__title">CRM · segments de clientèle</div>
            <div className="sys-section__cap">
              Les segments proposés dans les fiches clientes (VIP, Prospect, Cercle…). Ajoutez, renommez, retirez ;
              une fiche déjà taguée conserve ses segments même s’ils sont retirés d’ici.
            </div>
          </div>
          <span className="sys-badge-count">{segments.length} segment{segments.length > 1 ? 's' : ''}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {segments.map((s, i) => (
            <div key={`${s}-${i}`} className="sys-row sys-row--items">
              {segEditIdx === i ? (
                <>
                  <input
                    className="sys-select"
                    value={segEditVal}
                    autoFocus
                    onChange={(e) => setSegEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitSegRename(i); if (e.key === 'Escape') setSegEditIdx(null); }}
                    style={{ flex: 1, marginRight: 12 }}
                    aria-label="Renommer le segment"
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="copper" onClick={() => commitSegRename(i)}>Valider</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSegEditIdx(null)}>Annuler</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="sys-row__label" style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{s}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="ghost" onClick={() => { setSegEditIdx(i); setSegEditVal(s); }}>Renommer</Button>
                    <Button size="sm" variant="ghost" style={{ color: 'var(--copper-700)' }} onClick={() => removeSeg(i, s)}>Retirer</Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {segments.length === 0 && (
            <div className="sys-row" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
              Aucun segment — ajoutez le premier ci-dessous.
            </div>
          )}
        </div>

        <div className="sys-additem" style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Input
            value={newSeg}
            onChange={(e) => setNewSeg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSeg(); }}
            placeholder="Nouveau segment — ex. Fidèle"
            style={{ flex: 1 }}
          />
          <Button variant="copper" onClick={addSeg} disabled={!newSeg.trim()}>Ajouter</Button>
        </div>
      </Card>

      {/* ══ L'ENCAISSEMENT ══════════════════════════════════════════ */}
      <Intertitre id="fam-encaissement">L’encaissement</Intertitre>

      {/* ---------- Encaissement · modes de paiement ---------- */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 }}>
          <div>
            <div className="sys-section__title">Encaissement · modes de paiement</div>
            <div className="sys-section__cap">
              Les moyens de règlement proposés à l’encaissement — Factures &amp; Académie. Ajoutez, renommez, retirez ;
              les changements se propagent aussitôt.
            </div>
          </div>
          <span className="sys-badge-count">{payMethods.length} mode{payMethods.length > 1 ? 's' : ''}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {payMethods.map((s, i) => (
            <div key={`${s}-${i}`} className="sys-row sys-row--items">
              {payEditIdx === i ? (
                <>
                  <input
                    className="sys-select"
                    value={payEditVal}
                    autoFocus
                    onChange={(e) => setPayEditVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitPayRename(i); if (e.key === 'Escape') setPayEditIdx(null); }}
                    style={{ flex: 1, marginRight: 12 }}
                    aria-label="Renommer le mode de paiement"
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="copper" onClick={() => commitPayRename(i)}>Valider</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPayEditIdx(null)}>Annuler</Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="sys-row__label" style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{s}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" variant="ghost" onClick={() => { setPayEditIdx(i); setPayEditVal(s); }}>Renommer</Button>
                    <Button size="sm" variant="ghost" style={{ color: 'var(--copper-700)' }} onClick={() => removePay(i, s)}>Retirer</Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {payMethods.length === 0 && (
            <div className="sys-row" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
              Aucun mode de paiement — ajoutez le premier ci-dessous.
            </div>
          )}
        </div>

        <div className="sys-additem" style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Input
            value={newPay}
            onChange={(e) => setNewPay(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addPay(); }}
            placeholder="Nouveau mode — ex. Orange Money"
            style={{ flex: 1 }}
          />
          <Button variant="copper" onClick={addPay} disabled={!newPay.trim()}>Ajouter</Button>
        </div>
      </Card>

      {/* Ces deux réglages vivaient perdus dans la carte du rendez-vous — ils
          parlent de la Caisse et de la Gamme, pas du fauteuil (13 août). */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div className="sys-section__title">Devise étrangère & livraison</div>
        <div className="sys-section__cap">L’exception de la Caisse, et le geste de la Gamme.</div>
        {/* Exceptionnel, d'où une bascule : on l'ouvre le temps d'une facture,
            on la referme après. Fermée, la Caisse n'encaisse qu'en {currency}. */}
        <div className="sys-row">
          <div>
            <div className="sys-row__label">Paiement en devise étrangère</div>
            <div className="sys-row__sub">
              Ouvre à la Caisse le règlement dans une autre devise que le {currency} — la cliente
              paie en euros, en dollars… La facture reste en {currency} ; la devise reçue et son
              taux sont consignés. À refermer une fois la facture réglée.
            </div>
          </div>
          <Toggle on={!!settings.fxEnabled} onToggle={() => setSettings((s) => ({ ...s, fxEnabled: !s.fxEnabled }))} />
        </div>
        <div className="sys-row">
          <div>
            <div className="sys-row__label">Frais de livraison à domicile</div>
            <div className="sys-row__sub">Ajoutés en ligne à la commande produits sur Ma Couronne. 0 = livraison offerte.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="sys-select"
              type="number"
              min={0}
              step={500}
              value={settings.deliveryFeeXof}
              onChange={(e) => setDeliveryFee(e.target.value)}
              style={{ width: 96, textAlign: 'right', fontFamily: 'var(--font-serif)' }}
              aria-label="Frais de livraison à domicile en francs CFA"
            />
            <span className="sys-row__value">F</span>
          </div>
        </div>
      </Card>

      {/* ══ L'ÉQUIPE ════════════════════════════════════════════════ */}
      <Intertitre id="fam-equipe">L’équipe</Intertitre>

      {/* ── LA PREUVE DE PRÉSENCE ───────────────────────────────────
          Sans elle, le pointage n'est qu'une déclaration : rien n'empêche de
          l'écrire depuis son lit. La position d'abord — aucun geste quotidien —
          et le code en secours, parce qu'une journée de travail ne peut pas
          dépendre d'un satellite. */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div className="sys-section__title">Preuve de présence au pointage</div>
        <div className="sys-section__cap">
          Sans elle, « Arrivée » est une déclaration que rien ne vérifie. On demande d’abord la
          position du téléphone ; le code affiché au comptoir prend le relais quand le GPS refuse.
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 10px' }}>
          <button
            className={`tre-chip ${preuve.exigerPreuve ? '' : 'is-on'}`}
            onClick={() => setPreuve({ ...preuve, exigerPreuve: false })}
          >
            Confiance — aucune vérification
          </button>
          <button
            className={`tre-chip ${preuve.exigerPreuve ? 'is-on' : ''}`}
            onClick={() => setPreuve({ ...preuve, exigerPreuve: true })}
          >
            Vérifier la présence
          </button>
        </div>

        {preuve.exigerPreuve && (
          <>
            <div className="tr-grid tr-grid--2" style={{ marginTop: 6 }}>
              <Field label="Position du salon">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Input
                    value={preuve.lat !== undefined ? String(preuve.lat) : ''}
                    onChange={(e) => setPreuve({ ...preuve, lat: Number(e.target.value) || undefined })}
                    placeholder="latitude"
                    style={{ width: 118 }}
                  />
                  <Input
                    value={preuve.lng !== undefined ? String(preuve.lng) : ''}
                    onChange={(e) => setPreuve({ ...preuve, lng: Number(e.target.value) || undefined })}
                    placeholder="longitude"
                    style={{ width: 118 }}
                  />
                </div>
                {/* LA POSITION SE CAPTURE DEPUIS LE SALON — saisir des
                    coordonnées à la main est le meilleur moyen de se tromper
                    d'un chiffre et de rendre le pointage impossible. */}
                <button
                  className="tre-link-btn"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    if (!navigator.geolocation) { toast('Position indisponible sur cet appareil.'); return; }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setPreuve({
                          ...preuve,
                          lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
                          lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
                        });
                        toast('Position du salon enregistrée.');
                      },
                      () => toast('Position refusée — autorisez-la dans le navigateur.'),
                      { enableHighAccuracy: true, timeout: 8000 },
                    );
                  }}
                >
                  Utiliser ma position actuelle — à faire DEPUIS le salon
                </button>
              </Field>
              <Field label="Rayon accepté (mètres)">
                <Input
                  inputMode="numeric"
                  value={String(preuve.rayonM)}
                  onChange={(e) => setPreuve({ ...preuve, rayonM: Math.max(20, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 150) })}
                  style={{ width: 110, textAlign: 'right' }}
                />
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                  150 m est un bon départ : le GPS hésite de quelques dizaines de mètres en intérieur,
                  et un rayon trop serré refuserait des gens réellement présents.
                </div>
              </Field>
            </div>

            {/* LE BOUTON DU MATIN A DISPARU le 6 août. Il fallait le presser
                chaque jour — donc on l'oubliait, et le jour de l'oubli
                personne ne pouvait plus pointer sans GPS. Une vérification
                suspendue à un geste humain répété finit toujours par céder. */}
            <Field label="Code du jour">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 30, letterSpacing: '.22em', color: 'var(--color-indigo)' }}>
                  {codeAujourdhui || '— — — —'}
                </span>
                <button className="tre-link-btn" onClick={() => navigate('/comptoir')}>
                  Ouvrir l’affichage du comptoir
                </button>
              </div>
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.55 }}>
                Il se renouvelle seul chaque jour — rien à presser. Il ne sert qu’à celles et ceux
                dont le téléphone ne donne pas sa position ; ce qu’il prouve, c’est d’être passé
                le lire. Pose l’affichage du comptoir sur une tablette au salon, ou recopie ces
                quatre chiffres à la main.
              </div>
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.55 }}>
                L’équipe ne le voit jamais dans l’application : un code que le logiciel montre au
                téléphone qui s’en sert ne prouve plus rien.
              </div>
            </Field>
          </>
        )}
      </Card>

      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div className="sys-section__title">Accès ERP du personnel</div>
        <div className="sys-section__cap">
          Un membre rejoint le Trône avec son e-mail et son mot de passe, puis un souverain le
          rattache au personnel depuis Accès &amp; personnel — il entre avec exactement les droits
          de son rang, rien de plus. C’est là aussi qu’on ouvre à un maître les domaines
          supplémentaires dont il a besoin : le secrétariat et le fauteuil tiennent sur un seul
          compte, jamais sur deux.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {ROLE_DEFS.map((role) => (
            <div key={role.k} style={{ borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>{role.label}</div>
              <div className="sys-row__sub">{role.desc}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {DOMAINS.map((dom) => {
                  const on = role.perms.includes(dom.k);
                  return (
                    <span key={dom.k} className={`tre-chip ${on ? 'is-on' : ''}`} style={{ cursor: 'default', opacity: on ? 1 : 0.55 }}>
                      {dom.l}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ══ NOTIFICATIONS & AUTOMATISATIONS ═════════════════════════ */}
      <Intertitre id="fam-notifs">Notifications & automatisations</Intertitre>

      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div className="sys-section__title">Notifications</div>
        <div className="sys-section__cap">Qui est prévenu, et quand.</div>
        <ToggleRows rows={NOTIF_TOGGLES} />
      </Card>

      {/* ---------- Automatisations · IA ---------- */}
      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div className="sys-section__title">Automatisations · informations pour l’IA</div>
        <div className="sys-section__cap" style={{ maxWidth: 640 }}>
          Renseignez les liens et le texte utilisés par les messages automatiques (rappels, relances,
          invitations). Le Trône les insère tels quels dans les envois WhatsApp et SMS.
        </div>
        <div className="tr-grid tr-grid--2" style={{ marginTop: 8 }}>
          <label className="mnd-field">
            <span className="mnd-field__label">Lien de paiement Mobile Money</span>
            <Input value={autoCfg.momoLink} onChange={(e) => setAuto('momoLink', e.target.value)} placeholder="https://pay.moov-africa.bj/…" />
          </label>
          <label className="mnd-field">
            <span className="mnd-field__label">Lien Google Maps (itinéraire)</span>
            <Input value={autoCfg.mapsLink} onChange={(e) => setAuto('mapsLink', e.target.value)} placeholder="https://maps.google.com/?q=…" />
          </label>
          <label className="mnd-field" style={{ gridColumn: '1 / -1' }}>
            <span className="mnd-field__label">Lien Google Avis</span>
            <Input value={autoCfg.reviewLink} onChange={(e) => setAuto('reviewLink', e.target.value)} placeholder="https://g.page/r/…/review" />
          </label>
          <label className="mnd-field" style={{ gridColumn: '1 / -1' }}>
            <span className="mnd-field__label">Itinéraire · texte libre</span>
            <Textarea rows={2} value={autoCfg.itineraire} onChange={(e) => setAuto('itineraire', e.target.value)} placeholder="Ex. En face de la pharmacie Fifadji, portail vert, 2ᵉ étage." />
          </label>
        </div>
        <div style={{ marginTop: 4 }}>
          <Eyebrow>Insérés tels quels dans chaque envoi automatique</Eyebrow>
        </div>
      </Card>

      {/* ══ DONNÉES & ZONES SENSIBLES ═══════════════════════════════
          À LA FIN, délibérément : on ne croise pas « réinitialiser toute la
          Maison » en cherchant un horaire. Qui vient ici vient pour ça. */}
      <Intertitre id="fam-donnees">Données & zones sensibles</Intertitre>

      <Card className="sys-section" style={{ marginTop: 18 }}>
        <div className="sys-section__title">Accès & souveraineté</div>
        <div className="sys-section__cap">La Maison reste maîtresse de ses données.</div>
        <ToggleRows rows={ACCES_TOGGLES} />
        <FieldRowView l="Hébergement des données" v="Souverain · Afrique de l’Ouest" />
      </Card>

      {/* ---------- Sauvegarde de la Maison ---------- */}
      <SauvegardeCard />

      {/* ---------- Zone sensible — annuler les encaissements ---------- */}
      <ResetEncaissementsCard />

      {/* ---------- Zone sensible — vider tous les rendez-vous ---------- */}
      <ViderRdvCard />

      {/* ---------- Zone critique — réinitialiser toute la Maison ---------- */}
      <FactoryResetCard />
    </div>
  );
}
