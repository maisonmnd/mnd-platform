/* LES PRÊTS — leur propre écran, 23 août 2026.

   « Les prêts sont des mouvements qui n'ont rien à voir avec Foyer des
   clients, compte famille, et les avoirs. Retire-les de là et crée-leur un
   onglet à part. » Elle a raison, et le rangement était de moi : les prêts
   sont nés sous Comptes & Avoirs parce que la dette et l'avoir se ressemblent
   de loin. De près, tout les sépare. Un avoir est de l'argent que la MAISON
   DOIT à une cliente, porté par un compte client ; un prêt est de l'argent
   qu'ON DOIT À LA MAISON, et l'emprunteur n'est pas forcément une cliente —
   un membre de l'équipe, un associé, un tiers, le foyer.

   PUIS : « Crée-moi une gestion sans faille. » Maquette validée
   (`public/maquette-les-prets.html`). L'écran ne faisait que CONSTATER — ce
   qui est sorti, ce qui est rentré. Il lui manquait la seule chose qui permet
   de réclamer : QUAND l'argent doit revenir. Le calcul vit dans `foyer.ts`
   (`etatsDesEmprunteurs`), éprouvé par `verifie-foyer` ; cet écran ne fait que
   le montrer, dans l'ordre de l'urgence. */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { useCashboxes, usePaymentMethods, moyensAOffrir } from '../../../../shared/finance';
import { useClients } from '../../../../shared/clients';
import { signeLeMessage } from '../../../../shared/identite';
import {
  usePrets, detteEnCours, etatsDesEmprunteurs, parUrgence, joursEntre,
  type EtatEmprunteur, type GenreEmprunteur, type Pret,
} from '../../../../shared/foyer';
import { useStaff, waLink } from '../equipe/data';
import { ClientPicker } from '../clients/_shared';
import {
  ContrepartieMaison, montantsDuTiroir, libelleDuMontant, nettoieLeMontant,
  useCaissesOuvertes, EcranVerrouille, ReglerLeVerrou, CLE_PRETS,
} from './tiroirs';
import { useSettings, settingsStore } from '../../../../shared/settings';
import { todayISO } from './_shared';
import { LesObjectifs } from './objectifs';
import './finances.css';

/** Le genre d'un emprunteur, en français — ce que l'œil lit sur la carte. */
const LIBELLE_GENRE: Record<GenreEmprunteur, string> = {
  foyer: 'foyer', associe: 'associé', equipe: 'équipe', cliente: 'cliente', tiers: 'tiers',
};

const frJour = (iso: string): string =>
  (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—');

const frLong = (iso: string): string =>
  (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

/** « dans 13 jours », « en retard de 8 jours », « aujourd'hui ». */
const delai = (aujourdhui: string, date: string): string => {
  const j = joursEntre(aujourdhui, date);
  if (j === 0) return "aujourd'hui";
  if (j > 0) return `dans ${j} jour${j > 1 ? 's' : ''}`;
  return `en retard de ${-j} jour${-j > 1 ? 's' : ''}`;
};

type Filtre = 'retard' | 'proche' | 'cours' | 'sans' | 'soldes';

export default function Prets() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [staff] = useStaff();
  const aujourdhui = todayISO();

  /* ── LE VERROU DE L’ÉCRAN — 23 août 2026 ──────────────────────────
     Troisième écran à le demander, après les caisses et le coffre : ce que
     la Maison doit à la Maison ne regarde pas plus la salle que ses tiroirs.
     Même pièce partagée, aucun verrou recopié. Sans code posé, la porte reste
     ouverte — une mise à jour ne doit enfermer personne dehors. */
  const [reglages] = useSettings();
  const ouvertesIci = useCaissesOuvertes();
  const ecranVerrouille = !!reglages.codePretsHash && !ouvertesIci.has(CLE_PRETS);
  const [verrouOuvert, setVerrouOuvert] = useState(false);

  /* ── DEUX REGISTRES SUR UN MÊME ÉCRAN — 23 août 2026 ──────────────
     « Les objectifs devraient aller dans l’onglet des prêts, car il y a des
     apports et des remboursements qui se font à ce niveau. » Un prêt et un
     objectif sont la même figure : une cible, des mouvements dans le temps,
     un reste à faire. L argent, lui, ne déménage pas — un objectif flèche
     toujours ce qui dort au coffre. Seul l’endroit où on le lit a changé.

     LE COFFRE Y RENVOIE par `?onglet=objectifs` : arriver sur le bon onglet
     vaut mieux qu’arriver à côté et devoir chercher. */
  const [params, setParams] = useSearchParams();
  const [registre, setRegistre] = useState<'prets' | 'objectifs'>(
    params.get('onglet') === 'objectifs' ? 'objectifs' : 'prets',
  );
  const choisirLeRegistre = (k: 'prets' | 'objectifs') => {
    setRegistre(k);
    /* Le paramètre s’efface : recharger ne doit pas ramener un onglet qu’on
       vient de quitter. */
    if (params.get('onglet')) { const p2 = new URLSearchParams(params); p2.delete('onglet'); setParams(p2, { replace: true }); }
  };

  const [prets, setPrets] = usePrets();
  const etats = useMemo(
    () => etatsDesEmprunteurs(prets, branch.id, aujourdhui).sort(parUrgence),
    [prets, branch.id, aujourdhui],
  );
  const dette = detteEnCours(prets, branch.id);

  /* LES QUATRE CHIFFRES. Trois informent, un seul alarme — celui du retard.
     Les mettre au même niveau, c'est n'en signaler aucun. */
  const vivants = etats.filter((e) => e.reste > 0);
  const totalPrete = vivants.reduce((n, e) => n + e.prete, 0);
  const totalRembourse = etats.reduce((n, e) => n + e.rembourse, 0);
  const enRetard = vivants.filter((e) => e.retardJours > 0);
  const montantEnRetard = enRetard.reduce(
    (n, e) => n + e.attendus.filter((a) => a.date < aujourdhui).reduce((s, a) => s + a.montantXof, 0), 0,
  );
  const proches = vivants.filter((e) => e.retardJours === 0 && e.prochaine
    && joursEntre(aujourdhui, e.prochaine.date) <= 15);
  const sansDate = vivants.filter((e) => e.sansEcheance);
  const soldes = etats.filter((e) => e.reste <= 0);

  const [filtre, setFiltre] = useState<Filtre>('cours');
  const listeDe = (f: Filtre): EtatEmprunteur[] => (
    f === 'retard' ? enRetard
      : f === 'proche' ? proches
        : f === 'sans' ? sansDate
          : f === 'soldes' ? soldes
            : vivants);
  const liste = listeDe(filtre);

  /* ── Poser, corriger, effacer une ligne ── */
  const [pretOuvert, setPretOuvert] = useState(false);
  const [pretEdite, setPretEdite] = useState<Pret | null>(null);
  const [moyensPose] = usePaymentMethods();
  const [fPret, setFPret] = useState({
    type: 'pret' as 'pret' | 'remboursement',
    genre: 'equipe' as GenreEmprunteur,
    nom: '', personneId: '', motif: '', montant: '',
    cashbox: '', method: 'Espèces', date: todayISO(), enDevise: '',
    /* « Quand doit-il revenir ? » — le champ qui manquait. */
    retour: 'sans' as 'sans' | 'une' | 'plusieurs',
    echeance: '', nombre: '3', premier: '',
    retenue: '',
  });

  const corrigerLePret = (p: Pret) => {
    setFPret({
      type: p.type,
      genre: (p.genre ?? 'tiers') as GenreEmprunteur,
      nom: p.associe, personneId: p.personneId ?? '',
      motif: p.motif ?? '',
      cashbox: p.cashbox ?? '', method: p.method ?? 'Espèces', date: p.date.slice(0, 10),
      montant: p.fx ? String(p.fx.amount) : String(p.amountXof),
      enDevise: p.fx ? String(p.amountXof) : '',
      retour: p.echeancier ? 'plusieurs' : p.echeance ? 'une' : 'sans',
      echeance: p.echeance ?? '',
      nombre: String(p.echeancier?.nombre ?? 3),
      premier: p.echeancier?.premier ?? '',
      retenue: p.retenueXof ? String(p.retenueXof) : '',
    });
    setPretEdite(p);
  };
  const effacerLePret = () => {
    if (!pretEdite) return;
    setPrets((prev) => prev.filter((x) => x.id !== pretEdite.id));
    setPretEdite(null);
  };
  /* ENCAISSER UN REMBOURSEMENT part de l'emprunteur, pré-rempli du reste dû :
     le geste le plus fréquent ne doit pas demander de retaper un nom. */
  const encaisserPour = (e: EtatEmprunteur) => {
    setFPret((f) => ({
      ...f,
      type: 'remboursement', genre: e.genre, nom: e.nom, personneId: e.personneId ?? '',
      motif: 'Remboursement', montant: String(e.prochaine?.montantXof ?? e.reste),
      enDevise: '', date: todayISO(),
      retour: 'sans', echeance: '', premier: '', retenue: '',
    }));
    setPretEdite(null);
    setPretOuvert(true);
  };

  const [toutesCaisses] = useCashboxes();
  const caissesMaison = toutesCaisses.filter((c) => c.branchId === branch.id);
  const caisseDuPret = caissesMaison.find((c) => c.name === fPret.cashbox);
  const montantsPret = montantsDuTiroir(caisseDuPret, currency, fPret.montant, fPret.enDevise);

  const enregistrerPret = () => {
    const montant = montantsPret.xof;
    const nom = fPret.nom.trim();
    /* ══ UN REFUS SE DIT — 3 septembre 2026 ════════════════════════════
       « Je n'arrive pas à enregistrer de nouveaux prêts » (Yéman).

       LE GARDE RETOURNAIT EN SILENCE. Le bouton restait là, le clic ne faisait
       rien, et rien ne disait ce qui manquait : le nom, le montant, ou les
       deux. C'est la même faute que le formulaire des formules le 28 août, et
       elle coûte le même temps — on reclique, on recommence, on croit l'écran
       cassé.

       ON NOMME CE QUI BLOQUE, et rien d'autre. */
    if (!nom) {
      toast(fPret.genre === 'cliente'
        ? 'Choisissez la tête couronnée à qui la Maison prête.'
        : 'Nommez la personne : un prêt sans nom ne se réclame à personne.');
      return;
    }
    if (montantsPret.saisi <= 0 || montant <= 0) {
      toast('Portez le montant : un prêt de zéro ne déplace aucun argent.');
      return;
    }
    const estPret = fPret.type === 'pret';
    const ligne: Pret = {
      id: pretEdite?.id ?? `prt-${uid()}`,
      branchId: branch.id,
      date: fPret.date || todayISO(),
      type: fPret.type,
      associe: nom,
      motif: fPret.motif.trim() || (estPret ? 'Prêt' : 'Remboursement'),
      amountXof: montant,
      genre: fPret.genre,
      personneId: fPret.personneId || undefined,
      cashbox: fPret.cashbox || undefined,
      method: fPret.method || undefined,
      fx: montantsPret.fx,
      /* L'ÉCHÉANCE N'A DE SENS QUE SUR UN PRÊT : un remboursement est le
         paiement d'une attente, il n'en crée pas une nouvelle. */
      echeance: estPret && fPret.retour === 'une' && fPret.echeance ? fPret.echeance : undefined,
      echeancier: estPret && fPret.retour === 'plusieurs' && fPret.premier
        ? { nombre: Math.max(2, parseInt(fPret.nombre || '2', 10) || 2), premier: fPret.premier }
        : undefined,
      retenueXof: estPret && fPret.genre === 'equipe' && fPret.retenue
        ? (parseInt(fPret.retenue.replace(/[^0-9]/g, ''), 10) || 0) || undefined
        : undefined,
    };
    if (pretEdite) {
      setPrets((prev) => prev.map((x) => (x.id === pretEdite.id ? ligne : x)));
      setPretEdite(null);
      toast('Ligne corrigée.');
    } else {
      setPrets((prev) => [...prev, ligne]);
      setPretOuvert(false);
      /* UNE RÉUSSITE QUI NE DIT RIEN RESSEMBLE À UN ÉCHEC. La modale se fermait
         sans un mot ; si la nouvelle ligne tombait hors du filtre en cours, on
         ne voyait rien du tout et l'on croyait que l'enregistrement avait
         échoué. On le dit, et ON RAMÈNE L'ÉCRAN LÀ OÙ ELLE SE VOIT. */
      setFiltre('cours');
      toast(estPret
        ? `${fmtMoney(montant, currency)} prêtés à ${nom}.`
        : `${fmtMoney(montant, currency)} rendus par ${nom}.`);
    }
    setFPret((f) => ({ ...f, nom: '', personneId: '', motif: '', montant: '', enDevise: '', retenue: '' }));
  };

  /* ── La relance ── */
  const telephoneDe = (e: EtatEmprunteur): string => {
    if (e.genre === 'cliente' && e.personneId) return clients.find((c) => c.id === e.personneId)?.phone ?? '';
    if (e.genre === 'equipe') {
      const m = staff.find((x) => x.id === e.personneId || x.name.trim().toLowerCase() === e.nom.toLowerCase());
      return m?.phone ?? '';
    }
    const c = clients.find((x) => x.name.trim().toLowerCase() === e.nom.toLowerCase());
    return c?.phone ?? '';
  };
  /* UNE RELANCE COURTE SE LIT ; UNE LONGUE S'IGNORE. Le montant, la date, rien
     d'autre — et la devise de la Maison en signature, comme tout message. */
  const messageDeRelance = (e: EtatEmprunteur): string => signeLeMessage(
    `Bonjour ${e.nom.split(' ')[0]}, un petit rappel de la Maison : il reste ${fmtMoney(e.reste, currency)} `
    + (e.prochaine
      ? `sur votre prêt, dont ${fmtMoney(e.prochaine.montantXof, currency)} attendus le ${frLong(e.prochaine.date)}.`
      : 'sur votre prêt.')
    + ' Merci de nous dire ce qui vous arrange.',
  );

  /* ── LE RATTRAPAGE, UNE SEULE FOIS ─────────────────────────────────
     Les prêts d'avant aujourd'hui ne portent aucune date de retour. Le panneau
     les présente en bloc pour les dater — et disparaît dès qu'il n'y a plus
     rien à dater, sans réglage ni bouton « ne plus afficher ». */
  const [rattrapageOuvert, setRattrapageOuvert] = useState(true);
  /* ══ LE SENS AVANT LE MOT — 3 septembre 2026 ═══════════════════════
     « Tout est mélangé. Besoin de voir une différence nette entre les
     remboursements et les prêts » (Yéman).

     LE SENS NE SE LISAIT QUE DANS UN MOT. « Prêté » et « Remboursé » ouvraient
     la ligne, et le montant restait à droite, dans la même couleur, sans
     signe : l'œil ne pouvait pas trier, il devait lire chaque ligne. Sur un
     registre d'argent, une erreur de sens ne se rattrape pas à l'œil, elle se
     découvre au moment de réclamer.

     Le filtre vit PAR EMPRUNTEUR : on regarde le fil de quelqu'un, pas celui de
     la Maison, et un filtre commun se serait appliqué à des cartes qu'on
     n'était pas en train de lire. */
  const [sensVu, setSensVu] = useState<Record<string, 'tout' | 'sorti' | 'rentre'>>({});

  const carte = (e: EtatEmprunteur) => {
    const lignes = prets
      .filter((p) => p.branchId === branch.id && p.associe.trim().toLowerCase() === e.nom.toLowerCase())
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const part = e.prete > 0 ? Math.min(100, Math.round((e.rembourse / e.prete) * 100)) : 0;
    const tel = telephoneDe(e);
    return (
      <Card key={e.nom} className={`trf-pret ${e.retardJours > 0 ? 'trf-pret--retard' : ''} ${e.reste <= 0 ? 'trf-pret--solde' : ''}`}>
        <div className="trf-pret__tete">
          <span className="trf-pret__nom">{e.nom}</span>
          <span className="trf-tag">{LIBELLE_GENRE[e.genre] ?? e.genre}</span>
          {e.retardJours > 0 && <span className="trf-tag trf-tag--brique">en retard</span>}
          {e.retenueXof > 0 && <span className="trf-tag trf-tag--vert">retenu sur salaire</span>}
          {e.reste <= 0 && <span className="trf-tag trf-tag--vert">soldé</span>}
          <span className="trf-pret__reste">
            <em>{e.reste > 0 ? 'Reste dû' : 'Soldé'}</em>
            <b>{fmtMoney(e.reste, currency)}</b>
          </span>
        </div>

        <div className="trf-jauge"><i style={{ width: `${part}%` }} /></div>
        <div className="trf-jauge__mot">
          <span>prêté {fmtMoney(e.prete, currency)} · remboursé {fmtMoney(e.rembourse, currency)}</span>
          <span>{part} %</span>
        </div>

        {e.reste > 0 && (
          e.prochaine ? (
            <div className={`trf-echeance ${e.retardJours > 0 ? 'trf-echeance--brique' : ''}`}>
              {e.prochaine.sur > 1
                ? `Échéancier · versement ${e.prochaine.rang} sur ${e.prochaine.sur}, ${fmtMoney(e.prochaine.montantXof, currency)} le ${frLong(e.prochaine.date)}, ${delai(aujourdhui, e.prochaine.date)}.`
                : `Attendu le ${frLong(e.prochaine.date)}, ${delai(aujourdhui, e.prochaine.date)}.`}
            </div>
          ) : (
            <div className="trf-echeance trf-echeance--nu">
              Aucune date de retour. Un prêt sans échéance ne se réclame pas, il s’oublie.
            </div>
          )
        )}
        {e.retenueXof > 0 && (
          <div className="trf-echeance trf-echeance--vert">
            {fmtMoney(e.retenueXof, currency)} proposés en retenue sur chaque bulletin, l’argent
            n’est jamais sorti de la Maison, aucune caisse ne bouge.
          </div>
        )}

        {e.reste > 0 && (
          <div className="trf-pret__gestes">
            <Button variant="copper" onClick={() => encaisserPour(e)}>Encaisser un remboursement</Button>
            {tel && (
              <a className="trf-act trf-act--ghost" style={{ textDecoration: 'none' }}
                href={waLink(tel, messageDeRelance(e))} target="_blank" rel="noopener noreferrer">
                Relancer sur WhatsApp
              </a>
            )}
          </div>
        )}

        {/* ══ TROIS BLOCS, JAMAIS UN SEUL FIL ═══════════════════════════
            Ce qui est ATTENDU, ce qui est SORTI, ce qui est RENTRÉ. Les trois se
            suivaient dans une même colonne, du même côté, dans la même couleur :
            l'avenir se mêlait à l'histoire, et les deux sens de l'argent se
            ressemblaient. Une chose qui n'est pas encore arrivée n'a rien à
            faire dans un registre de ce qui s'est passé — c'est ainsi qu'on
            finit par compter deux fois. */}
        <div className="trf-pret__lignes">
          {e.attendus.length > 0 && (
            <div className="trf-pret__titre">Attendu</div>
          )}
          {e.attendus.slice(0, 3).map((a) => (
            <div className="trf-pret__ligne trf-pret__ligne--attendu" key={`${a.pretId}-${a.rang}`}>
              <span className="trf-pret__sens" aria-hidden="true">·</span>
              <span className="trf-pret__quoi">
                {frJour(a.date)}
                {a.sur > 1 ? ` · ${a.rang}ᵉ versement sur ${a.sur}` : ''}
                {a.date < aujourdhui ? ' · en souffrance' : ''}
              </span>
              <span className="trf-pret__m">{fmtMoney(a.montantXof, currency)}</span>
            </div>
          ))}

          {lignes.length > 0 && (() => {
            const vu = sensVu[e.nom] ?? 'tout';
            const montrees = lignes.filter((p) => vu === 'tout'
              || (vu === 'sorti' ? p.type === 'pret' : p.type === 'remboursement'));
            return (
              <>
                <div className="trf-pret__titre trf-pret__titre--fil">
                  <span>Ce qui s’est passé</span>
                  {/* LE FILTRE NE CACHE JAMAIS UN TOTAL, il ne trie qu'un fil :
                      le reste dû et la barre restent au-dessus, intacts. */}
                  <span className="trf-pret__filtres">
                    {([['tout', 'Tout'], ['sorti', 'Sorti'], ['rentre', 'Rentré']] as const).map(([k, mot]) => (
                      <button
                        key={k} type="button"
                        className={`trf-pret__filtre ${vu === k ? 'is-on' : ''}`}
                        onClick={() => setSensVu((prev) => ({ ...prev, [e.nom]: k }))}
                      >{mot}</button>
                    ))}
                  </span>
                </div>
                {montrees.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`trf-pret__ligne trf-pret__ligne--clic ${p.type === 'pret' ? 'is-sorti' : 'is-rentre'}`}
                    onClick={() => corrigerLePret(p)}
                    title="Corriger ou effacer cette ligne"
                  >
                    {/* TROIS INDICES POUR LA MÊME CHOSE : la flèche, la couleur,
                        le signe. Un seul se rate ; trois, non. */}
                    <span className="trf-pret__sens" aria-hidden="true">{p.type === 'pret' ? '↓' : '↑'}</span>
                    <span className="trf-pret__quoi">
                      {p.type === 'pret' ? 'Prêté' : 'Remboursé'}
                      {' · '}{frJour(p.date)}
                      {p.motif ? ` · ${p.motif}` : ''}
                      {p.cashbox ? <i> · {p.cashbox}</i> : null}
                    </span>
                    <span className="trf-pret__m">
                      {p.type === 'pret' ? '−' : '+'} {fmtMoney(p.amountXof, currency)}
                    </span>
                  </button>
                ))}
                {montrees.length === 0 && (
                  <div className="trf-pret__ligne trf-pret__ligne--attendu">
                    <span className="trf-pret__sens" aria-hidden="true">·</span>
                    <span className="trf-pret__quoi">
                      {vu === 'sorti' ? 'Rien n’est sorti pour cette personne.' : 'Rien n’est encore rentré.'}
                    </span>
                    <span className="trf-pret__m" />
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </Card>
    );
  };

  if (ecranVerrouille) {
    return <EcranVerrouille titre="Les prêts sont verrouillés." cle={CLE_PRETS} hash={reglages.codePretsHash} />;
  }

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Finances"
        title="Les prêts."
        sub="Ce que la Maison a prêté et ce qu’on lui doit encore. Un prêt sort d’une caisse, un remboursement y rentre, l’argent se déplace, il ne se duplique pas."
        actions={(
          <>
            <Button variant="ghost" onClick={() => setVerrouOuvert(true)}>
              {reglages.codePretsHash ? 'Code de l’écran' : 'Protéger cet écran'}
            </Button>
            <Button variant="copper" onClick={() => { setPretEdite(null); setPretOuvert(true); }}>+ Prêt ou remboursement</Button>
          </>
        )}
      />

      {/* Les deux registres — ce qu’on nous doit d’un côté, ce qu’on prépare
          de l’autre. Deux figures proches, jamais additionnées. */}
      <div style={{ display: 'flex', gap: 26, borderBottom: '1px solid var(--hairline)', margin: '0 0 18px' }}>
        {([
          ['prets' as const, 'Les prêts', fmtMoney(dette, currency)],
          ['objectifs' as const, 'Les objectifs', ''],
        ] as ['prets' | 'objectifs', string, string][]).map(([k, mot, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => choisirLeRegistre(k)}
            aria-current={registre === k ? 'page' : undefined}
            style={{
              appearance: 'none', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit',
              padding: '10px 2px', display: 'inline-flex', alignItems: 'baseline', gap: 9,
              fontSize: 14.5, color: registre === k ? 'var(--color-indigo)' : 'var(--ink-soft)',
              fontWeight: registre === k ? 600 : 400,
              borderBottom: `2px solid ${registre === k ? 'var(--color-copper)' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {mot}
            {n ? <span className="mnd-muted" style={{ fontSize: 12 }}>{n}</span> : null}
          </button>
        ))}
      </div>

      {registre === 'objectifs' ? <LesObjectifs /> : (
      <>
      {etats.length === 0 ? (
        <Card style={{ padding: 22 }}>
          <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
            <b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>Aucun prêt enregistré.</b><br />
            Une avance sur salaire, un dépannage, un prêt au foyer : notez-le ici, avec la date à
            laquelle l’argent doit revenir. Chaque remboursement viendra s’imputer dessus, et le
            solde de chacun se tiendra tout seul.
          </div>
        </Card>
      ) : (
        <>
          <div className="trf-pret-bandeau">
            <div className="trf-pret-stat">
              <div className="trf-pret-stat__l">Prêté · en cours</div>
              <div className="trf-pret-stat__v">{fmtMoney(totalPrete, currency)}</div>
              <div className="trf-pret-stat__s">{vivants.length} emprunteur{vivants.length > 1 ? 's' : ''}</div>
            </div>
            <div className="trf-pret-stat">
              <div className="trf-pret-stat__l">Remboursé</div>
              <div className="trf-pret-stat__v trf-pret-stat__v--vert">{fmtMoney(totalRembourse, currency)}</div>
              <div className="trf-pret-stat__s">
                {totalPrete > 0 ? `${Math.round((totalRembourse / (totalPrete || 1)) * 100)} % du prêté` : '—'}
              </div>
            </div>
            <div className="trf-pret-stat">
              <div className="trf-pret-stat__l">Reste dû</div>
              <div className="trf-pret-stat__v">{fmtMoney(dette, currency)}</div>
              <div className="trf-pret-stat__s">envers la Maison</div>
            </div>
            <div className={`trf-pret-stat ${enRetard.length > 0 ? 'trf-pret-stat--alerte' : ''}`}>
              <div className="trf-pret-stat__l">En retard</div>
              <div className={`trf-pret-stat__v ${enRetard.length > 0 ? 'trf-pret-stat__v--brique' : ''}`}>
                {fmtMoney(montantEnRetard, currency)}
              </div>
              <div className="trf-pret-stat__s">
                {enRetard.length === 0 ? 'rien à réclamer' : `${enRetard.length} prêt${enRetard.length > 1 ? 's' : ''} · depuis ${enRetard[0].retardJours} jour${enRetard[0].retardJours > 1 ? 's' : ''}`}
              </div>
            </div>
          </div>

          {/* LE RATTRAPAGE — une seule fois, et il s’efface de lui-même. */}
          {rattrapageOuvert && sansDate.length > 0 && (
            <Card style={{ padding: 18, marginTop: 16, borderLeft: '3px solid var(--color-copper)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div style={{ maxWidth: '62ch' }}>
                  <div className="mnd-serif" style={{ fontSize: 19, color: 'var(--color-indigo)' }}>
                    {sansDate.length} prêt{sansDate.length > 1 ? 's' : ''} sans date de retour
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.65, marginTop: 5 }}>
                    Ils sont d’avant l’échéance. Ouvrez chacun pour lui donner une date, ou
                    laissez-les ainsi : « sans échéance » est un état assumé, il ne déclenche
                    simplement aucune relance. Ce panneau disparaîtra quand plus rien n’attendra
                    de date.
                  </div>
                </div>
                <button className="trf-act trf-act--ghost" onClick={() => setRattrapageOuvert(false)}>Plus tard</button>
              </div>
            </Card>
          )}

          <div className="trf-pret-rail">
            {([
              ['retard', `En retard · ${enRetard.length}`, enRetard.length > 0],
              ['proche', `Échéance sous 15 jours · ${proches.length}`, false],
              ['cours', `Tous les prêts en cours · ${vivants.length}`, false],
              ['sans', `Sans échéance · ${sansDate.length}`, false],
              ['soldes', `Soldés · ${soldes.length}`, false],
            ] as [Filtre, string, boolean][]).map(([k, mot, alerte]) => (
              <button
                key={k}
                type="button"
                className={`trf-pret-puce ${filtre === k ? 'is-on' : ''} ${alerte && filtre !== k ? 'trf-pret-puce--alerte' : ''}`}
                onClick={() => setFiltre(k)}
              >
                {mot}
              </button>
            ))}
          </div>

          {liste.length === 0 ? (
            <Card style={{ padding: 20 }}>
              <div className="mnd-muted" style={{ fontSize: 13 }}>
                {filtre === 'retard' ? 'Aucun retard, tout le monde est à jour.'
                  : filtre === 'proche' ? 'Aucune échéance dans les quinze jours.'
                    : filtre === 'sans' ? 'Tous les prêts en cours portent une date de retour.'
                      : filtre === 'soldes' ? 'Aucun prêt soldé pour l’instant.'
                        : 'Aucun prêt en cours.'}
              </div>
            </Card>
          ) : liste.map(carte)}
        </>
      )}
      </>
      )}

      {verrouOuvert && (
        <ReglerLeVerrou
          cle={CLE_PRETS}
          hash={reglages.codePretsHash}
          onClose={() => setVerrouOuvert(false)}
          onPose={(h) => settingsStore.set((prev) => ({ ...prev, codePretsHash: h }))}
        />
      )}

      {(pretOuvert || pretEdite) && (
        <Modal
          title={pretEdite
            ? (pretEdite.type === 'pret' ? 'Corriger ce prêt' : 'Corriger ce remboursement')
            : 'Prêt ou remboursement'}
          onClose={() => { setPretOuvert(false); setPretEdite(null); }}
          width={520}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="De quel geste s’agit-il ?">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {([['pret', 'La Maison prête'], ['remboursement', 'On lui rembourse']] as const).map(([k, mot]) => (
                  <button
                    key={k}
                    type="button"
                    className={`trc-chip ${fPret.type === k ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({ ...f, type: k }))}
                  >
                    {mot}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="À qui">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 9 }}>
                {(['equipe', 'cliente', 'tiers', 'associe', 'foyer'] as GenreEmprunteur[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`trc-chip ${fPret.genre === g ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({ ...f, genre: g }))}
                  >
                    {LIBELLE_GENRE[g]}
                  </button>
                ))}
              </div>
              {fPret.genre === 'cliente' ? (
                <ClientPicker
                  value={fPret.personneId}
                  onChange={(id) => setFPret((f) => ({
                    ...f, personneId: id,
                    nom: clients.find((c) => c.id === id)?.name ?? f.nom,
                  }))}
                  placeholder="Choisir la cliente…"
                />
              ) : (
                <Input
                  value={fPret.nom}
                  placeholder={fPret.genre === 'equipe' ? 'Nom du membre de l’équipe' : 'Nom de la personne'}
                  onChange={(e) => setFPret((f) => ({ ...f, nom: e.target.value }))}
                />
              )}
            </Field>

            <Field label={libelleDuMontant(caisseDuPret, currency)}>
              <Input
                inputMode="decimal"
                value={fPret.montant}
                placeholder="0"
                onChange={(e) => setFPret((f) => ({ ...f, montant: nettoieLeMontant(e.target.value, montantsPret.enDevise) }))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </Field>

            <Field label={fPret.type === 'pret' ? 'De quelle caisse sort cet argent ?' : 'Dans quelle caisse rentre-t-il ?'}>
              <Select value={fPret.cashbox} onChange={(e) => setFPret((f) => ({ ...f, cashbox: e.target.value }))}>
                {caissesMaison.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                <option value="">Hors caisse, l’argent n’est pas passé par un tiroir</option>
              </Select>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>
                {fPret.type === 'pret'
                  ? 'La caisse choisie baisse d’autant : l’argent se déplace, il ne se duplique pas.'
                  : 'La caisse choisie monte d’autant, l’argent revient dans le tiroir.'}
              </div>
            </Field>

            <ContrepartieMaison
              caisse={caisseDuPret}
              maison={currency}
              saisie={fPret.montant}
              contrepartie={fPret.enDevise}
              onChange={(v: string) => setFPret((f) => ({ ...f, enDevise: v }))}
              sortant={fPret.type === 'pret'}
            />

            {/* ── QUAND DOIT-IL REVENIR ? ─────────────────────────────
                Le champ qui manquait, et dont tout le reste découle. Il ne
                s’affiche que sur un PRÊT : un remboursement paie une attente,
                il n’en crée pas. */}
            {fPret.type === 'pret' && (
              <Field label="Quand doit-il revenir ?">
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
                  {([['sans', 'Sans échéance'], ['une', 'En une fois'], ['plusieurs', 'En plusieurs fois']] as const).map(([k, mot]) => (
                    <button
                      key={k}
                      type="button"
                      className={`trc-chip ${fPret.retour === k ? 'is-active' : ''}`}
                      onClick={() => setFPret((f) => ({ ...f, retour: k }))}
                    >
                      {mot}
                    </button>
                  ))}
                </div>
                {fPret.retour === 'une' && (
                  <Input type="date" value={fPret.echeance} onChange={(e) => setFPret((f) => ({ ...f, echeance: e.target.value }))} />
                )}
                {fPret.retour === 'plusieurs' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
                    <label className="mnd-field">
                      <span className="mnd-field__label">Combien de versements</span>
                      <input
                        className="mnd-input" inputMode="numeric" value={fPret.nombre}
                        onChange={(e) => setFPret((f) => ({ ...f, nombre: e.target.value.replace(/[^0-9]/g, '') }))}
                      />
                    </label>
                    <label className="mnd-field">
                      <span className="mnd-field__label">À partir du</span>
                      <input
                        className="mnd-input" type="date" value={fPret.premier}
                        onChange={(e) => setFPret((f) => ({ ...f, premier: e.target.value }))}
                      />
                    </label>
                  </div>
                )}
                <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 7, lineHeight: 1.55 }}>
                  {fPret.retour === 'sans'
                    ? 'Sans date, ce prêt ne sera jamais annoncé en retard, et ne sera jamais rappelé non plus.'
                    : fPret.retour === 'plusieurs' && montantsPret.xof > 0 && fPret.nombre
                      ? `${fPret.nombre} versements d’environ ${fmtMoney(Math.round(montantsPret.xof / (parseInt(fPret.nombre, 10) || 1)), currency)}, de mois en mois. Ce sont des attentes, pas des écritures : rien ne bouge dans une caisse tant que l’argent n’est pas revenu.`
                      : 'Ce sont des attentes, pas des écritures : rien ne bouge dans une caisse tant que l’argent n’est pas revenu.'}
                </div>
              </Field>
            )}

            {/* LA RETENUE SUR SALAIRE ferme la boucle des avances. */}
            {fPret.type === 'pret' && fPret.genre === 'equipe' && (
              <Field label="Retenir sur le bulletin de paie · facultatif">
                <Input
                  inputMode="numeric"
                  value={fPret.retenue}
                  placeholder="0"
                  onChange={(e) => setFPret((f) => ({ ...f, retenue: e.target.value.replace(/[^0-9]/g, '') }))}
                />
                <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.55 }}>
                  Ce montant sera PROPOSÉ en retenue sur chaque bulletin, jusqu’à extinction du
                  prêt, vous le validez ou l’écartez au moment de la paie. Aucune caisse ne
                  bouge : l’argent n’est jamais sorti de la Maison.
                </div>
              </Field>
            )}

            <Field label="Par quel moyen">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {/* LA LISTE DES PARAMÈTRES, PAS UNE COPIE — 5 septembre 2026. */}
                {moyensAOffrir(moyensPose, fPret.method).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`trc-chip ${fPret.method === m ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({ ...f, method: m }))}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Motif · facultatif">
              <Input
                value={fPret.motif}
                placeholder="Avance sur salaire · dépannage · …"
                onChange={(e) => setFPret((f) => ({ ...f, motif: e.target.value }))}
              />
            </Field>

            <Field label="Date">
              <Input type="date" value={fPret.date} onChange={(e) => setFPret((f) => ({ ...f, date: e.target.value }))} />
            </Field>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap' }}>
              {/* EFFACER VIT À GAUCHE, loin d’Enregistrer : un geste sans retour
                  ne voisine pas avec le geste courant. Effacer un prêt REND
                  l’argent à sa caisse — c’est bien ce qu’on veut d’une ligne
                  qui n’aurait jamais dû exister. */}
              {pretEdite ? (
                <button className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--copper-700)' }} onClick={effacerLePret}>
                  Effacer cette ligne
                </button>
              ) : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="mnd-btn mnd-btn--ghost" onClick={() => { setPretOuvert(false); setPretEdite(null); }}>Annuler</button>
                <button className="mnd-btn" onClick={enregistrerPret}>Enregistrer</button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
