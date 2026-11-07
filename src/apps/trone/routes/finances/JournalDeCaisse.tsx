import { usePiecesDeLaMaison } from '../../../../shared/essai';
import { Fragment, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../../../../ds/components';
import { ChampDeDate } from '../../../../ds/dates';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { fmtIn, fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import {
  aValider as aValiderDepenses, caisseDiscrete, cashboxCurrency, entreesHorsActiviteStore, expenseTotal, gardeToutSonPasse, invoiceReglements,
  useEntreesHorsActivite, useExpenses, useInvoices,
  type Cashbox, type Invoice,
} from '../../../../shared/finance';
import { cloturesStore, useClotures } from '../../../../shared/caisse-du-soir';
import { derniereCloture, fondPropose, livreDeLaCloture } from '../../../../shared/caisse-du-soir-pur';
import { derniereRemiseDe } from '../../../../shared/remise-a-zero-pur';
import {
  caissesDuComptoir, cocheeAuDepart, compteEtEcart, etatDeLaCaisse, etatDit, laCaisseDuJour, laRemiseDesPourboires, leDepartDuLivre, leLivreDeLaCaisse,
  lesCloturesDuSoir, lesTotaux, montantSaisi, pourboiresDesPieces, pourquoiPasLaCloture, pourquoiPasLaRemiseDesPourboires, remisesDesPourboires,
  type CaisseACloturer, type CaisseDuJour, type EtatDeLaCaisse, type LigneDuLivre, type LivreDeLaCaisse,
} from '../../../../shared/caisse-du-jour-pur';
import { useEstDirection } from '../_vie';
import { JournalMndPay } from '../vente/JournalMndPay';
import { useCaisses } from './tiroirs';
import { monthKey } from './_shared';
import '../vente/vente.css';
import './caisse-du-soir.css';
import './caisse-du-jour.css';

/* ══ LA CAISSE DU JOUR, CAISSE PAR CAISSE — 5 novembre 2026 ═══════════════
   « Dans la caisse du jour je veux pouvoir cocher les caisses pour voir quoi
   est disponible dans la caisse et clôturer correctement la caisse. Je ne
   veux pas juste un résumé » (Yéman). Maquette « La caisse du jour »
   validée (« Validé, construis »). Elle remplace, en bas de Finances › La
   journée, les pilules à choix unique et les chiffres par moyen :

     · l'en-tête : le jour (Hier, Aujourd'hui, une date) et l'état ;
     · le bandeau : six chiffres sur les SEULES caisses cochées ;
     · « Les caisses » : une ligne par caisse, sa case, Matin, + Versements,
       + Pourboires, − Sorties, = Disponible, Compté, Écart ; le total ne
       somme que les cochées. Le comptoir est coché au départ s'il a un
       solde ou un mouvement ; les banques et les autres, repliées ;
     · le détail de la caisse choisie : ses entrées (une ligne ouvre la
       facture) et ses sorties, chacune nommée ;
     · « Clôturer les caisses cochées » : une clôture par caisse cochée et
       comptée, celle qu'écrit la clôture du soir.

   LES ESPÈCES SE COMPTENT EN UN MONTANT (sa décision) : pas de billetage.
   LES POURBOIRES restent dans le tiroir jusqu'aux salaires du 5 : ils
   comptent dans le disponible, de jour en jour, jusqu'à leur remise. La paie
   ne fait sortir aucune espèce (les salaires partent par MTN) : la direction
   les remet d'un geste, « Remettre les pourboires », une sortie hors
   activité du tiroir (« Pourboires remis à l’équipe »), jamais une dépense.

   LES CHIFFRES VIENNENT DU LIVRE DES CAISSES (`boxMoves`, la source de
   Finances › Les caisses et de son « Jour par jour ») et de la dernière
   clôture (`attenduDuTiroir`) ; `caisse-du-jour-pur` les range, sans
   formule nouvelle. LE BOUTON garde la condition d'avant : il ne s'allume
   que sur une journée close (la clôture de Grenat), et dit pourquoi. */

const veilleIso = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const heureDe = (iso: string) => new Date(iso).toTimeString().slice(0, 5).replace(':', ' h ');
const VIDE = '–';

/** Une caisse vue ce jour-là : ses chiffres, son état, ce qu'on peut en montrer. */
type CaisseVue = {
  box: Cashbox;
  caisse: CaisseDuJour;
  etat: EtatDeLaCaisse;
  duComptoir: boolean;
  devise: string;
  enDevise: boolean;
  /** Une caisse à code ne dit jamais son solde hors de l'écran des Caisses. */
  verrouillee: boolean;
  fondXof: number;
  /** Sa dernière clôture, tous jours (AAAA-MM-JJ) : la remise des pourboires ne se date pas avant. */
  derniereClotureLe?: string;
};

export function JournalDeCaisse({ jour, onJour, aujourdhui, clotureOuverteAuxGestes, pourquoiPasEncore }: {
  /** Le jour du journal (et de la clôture), choisi par la page. */
  jour: string;
  onJour: (iso: string) => void;
  aujourdhui: string;
  /** La journée est close : « Clôturer les caisses cochées » peut s'allumer. */
  clotureOuverteAuxGestes: boolean;
  /** Ce qui reste, dit, quand elle ne l'est pas. */
  pourquoiPasEncore: string;
}) {
  const { branch, currency, branchBoxes, boxMoves, horsActiviteJusquAu, depuis } = useCaisses(monthKey(jour));
  const [invoices] = usePiecesDeLaMaison();
  const [depenses] = useExpenses();
  const [clotures] = useClotures();
  const [horsActivite] = useEntreesHorsActivite();

  /* Le comptoir d'abord, dans son ordre ; puis toutes les autres de la branche. */
  const comptoir = caissesDuComptoir(branchBoxes, branch.id);
  const duComptoir = new Set(comptoir.map((b) => b.id));
  const ordre = [...comptoir, ...branchBoxes.filter((b) => !duComptoir.has(b.id))];
  /* Les pourboires, chacun à son jour et dans sa caisse : ceux du jour, ceux
     que la caisse garde des jours d'avant, ceux qui restent à remettre. */
  const pourboires = pourboiresDesPieces(invoices, branch.id);
  /* Les dépenses sorties d'un tiroir sans être encore validées : la clôture
     du soir les retire de l'attendu, on les retire aussi (`ClotureDuTiroir`). */
  const enAttente = aValiderDepenses(depenses, branch.id).filter((e) => !e.avancee && e.date <= jour);
  const veille = veilleIso(jour);
  const versLigne = (m: ReturnType<typeof boxMoves>['moves'][number]): LigneDuLivre => ({
    date: m.date, delta: m.delta, label: m.label, sub: m.sub,
    ...(m.invoiceId ? { invoiceId: m.invoiceId } : {}),
    ...(m.expense ? { expenseId: m.expense.id } : {}),
    ...(m.transfertId ? { transfertId: m.transfertId } : {}),
  });

  const caisses: CaisseVue[] = ordre.map((box) => {
    const vu = boxMoves(box.name, { de: jour, a: jour });
    const brute = derniereCloture(clotures, branch.id, box.name, veille);
    const caisse = laCaisseDuJour({
      nom: box.name, jour,
      livreMatinXof: vu.startBalance,
      moves: vu.moves.map(versLigne),
      enAttente: enAttente.filter((e) => e.cashbox === box.name).map((e) => ({ id: e.id, label: e.label, date: e.date, xof: expenseTotal(e) })),
      /* Une clôture d'avant le 10 octobre 2026 se remet à la mesure du livre
         de ce soir, comme dans la clôture du soir. */
      derniere: brute ? { laisseXof: brute.laisseXof, livreXof: livreDeLaCloture(brute, horsActiviteJusquAu(box.name, brute.date)), date: brute.date } : undefined,
      pourboires,
      remises: remisesDesPourboires(horsActivite, branch.id, box.name),
      /* Une remise à 0 F du tiroir emporte ce qu'il gardait, pourboires compris. */
      suiviDepuis: derniereRemiseDe(horsActivite, branch.id, box.name),
    });
    const devise = cashboxCurrency(box);
    return {
      box, caisse, devise, enDevise: devise !== currency, verrouillee: caisseDiscrete(box), duComptoir: duComptoir.has(box.id),
      etat: etatDeLaCaisse({ clotures, branchId: branch.id, cashbox: box.name, jour, aujourdhui }),
      fondXof: fondPropose(derniereCloture(clotures, branch.id, box.name, jour)),
      derniereClotureLe: derniereCloture(clotures, branch.id, box.name)?.date,
    };
  });

  /* TOUS LES MONTANTS DE LA CAISSE CHOISIE (5 novembre 2026, « quand je
     clique sur une caisse, je veux voir tous les montants qui sont associés
     à cette caisse ») : son livre depuis sa dernière clôture, sa dernière
     remise à 0 F, ou le début des comptes, jusqu'au soir du jour. Calculé
     pour la seule caisse ouverte. */
  const pieceDe = new Map(invoices.map((i) => [i.id, i] as const));
  const livreDe = (nom: string): LivreDeLaCaisse | null => {
    const vue = caisses.find((c) => c.box.name === nom);
    if (!vue || vue.verrouillee) return null;
    const { depuis: de, depart, departLe } = leDepartDuLivre({
      clotureLe: derniereCloture(clotures, branch.id, nom, veille)?.date,
      remiseLe: derniereRemiseDe(horsActivite.filter((m) => m.date.slice(0, 10) <= veille), branch.id, nom),
      /* Une ancienne garde tout son passé : son livre part de son ouverture. */
      debutDesComptes: depuis && !gardeToutSonPasse(vue.box) ? `${depuis}-01` : '1900-01-01',
    });
    const heureDe = (m: { invoiceId?: string; expenseId?: string; jour: string }): string | undefined => {
      if (m.expenseId) return undefined;
      const i = m.invoiceId ? pieceDe.get(m.invoiceId) : undefined;
      if (!i) return undefined;
      const vs = invoiceReglements(i).filter((p) => (p.cashbox ?? i.cashbox) === nom && (p.date || i.date).slice(0, 10) === m.jour);
      return vs.map((p) => p.time ?? '').filter(Boolean).sort()[0] || i.time || undefined;
    };
    return leLivreDeLaCaisse({
      caisse: vue.caisse, jour, depuis: de, depart, departLe,
      avant: de <= veille ? boxMoves(nom, { de, a: veille }).moves.map(versLigne) : [],
      heureDe,
    });
  };

  const jourDit = (() => {
    const s = new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  return (
    <div data-journal="caisse-du-jour" className="cdj">
      <JournalMndPay branchId={branch.id} jour={jour} currency={currency} />
      {/* L'état du tableau se remet à neuf quand le jour change. */}
      <LesCaisses
        key={`${branch.id}|${jour}`}
        jour={jour} jourDit={jourDit} onJour={onJour} aujourdhui={aujourdhui}
        caisses={caisses} invoices={invoices} currency={currency} branchId={branch.id}
        journeeClose={clotureOuverteAuxGestes} pourquoiJournee={pourquoiPasEncore}
        livreDe={livreDe}
      />
    </div>
  );
}

function LesCaisses({ jour, jourDit, onJour, aujourdhui, caisses, invoices, currency, branchId, journeeClose, pourquoiJournee, livreDe }: {
  jour: string; jourDit: string; onJour: (iso: string) => void; aujourdhui: string;
  caisses: CaisseVue[]; invoices: Invoice[]; currency: string; branchId: string;
  journeeClose: boolean; pourquoiJournee: string;
  livreDe: (nom: string) => LivreDeLaCaisse | null;
}) {
  const navigate = useNavigate();
  const estDirection = useEstDirection();
  const me = useMaTete();
  const moi = me?.name?.trim() || 'Sans nom';

  /* Ce que la main a décidé ; le reste suit la règle du départ. */
  const [cocheVoulue, setCocheVoulue] = useState<Record<string, boolean>>({});
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [choisie, setChoisie] = useState<string | null>(null);
  const [autresOuvertes, setAutresOuvertes] = useState(false);
  /* « Remettre les pourboires » : la caisse ouverte, le montant saisi, ce qui l'empêche. */
  const [remise, setRemise] = useState<{ nom: string; saisie: string; souci: string } | null>(null);

  const f = (n: number, c: CaisseVue | null = null) => (c && c.enDevise ? fmtIn(n, c.devise) : fmtMoney(n, currency));
  const signe = (n: number, c: CaisseVue | null = null) => (n === 0 ? f(0, c) : `${n > 0 ? '+' : '−'}${f(Math.abs(n), c)}`);
  const estCochee = (c: CaisseVue) => !c.verrouillee && (cocheVoulue[c.box.name] ?? cocheeAuDepart(c.caisse, c.duComptoir));

  const lignes = caisses.map((c) => {
    const { compteXof, ecartXof } = compteEtEcart(c.etat, montantSaisi(saisies[c.box.name] ?? ''), c.caisse.disponibleXof);
    return { vue: c, caisse: c.caisse, compteXof, ecartXof, cochee: estCochee(c) };
  });
  const cochees = lignes.filter((l) => l.cochee);
  /* Les totaux en francs : une caisse en devise se lit sur sa ligne, hors total. */
  const enFrancs = lignes.filter((l) => !l.vue.enDevise);
  const t = lesTotaux(enFrancs, new Set(cochees.map((l) => l.caisse.nom)));
  const nomsCoches = cochees.filter((l) => !l.vue.enDevise).map((l) => l.caisse.nom);
  const enDeviseCochees = cochees.filter((l) => l.vue.enDevise).length;
  const aCloturer: CaisseACloturer[] = cochees.map((l) => ({
    nom: l.caisse.nom, etat: l.vue.etat, caisse: l.caisse, compteXof: l.compteXof, ecartXof: l.ecartXof,
    motif: motifs[l.caisse.nom] ?? '', fondXof: l.vue.fondXof,
  }));
  const pourquoi = pourquoiPasLaCloture({ journeeClose, pourquoiJournee, cochees: aCloturer });
  const etat = etatDit(aCloturer);
  const avecAutres = lignes.some((l) => l.caisse.autresEntreesXof !== 0);
  const nbColonnes = avecAutres ? 9 : 8;

  const duComptoir = lignes.filter((l) => l.vue.duComptoir);
  const lesAutres = lignes.filter((l) => !l.vue.duComptoir);
  const autresVues = lesAutres.filter((l) => autresOuvertes || l.cochee);

  /* La caisse du détail : celle qu'on a choisie, sinon la première cochée qui a bougé. */
  const detail = lignes.find((l) => l.caisse.nom === choisie && !l.vue.verrouillee)
    ?? cochees.find((l) => l.caisse.bouge) ?? cochees[0] ?? duComptoir[0];

  const coche = (nom: string, oui: boolean) => setCocheVoulue((p) => ({ ...p, [nom]: oui }));
  /* UN CLIC SUR LA CAISSE (la ligne entière, hors case, champ et bouton)
     ouvre tous ses montants, et y mène. */
  const leLivreRef = useRef<HTMLElement | null>(null);
  const choisir = (nom: string) => {
    setChoisie(nom);
    requestAnimationFrame(() => leLivreRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  };
  const surLaLigne = (e: MouseEvent, l: (typeof lignes)[number]) => {
    if (l.vue.verrouillee || (e.target as HTMLElement).closest('input, button, label, a, select, textarea')) return;
    choisir(l.caisse.nom);
  };
  const fermer = () => {
    if (pourquoi) return;
    const nouvelles = lesCloturesDuSoir({ branchId, jour, par: moi, le: new Date().toISOString(), id: () => `clo-${uid()}`, cochees: aCloturer });
    if (nouvelles.length === 0) return;
    cloturesStore.set((prev) => [...prev, ...nouvelles]);
    const faites = new Set(nouvelles.map((c) => c.cashbox));
    setSaisies((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !faites.has(k))));
    setMotifs((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !faites.has(k))));
    const ecart = nouvelles.reduce((s, c) => s + c.ecartXof, 0);
    toast(`${nouvelles.length} caisse${nouvelles.length > 1 ? 's' : ''} clôturée${nouvelles.length > 1 ? 's' : ''} · écart ${signe(ecart)}`);
  };

  /* REMETTRE LES POURBOIRES — la direction seule : une sortie hors activité
     du tiroir, au jour affiché (`laRemiseDesPourboires`), jamais une dépense. */
  const peutRemettre = (l: (typeof lignes)[number]) => estDirection && !l.vue.verrouillee && !l.vue.enDevise && l.caisse.aRemettreXof > 0;
  const remettre = (l: (typeof lignes)[number]) => {
    const saisie = remise?.nom === l.caisse.nom ? remise.saisie : String(l.caisse.aRemettreXof);
    const xof = montantSaisi(saisie);
    const souci = pourquoiPasLaRemiseDesPourboires({ xof, aRemettreXof: l.caisse.aRemettreXof, jour, aujourdhui, derniereClotureLe: l.vue.derniereClotureLe });
    if (souci || xof === null) { setRemise({ nom: l.caisse.nom, saisie, souci: souci ?? 'Le montant manque.' }); return; }
    entreesHorsActiviteStore.set((prev) => [...prev, laRemiseDesPourboires({ id: `hav-${uid()}`, branchId, cashbox: l.caisse.nom, jour, xof, par: moi })]);
    setRemise(null);
    toast(`${f(xof, l.vue)} de pourboires remis à l’équipe · ${l.caisse.nom}`);
  };

  const sousTitre = (l: (typeof lignes)[number]): string => {
    const { vue, caisse } = l;
    if (vue.verrouillee) return 'Verrouillée';
    if (vue.etat.etat === 'close') return `Close à ${heureDe(vue.etat.cloture.le)} · ${vue.etat.cloture.par}`;
    if (vue.etat.etat === 'bloquee') return 'Close un jour d’après';
    if (vue.enDevise) return `En ${vue.devise}, hors total`;
    if (!caisse.bouge && caisse.matinXof === 0 && caisse.disponibleXof === 0) return 'Aucun mouvement';
    if (caisse.matinSelon === 'comptage') return 'Matin compté';
    return vue.box.sub || 'Selon le livre';
  };

  const ligneDeCaisse = (l: (typeof lignes)[number]) => {
    const { vue, caisse } = l;
    const nom = caisse.nom;
    const m = (n: number) => (vue.verrouillee ? '•••' : f(n, vue));
    const montrerMotif = l.cochee && vue.etat.etat === 'ouverte' && (l.ecartXof ?? 0) !== 0;
    return (
      <Fragment key={vue.box.id}>
        <tr
          data-caisse={nom} onClick={(e) => surLaLigne(e, l)}
          className={`${l.cochee ? '' : 'est-off'}${detail?.caisse.nom === nom ? ' est-choisie' : ''}${vue.verrouillee ? '' : ' cdj-choisit'}`}
        >
          <td className="g">
            <span className="cdj-case">
              <input
                type="checkbox" data-coche={nom} checked={l.cochee} disabled={vue.verrouillee}
                aria-label={`Cocher ${nom}`} onChange={(e) => coche(nom, e.target.checked)}
              />
              <button type="button" className="cdj-nom" data-voir={nom} disabled={vue.verrouillee} onClick={() => choisir(nom)} title="Voir tous ses montants">
                <b>{nom}</b><small>{sousTitre(l)}</small>
              </button>
            </span>
          </td>
          <td data-col="matin">{m(caisse.matinXof)}</td>
          <td data-col="versements">{m(caisse.versementsXof)}</td>
          <td data-col="pourboires">
            {m(caisse.pourboiresXof)}
            {!vue.verrouillee && caisse.aRemettreXof > 0 && <small className="cdj-sous" data-a-remettre={nom}>à remettre {f(caisse.aRemettreXof, vue)}</small>}
            {peutRemettre(l) && remise?.nom !== nom && (
              <button type="button" className="cdj-mini cdj-mini--remettre" data-remettre={nom} onClick={() => setRemise({ nom, saisie: String(caisse.aRemettreXof), souci: '' })}>Remettre les pourboires</button>
            )}
          </td>
          {avecAutres && <td data-col="autres">{m(caisse.autresEntreesXof)}</td>}
          <td data-col="sorties">{m(caisse.sortiesXof)}</td>
          <td data-col="disponible"><b>{m(caisse.disponibleXof)}</b></td>
          <td data-col="compte">
            {vue.verrouillee || vue.etat.etat === 'bloquee'
              ? VIDE
              : vue.etat.etat === 'close'
                ? <span className="cdj-clos">{f(vue.etat.cloture.compteXof, vue)}</span>
                : (
                  <input
                    className="cdj-champ" data-compte={nom} inputMode="numeric" placeholder="0" aria-label={`Compté ${nom}`}
                    value={saisies[nom] ?? ''} onChange={(e) => setSaisies((p) => ({ ...p, [nom]: e.target.value }))}
                  />
                )}
          </td>
          <td data-col="ecart" className={l.ecartXof === null ? '' : l.ecartXof === 0 ? 'est-juste' : 'est-ecart'}>
            {l.ecartXof === null ? VIDE : signe(l.ecartXof, vue)}
          </td>
        </tr>
        {montrerMotif && (
          <tr className="cdj-motif" data-motif-de={nom}>
            <td colSpan={nbColonnes}>
              <label>
                <span>Motif de l’écart · {nom}</span>
                <input
                  className="cdj-champ cdj-champ--motif" data-motif={nom} value={motifs[nom] ?? ''}
                  placeholder="Ex. 2 000 F rendus en monnaie, non notés"
                  onChange={(e) => setMotifs((p) => ({ ...p, [nom]: e.target.value }))}
                />
              </label>
            </td>
          </tr>
        )}
        {remise?.nom === nom && peutRemettre(l) && (
          <tr className="cdj-remise" data-remise-de={nom}>
            <td colSpan={nbColonnes}>
              <label>
                <span>Remettre les pourboires · {nom} · à remettre <b>{f(caisse.aRemettreXof, vue)}</b></span>
                <input
                  className="cdj-champ" data-remise-montant={nom} inputMode="numeric" aria-label={`Pourboires remis · ${nom}`}
                  value={remise.saisie} onChange={(e) => setRemise({ nom, saisie: e.target.value, souci: '' })}
                />
              </label>
              <button type="button" className="cdj-btn cdj-btn--petit" data-cdj="remettre" onClick={() => remettre(l)}>Remettre</button>
              <button type="button" className="cdj-lien" onClick={() => setRemise(null)}>Annuler</button>
              {remise.souci && <span className="cdj-souci">{remise.souci}</span>}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  /* ── Le détail de la caisse choisie ── */
  const pieceDe = new Map(invoices.map((i) => [i.id, i] as const));
  const d = detail ? detail.caisse : null;
  const dv = detail ? detail.vue : null;
  type Entree = { invoiceId: string; heure: string; numero: string; cliente: string; moyen: string; montant: number; pourboire: number };
  const entrees: Entree[] = (() => {
    if (!d) return [];
    const parPiece = new Map<string, Entree>();
    const tipDe = (id: string) => d.pourboires.filter((p) => p.invoiceId === id).reduce((s, p) => s + p.xof, 0);
    const versementsDuJour = (i: Invoice | undefined) => (i ? invoiceReglements(i).filter((p) => (p.cashbox ?? i.cashbox) === d.nom && (p.date || i.date).slice(0, 10) === jour && p.method !== 'Avoir' && p.method !== 'Acompte') : []);
    const ligne = (id: string, montant: number, label?: string): Entree => {
      const i = pieceDe.get(id);
      const vs = versementsDuJour(i);
      return {
        invoiceId: id,
        heure: vs.map((p) => p.time ?? '').filter(Boolean).sort().at(-1) ?? i?.time ?? VIDE,
        numero: i?.number ?? VIDE,
        cliente: label ?? i?.clientName ?? VIDE,
        moyen: [...new Set(vs.map((p) => p.method))].join(' + ') || i?.payment || VIDE,
        montant, pourboire: tipDe(id),
      };
    };
    for (const m of d.entrees) parPiece.set(m.invoiceId!, ligne(m.invoiceId!, m.delta, m.label));
    for (const p of d.pourboires) if (!parPiece.has(p.invoiceId)) parPiece.set(p.invoiceId, ligne(p.invoiceId, 0));
    return [...parPiece.values()].sort((a, b) => a.heure.localeCompare(b.heure));
  })();
  const ouvreLaPiece = (id: string) => navigate(`/factures?id=${id}`);
  const auClavier = (e: KeyboardEvent, faire: () => void) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); faire(); } };

  const resume = `${nomsCoches.length ? nomsCoches.join(', ') : 'aucune'}${enDeviseCochees ? ` · ${enDeviseCochees} en devise, hors total` : ''}`;
  const matinSelon = (() => {
    const c = cochees.filter((l) => !l.vue.enDevise);
    const n = c.filter((l) => l.caisse.matinSelon === 'comptage').length;
    if (c.length === 0 || n === 0) return 'selon le livre';
    return n === c.length ? 'compté la veille' : `${n} compté${n > 1 ? 's' : ''} la veille`;
  })();

  return (
    <div className="cdj-corps">
      <header className="cdj-tete">
        <div>
          <p className="cdj-sur">Finances · La journée · La caisse du jour</p>
          <h3 className="cdj-titre">{jourDit}</h3>
          <div className="cds-jour cdj-jour">
            <span className="cds-jour__mot">Le jour</span>
            <button type="button" className={`cds-bouton${jour === veilleIso(aujourdhui) ? ' is-indigo' : ''}`} onClick={() => onJour(veilleIso(aujourdhui))}>Hier</button>
            <button type="button" className={`cds-bouton${jour === aujourdhui ? ' is-indigo' : ''}`} onClick={() => onJour(aujourdhui)}>Aujourd’hui</button>
            <ChampDeDate value={jour} onChange={(v) => { if (v) onJour(v); }} sens="arriere" max={aujourdhui} compact ariaLabel="Le jour du journal" />
          </div>
        </div>
        <div className="cdj-puces">
          <span className={`cdj-puce ${journeeClose ? 'est-ok' : 'est-attente'}`}>{journeeClose ? 'Journée close · Grenat' : 'Journée ouverte'}</span>
          <span className={`cdj-puce ${etat.close ? 'est-ok' : 'est-attente'}`} data-cdj="etat">{etat.dit}</span>
        </div>
      </header>

      <section className="cdj-kpis" aria-label="Les caisses cochées">
        <div className="cdj-kpi" data-kpi="n"><p className="l">Caisses cochées</p><p className="v">{t.n}</p><p className="c">{resume}</p></div>
        <div className="cdj-kpi" data-kpi="matin"><p className="l">Au matin</p><p className="v">{f(t.matinXof)}</p><p className="c">{matinSelon}</p></div>
        <div className="cdj-kpi" data-kpi="entrees">
          <p className="l">Entrées</p><p className="v">{f(t.versementsXof + t.pourboiresXof + t.autresEntreesXof)}</p>
          <p className="c">{f(t.versementsXof)} + {f(t.pourboiresXof)} pourboires{t.autresEntreesXof ? ` + ${f(t.autresEntreesXof)} autres` : ''}</p>
        </div>
        <div className="cdj-kpi" data-kpi="sorties"><p className="l">Sorties</p><p className="v">{f(t.sortiesXof)}</p><p className="c">dépenses, coffre, transferts</p></div>
        <div className="cdj-kpi" data-kpi="disponible"><p className="l">Disponible</p><p className="v">{f(t.disponibleXof)}</p><p className="c">{t.aRemettreXof > 0 ? `dont pourboires à remettre : ${f(t.aRemettreXof)}` : 'doit y être ce soir'}</p></div>
        <div className="cdj-kpi" data-kpi="compte">
          <p className="l">Compté · écart</p>
          <p className={`v${t.comptees && t.ecartXof !== 0 ? ' est-ecart' : ''}`}>{t.comptees ? f(t.compteXof) : VIDE}</p>
          <p className={`c${t.comptees ? (t.ecartXof === 0 ? ' est-juste' : ' est-ecart') : ''}`}>
            {t.comptees ? `${t.comptees} / ${t.n} comptée${t.comptees > 1 ? 's' : ''} · écart ${signe(t.ecartXof)}` : 'rien compté'}
          </p>
        </div>
      </section>

      <section className="cdj-carte" aria-labelledby="cdj-t-caisses">
        <div className="cdj-carte__t"><h4 id="cdj-t-caisses">Les caisses</h4><span>{cochees.length} cochée{cochees.length > 1 ? 's' : ''} sur {lignes.length}</span></div>
        <div className="cdj-defile">
          <table className="cdj-table">
            <thead>
              <tr>
                <th className="g">Caisse</th><th>Matin</th><th>+ Versements</th><th>+ Pourboires</th>
                {avecAutres && <th>+ Autres entrées</th>}
                <th>− Sorties</th><th>= Disponible</th><th>Compté</th><th>Écart</th>
              </tr>
            </thead>
            <tbody>
              <tr className="cdj-groupe"><td colSpan={nbColonnes}>Comptoir</td></tr>
              {duComptoir.map(ligneDeCaisse)}
              {lesAutres.length > 0 && (
                <tr className="cdj-groupe">
                  <td colSpan={nbColonnes}>
                    Banques et autres · {lesAutres.length} caisse{lesAutres.length > 1 ? 's' : ''}
                    <button type="button" className="cdj-lien" data-cdj="autres" onClick={() => setAutresOuvertes((v) => !v)}>{autresOuvertes ? 'Replier' : 'Voir'}</button>
                  </td>
                </tr>
              )}
              {autresVues.map(ligneDeCaisse)}
            </tbody>
            <tfoot>
              <tr className="cdj-total" data-cdj="total">
                <td className="g">Total coché</td>
                <td data-col="matin">{f(t.matinXof)}</td>
                <td data-col="versements">{f(t.versementsXof)}</td>
                <td data-col="pourboires">{f(t.pourboiresXof)}</td>
                {avecAutres && <td data-col="autres">{f(t.autresEntreesXof)}</td>}
                <td data-col="sorties">{f(t.sortiesXof)}</td>
                <td data-col="disponible">{f(t.disponibleXof)}</td>
                <td data-col="compte">{t.comptees ? f(t.compteXof) : VIDE}</td>
                <td data-col="ecart" className={t.comptees ? (t.ecartXof === 0 ? 'est-juste' : 'est-ecart') : ''}>{t.comptees ? signe(t.ecartXof) : VIDE}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {d && dv && (() => {
        const livre = livreDe(d.nom);
        return livre ? (
          <LeLivre
            key={`${d.nom}|${jour}`} livre={livre} jour={jour} f={(n) => f(n, dv)} refDuLivre={leLivreRef}
            ouvreLaPiece={ouvreLaPiece} ouvreLaDepense={(id) => navigate(`/depenses?depense=${encodeURIComponent(id)}`)} pieceDe={pieceDe}
          />
        ) : null;
      })()}

      {d && dv && (
        <div className="cdj-grille">
          <section className="cdj-carte" data-cdj="detail" aria-labelledby="cdj-t-entrees">
            <div className="cdj-carte__t">
              <h4 id="cdj-t-entrees">{d.nom} · les entrées du jour</h4>
              <span>{d.entrees.length} versement{d.entrees.length > 1 ? 's' : ''} · {f(d.versementsXof, dv)} · pourboires {f(d.pourboiresXof, dv)}</span>
            </div>
            <div className="cdj-defile">
              <table className="cdj-table cdj-table--detail">
                <thead>
                  <tr><th className="g">Heure</th><th className="g">Pièce</th><th className="g">Cliente</th><th className="g">Moyen</th><th>Montant</th><th>Pourboire</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {entrees.map((e) => (
                    <tr
                      key={e.invoiceId} className="cdj-ouvre" data-entree={e.invoiceId} role="button" tabIndex={0} title="Ouvrir la facture"
                      onClick={() => ouvreLaPiece(e.invoiceId)} onKeyDown={(k) => auClavier(k, () => ouvreLaPiece(e.invoiceId))}
                    >
                      <td className="g">{e.heure}</td>
                      <td className="g cdj-piece">
                        {e.numero}
                        {/* MODIFIER UN ENCAISSEMENT (15 septembre 2026) : la direction seule, dans l'éditeur des Factures. */}
                        {estDirection && (
                          <button type="button" className="cdj-mini" title="Modifier cet encaissement"
                            onClick={(k) => { k.stopPropagation(); navigate(`/factures?id=${e.invoiceId}&modifier=1`); }}>Modifier</button>
                        )}
                      </td>
                      <td className="g">{e.cliente}</td>
                      <td className="g">{e.moyen}</td>
                      <td>{f(e.montant, dv)}</td>
                      <td>{e.pourboire ? f(e.pourboire, dv) : VIDE}</td>
                      <td><b>{f(e.montant + e.pourboire, dv)}</b></td>
                    </tr>
                  ))}
                  {entrees.length === 0 && <tr><td className="g cdj-rien" colSpan={7}>Aucun versement ce jour-là.</td></tr>}
                  {d.autresEntrees.map((m, i) => (
                    <tr key={`a-${i}`} data-autre-entree="">
                      <td className="g" colSpan={4}>{m.label}{m.sub ? <small className="cdj-sous">{m.sub}</small> : null}</td>
                      <td>{f(m.delta, dv)}</td><td>{VIDE}</td><td><b>{f(m.delta, dv)}</b></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="cdj-total">
                    <td className="g" colSpan={4}>Total des entrées</td>
                    <td>{f(d.versementsXof + d.autresEntreesXof, dv)}</td><td>{f(d.pourboiresXof, dv)}</td>
                    <td>{f(d.versementsXof + d.autresEntreesXof + d.pourboiresXof, dv)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="cdj-carte" data-cdj="sorties" aria-labelledby="cdj-t-sorties">
            <div className="cdj-carte__t"><h4 id="cdj-t-sorties">{d.nom} · les sorties du jour</h4><span>{f(d.sortiesXof, dv)}</span></div>
            {d.sorties.length === 0 && <p className="cdj-ligne cdj-rien">Aucune sortie ce jour-là.</p>}
            {d.sorties.map((s, i) => {
              const ouvre = s.expenseId ? () => navigate(`/depenses?depense=${encodeURIComponent(s.expenseId!)}`) : undefined;
              return (
                <p
                  key={`s-${i}`} className={`cdj-ligne${ouvre ? ' cdj-ouvre' : ''}`} data-sortie=""
                  {...(ouvre ? { role: 'button', tabIndex: 0, title: 'Ouvrir la dépense', onClick: ouvre, onKeyDown: (k: KeyboardEvent) => auClavier(k, ouvre) } : {})}
                >
                  <span>{s.label}{s.sub ? <small className="cdj-sous">{s.sub}</small> : null}</span>
                  <b>{f(-s.delta, dv)}</b>
                </p>
              );
            })}
            <div className="cdj-pont" data-cdj="pont">
              <p className="cdj-ligne"><span><i></i>Au matin</span><b>{f(d.matinXof, dv)}</b></p>
              {d.pourboiresDuMatinXof > 0 && <p className="cdj-ligne cdj-ligne--dont"><span><i></i>dont pourboires d’avant</span><b>{f(d.pourboiresDuMatinXof, dv)}</b></p>}
              <p className="cdj-ligne"><span><i>+</i>Versements</span><b>{f(d.versementsXof, dv)}</b></p>
              <p className="cdj-ligne"><span><i>+</i>Pourboires</span><b>{f(d.pourboiresXof, dv)}</b></p>
              {d.autresEntreesXof !== 0 && <p className="cdj-ligne"><span><i>+</i>Autres entrées</span><b>{f(d.autresEntreesXof, dv)}</b></p>}
              <p className="cdj-ligne"><span><i>−</i>Sorties</span><b>{f(d.sortiesXof, dv)}</b></p>
              <p className="cdj-ligne cdj-ligne--fort"><span><i>=</i>Disponible ce soir</span><b>{f(d.disponibleXof, dv)}</b></p>
              <p className="cdj-ligne cdj-ligne--dont" data-cdj="a-remettre"><span><i></i>dont pourboires à remettre</span><b>{f(d.aRemettreXof, dv)}</b></p>
            </div>
          </section>
        </div>
      )}

      <footer className="cdj-pied">
        <p className="cdj-pied__dit">
          {pourquoi
            ? <span className={`cdj-pourquoi${journeeClose ? '' : ' jdc-pas-encore'}`}>{pourquoi}</span>
            : <>
              <b>{aCloturer.filter((c) => c.etat.etat === 'ouverte').length} caisse{aCloturer.filter((c) => c.etat.etat === 'ouverte').length > 1 ? 's' : ''}</b>
              {' · disponible '}<b>{f(t.disponibleXof)}</b>{' · compté '}<b>{f(t.compteXof)}</b>{' · écart '}
              <b className={t.ecartXof === 0 ? 'est-juste' : 'est-ecart'}>{signe(t.ecartXof)}</b>
            </>}
        </p>
        <button type="button" className="cdj-btn" data-cdj="cloturer" disabled={!!pourquoi} title={pourquoi ?? ''} onClick={fermer}>Clôturer les caisses cochées</button>
      </footer>
    </div>
  );
}

/* ── TOUS LES MONTANTS DE LA CAISSE ──────────────────────────────────────
   Le plus récent en haut : le jour affiché ouvert, les jours d'avant repliés
   sur leur résumé (montants, entrées, sorties, solde du soir), un clic les
   déplie. En bas, le départ du livre. Chaque montant ouvre sa pièce ou sa
   dépense. Le solde après chaque montant ; « Au matin » du jour affiché est
   le Matin du tableau, son soir le Disponible. */
const premierDit = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  const mois = d.toLocaleDateString('fr-FR', { month: 'long' });
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${mois}`;
};
const jourCourt = (iso: string): string => {
  const s = new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const OUVERTURE = '1900-01-01';

function LeLivre({ livre, jour, f, refDuLivre, ouvreLaPiece, ouvreLaDepense, pieceDe }: {
  livre: LivreDeLaCaisse; jour: string; f: (n: number) => string;
  refDuLivre: { current: HTMLElement | null };
  ouvreLaPiece: (id: string) => void; ouvreLaDepense: (id: string) => void;
  pieceDe: ReadonlyMap<string, Invoice>;
}) {
  const [ouverts, setOuverts] = useState<ReadonlySet<string>>(() => new Set([jour]));
  const tousOuverts = livre.jours.every((j) => ouverts.has(j.jour));
  const bascule = (j: string) => setOuverts((p) => { const n = new Set(p); if (n.has(j)) n.delete(j); else n.add(j); return n; });
  const toutBasculer = () => setOuverts(tousOuverts ? new Set([jour]) : new Set(livre.jours.map((j) => j.jour)));
  const auClavier = (e: KeyboardEvent, faire: () => void) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); faire(); } };
  const departDit = livre.depart === 'cloture' && livre.departLe
    ? `Compté à la clôture du ${premierDit(livre.departLe)}`
    : livre.depart === 'remise' && livre.departLe
      ? `Remise à 0 F du ${premierDit(livre.departLe)}`
      : livre.depuis === OUVERTURE ? 'Ouverture de la caisse' : `Début des comptes · ${premierDit(livre.depuis)}`;
  const depuisDit = livre.depuis === OUVERTURE ? 'depuis l’ouverture' : `depuis le ${premierDit(livre.depuis)}`;
  const libelle = (m: LivreDeLaCaisse['jours'][number]['montants'][number]): { l: string; s?: string } => {
    const i = m.invoiceId ? pieceDe.get(m.invoiceId) : undefined;
    if (m.genre === 'pourboire') return { l: `Pourboire · ${i?.clientName || m.label}`, s: i?.number };
    if (m.genre === 'versement' && i) {
      const moyens = [...new Set(invoiceReglements(i)
        .filter((p) => (p.cashbox ?? i.cashbox) === livre.nom && (p.date || i.date).slice(0, 10) === m.jour && p.method !== 'Avoir' && p.method !== 'Acompte')
        .map((p) => p.method))].join(' + ');
      return { l: i.clientName || m.label, s: [i.number, moyens].filter(Boolean).join(' · ') };
    }
    return { l: m.label, s: m.sub };
  };
  const dit = (n: number) => `${n} montant${n > 1 ? 's' : ''}`;

  return (
    <section className="cdj-carte cdj-livre" data-cdj="livre" data-livre-de={livre.nom} ref={(el) => { refDuLivre.current = el; }} aria-labelledby="cdj-t-livre">
      <div className="cdj-carte__t">
        <h4 id="cdj-t-livre">{livre.nom} · tous ses montants</h4>
        <span>
          {depuisDit} · {dit(livre.n)} · entrées {f(livre.entreesXof)} · sorties {f(livre.sortiesXof)}
          {livre.jours.length > 1 && (
            <button type="button" className="cdj-lien" data-cdj="tout-deplier" onClick={toutBasculer}>{tousOuverts ? 'Tout replier' : 'Tout déplier'}</button>
          )}
        </span>
      </div>
      <div className="cdj-defile">
        <table className="cdj-table cdj-table--livre">
          <thead>
            <tr><th className="g">Jour · heure</th><th className="g">Montant</th><th>+ Entrée</th><th>− Sortie</th><th>Solde</th></tr>
          </thead>
          <tbody>
            {[...livre.jours].reverse().map((j) => {
              const ouvert = ouverts.has(j.jour);
              return (
                <Fragment key={j.jour}>
                  <tr
                    className={`cdj-livre-jour${j.jour === jour ? ' est-du-jour' : ''}`} data-livre-jour={j.jour}
                    role="button" tabIndex={0} aria-expanded={ouvert}
                    onClick={() => bascule(j.jour)} onKeyDown={(k) => auClavier(k, () => bascule(j.jour))}
                  >
                    <td className="g"><span className="cdj-chevron" aria-hidden="true">{ouvert ? '▾' : '▸'}</span>{jourCourt(j.jour)}</td>
                    <td className="g">{j.montants.length ? dit(j.montants.length) : 'aucun montant'}</td>
                    <td>{j.entreesXof ? f(j.entreesXof) : VIDE}</td>
                    <td>{j.sortiesXof ? f(j.sortiesXof) : VIDE}</td>
                    <td><b>{f(j.soirXof)}</b></td>
                  </tr>
                  {ouvert && [...j.montants].reverse().map((m, k) => {
                    const { l, s } = libelle(m);
                    const ouvre = m.invoiceId ? () => ouvreLaPiece(m.invoiceId!) : m.expenseId ? () => ouvreLaDepense(m.expenseId!) : undefined;
                    return (
                      <tr
                        key={`${j.jour}-${k}`} data-montant={m.genre} className={`cdj-livre-montant${ouvre ? ' cdj-ouvre' : ''}${m.genre === 'attente' ? ' est-attente' : ''}`}
                        {...(ouvre ? { role: 'button', tabIndex: 0, title: m.invoiceId ? 'Ouvrir la facture' : 'Ouvrir la dépense', onClick: ouvre, onKeyDown: (e: KeyboardEvent) => auClavier(e, ouvre) } : {})}
                      >
                        <td className="g">{m.heure ? m.heure.slice(0, 5).replace(':', ' h ') : VIDE}</td>
                        <td className="g cdj-libelle">{l}{s ? <small className="cdj-sous">{s}</small> : null}</td>
                        <td>{m.xof > 0 ? f(m.xof) : VIDE}</td>
                        <td>{m.xof < 0 ? f(-m.xof) : VIDE}</td>
                        <td>{f(m.soldeXof)}</td>
                      </tr>
                    );
                  })}
                  {ouvert && (
                    <tr className="cdj-livre-matin" data-livre-matin={j.jour}>
                      <td className="g" colSpan={4}>Au matin du {premierDit(j.jour)}</td>
                      <td>{f(j.matinXof)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            <tr className="cdj-livre-depart" data-cdj="depart">
              <td className="g" colSpan={4}>Au départ · {departDit}</td>
              <td><b>{f(livre.departXof)}</b></td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="cdj-total" data-cdj="livre-total">
              <td className="g" colSpan={2}>Disponible ce soir · {dit(livre.n)}</td>
              <td>{f(livre.entreesXof)}</td>
              <td>{f(livre.sortiesXof)}</td>
              <td>{f(livre.disponibleXof)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
