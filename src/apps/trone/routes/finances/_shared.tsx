/* Finances — utilitaires de dates & de mois, navigation mensuelle et export CSV,
   partagés par les trois écrans. Plus le registre des encaissements, lu par
   Encaissements ET par Dépenses (voir `useRegistreEncaissements`, en bas). */

import { useMemo, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { useInvoices, usePayments, useCredits, type PieceJointe } from '../../../../shared/finance';
import { deposerFichier, adresseSignee, poidsEnClair } from '../../../../shared/fil';
import { useAppointments } from '../../../../shared/agenda';
import { useClients } from '../../../../shared/clients';
import { useApprenants, useSubscribers } from '../equipe/data';
import { buildReceipts, type Receipt } from '../../../../shared/receipts';
import { apptLabel, useServicesById } from '../clients/_shared';

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ── LE JOUR D’UN MOUVEMENT — remis d'aplomb le 23 août 2026 ───────
   « Toutes les caisses sont au 23 août. » Elles ne l’étaient pas : le relevé
   les DATAIT toutes d’aujourd’hui. `fmtDay` y était écrit
   `new Date().toLocaleDateString(...)` au lieu de `new Date(iso)` — il
   ignorait la date qu’on lui passait et rendait celle du jour, pour chaque
   ligne de chaque caisse. Faute de copie, née en extrayant `tiroirs.tsx` des
   Dépenses le 22 août : les Dépenses et la Synthèse, elles, avaient la bonne.

   ELLE VIT DÉSORMAIS ICI, une seule fois. Trois copies d’une même fonction,
   c’est trois occasions d en casser une sans que les autres le disent.

   `T00:00:00` force une lecture LOCALE : sans lui, « 2026-08-22 » se lit à
   minuit UTC et retombe la veille dans tout fuseau négatif. */
export const fmtDay = (iso: string): string =>
  (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');

/** Clé mois `AAAA-MM` d'une date ISO. */
export const monthKey = (iso: string): string => iso.slice(0, 7);

/** Nom du mois en toutes lettres, ex. « juin ». */
export const monthLabel = (mk: string): string =>
  new Date(`${mk}-15T00:00:00`).toLocaleDateString('fr-FR', { month: 'long' });

/** Nom court du mois, ex. « juil. » — pour les axes de graphe. */
export const monthShort = (mk: string): string =>
  new Date(`${mk}-15T00:00:00`).toLocaleDateString('fr-FR', { month: 'short' });

/** « juillet 2026 » — titre du mois pour la navigation. */
export const monthTitle = (mk: string): string =>
  new Date(`${mk}-15T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

/** Décale une clé mois de `delta` mois. */
export const shiftMonth = (mk: string, delta: number): string => {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Les `n` derniers mois jusqu'à `mk` inclus, du plus ancien au plus récent. */
export const lastMonths = (mk: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => shiftMonth(mk, -(n - 1 - i)));

/** Rythme du mois × jours du mois — prévision simple, comme sur les prototypes. */
export const paceForecast = (soFar: number, dayOfMonth: number, daysInMonth: number): number =>
  Math.round((soFar / Math.max(1, dayOfMonth)) * daysInMonth);

/* ---------- Export CSV ---------- */

/** Télécharge des lignes en CSV « Excel-FR » : point-virgule, BOM UTF-8, CRLF. */
export const downloadCsv = (filename: string, rows: (string | number)[][]): void => {
  const esc = (v: string | number) => {
    let s = String(v);
    /* NEUTRALISER LES FORMULES. Excel et LibreOffice exécutent toute cellule qui
       commence par = + - @ ou une tabulation. Ces exports embarquent du texte
       libre — nom de cliente, libellé de dépense, référence — donc une fiche
       nommée « =HYPERLINK(...) » s'exécutait à l'ouverture du fichier chez qui
       le recevait. L'apostrophe de tête est la convention du tableur : elle
       force le texte et ne s'affiche pas dans la cellule. */
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/* ---------- Navigation ‹ mois › ---------- */

/** Sélecteur de mois partagé — Synthèse & Dépenses. Retour rapide au mois courant. */
export function MonthNav({ month, onChange }: { month: string; onChange: (mk: string) => void }) {
  const current = monthKey(todayISO());
  return (
    <div className="trf-monthnav" role="group" aria-label="Choisir le mois">
      <button className="trf-monthnav__btn" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Mois précédent">‹</button>
      <span className="trf-monthnav__label">{monthTitle(month)}</span>
      <button className="trf-monthnav__btn" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Mois suivant">›</button>
      {month !== current && (
        <button className="trf-monthnav__today" onClick={() => onChange(current)}>Ce mois</button>
      )}
    </div>
  );
}

/* ---------- Le registre des encaissements, à UNE seule source ---------- */

/** TOUT CE QUI EST ENTRÉ, assemblé une fois pour toutes.

    Le registre se construisait entièrement dans Encaissements ; le jour où
    Dépenses a eu besoin de nommer les revenus qui paient une sortie, recopier
    l'assemblage aurait créé un second registre — et deux registres finissent
    toujours par diverger. C'est exactement ce qui venait d'arriver aux dépôts
    d'avoir : Dépenses créditait la caisse nommée, le registre affichait « Hors
    caisse », et personne ne pouvait dire lequel avait raison.

    Les deux écrans lisent désormais la même chose, par la même porte. */
export function useRegistreEncaissements(): Receipt[] {
  const { branch } = useBranch();
  const [invoices] = useInvoices();
  const [online] = usePayments();
  const [appointments] = useAppointments();
  const [credits] = useCredits();
  const [apprenants] = useApprenants();
  const [subscribers] = useSubscribers();
  const [clients] = useClients();
  const byId = useServicesById();
  return useMemo(
    () => buildReceipts({
      branchId: branch.id,
      invoices,
      online,
      appointments,
      credits,
      formation: apprenants,
      abonnements: subscribers.map((s) => ({ id: s.id, clientId: s.clientId, name: s.name, payments: s.payments })),
      nameOf: (id) => clients.find((c) => c.id === id)?.name ?? 'Cliente de passage',
      apptLabel: (a) => apptLabel(a, byId),
    }),
    [branch.id, invoices, online, appointments, credits, apprenants, subscribers, clients, byId],
  );
}

/* ── JOINDRE UN FICHIER OU UNE PHOTO — 23 août 2026 ─────────────────
   « Après note, j'aimerais attacher un fichier ou une photo. » Un reçu, un
   bordereau, la capture d'un virement : la preuve de ce qui est écrit.

   RIEN DE NEUF SOUS LA MAIN. Le Fil dépose des pièces depuis le 18 août
   (migration 0059) dans un compartiment PRIVÉ, ouvert au seul personnel
   connecté, chaque fichier servi par un jeton d'une heure. On y range les
   pièces des caisses et des dépenses sous leur propre dossier — un second
   compartiment aux politiques identiques aurait doublé la surface à protéger
   sans rien gagner.

   LE DÉPÔT SE FAIT AU CHOIX DU FICHIER, pas à l'enregistrement de la ligne :
   sinon un formulaire abandonné laisserait croire que la pièce est là. La
   conséquence assumée est qu'un fichier choisi puis abandonné reste dans le
   compartiment — un octet oublié coûte moins qu'une preuve perdue.

   IL NE BLOQUE JAMAIS L'ÉCRITURE. Dépôt refusé, hors ligne, fichier trop
   lourd : on le DIT, et la ligne s'enregistre sans sa pièce. Perdre une vente
   parce qu'une photo n'est pas passée serait le pire des échanges. */
export function ChampPieceJointe({
  branchId, dossier, valeur, onChange,
}: {
  branchId: string;
  /** Le sous-dossier du compartiment : « caisse », « depense »… */
  dossier: string;
  valeur?: PieceJointe;
  onChange: (p?: PieceJointe) => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const [souci, setSouci] = useState('');

  const choisir = async (f?: File | null) => {
    if (!f) return;
    setSouci('');
    /* Le compartiment refuse au-delà de 10 Mo (0059). Le dire AVANT le voyage
       vaut mieux qu'un refus du serveur trente secondes plus tard. */
    if (f.size > 10 * 1024 * 1024) {
      setSouci(`« ${f.name} » pèse ${poidsEnClair(f.size)} — la limite est de 10 Mo.`);
      return;
    }
    setEnCours(true);
    const pose = await deposerFichier(branchId, f, dossier);
    setEnCours(false);
    if (!pose) {
      setSouci('Le dépôt n’a pas abouti — sans connexion, la pièce ne peut pas être déposée. L’écriture s’enregistre quand même.');
      return;
    }
    onChange(pose);
  };

  const ouvrir = async () => {
    if (!valeur) return;
    const url = await adresseSignee(valeur.chemin);
    if (url) window.open(url, '_blank', 'noopener');
    else setSouci('La pièce n’a pas pu être ouverte — réessayez dans un instant.');
  };

  return (
    <label className="mnd-field">
      <span className="mnd-field__label">Joindre un fichier ou une photo · facultatif</span>
      {valeur ? (
        <div className="trf-piece">
          <span className="trf-piece__nom">{valeur.nom}</span>
          <span className="trf-piece__poids">{poidsEnClair(valeur.taille)}</span>
          <button type="button" className="trf-piece__acte" onClick={() => void ouvrir()}>Voir</button>
          <button
            type="button"
            className="trf-piece__acte trf-piece__acte--oter"
            onClick={() => { onChange(undefined); setSouci(''); }}
          >
            Retirer
          </button>
        </div>
      ) : (
        <input
          className="mnd-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          disabled={enCours}
          onChange={(e) => { void choisir(e.target.files?.[0]); e.target.value = ''; }}
        />
      )}
      <span className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
        {enCours
          ? 'Dépôt en cours…'
          : 'Photo ou PDF, 10 Mo au plus. La pièce dort dans le compartiment privé de la Maison —'
            + ' elle ne s’ouvre qu’au personnel connecté, par une adresse valable une heure.'}
      </span>
      {souci && (
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--copper-700)', marginTop: 6, display: 'block', lineHeight: 1.5 }}>
          {souci}
        </span>
      )}
    </label>
  );
}

