/* ── CE QUE LA MAISON MET DE CÔTÉ ───────────────────────────────────

   LES OBJECTIFS ONT REJOINT LES PRÊTS — 23 août 2026. « Les objectifs
   devraient aller dans l'onglet des prêts, car il y a des apports et des
   remboursements qui se font à ce niveau. » Un prêt et un objectif sont la
   même figure : une cible, des mouvements dans le temps, un reste à faire.

   PUIS, LE MÊME JOUR : « Un objectif doit être clair, avoir des milestones,
   tout comme les programmes de remboursement pour les prêts. Surtout atteindre
   les objectifs. » Maquette validée (`public/maquette-les-objectifs.html`).
   UNE CIBLE SANS CHEMIN NE S'ATTEINT QUE PAR CHANCE : l'objectif disait ce
   qu'il visait et ce qu'il manquait, jamais COMMENT y arriver. Le calcul vit
   dans `finance.ts` (`etatDeLObjectif`), éprouvé par `verifie-coffre` ; cet
   écran ne fait que le montrer.

   L'ARGENT, LUI, NE DÉMÉNAGE PAS. Un objectif flèche ce qui dort DANS LE
   COFFRE : le détacher séparerait un but de ce qui le remplit. Le Coffre garde
   le tiroir — total, courbe, mouvements, compartiments — et renvoie ici.

   LES DEUX GESTES SUIVENT. « Verser » et « Reprendre » n'auraient servi à rien
   restés au coffre : c'est en regardant un objectif qu'on décide de
   l'alimenter. Les deux modales vivent donc ici, et le Coffre les importe. */

import { useState } from 'react';
import { Button, Card, Field, Input, Modal, Select, Textarea } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, fmtIn } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { CURRENCIES } from '../../../../shared/geo';
import { useClients } from '../../../../shared/clients';
import {
  useCoffre, coffreStore, coffreBalance, invoiceRegleXof, useInvoices, useCashboxes,
  useObjectifs, objectifsStore, coffreNonFleche, type ObjectifCoffre,
  recuDansSaDevise, deviseDuCompartiment, compartimentEtranger, cashboxCurrency,
  caissesEnDevise, motDesCaissesEnDevise,
  etatDeLObjectif, attenduAuJour, planPourTenir, moisEntre, moisPlusISO, joursEntreISO,
  type EtatObjectif, type CoffreMovement, type Cashbox,
} from '../../../../shared/finance';
import { ClientPicker } from '../clients/_shared';
import { todayISO, monthKey, monthTitle } from './_shared';
import './finances.css';

/** « septembre 2027 » — l'échéance d'un objectif se dit en toutes lettres. */
const monthLabelLong = (mk: string): string => (mk ? monthTitle(mk) : '');

const frJourCourt = (iso: string): string =>
  (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—');

const frJourLong = (iso: string): string =>
  (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

/** « dans 7 jours », « en retard de 3 jours », « aujourd'hui ». */
const delaiEnClair = (aujourdhui: string, date: string): string => {
  const j = joursEntreISO(aujourdhui, date);
  if (j === 0) return "aujourd'hui";
  if (j > 0) return `dans ${j} jour${j > 1 ? 's' : ''}`;
  return `en retard de ${-j} jour${-j > 1 ? 's' : ''}`;
};

type FiltreObj = 'retard' | 'mois' | 'tous' | 'sansplan' | 'atteints';

type FormeObjectif = {
  id: string; nom: string; cible: string; echeance: string; devise: string;
  /** Comment y arriver : un rythme régulier, ou rien. */
  rythme: 'plan' | 'sans';
  premier: string; nombre: string; parMois: string;
};

/* ── LA CARTE D'UN OBJECTIF — 23 août 2026 ──────────────────────────
   Maquette validée. Elle dit trois choses dans cet ordre : où on en est, ce
   que le plan attendait, et CE QU'IL FAUT FAIRE. La troisième est la seule
   qui compte — « il faut désormais 878 572 F par mois au lieu de 500 000 »
   remplace un calcul mental que personne ne fait.

   LES DEUX ISSUES D'UN RETARD SE PROPOSENT CÔTE À CÔTE — arbitrage de Yéman :
   rattraper garde la date et monte l'effort, accepter garde l'effort et
   recule la date. Aucune n'est meilleure dans l'absolu : c'est une décision
   de trésorerie, elle appartient à la Souveraine. */
function CarteObjectif({
  etat, currency, moves, aujourdhui, onVerser, onModifier, onReprendre, onRattraper, onAccepter,
}: {
  etat: EtatObjectif;
  currency: string;
  moves: readonly CoffreMovement[];
  aujourdhui: string;
  onVerser: (o: ObjectifCoffre, montant: number) => void;
  onModifier: (o: ObjectifCoffre) => void;
  onReprendre: () => void;
  onRattraper: (o: ObjectifCoffre) => void;
  onAccepter: (o: ObjectifCoffre) => void;
}) {
  const o = etat.objectif;
  const devise = deviseDuCompartiment(o, currency);
  const etranger = compartimentEtranger(o, currency);
  const recu = etranger ? recuDansSaDevise(moves, o, currency) : etat.recu;
  /* SANS CIBLE, C'EST UN COMPARTIMENT : il contient, il ne vise rien. Ni
     jauge, ni manque, ni jugement — juste un solde. */
  const compartiment = o.cibleXof <= 0;
  const attendu = attenduAuJour(o, aujourdhui);
  const repere = o.cibleXof > 0 ? Math.min(100, Math.round((attendu / o.cibleXof) * 100)) : 0;
  const enRetard = etat.retardXof > 0;
  const atteint = !compartiment && etat.manque === 0;

  return (
    <Card className={`trf-obj ${enRetard ? 'trf-obj--retard' : ''} ${atteint ? 'trf-obj--atteint' : ''}`}>
      <div className="trf-obj__tete">
        <button className="trf-obj__nom" onClick={() => onModifier(o)} title="Modifier cet objectif et son plan">
          {o.nom}
        </button>
        {o.echeance && <span className="trf-tag">échéance {monthLabelLong(o.echeance)}</span>}
        {enRetard && <span className="trf-tag trf-tag--brique">en retard sur le plan</span>}
        {atteint && <span className="trf-tag trf-tag--vert">atteint</span>}
        {!compartiment && !enRetard && !atteint && !etat.sansPlan && (
          <span className="trf-tag trf-tag--vert">dans les temps</span>
        )}
        {compartiment && <span className="trf-tag">compartiment</span>}
        <span className="trf-obj__chiffres">
          <em>{compartiment ? 'Contient' : 'Mis de côté'}</em>
          <b>{fmtIn(recu, devise)}</b>
          {!compartiment && <i> / {fmtIn(o.cibleXof, devise)}</i>}
        </span>
      </div>

      {!compartiment && (
        <>
          <div className="trf-jauge trf-jauge--obj">
            <i style={{ width: `${Math.max(1, etat.part)}%` }} className={atteint ? 'est-atteint' : enRetard ? 'est-loin' : ''} />
            {/* LE REPÈRE DIT OÙ LE PLAN VOUS ATTENDAIT. Voir la barre en
                dessous vaut tous les chiffres : on sait d'un regard si on
                tient ou si on glisse. */}
            {attendu > 0 && !atteint && (
              <u style={{ left: `${Math.min(99, repere)}%` }} title={`Le plan attendait ${fmtIn(attendu, devise)} à ce jour`} />
            )}
          </div>
          <div className="trf-jauge__mot">
            <span>
              {etat.part} % versés
              {attendu > 0 && !atteint && ' · le repère cuivré marque où le plan vous attendait'}
            </span>
            <span>{atteint ? 'objectif atteint' : `il manque ${fmtIn(etat.manque, devise)}`}</span>
          </div>
        </>
      )}

      {/* LA PHRASE QUI REMPLACE LE CALCUL MENTAL. */}
      {!compartiment && (
        <div className={`trf-verdict ${enRetard ? 'trf-verdict--brique' : atteint ? 'trf-verdict--vert' : ''}`}>
          {atteint
            ? 'Objectif atteint. Ce qui est fléché dessus reste au coffre, disponible le jour venu.'
            : etat.sansPlan
              ? 'Aucun plan posé — cet objectif ne sera jamais annoncé en retard, et ne réclamera rien. Donnez-lui un rythme pour qu’il se tienne tout seul.'
              : enRetard
                ? `${etat.jalonsManques} jalon${etat.jalonsManques > 1 ? 's' : ''} manqué${etat.jalonsManques > 1 ? 's' : ''} — ${fmtIn(etat.retardXof, devise)} de retard.`
                  + (o.echeance
                    ? ` Pour tenir ${monthLabelLong(o.echeance)}, il faut désormais ${fmtIn(etat.effortPourTenir, devise)} par mois`
                      + (o.plan ? ` au lieu de ${fmtIn(o.plan.montantXof, devise)}.` : '.')
                      + (etat.arriveeProjetee && !etat.tientLaDate
                        ? ` Sans changement de rythme, l’objectif tombe en ${monthLabelLong(etat.arriveeProjetee)}.`
                        : '')
                    : '')
                : etat.prochain
                  ? `Prochain jalon : ${fmtIn(etat.prochain.montantXof - etat.prochain.couvert, devise)} le ${frJourLong(etat.prochain.date)}, ${delaiEnClair(aujourdhui, etat.prochain.date)}.`
                    + (o.echeance && etat.tientLaDate ? ` Au rythme tenu, l’objectif tombe en ${monthLabelLong(etat.arriveeProjetee ?? o.echeance)} — la date visée.` : '')
                  : 'Le plan est déroulé jusqu’au bout.'}
        </div>
      )}

      {/* LES JALONS. Ceux qui restent à venir s'affichent en italique pâle :
          ce sont des ATTENTES, aucun franc n'a bougé. */}
      {etat.jalons.length > 0 && (
        <div className="trf-jalons">
          {etat.jalons.slice(0, 6).map((j) => (
            <div className={`trf-jalon ${j.etat === 'attendu' ? 'trf-jalon--attendu' : ''}`} key={`${j.date}-${j.rang}`}>
              <span className={`trf-pastille trf-pastille--${j.etat}`} />
              <span className="trf-jalon__date">{frJourCourt(j.date)}</span>
              <span className="trf-jalon__nom">
                {j.nom || `${j.rang}ᵉ versement`}
                {j.etat === 'partiel' && (
                  <small>{fmtIn(j.couvert, devise)} versés — il manque {fmtIn(j.montantXof - j.couvert, devise)}</small>
                )}
                {j.etat === 'manque' && <small>rien reçu — en souffrance</small>}
                {j.etat === 'verse' && <small>versé</small>}
              </span>
              <span className="trf-jalon__m">{fmtIn(j.montantXof, devise)}</span>
            </div>
          ))}
          {etat.jalons.length > 6 && (
            <div className="trf-jalon trf-jalon--attendu" style={{ opacity: 0.42 }}>
              <span className="trf-pastille" />
              <span className="trf-jalon__date">…</span>
              <span className="trf-jalon__nom">et {etat.jalons.length - 6} autres</span>
              <span className="trf-jalon__m">
                {fmtIn(etat.jalons.slice(6).reduce((s, j) => s + (j.montantXof - j.couvert), 0), devise)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="trf-obj__gestes">
        {/* LE BOUTON PRINCIPAL PORTE LE MONTANT : le geste le plus fréquent ne
            doit demander aucun calcul. */}
        {!atteint && (etat.retardXof > 0 || etat.prochain) && (
          <Button
            variant="copper"
            onClick={() => onVerser(o, etat.retardXof > 0
              ? etat.retardXof
              : (etat.prochain!.montantXof - etat.prochain!.couvert))}
          >
            {etat.retardXof > 0
              ? `Verser ${fmtIn(etat.retardXof, devise)} — rattraper le plan`
              : `Verser ${fmtIn(etat.prochain!.montantXof - etat.prochain!.couvert, devise)} — le jalon du mois`}
          </Button>
        )}
        <Button variant="ghost" onClick={() => onVerser(o, 0)}>Verser un autre montant</Button>
        <Button variant="ghost" onClick={() => onModifier(o)}>{etat.sansPlan ? 'Poser un plan' : 'Revoir le plan'}</Button>
        <Button variant="ghost" onClick={onReprendre}>Reprendre</Button>
      </div>

      {/* LES DEUX ISSUES, CÔTE À CÔTE. On ne choisit pas pour elle. */}
      {enRetard && o.echeance && (
        <div className="trf-issues">
          <div className="trf-issues__mot">Ce retard, on en fait quoi ?</div>
          <div className="trf-issues__deux">
            <button type="button" className="trf-issue" onClick={() => onRattraper(o)}>
              <b>Rattraper</b>
              <span>{fmtIn(etat.effortPourTenir, devise)} par mois jusqu’en {monthLabelLong(o.echeance)} — la date tient, l’effort monte.</span>
            </button>
            <button type="button" className="trf-issue" onClick={() => onAccepter(o)}>
              <b>Accepter la nouvelle date</b>
              <span>
                {o.plan ? `${fmtIn(o.plan.montantXof, devise)} par mois, inchangé` : 'Le rythme ne change pas'} — l’échéance
                {etat.arriveeProjetee ? ` glisse à ${monthLabelLong(etat.arriveeProjetee)}` : ' recule'}.
              </span>
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function LesObjectifs() {
  const { branch, currency } = useBranch();
  const [tousMoves] = useCoffre();
  const [objectifs, setObjectifs] = useObjectifs();
  const [clients] = useClients();
  const [invoices] = useInvoices();
  const aujourdhui = todayISO();

  const moves = tousMoves.filter((m) => m.branchId === branch.id);
  const vivants = objectifs.filter((o) => o.branchId === branch.id && !o.clos);
  const balance = coffreBalance(moves);

  /* L'ORDRE DE LECTURE EST L'ORDRE DE L'URGENCE, comme pour les prêts : le
     retard d'abord, puis le jalon le plus proche, puis ce qui manque. */
  const etats = vivants
    .map((o) => etatDeLObjectif(o, moves, aujourdhui))
    .sort((a, b) => (b.retardXof - a.retardXof)
      || (a.prochain?.date ?? '9999').localeCompare(b.prochain?.date ?? '9999')
      || (b.manque - a.manque));

  const avecCible = etats.filter((e) => e.objectif.cibleXof > 0);
  const enRetard = avecCible.filter((e) => e.retardXof > 0);
  const atteints = avecCible.filter((e) => e.manque === 0);
  const sansPlan = avecCible.filter((e) => e.sansPlan && e.manque > 0);
  const ceMois = avecCible.filter((e) => e.retardXof === 0 && e.prochain
    && monthKey(e.prochain.date) === monthKey(aujourdhui));

  const flechee = etats.reduce((n, e) => n + e.recu, 0);
  const vise = avecCible.reduce((n, e) => n + e.objectif.cibleXof, 0);
  const aTrouver = avecCible.reduce((n, e) => n + e.manque, 0);
  const effortTotal = avecCible.reduce((n, e) => n + e.effortPourTenir, 0);
  const retardTotal = enRetard.reduce((n, e) => n + e.retardXof, 0);
  const jalonsManques = enRetard.reduce((n, e) => n + e.jalonsManques, 0);

  const [filtre, setFiltre] = useState<FiltreObj>('tous');
  const liste = filtre === 'retard' ? enRetard
    : filtre === 'mois' ? ceMois
      : filtre === 'sansplan' ? sansPlan
        : filtre === 'atteints' ? atteints
          : etats;

  /* ── Poser ou revoir un objectif, et son plan ── */
  const [objOuvert, setObjOuvert] = useState<FormeObjectif | null>(null);
  const formeVierge = (): FormeObjectif => ({
    id: '', nom: '', cible: '', echeance: '', devise: '',
    rythme: 'plan', premier: '', nombre: '', parMois: '',
  });
  const ouvrirObjectif = (o: ObjectifCoffre) => setObjOuvert({
    id: o.id, nom: o.nom, cible: String(o.cibleXof || ''), echeance: o.echeance ?? '', devise: o.devise ?? '',
    rythme: o.plan ? 'plan' : 'sans',
    premier: o.plan?.premier ?? '', nombre: String(o.plan?.nombre ?? ''), parMois: String(o.plan?.montantXof ?? ''),
  });

  /* LE PLAN SE CALCULE, IL NE SE SAISIT PAS. Cible ÷ mois restants = le
     versement mensuel. On donne ce qu'on vise et pour quand ; Le Trône dit ce
     que ça coûte par mois — c'est la seule chose qui transforme « sept
     millions un jour » en une décision qu'on peut tenir. */
  const planPropose = (f: FormeObjectif) => {
    const cible = parseInt((f.cible || '').replace(/[^0-9]/g, ''), 10) || 0;
    if (!f.echeance || cible <= 0) return null;
    const dejaLa = f.id ? etats.find((e) => e.objectif.id === f.id)?.recu ?? 0 : 0;
    const reste = Math.max(0, cible - dejaLa);
    const nombre = Math.max(1, moisEntre(aujourdhui.slice(0, 7), f.echeance));
    const premier = f.premier || moisPlusISO(`${aujourdhui.slice(0, 7)}-28`, 1);
    return { premier, nombre, montantXof: Math.ceil(reste / nombre) };
  };

  const enregistrerObjectif = () => {
    if (!objOuvert) return;
    const nom = objOuvert.nom.trim();
    if (!nom) return;
    /* La cible est FACULTATIVE : sans elle, on pose un compartiment — il
       contient, il ne vise rien. Seul le nom est requis. */
    const cible = parseInt(objOuvert.cible.replace(/[^0-9]/g, ''), 10) || 0;
    const auto = planPropose(objOuvert);
    const plan = objOuvert.rythme === 'plan' && auto
      ? {
        premier: objOuvert.premier || auto.premier,
        nombre: parseInt(objOuvert.nombre || '', 10) || auto.nombre,
        montantXof: parseInt((objOuvert.parMois || '').replace(/[^0-9]/g, ''), 10) || auto.montantXof,
      }
      : undefined;
    setObjectifs((prev) => (objOuvert.id
      ? prev.map((o) => (o.id === objOuvert.id
        ? {
          ...o, nom, cibleXof: cible,
          echeance: objOuvert.echeance || undefined,
          devise: objOuvert.devise || undefined,
          plan,
        }
        : o))
      : [...prev, {
        id: uid(), branchId: branch.id, nom, cibleXof: cible,
        echeance: objOuvert.echeance || undefined,
        devise: objOuvert.devise || undefined,
        plan,
      } as ObjectifCoffre]));
    setObjOuvert(null);
  };

  /* CLORE PLUTÔT QU'EFFACER : un objectif atteint quitte la liste vivante sans
     emporter son histoire — les versements qui l'ont nourri restent fléchés
     vers lui, et le coffre se retrouve toujours. */
  const cloreObjectif = () => {
    if (!objOuvert?.id) return;
    const o = objectifs.find((x) => x.id === objOuvert.id);
    if (!o || !window.confirm(`Refermer « ${o.nom} » ? Il quitte la liste, et les versements qui lui étaient destinés gardent leur trace.`)) return;
    setObjectifs((prev) => prev.map((x) => (x.id === o.id ? { ...x, clos: true } : x)));
    setObjOuvert(null);
  };

  /* ── LES DEUX ISSUES D'UN RETARD ── */
  const rattraper = (o: ObjectifCoffre) => {
    const neuf = planPourTenir(o, moves, aujourdhui);
    if (!neuf) return;
    if (!window.confirm(
      `Rattraper « ${o.nom} » ?\n\nLe plan passe à ${fmtMoney(neuf.montantXof, currency)} par mois sur ${neuf.nombre} mois — la date visée est tenue, l'effort monte.`,
    )) return;
    setObjectifs((prev) => prev.map((x) => (x.id === o.id ? { ...x, plan: neuf } : x)));
  };
  const accepterLaGlisse = (o: ObjectifCoffre) => {
    const e = etats.find((x) => x.objectif.id === o.id);
    if (!e?.arriveeProjetee) return;
    if (!window.confirm(
      `Accepter la nouvelle date pour « ${o.nom} » ?\n\nLe rythme ne change pas ; l'échéance passe de ${monthLabelLong(o.echeance ?? '')} à ${monthLabelLong(e.arriveeProjetee)}.`,
    )) return;
    setObjectifs((prev) => prev.map((x) => (x.id === o.id ? { ...x, echeance: e.arriveeProjetee } : x)));
  };

  /* ── Verser, reprendre ── */
  const [depot, setDepot] = useState<{ objectifId?: string; montant?: number } | null>(null);
  const [repriseOuverte, setRepriseOuverte] = useState(false);
  const clientRevenue = (id: string): number => invoices
    .filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.clientId === id)
    .reduce((n, i) => n + invoiceRegleXof(i), 0);

  return (
    <>
      {etats.length === 0 ? (
        <Card style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7, maxWidth: '64ch' }}>
              <b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>Aucun objectif posé.</b><br />
              Une scolarité, un voyage, un second fauteuil : nommez ce que vous préparez, donnez-lui
              un montant et une date — Le Trône dira ce que ça coûte par mois, et vous rappellera
              chaque jalon.
            </div>
            <Button variant="copper" onClick={() => setObjOuvert(formeVierge())}>+ Objectif</Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="trf-pret-bandeau">
            <div className="trf-pret-stat">
              <div className="trf-pret-stat__l">Mis de côté · fléché</div>
              <div className="trf-pret-stat__v trf-pret-stat__v--vert">{fmtMoney(flechee, currency)}</div>
              <div className="trf-pret-stat__s">{vise > 0 ? `sur ${fmtMoney(vise, currency)} visés` : 'aucune cible posée'}</div>
            </div>
            <div className="trf-pret-stat">
              <div className="trf-pret-stat__l">Non fléché · disponible</div>
              <div className="trf-pret-stat__v">{fmtMoney(coffreNonFleche(moves), currency)}</div>
              <div className="trf-pret-stat__s">au coffre, libre d’emploi</div>
            </div>
            <div className="trf-pret-stat">
              <div className="trf-pret-stat__l">À trouver d’ici les échéances</div>
              <div className="trf-pret-stat__v">{fmtMoney(aTrouver, currency)}</div>
              <div className="trf-pret-stat__s">
                {effortTotal > 0 ? `soit ${fmtMoney(effortTotal, currency)} par mois` : 'aucune échéance posée'}
              </div>
            </div>
            <div className={`trf-pret-stat ${enRetard.length > 0 ? 'trf-pret-stat--alerte' : ''}`}>
              <div className="trf-pret-stat__l">En retard sur le plan</div>
              <div className={`trf-pret-stat__v ${enRetard.length > 0 ? 'trf-pret-stat__v--brique' : ''}`}>
                {fmtMoney(retardTotal, currency)}
              </div>
              <div className="trf-pret-stat__s">
                {enRetard.length === 0
                  ? 'rien à rattraper'
                  : `${enRetard.length} objectif${enRetard.length > 1 ? 's' : ''} · ${jalonsManques} jalon${jalonsManques > 1 ? 's' : ''} manqué${jalonsManques > 1 ? 's' : ''}`}
              </div>
            </div>
          </div>

          <div className="trf-pret-rail">
            {([
              ['retard', `En retard · ${enRetard.length}`, enRetard.length > 0],
              ['mois', `Jalon ce mois-ci · ${ceMois.length}`, false],
              ['tous', `Tous les objectifs · ${etats.length}`, false],
              ['sansplan', `Sans plan · ${sansPlan.length}`, false],
              ['atteints', `Atteints · ${atteints.length}`, false],
            ] as [FiltreObj, string, boolean][]).map(([k, mot, alerte]) => (
              <button
                key={k}
                type="button"
                className={`trf-pret-puce ${filtre === k ? 'is-on' : ''} ${alerte && filtre !== k ? 'trf-pret-puce--alerte' : ''}`}
                onClick={() => setFiltre(k)}
              >
                {mot}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 9 }}>
              <Button variant="copper" onClick={() => setDepot({})}>+ Verser au coffre</Button>
              <Button variant="ghost" onClick={() => setObjOuvert(formeVierge())}>+ Objectif</Button>
            </span>
          </div>

          {liste.length === 0 ? (
            <Card style={{ padding: 20 }}>
              <div className="mnd-muted" style={{ fontSize: 13 }}>
                {filtre === 'retard' ? 'Aucun retard — tous les plans sont tenus.'
                  : filtre === 'mois' ? 'Aucun jalon attendu ce mois-ci.'
                    : filtre === 'sansplan' ? 'Tous les objectifs portent un plan.'
                      : filtre === 'atteints' ? 'Aucun objectif atteint pour l’instant.'
                        : 'Aucun objectif.'}
              </div>
            </Card>
          ) : liste.map((e) => (
            <CarteObjectif
              key={e.objectif.id}
              etat={e}
              currency={currency}
              moves={moves}
              aujourdhui={aujourdhui}
              onVerser={(o, montant) => setDepot({ objectifId: o.id, montant: montant || undefined })}
              onModifier={ouvrirObjectif}
              onReprendre={() => setRepriseOuverte(true)}
              onRattraper={rattraper}
              onAccepter={accepterLaGlisse}
            />
          ))}

          <div className="trf-objectif__pied" style={{ marginTop: 16 }}>
            <span>Non fléché — disponible au coffre</span>
            <b>{fmtMoney(coffreNonFleche(moves), currency)}</b>
          </div>
        </>
      )}

      {objOuvert && (() => {
        const auto = planPropose(objOuvert);
        const cibleNum = parseInt((objOuvert.cible || '').replace(/[^0-9]/g, ''), 10) || 0;
        return (
          <Modal title={objOuvert.id ? 'Revoir l’objectif et son plan' : 'Un nouvel objectif'} onClose={() => setObjOuvert(null)} width={520}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Ce que la Maison prépare">
                <Input
                  value={objOuvert.nom}
                  placeholder="Vacances 2027 · scolarité · second fauteuil…"
                  onChange={(e) => setObjOuvert((f) => (f ? { ...f, nom: e.target.value } : f))}
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label={`Montant visé · ${objOuvert.devise || currency}`}>
                  <Input
                    inputMode="numeric"
                    value={objOuvert.cible}
                    placeholder="0"
                    onChange={(e) => setObjOuvert((f) => (f ? { ...f, cible: e.target.value.replace(/[^0-9]/g, '') } : f))}
                    style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
                  />
                  <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>
                    Laissé vide, c’est un <b>compartiment</b> : il contient, il ne vise rien.
                  </div>
                </Field>
                <Field label="Pour quand · facultatif">
                  <Input
                    type="month"
                    value={objOuvert.echeance}
                    onChange={(e) => setObjOuvert((f) => (f ? { ...f, echeance: e.target.value } : f))}
                  />
                </Field>
              </div>

              {/* ── COMMENT Y ARRIVER ─────────────────────────────────
                  Le champ qui manquait. Sans lui, l’objectif dit ce qu’il vise
                  et jamais comment l’atteindre. */}
              {cibleNum > 0 && (
                <Field label="Comment y arriver">
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
                    {([['plan', 'Un rythme régulier'], ['sans', 'Sans plan']] as const).map(([k, mot]) => (
                      <button
                        key={k}
                        type="button"
                        className={`trc-chip ${objOuvert.rythme === k ? 'is-active' : ''}`}
                        onClick={() => setObjOuvert((f) => (f ? { ...f, rythme: k } : f))}
                      >
                        {mot}
                      </button>
                    ))}
                  </div>
                  {objOuvert.rythme === 'plan' && (auto ? (
                    <>
                      <div className="trf-apercu">
                        ◈ <b>{objOuvert.nombre || auto.nombre} versements de {fmtMoney(parseInt(objOuvert.parMois || '', 10) || auto.montantXof, currency)}</b>,
                        de mois en mois, à partir du {frJourLong(objOuvert.premier || auto.premier)}.<br />
                        Ce sont des <b>attentes</b>, pas des écritures : rien ne quitte une caisse tant que le
                        versement n’a pas eu lieu. Vous pouvez verser plus, moins, ou en avance — le plan
                        s’ajuste et vous dit où vous en êtes.
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                        <label className="mnd-field">
                          <span className="mnd-field__label">Par mois</span>
                          <input
                            className="mnd-input" inputMode="numeric"
                            value={objOuvert.parMois} placeholder={String(auto.montantXof)}
                            onChange={(e) => setObjOuvert((f) => (f ? { ...f, parMois: e.target.value.replace(/[^0-9]/g, '') } : f))}
                          />
                        </label>
                        <label className="mnd-field">
                          <span className="mnd-field__label">Combien</span>
                          <input
                            className="mnd-input" inputMode="numeric"
                            value={objOuvert.nombre} placeholder={String(auto.nombre)}
                            onChange={(e) => setObjOuvert((f) => (f ? { ...f, nombre: e.target.value.replace(/[^0-9]/g, '') } : f))}
                          />
                        </label>
                        <label className="mnd-field">
                          <span className="mnd-field__label">Premier jalon</span>
                          <input
                            className="mnd-input" type="date"
                            value={objOuvert.premier || auto.premier}
                            onChange={(e) => setObjOuvert((f) => (f ? { ...f, premier: e.target.value } : f))}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                      Donnez une <b>date</b> ci-dessus, et Le Trône calculera le rythme — c’est la seule
                      chose qui transforme un montant en une décision qu’on peut tenir.
                    </div>
                  ))}
                  {objOuvert.rythme === 'sans' && (
                    <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                      Sans plan, cet objectif ne sera jamais annoncé en retard — et ne vous rappellera
                      rien. C’est un état assumé, comme un prêt sans échéance.
                    </div>
                  )}
                </Field>
              )}

              <Field label="Devise du compartiment · facultatif">
                <Select
                  value={objOuvert.devise}
                  onChange={(e) => setObjOuvert((f) => (f ? { ...f, devise: e.target.value } : f))}
                >
                  <option value="">{currency} — la monnaie de la Maison</option>
                  {CURRENCIES.filter((c) => c.code !== currency).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </Select>
              </Field>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 4 }}>
                {objOuvert.id ? (
                  <button className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--copper-700)' }} onClick={cloreObjectif}>
                    Refermer cet objectif
                  </button>
                ) : <span />}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="mnd-btn mnd-btn--ghost" onClick={() => setObjOuvert(null)}>Annuler</button>
                  <button className="mnd-btn" onClick={enregistrerObjectif}>
                    {objOuvert.id ? 'Enregistrer' : 'Poser l’objectif'}
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}

      {depot && (
        <DepositModal
          onClose={() => setDepot(null)}
          currency={currency}
          clients={clients}
          clientRevenue={clientRevenue}
          objectifVise={depot.objectifId}
          montantSuggere={depot.montant}
          onSave={(mv: CoffreMovement) => { coffreStore.set((prev) => [...prev, mv]); setDepot(null); }}
          branchId={branch.id}
        />
      )}
      {repriseOuverte && (
        <TransferModal
          onClose={() => setRepriseOuverte(false)}
          currency={currency}
          balance={balance}
          lastBank={moves.find((m) => m.kind === 'virement' && m.bank)?.bank ?? ''}
          onSave={(mv: CoffreMovement) => { coffreStore.set((prev) => [...prev, mv]); setRepriseOuverte(false); }}
          branchId={branch.id}
        />
      )}
    </>
  );
}

/* ---------- Verser au coffre — dépôt, souvent adossé au revenu d'une cliente ---------- */
export function DepositModal({
  onClose, currency, clients, clientRevenue, onSave, branchId, objectifVise, montantSuggere,
}: {
  onClose: () => void;
  currency: string;
  clients: ReturnType<typeof useClients>[0];
  clientRevenue: (id: string) => number;
  onSave: (m: CoffreMovement) => void;
  branchId: string;
  /* ARRIVER DÉJÀ POINTÉ — 23 août 2026. « Verser 878 572 F — rattraper le
     plan » ouvre cette modale sur l’objectif visé, montant en place : le geste
     le plus fréquent ne doit demander ni calcul ni sélection. */
  objectifVise?: string;
  montantSuggere?: number;
}) {
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState(montantSuggere ? String(montantSuggere) : '');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  /* D'OÙ SORT L'ARGENT — 17 août 2026, « le coffre comme caisse ». Un dépôt
     DÉBITE la caisse nommée : sans elle, les mêmes francs vivraient dans le
     tiroir et dans le coffre, et la trésorerie les compterait deux fois.
     « Hors caisse » reste possible pour une mise de côté qui ne sort d'aucun
     tiroir — une somme reçue ailleurs, portée directement à l'abri. */
  const [caisses] = useCashboxes();
  const boxes = caisses.filter((c: Cashbox) => c.branchId === branchId);
  const [cashbox, setCashbox] = useState(boxes[0]?.name ?? '');
  const amountNum = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const rev = clientId ? clientRevenue(clientId) : 0;
  const clientName = clients.find((c) => c.id === clientId)?.name;

  /* VERS QUEL OBJECTIF — 22 août 2026. Facultatif, et son absence est un état
     normal : cet argent-là reste disponible, il n'est pas égaré. */
  const [objectifs] = useObjectifs();
  const objectifsVivants = objectifs.filter((o) => o.branchId === branchId && !o.clos);
  const [objectifId, setObjectifId] = useState(objectifVise ?? '');
  /* SI LE COMPARTIMENT TIENT UNE AUTRE DEVISE, on saisit les billets réels et
     leur taux : le franc reste la base comptable, mais le compartiment doit
     pouvoir dire « 200 € », pas leur contre-valeur d'un jour. */
  const objChoisi = objectifsVivants.find((o) => o.id === objectifId);
  const deviseChoisie = objChoisi ? deviseDuCompartiment(objChoisi, currency) : currency;
  const enDevise = deviseChoisie !== currency;
  const [fxMontant, setFxMontant] = useState('');
  const [fxTaux, setFxTaux] = useState('');
  const fxMontantNum = parseFloat(fxMontant.replace(',', '.')) || 0;
  const fxTauxNum = parseFloat(fxTaux.replace(',', '.')) || 0;

  const save = () => {
    const xof = enDevise ? Math.round(fxMontantNum * fxTauxNum) : amountNum;
    if (xof <= 0) return;
    onSave({
      id: uid(), branchId, kind: 'depot', amountXof: xof, date: date || todayISO(),
      clientId: clientId || undefined, clientName: clientName || undefined,
      cashbox: cashbox || undefined,
      objectifId: objectifId || undefined,
      ...(enDevise ? { fx: { code: deviseChoisie, rate: fxTauxNum, amount: fxMontantNum } } : {}),
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal title="Verser au coffre-fort." onClose={onClose} width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="De quelle caisse sort cet argent ?">
          <Select value={cashbox} onChange={(e) => setCashbox(e.target.value)}>
            {boxes.map((c: Cashbox) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
            <option value="">Hors caisse — reçu ailleurs, porté directement à l'abri</option>
          </Select>
          <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5 }}>
            La caisse choisie baisse d'autant : l'argent se déplace, il ne se duplique pas.
          </div>
        </Field>
        {objectifsVivants.length > 0 && (
          <Field label="Pour quel objectif · facultatif">
            <Select value={objectifId} onChange={(e) => setObjectifId(e.target.value)}>
              <option value="">Sans objectif — argent disponible</option>
              {objectifsVivants.map((o) => (
                <option key={o.id} value={o.id}>{o.nom}</option>
              ))}
            </Select>
            <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5 }}>
              Le fléchage est une lecture, jamais une serrure : cet argent reste disponible,
              et un virement pourra toujours partir.
            </div>
          </Field>
        )}
        {enDevise && (
          <>
            <Field label={`Billets déposés · ${deviseChoisie}`}>
              <Input
                inputMode="decimal"
                value={fxMontant}
                placeholder="0"
                onChange={(e) => setFxMontant(e.target.value.replace(/[^0-9.,]/g, ''))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </Field>
            <Field label={`Taux du jour · 1 ${deviseChoisie} = ? ${currency}`}>
              <Input
                inputMode="decimal"
                value={fxTaux}
                placeholder="0"
                onChange={(e) => setFxTaux(e.target.value.replace(/[^0-9.,]/g, ''))}
              />
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>
                {fxMontantNum > 0 && fxTauxNum > 0
                  ? `Soit ${fmtMoney(Math.round(fxMontantNum * fxTauxNum), currency)} — la base comptable de la Maison. Le compartiment, lui, comptera ${fxMontant} ${deviseChoisie}.`
                  : 'Le taux fige la contre-valeur du jour ; le compartiment, lui, garde ses billets.'}
              </div>
            </Field>
          </>
        )}
        <Field label="Adosser à une cliente · facultatif">
          <ClientPicker value={clientId} onChange={setClientId} placeholder="Choisir la cliente dont on met de côté le revenu…" />
        </Field>

        {clientId && (
          <div className="trf-coffre-suggest">
            <div className="trf-coffre-suggest__rev">
              Chiffre réalisé de {clientName?.split(' ')[0]} : <b>{fmtMoney(rev, currency)}</b>
            </div>
            <div className="trf-coffre-suggest__chips">
              {[10, 20, 50, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="tre-chip"
                  disabled={rev <= 0}
                  onClick={() => setAmount(String(Math.round((rev * pct) / 100)))}
                >
                  {pct}%{rev > 0 ? ` · ${fmtMoney(Math.round((rev * pct) / 100), currency)}` : ''}
                </button>
              ))}
            </div>
            <div className="mnd-muted" style={{ fontSize: 10.5 }}>
              Le versement met de côté cette somme — le chiffre d’affaires déjà réalisé reste inchangé.
            </div>
          </div>
        )}

        {/* En devise, le montant vient des billets et du taux — le saisir une
            seconde fois en francs ouvrirait deux vérités pour un seul dépôt. */}
        {!enDevise && (
          <Field label={`Montant à verser (${currency})`}>
            <Input inputMode="numeric" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
          </Field>
        )}
        <Field label="Date du versement">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note · facultatif">
          <Textarea rows={2} value={note} placeholder="Ex. épargne du mois, mise de côté prudente…" onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="copper" style={{ flex: 1 }} onClick={save} disabled={amountNum <= 0}>
            Verser {amountNum > 0 ? fmtMoney(amountNum, currency) : ''} au coffre
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Virement vers la banque — la SEULE sortie autorisée ---------- */
export function TransferModal({
  onClose, currency, balance, lastBank, onSave, branchId,
}: {
  onClose: () => void;
  currency: string;
  balance: number;
  lastBank: string;
  onSave: (m: CoffreMovement) => void;
  branchId: string;
}) {
  const [amount, setAmount] = useState(String(balance));
  const [bank, setBank] = useState(lastBank);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const amountNum = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const tooMuch = amountNum > balance;
  const canSave = amountNum > 0 && !tooMuch && bank.trim() !== '';

  const save = () => {
    if (!canSave) return;
    onSave({
      id: uid(), branchId, kind: 'virement', amountXof: amountNum, date: date || todayISO(),
      bank: bank.trim(), note: note.trim() || undefined,
    });
  };

  return (
    <Modal title="Virement vers la banque." onClose={onClose} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="trf-coffre-suggest" style={{ background: 'var(--surface-card)' }}>
          <div className="mnd-muted" style={{ fontSize: 12 }}>
            Solde disponible : <b style={{ color: 'var(--color-indigo)' }}>{fmtMoney(balance, currency)}</b>. C’est la seule sortie du coffre — l’argent va vers la banque, jamais vers une dépense.
          </div>
        </div>
        <Field label="Banque / compte destinataire">
          <Input value={bank} placeholder="Ex. Ecobank · MND Épargne" onChange={(e) => setBank(e.target.value)} />
        </Field>
        <Field label={`Montant du virement (${currency})`}>
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
          {tooMuch && <div style={{ fontSize: 11.5, color: '#8f3b30', marginTop: 6 }}>Le virement dépasse le solde du coffre.</div>}
        </Field>
        <Field label="Date du virement">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Référence · facultatif">
          <Textarea rows={2} value={note} placeholder="Ex. n° de bordereau, motif…" onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="indigo" style={{ flex: 1 }} onClick={save} disabled={!canSave}>
            Virer {amountNum > 0 && !tooMuch ? fmtMoney(amountNum, currency) : ''} vers la banque
          </Button>
        </div>
      </div>
    </Modal>
  );
}
