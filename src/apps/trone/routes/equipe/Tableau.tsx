import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../../../shared/store';
import { PageHead } from '../_ui';
import { Button, Input, Select, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useAuth, useStaff as useMonProfil } from '../../../../shared/auth';
import { useInvoices, invoiceTotal, invoiceResteXof, invoiceSoldee, invoiceReglements } from '../../../../shared/finance';
import { fmtMoney } from '../../../../shared/currency';
import {
  filStore, useFil, nouveauMessage, demandesDuTableau, demandeOuverte, puisJeDeplacer, puisJeClore,
  puisJeEffacer, enRetard, faiteRecemment, estAPrendre, A_PRENDRE, CANAL_MAISON,
  PRIORITES, poidsPriorite,
  type FilMessage, type FilPiece,
} from '../../../../shared/fil';
import { useStaff, staffAccessStore, useAnnuaire, nomDuCompte } from './data';
import { voitLesPrix } from '../index';
import './equipe.css';

/* ═══════════════════════════════════════════════════════════════════
   LE TABLEAU — maquette `public/maquette-le-tableau.html`, validée le
   18 août 2026 : « construis tous les tableaux de la maquette. Le tableau
   peut suivre le rang. C'est bon comme ça. »

   IL N'A PAS DE TABLE À LUI. Une carte EST une demande du Fil : la glisser
   sous un autre nom réécrit son destinataire, la déposer dans « Terminé »
   coche la case, la ressortir la rouvre. Un tableau qui garderait ses propres
   tâches serait un second endroit où demander — et le jour où les deux se
   contredisent, aucun ne fait foi.

   LE RANG : le souverain voit toutes les colonnes, parce qu'il répond de la
   Maison. Le maître ne voit que ce qui le touche — sa colonne, ce qu'il
   demande, ce qui est à prendre. La demande d'un souverain à l'autre reste
   hors de la vue du personnel : le rang ne rouvre pas la correction du matin.
   ═══════════════════════════════════════════════════════════════════ */

const initiales = (nom: string) => nom.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('');

/** Où poser une carte. Un membre, l'« à prendre », ou « terminé ». */
type Cible =
  | { genre: 'membre'; mail: string; nom: string }
  | { genre: 'aprendre' }
  | { genre: 'fait' };

const maintenant = (): string => {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

/** L'échéance en clair — « 22 août », pas « 2026-08-22 » : une carte se lit. */
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dateEnClair = (iso: string): string => {
  const [, m, j] = iso.split('-').map(Number);
  return `${j} ${MOIS_COURTS[(m ?? 1) - 1] ?? ''}`;
};

export default function Tableau() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const { session } = useAuth();
  const [tous] = useFil();
  const [equipe] = useStaff();
  const [invoices] = useInvoices();
  const monProfil = useMonProfil();
  const [acces] = useStore(staffAccessStore);

  const monMail = (session?.user?.email ?? '').trim().toLowerCase();
  const maFiche = equipe.find((m) => (m.email ?? '').trim().toLowerCase() === monMail);
  /* Le nom du COMPTE signe et s'affiche — même règle que le Fil (19 août). */
  const [annuaire] = useAnnuaire();
  const monNom = nomDuCompte(annuaire, monMail, maFiche?.name?.trim() || monMail.split('@')[0] || 'La maison');
  const nomDe = (mail: string | undefined, repli: string): string =>
    nomDuCompte(annuaire, mail,
      equipe.find((mb) => (mb.email ?? '').trim().toLowerCase() === (mail ?? '').toLowerCase())?.name?.trim() || repli);

  /* LE RANG — le profil serveur fait foi (c'est lui que la RLS lit) ; sans
     profil, on traite en maître : le rang le plus bas est le seul défaut sûr. */
  const estSouverain = monProfil?.role === 'souverain';
  const sansPrix = !voitLesPrix(monProfil?.role, acces[monProfil?.user_id ?? ''] ?? {});

  const aujourdhui = useMemo(() => {
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }, []);

  const demandes = useMemo(
    () => demandesDuTableau(tous, branch.id, monMail, estSouverain, sansPrix),
    [tous, branch.id, monMail, estSouverain, sansPrix],
  );

  /* ── OUVERTE OU TERMINÉE — les deux seuls états du tableau ────────
     « En cours » et « bloqué » n'existent pas : un état qu'il faut penser à
     changer à la main finit toujours par mentir. Le retard, lui, se calcule. */
  const estClose = (m: FilMessage) => !demandeOuverte(m, invoices);

  /* Terminé garde SEPT JOURS à vue. Une demande éteinte d'elle-même (facture
     soldée) n'a pas de `faitAt` : on date son extinction au dernier règlement. */
  const auTableauDesFaites = (m: FilMessage): boolean => {
    if (m.faitAt) return faiteRecemment(m, aujourdhui);
    if (m.piece?.kind === 'facture') {
      const inv = invoices.find((i) => i.id === m.piece!.id);
      if (inv && invoiceSoldee(inv)) {
        const dernier = invoiceReglements(inv).map((p) => p.date ?? '').sort().pop() ?? '';
        return !!dernier && faiteRecemment({ ...m, faitAt: dernier }, aujourdhui);
      }
    }
    return false;
  };

  const ouvertes = demandes.filter((m) => !estClose(m));
  const faites = demandes.filter((m) => estClose(m) && auTableauDesFaites(m));

  /* ── LES COLONNES ─────────────────────────────────────────────────
     Le souverain : à prendre, puis chaque membre dans l'ordre du travail,
     puis terminé. Le maître : ce qui le touche, rien d'autre — il ne sait pas
     ce que portent les autres colonnes, ni qu'elles existent. */
  const membres = useMemo(
    () => equipe
      .filter((mb) => mb.branchId === branch.id && (mb.email ?? '').trim() !== '')
      .sort((a, b) => (a.ordre ?? 900) - (b.ordre ?? 900) || a.name.localeCompare(b.name)),
    [equipe, branch.id],
  );

  const deQui = (m: FilMessage, mail: string) => (m.demandePour ?? '').toLowerCase() === mail.trim().toLowerCase();

  /* LES SANS-FICHE — une demande adressée à quelqu'un dont la fiche a disparu
     doit rester VISIBLE : la faire tomber dans « à prendre » réécrirait son
     adresse en silence. Chaque adresse orpheline garde sa colonne, marquée. */
  const orphelines = useMemo(() => {
    if (!estSouverain) return [];
    const connus = new Set(membres.map((mb) => (mb.email ?? '').trim().toLowerCase()));
    const vus = new Map<string, string>();
    for (const m of ouvertes) {
      const mail = (m.demandePour ?? '').toLowerCase();
      if (mail && mail !== A_PRENDRE && !connus.has(mail) && !vus.has(mail)) {
        vus.set(mail, m.demandePourNom ?? mail);
      }
    }
    return [...vus.entries()].map(([mail, nom]) => ({ mail, nom }));
  }, [ouvertes, membres, estSouverain]);

  /* ── LE GESTE — poser une carte quelque part ──────────────────────
     Le déplacement laisse sa TRACE : « un travail qui passe d'une main à
     l'autre sans que rien ne le dise, c'est un travail qui se perd ». */
  const deposer = (m: FilMessage, cible: Cible) => {
    if (!puisJeDeplacer(m, monMail, estSouverain)) {
      toast('Cette carte ne vous regarde pas — seul son auteur, son destinataire ou le souverain la déplace.');
      return;
    }
    /* Prendre une carte à prendre, quand on n'est ni son auteur ni souverain,
       c'est la prendre POUR SOI : on ne distribue pas le travail des autres. */
    if (estAPrendre(m) && !estSouverain
      && m.auteurMail.trim().toLowerCase() !== monMail
      && !(cible.genre === 'membre' && cible.mail === monMail)) {
      toast('Une carte à prendre se prend pour soi.');
      return;
    }

    if (cible.genre === 'fait') {
      if (!puisJeClore(m, monMail) && !estSouverain) {
        toast(`À ${nomDe(m.demandePour, m.demandePourNom ?? m.demandePour ?? '')} d'y répondre — on ne clôt pas le travail d'un autre.`);
        return;
      }
      filStore.set((prev) => prev.map((x) => (x.id === m.id
        ? { ...x, faitAt: maintenant(), faitPar: monNom }
        : x)));
      toast('Terminé — la case est cochée dans Le Fil.');
      return;
    }

    /* Ressortir de « Terminé » rouvre ; une demande éteinte PAR SA FACTURE ne
       se rouvre pas à la main — la facture est soldée, le travail est fait. */
    const etaitClose = estClose(m);
    if (etaitClose && !m.faitAt) {
      toast('Cette demande s’est éteinte d’elle-même : sa facture est soldée.');
      return;
    }

    const versMail = cible.genre === 'membre' ? cible.mail : A_PRENDRE;
    const versNom = cible.genre === 'membre' ? cible.nom : 'À prendre';
    const deNom = nomDe(m.demandePour, m.demandePourNom ?? m.demandePour ?? '') ?? '';
    if ((m.demandePour ?? '').toLowerCase() === versMail && !etaitClose) return;

    filStore.set((prev) => prev.map((x) => (x.id === m.id
      ? {
        ...x,
        demandePour: versMail,
        demandePourNom: versNom,
        faitAt: undefined,
        faitPar: undefined,
        mouvements: [...(x.mouvements ?? []), { parNom: monNom, deNom, aNom: versNom, at: maintenant() }],
      }
      : x)));
    toast(etaitClose
      ? `Rouverte — elle revient chez ${versNom}.`
      : `Réadressée à ${versNom} — ${deNom} ne l'a plus dans « à traiter ».`);
  };

  /* ── LE GLISSEMENT — et son repli sans souris ─────────────────────
     Toucher la carte, puis toucher la colonne : le même geste au doigt. */
  const [priseId, setPriseId] = useState<string | null>(null);
  const [choisieId, setChoisieId] = useState<string | null>(null);
  const [cibleSur, setCibleSur] = useState<string | null>(null);

  const carteDe = (id: string) => demandes.find((m) => m.id === id);

  const poserSur = (cle: string, cible: Cible) => {
    const id = priseId ?? choisieId;
    if (!id) return;
    const m = carteDe(id);
    setPriseId(null); setChoisieId(null); setCibleSur(null);
    if (m) deposer(m, cible);
    void cle;
  };

  /* ── POSER UNE CARTE DEPUIS LE TABLEAU — 18 août, « comment j'écris dans
     les cases ? ». La carte naissait dans Le Fil ou sur une facture ; arriver
     devant le tableau sans pouvoir y écrire était une porte manquante. UN
     compositeur, en tête — pas un champ par colonne : huit petits champs
     vides pèseraient plus que ce qu'ils rendent. La carte posée ici est un
     message du fil de la Maison, comme les autres : un seul registre. */
  const [brouillon, setBrouillon] = useState('');
  const [brouillonPour, setBrouillonPour] = useState(A_PRENDRE);
  const [brouillonEcheance, setBrouillonEcheance] = useState('');
  const [brouillonPrio, setBrouillonPrio] = useState('');
  const poserUneCarte = () => {
    const dit = brouillon.trim();
    if (!dit) return;
    const dest = brouillonPour === A_PRENDRE
      ? undefined
      : membres.find((mb) => (mb.email ?? '').trim().toLowerCase() === brouillonPour);
    filStore.set((prev) => [...prev, nouveauMessage({
      branchId: branch.id,
      canal: CANAL_MAISON,
      auteurMail: monMail,
      auteurNom: monNom,
      texte: dit,
      demandePour: dest ? (dest.email ?? '').trim().toLowerCase() : A_PRENDRE,
      demandePourNom: dest ? dest.name : 'À prendre',
      echeance: brouillonEcheance || undefined,
      priorite: (brouillonPrio || undefined) as FilMessage['priorite'],
    })]);
    setBrouillon(''); setBrouillonEcheance(''); setBrouillonPrio('');
    toast(dest ? `Carte posée chez ${dest.name}.` : 'Carte posée — à prendre.');
  };

  const changerPriorite = (m: FilMessage, p: string) => {
    filStore.set((prev) => prev.map((x) => (x.id === m.id
      ? { ...x, priorite: (p || undefined) as FilMessage['priorite'] }
      : x)));
  };

  const changerEcheance = (m: FilMessage, echeance: string) => {
    filStore.set((prev) => prev.map((x) => (x.id === m.id
      ? { ...x, echeance: echeance || undefined }
      : x)));
  };

  const basculerFait = (m: FilMessage) => {
    filStore.set((prev) => prev.map((x) => (x.id === m.id
      ? (x.faitAt
        ? { ...x, faitAt: undefined, faitPar: undefined }
        : { ...x, faitAt: maintenant(), faitPar: monNom })
      : x)));
  };

  /* EFFACER UNE CARTE TERMINÉE — 18 août, « supprimer les tâches terminées ».
     Elle disparaît du tableau ET du fil : c'est le même message. Le geste
     demande confirmation, parce qu'il n'a pas de retour. */
  const effacerCarte = (m: FilMessage) => {
    if (!window.confirm('Effacer cette carte terminée ? Elle disparaîtra aussi du Fil, pour tout le monde.')) return;
    filStore.set((prev) => prev.filter((x) => x.id !== m.id));
    toast('Carte effacée.');
  };

  const ouvrirLaPiece = (p: FilPiece) => {
    if (p.kind === 'facture') navigate(`/factures?id=${p.id}`);
    else if (p.kind === 'rituel') navigate('/carnet');
    else navigate('/customers');
  };

  /* ── LA CARTE ─────────────────────────────────────────────────────
     La pièce s'affiche avec son état DU MOMENT — pas le libellé figé du jour
     de la demande : c'est ce que Monday ne peut pas faire. */
  const Carte = ({ m, faite }: { m: FilMessage; faite?: boolean }) => {
    const retard = !faite && enRetard(m, aujourdhui);
    const jour = !faite && m.echeance === aujourdhui;
    const bouge = puisJeDeplacer(m, monMail, estSouverain) && !(faite && !m.faitAt);
    const inv = m.piece?.kind === 'facture' ? invoices.find((i) => i.id === m.piece!.id) : undefined;
    /* Le bord dit la priorité ; le RETARD garde le dernier mot — un retard
       est une urgence, quoi qu'on ait coché à la création. */
    const prioClasse = !retard && !faite && m.priorite ? ` prio-${m.priorite}` : '';
    return (
      <article
        className={`trt__carte${retard ? ' est-retard' : ''}${faite ? ' est-faite' : ''}${priseId === m.id ? ' est-prise' : ''}${choisieId === m.id ? ' est-choisie' : ''}${bouge ? '' : ' sans-main'}${prioClasse}`}
        draggable={bouge}
        onDragStart={(e) => { if (!bouge) return; setPriseId(m.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setPriseId(null); setCibleSur(null); }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('input,button,a,label')) return;
          if (!bouge) return;
          setChoisieId((v) => (v === m.id ? null : m.id));
        }}
      >
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
          {m.priorite && !faite && (
            <span className={`tr-prio tr-prio--${m.priorite}`}>{PRIORITES.find((p) => p.cle === m.priorite)?.nom}</span>
          )}
          {retard && <span className="trt__chip est-retard" style={{ marginBottom: 0 }}>En retard · {dateEnClair(m.echeance!)}</span>}
          {jour && <span className="trt__chip est-jour" style={{ marginBottom: 0 }}>Aujourd’hui</span>}
          {!retard && !jour && m.echeance && !faite && <span className="trt__chip" style={{ marginBottom: 0 }}>{dateEnClair(m.echeance)}</span>}
        </span>
        {faite && (
          <span className="trt__chip">
            {m.faitAt ? 'Fermée à la main' : 'Éteinte d’elle-même'}
          </span>
        )}
        <div className="trt__texte">{m.texte}</div>

        {m.piece && (
          <div className="trt__piece">
            <div className="trt__piecequoi">
              {m.piece.kind === 'facture' ? 'Facture' : m.piece.kind === 'rituel' ? 'Rendez-vous' : 'Cliente'}
            </div>
            <div className="trt__piecetitre">{m.piece.label}</div>
            {inv && !sansPrix && (
              <div className="trt__piecemeta">
                <span>{fmtMoney(invoiceTotal(inv), currency)}</span>
                <span>{invoiceResteXof(inv) > 0 ? `reste ${fmtMoney(invoiceResteXof(inv), currency)}` : 'soldée'}</span>
              </div>
            )}
            <button type="button" className="trf-fil__lien" onClick={() => ouvrirLaPiece(m.piece!)}>Ouvrir</button>
          </div>
        )}

        <div className="trt__pied">Demandée par {nomDe(m.auteurMail, m.auteurNom)} · {m.at.slice(0, 10) === aujourdhui ? m.at.slice(11) : dateEnClair(m.at.slice(0, 10))}</div>
        {(m.mouvements?.length ?? 0) > 0 && (
          <div className="trt__trace">
            Réadressée par {m.mouvements!.at(-1)!.parNom} · de {m.mouvements!.at(-1)!.deNom || 'à prendre'} à {m.mouvements!.at(-1)!.aNom}
          </div>
        )}

        {faite ? (
          <>
            {puisJeClore(m, monMail) && m.faitAt ? (
              <label className="trf-fil__case" style={{ marginTop: 7 }}>
                <input type="checkbox" checked onChange={() => basculerFait(m)} />
                <span>Traité{m.faitPar ? ` par ${m.faitPar}` : ''} — décocher pour rouvrir</span>
              </label>
            ) : (
              <div className="trt__pied">{m.faitPar ? `Traité par ${m.faitPar}` : 'La facture est soldée'}</div>
            )}
            {/* Une carte terminée s'EFFACE — du tableau et du fil, c'est le
                même message. Par son auteur, son destinataire ou le souverain. */}
            {puisJeEffacer(m, monMail, estSouverain, true) && (
              <button type="button" className="trf-fil__mini" style={{ marginTop: 5 }} onClick={() => effacerCarte(m)}>
                Effacer
              </button>
            )}
          </>
        ) : (
          bouge && (
            <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
              <label className="trt__echeance">
                Échéance
                <input
                  type="date"
                  value={m.echeance ?? ''}
                  onChange={(e) => changerEcheance(m, e.target.value)}
                />
              </label>
              <select
                className="trt__prio-select"
                value={m.priorite ?? ''}
                onChange={(e) => changerPriorite(m, e.target.value)}
                aria-label="Priorité de la carte"
              >
                <option value="">Sans priorité</option>
                {PRIORITES.map((p) => <option key={p.cle} value={p.cle}>{p.nom}</option>)}
              </select>
            </span>
          )
        )}
      </article>
    );
  };

  /* ── LA COLONNE — les comptes en tête se RECALCULENT ──────────────
     Retards d'abord, puis les datées, puis un trait, puis les sans-date :
     une carte sans échéance ne se fait pas passer pour urgente. */
  const Colonne = ({ cle, nom, rang, cartes, cible, faite, vide }: {
    cle: string;
    nom: string;
    rang: string;
    cartes: FilMessage[];
    cible: Cible;
    faite?: boolean;
    vide: string;
  }) => {
    const retards = cartes.filter((m) => !faite && enRetard(m, aujourdhui)).length;
    const hautes = cartes.filter((m) => !faite && m.priorite === 'haute').length;
    const enJeu = sansPrix ? 0 : cartes
      .filter((m) => !faite && m.piece?.kind === 'facture')
      .reduce((s, m) => {
        const inv = invoices.find((i) => i.id === m.piece!.id);
        return s + (inv ? invoiceResteXof(inv) : 0);
      }, 0);
    /* L'ORDRE DE LA COLONNE : le retard d'abord (un retard est une urgence,
       cochée ou non), puis la priorité, puis l'échéance, puis l'ancienneté.
       Une clé composée — comparer champ à champ finit toujours par oublier
       une branche. */
    const cleDe = (m: FilMessage) =>
      `${!faite && enRetard(m, aujourdhui) ? 0 : 1}·${poidsPriorite(m)}·${m.echeance ?? '9999'}·${m.at}`;
    const triees = [...cartes].sort((a, b) => cleDe(a).localeCompare(cleDe(b)));
    const datees = faite ? triees : triees.filter((m) => m.echeance);
    const sansDate = faite ? [] : triees.filter((m) => !m.echeance);
    return (
      <section className={`trt__col${faite ? ' est-fait' : ''}`}>
        <div className="trt__tete">
          <div className={`trt__av${cible.genre === 'aprendre' ? ' est-vide' : ''}${faite ? ' est-fait' : ''}`}>
            {faite ? '✓' : cible.genre === 'aprendre' ? '?' : initiales(nom)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="trt__nom">{nom}</div>
            <div className="trt__rang">{rang}</div>
            <div className="trt__somme">
              <b>{cartes.length}</b> {faite ? (cartes.length > 1 ? 'terminées' : 'terminée') : (cartes.length > 1 ? 'demandes' : 'demande')}
              {enJeu > 0 && <> · {fmtMoney(enJeu, currency)} en jeu</>}
              {hautes > 0 && <> · <span className="est-retard">{hautes} haute{hautes > 1 ? 's' : ''}</span></>}
              {retards > 0 && <> · <span className="est-retard">{retards} en retard</span></>}
            </div>
          </div>
        </div>
        <div
          className={`trt__corps${cibleSur === cle ? ' est-cible' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setCibleSur(cle); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setCibleSur(null); }}
          onDrop={(e) => { e.preventDefault(); poserSur(cle, cible); }}
          onClick={(e) => {
            if (!choisieId) return;
            if ((e.target as HTMLElement).closest('.trt__carte')) return;
            poserSur(cle, cible);
          }}
        >
          {cartes.length === 0 && <div className="trt__vide">{vide}</div>}
          {datees.map((m) => <Carte key={m.id} m={m} faite={faite} />)}
          {sansDate.length > 0 && datees.length > 0 && <div className="trt__trait">sans échéance</div>}
          {sansDate.map((m) => <Carte key={m.id} m={m} faite={faite} />)}
        </div>
      </section>
    );
  };

  const aPrendre = ouvertes.filter((m) => estAPrendre(m));
  const retardsTotal = ouvertes.filter((m) => enRetard(m, aujourdhui)).length;

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="La Maison · les demandes vues d'en haut"
        title="Le Tableau."
        sub={`${ouvertes.length} demande${ouvertes.length > 1 ? 's' : ''} ouverte${ouvertes.length > 1 ? 's' : ''}${retardsTotal > 0 ? ` · ${retardsTotal} en retard` : ''} — glissez une carte d'un nom à l'autre, ou touchez la carte puis la colonne.`}
      />

      <div className="trt">
        <div className="trt__poser">
          <Input
            value={brouillon}
            onChange={(e) => setBrouillon(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') poserUneCarte(); }}
            placeholder="Poser une carte — que faut-il faire ?"
            style={{ flex: 1, minWidth: 220 }}
          />
          <Select value={brouillonPour} onChange={(e) => setBrouillonPour(e.target.value)} style={{ fontSize: 12, maxWidth: 190 }}>
            <option value={A_PRENDRE}>À prendre</option>
            {membres.map((mb) => (
              <option key={mb.id} value={(mb.email ?? '').trim().toLowerCase()}>{mb.name}</option>
            ))}
          </Select>
          <Select value={brouillonPrio} onChange={(e) => setBrouillonPrio(e.target.value)} style={{ fontSize: 12, maxWidth: 150 }}>
            <option value="">Sans priorité</option>
            {PRIORITES.map((p) => <option key={p.cle} value={p.cle}>Priorité {p.nom.toLowerCase()}</option>)}
          </Select>
          <label className="trt__echeance" style={{ marginTop: 0 }}>
            Échéance
            <input type="date" value={brouillonEcheance} onChange={(e) => setBrouillonEcheance(e.target.value)} />
          </label>
          <Button variant="copper" size="sm" disabled={!brouillon.trim()} onClick={poserUneCarte}>
            Poser la carte
          </Button>
        </div>
        <div className="trt__mot">
          {choisieId
            ? <><b>Carte prise.</b> Touchez maintenant la colonne où la poser.</>
            : <>Glisser sous un nom réadresse · glisser dans « Terminé » coche la case · ressortir rouvre. Chaque déplacement laisse sa trace dans Le Fil.</>}
        </div>
        <div className="trt__cols">
          <Colonne
            cle="aprendre"
            nom="À prendre"
            rang="sans destinataire"
            cartes={aPrendre}
            cible={{ genre: 'aprendre' }}
            vide="Rien à prendre."
          />
          {estSouverain
            ? membres.map((mb) => {
              const mail = (mb.email ?? '').trim().toLowerCase();
              return (
                <Colonne
                  key={mb.id}
                  cle={`m:${mail}`}
                  nom={mb.name}
                  rang={mb.role || 'membre'}
                  cartes={ouvertes.filter((m) => deQui(m, mail))}
                  cible={{ genre: 'membre', mail, nom: mb.name }}
                  vide="Rien pour l’instant."
                />
              );
            })
            : (
              <>
                <Colonne
                  cle={`m:${monMail}`}
                  nom="Ce qu’on me demande"
                  rang={maFiche?.role || 'moi'}
                  cartes={ouvertes.filter((m) => deQui(m, monMail))}
                  cible={{ genre: 'membre', mail: monMail, nom: monNom }}
                  vide="Rien ne vous attend."
                />
                {/* Ce que JE demande — chez les autres. Les cartes disent chez
                    qui elles sont ; les colonnes des autres n'existent pas. */}
                <section className="trt__col">
                  <div className="trt__tete">
                    <div className="trt__av est-vide">→</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="trt__nom">Ce que je demande</div>
                      <div className="trt__rang">chez les autres</div>
                      <div className="trt__somme">
                        <b>{ouvertes.filter((m) => m.auteurMail.trim().toLowerCase() === monMail && !deQui(m, monMail) && !estAPrendre(m)).length}</b> en attente
                      </div>
                    </div>
                  </div>
                  <div className="trt__corps">
                    {ouvertes
                      .filter((m) => m.auteurMail.trim().toLowerCase() === monMail && !deQui(m, monMail) && !estAPrendre(m))
                      .map((m) => (
                        <div key={m.id}>
                          <span className="trt__chip">Chez {nomDe(m.demandePour, m.demandePourNom ?? m.demandePour ?? '')}</span>
                          <Carte m={m} />
                        </div>
                      ))}
                    {ouvertes.filter((m) => m.auteurMail.trim().toLowerCase() === monMail && !deQui(m, monMail) && !estAPrendre(m)).length === 0
                      && <div className="trt__vide">Vous n’attendez rien de personne.</div>}
                  </div>
                </section>
              </>
            )}
          {orphelines.map((o) => (
            <Colonne
              key={o.mail}
              cle={`m:${o.mail}`}
              nom={o.nom}
              rang="sans fiche"
              cartes={ouvertes.filter((m) => deQui(m, o.mail))}
              cible={{ genre: 'membre', mail: o.mail, nom: o.nom }}
              vide=""
            />
          ))}
          <Colonne
            cle="fait"
            nom="Terminé"
            rang="7 derniers jours"
            cartes={faites}
            cible={{ genre: 'fait' }}
            faite
            vide="Rien de terminé cette semaine."
          />
        </div>
      </div>
    </div>
  );
}
