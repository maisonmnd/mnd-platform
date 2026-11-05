import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../../../../ds/components';
import { demandeUnTexte } from '../../../../ds/demande';
import { useBranch } from '../../../../shared/branches';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { useCategories, useServices, useProducts } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { useModelBands, useBandSets } from '../../../../shared/pricing';
import { jourPropose } from '../../../../shared/caisse-du-soir-pur';
import { francsDits, type ConstatDeDepense, type GesteDeDepense, type GesteDuComptoir } from '../../../../shared/cloture-du-jour-pur';
import { decideLaDepense, momentDit, tranche } from '../../../../shared/cloture-du-jour';
import { peutValider, useExpenses } from '../../../../shared/finance';
import { useStore } from '../../../../shared/store';
import { sameName } from '../../../../shared/text';
import { staffAccessStore } from '../equipe/data';
import { tarifsDuRituel, useBranchAppointments, useServicesById } from '../clients/_shared';
import { useClotureDuJour } from './useClotureDuJour';
import { honoreSansEncaisser, PayAppointmentModal } from '../clients/actions';
import { useEnvoiDeLaPiece } from '../vente/envoi-de-la-piece';
import { JournalDeCaisse } from './JournalDeCaisse';
import { todayISO } from './_shared';
import './la-journee.css';

/* ══ LA JOURNÉE — 4 novembre 2026 ════════════════════════════════════════
   « Tous les jours à 15 h et à 19 h, qu'Opale clôture toutes les factures…
   et qu'on puisse faire la caisse du jour », puis « relier ce travail avec
   la caisse du jour que nous tenons dans le Trône », puis « la caisse du
   jour en fin de page… combiner le travail et supprimer la barre de
   navigation de la caisse du jour » (Yéman ; maquette 9KCMgAb1…,
   « construis »).

   UNE SEULE PAGE, SANS BARRE D'ONGLETS :
     · EN HAUT, la clôture de Grenat : chaque rendez-vous du jour avec son
       état et le geste qui le règle d'un toucher (« Encaisser », « Honoré »,
       « Absente », « Annulée ») ; les alarmes ; ce que Grenat a fait seul ;
       le verdict. Elle se recalcule à l'écran avec LA MÊME RÈGLE que la
       fonction (`clotureDuJour`, cloture-du-jour-pur.ts) et dit le dernier
       passage de Grenat.
     · EN BAS, la caisse du jour (`JournalDeCaisse`, déplacé de la Caisse) :
       « Clôturer la caisse » ne s'allume que sur une journée close.

   Les gestes du comptoir passent par les MÊMES chemins que le Carnet
   (encaisser, terminer la séance, annuler) : deux chemins pour un geste
   finiraient par ne plus dire la même chose. Trancher une alarme ou un
   constat est réservé à la direction (souverain), la base le garde (0156).

   LES DÉPENSES DU JOUR — 5 novembre 2026 (« Oui, il les relit à 19 h »,
   maquette 9KCMgAb1…, section 8) : sous les rendez-vous, avant la caisse
   du jour. Grenat ne saisit rien : chaque constat porte le geste qui le
   règle, par les chemins de toujours. « Valider », « Refuser » : la
   validation des Dépenses (`peutValider`, souverain ou gérant, jamais ses
   propres dépenses) ; « Joindre la photo », « Dire qui a payé » ouvrent la
   fiche de la dépense ; « Saisir une dépense », « C'était une dépense »
   ouvrent le formulaire des Dépenses ; « Rien aujourd'hui » et « Laisser
   l'écart » sont des décisions de clôture, de la direction (0156). Un
   compte qui ne voit que ses dépenses ne voit ici que les siennes. */

const ETAT_TON: Record<string, string> = {
  'a-venir': 'cuivre', 'en-cours': 'cuivre', 'a-encaisser': 'ko', 'sans-etat': 'ko', regle: 'cuivre', 'a-revoir': 'ko', clos: 'ok', annule: 'ok',
};
const GESTE_DIT: Record<GesteDuComptoir, string> = { encaisser: 'Encaisser', honore: 'Honoré', absente: 'Absente', annulee: 'Annulée' };
const DEPENSE_TON: Record<ConstatDeDepense['genre'], string> = { 'jour-sans-depense': 'cuivre', 'a-valider': 'cuivre', 'a-completer': 'ko', 'ecart-sans-depense': 'ko' };
const GESTE_DEPENSE_DIT: Record<Exclude<GesteDeDepense, 'rien-aujourdhui'>, string> = {
  valider: 'Valider', refuser: 'Refuser', 'joindre-la-photo': 'Joindre la photo', 'dire-qui-a-paye': 'Dire qui a payé',
  saisir: 'Saisir une dépense', 'c-etait-une-depense': 'C’était une dépense', 'laisser-l-ecart': 'Laisser l’écart, avec sa note',
};

export default function LaJournee() {
  const navigate = useNavigate();
  const { branch } = useBranch();
  const me = useMaTete();
  const souverain = me?.role === 'souverain';
  const moi = me?.name?.trim() || 'La direction';
  const aujourdhui = todayISO();
  const [jour, setJour] = useState(() => jourPropose(new Date()));

  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [clients] = useClients();
  const [categories] = useCategories();
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const [services] = useServices();
  const [produits] = useProducts();
  const envoiDeLaPiece = useEnvoiDeLaPiece();
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);
  /* La même prise que la carte du tableau de bord (useClotureDuJour.ts). */
  const { cloture, passage, alarmes, close, pourquoiPasEncore, verdictDit, heureDesDepenses } = useClotureDuJour(jour);
  const alarmesOuvertes = alarmes.filter((x) => x.ouverte);

  /* ── Les dépenses du jour : chacun ne voit que ce qu'il voit aux Dépenses ── */
  const [toutesLesDepenses] = useExpenses();
  const accesTous = useStore(staffAccessStore)[0];
  const monNom = me?.name?.trim() ?? '';
  const voitToutesLesDepenses = me?.role !== 'maitre' || (accesTous[me?.user_id ?? ''] ?? {}).finances === true;
  const depenseDe = (id?: string) => (id ? toutesLesDepenses.find((e) => e.id === id) : undefined);
  const sienne = (id?: string): boolean => {
    const e = depenseDe(id);
    return !!e && ((!!e.porteur && sameName(e.porteur, monNom)) || (!!e.validation && sameName(e.validation.soumisPar, monNom)));
  };
  const depenses = cloture.depenses;
  const constatsDepenses = depenses?.constats ?? [];
  const depensesVues = voitToutesLesDepenses ? constatsDepenses : constatsDepenses.filter((c) => !c.depenseId || sienne(c.depenseId));
  const depensesCachees = constatsDepenses.length - depensesVues.length;
  const gestesVus = (c: ConstatDeDepense): GesteDeDepense[] => c.gestes.filter((g) => {
    if (g === 'valider' || g === 'refuser') { const e = depenseDe(c.depenseId); return !!e && peutValider(me?.role, monNom, e); }
    if (g === 'rien-aujourdhui' || g === 'laisser-l-ecart') return souverain;
    return true;
  });
  const pourquoiPasCeGeste = (c: ConstatDeDepense): string => {
    if (c.genre === 'a-valider') {
      return (me?.role === 'souverain' || me?.role === 'gerant') ? 'Vous l’avez saisie vous-même : un autre souverain, ou un gérant, la valide.' : 'La direction la valide ou la refuse.';
    }
    if (c.genre === 'jour-sans-depense') return `La direction peut dire « ${jour === aujourdhui ? 'Rien aujourd’hui' : 'Rien ce jour-là'} ».`;
    if (c.genre === 'ecart-sans-depense') return 'La direction peut laisser l’écart, avec sa note.';
    return '';
  };
  const faisPourLaDepense = async (c: ConstatDeDepense, g: GesteDeDepense) => {
    if (g === 'valider' || g === 'refuser') {
      let motif: string | undefined;
      if (g === 'refuser') {
        const m = await demandeUnTexte({
          quoi: 'Les dépenses du jour', titre: 'Refuser cette dépense ?',
          dit: `${c.quoi}. Un refus se donne avec son motif : la ligne reste, barrée, chez celui qui l’a saisie.`,
          etiquette: 'Le motif du refus', gabarit: 'Pas de reçu, et le montant ne correspond pas.',
          accepter: 'Refuser la dépense', refuser: 'Ne rien faire',
        });
        if (m === null) return;
        motif = m;
      }
      const pourquoi = decideLaDepense({ id: c.depenseId ?? '', role: me?.role, nom: monNom, oui: g === 'valider', motif });
      toast(pourquoi ?? (g === 'valider' ? 'Validée : elle entre dans les chiffres.' : 'Refusée avec son motif : elle reste, barrée, chez celui qui l’a saisie.'));
      return;
    }
    if (g === 'joindre-la-photo' || g === 'dire-qui-a-paye') {
      navigate(`/depenses?depense=${encodeURIComponent(c.depenseId ?? '')}&volet=${g === 'joindre-la-photo' ? 'recu' : 'porteur'}`);
      return;
    }
    if (g === 'saisir' || g === 'c-etait-une-depense') {
      const q = new URLSearchParams({ nouvelle: '1', date: jour });
      if (g === 'c-etait-une-depense') {
        if (c.tiroir) q.set('caisse', c.tiroir);
        if (c.montantXof) q.set('montant', String(c.montantXof));
        if (c.comptageId) q.set('ecart', c.comptageId);
      }
      navigate(`/depenses?${q.toString()}`);
      return;
    }
    /* « Rien aujourd'hui », « Laisser l'écart » : des décisions de clôture, de la direction (0156). */
    if (!souverain) { toast('La direction seule le dit.'); return; }
    if (g === 'rien-aujourdhui') {
      tranche({ branchId: branch.id, cle: c.cle, par: moi, mot: 'Rien acheté, rien payé de la caisse ce jour-là.' });
      toast('Noté : aucune dépense ce jour-là. Grenat ne le redemande pas.');
      return;
    }
    tranche({ branchId: branch.id, cle: c.cle, par: moi, mot: c.note ? `L’écart reste, avec sa note : « ${c.note} ».` : 'L’écart reste, sans dépense en face.' });
    toast('L’écart reste, avec sa note. Grenat ne le redemande pas.');
  };
  const saisiesDites = (n: number) => `${n} dépense${n > 1 ? 's' : ''} saisie${n > 1 ? 's' : ''}`;

  /* ── Les gestes du comptoir, par les chemins du Carnet ── */
  const rdvDe = (id: string) => appts.find((a) => a.id === id);
  const fais = (id: string, g: GesteDuComptoir) => {
    const a = rdvDe(id);
    if (!a) return;
    if (g === 'encaisser') { setPayAppt(a); return; }
    if (g === 'honore') {
      /* « Terminer la séance », comme le toucher du Carnet : le jour même, le
         reste dû part sur son WhatsApp ; un jour passé s'honore sans prévenir. */
      const h = honoreSansEncaisser(a, byId, tarifsDuRituel(a, {
        client: clients.find((c) => c.id === a.clientId), bands, sets, cats: categories, byId, tousServices: services, produits,
      }));
      if (h.honore && h.facture && !h.deja && a.date === aujourdhui) void envoiDeLaPiece.aRegler(h.facture.id, a.date, { memePasse: true });
      return;
    }
    /* « Absente » comme « Absente : marquer manquée » (la séance de la
       formule) ; « Annulée » comme le toucher du Carnet : le statut seul. */
    const absente = g === 'absente';
    appointmentsStore.set((prev) => prev.map((x) => (x.id === id && x.status !== 'honoré'
      ? { ...x, status: 'annulé', ...(absente ? { absente: { le: jour, par: moi } } : {}) }
      : x)));
    toast(absente ? 'Marquée absente : le rendez-vous est clos.' : 'Rendez-vous annulé : il est clos.');
  };
  const trancher = async (cle: string, dit: string) => {
    if (!souverain) { toast('La direction seule tranche.'); return; }
    const mot = await demandeUnTexte({
      quoi: 'La clôture de Grenat', titre: 'Trancher ce constat ?', dit,
      etiquette: 'Votre décision, en une phrase', gabarit: 'Les 2 000 F ont été reçus en espèces.',
      accepter: 'Trancher et fermer le constat', refuser: 'Laisser ouvert',
    });
    if (mot === null) return;
    tranche({ branchId: branch.id, cle, par: moi, mot });
    toast('Tranché : le constat est fermé, il reste au compte rendu.');
  };

  const jourDit = (() => {
    const s = new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();
  const fait = passage?.gestesFaits ?? [];
  const aRevoir = [
    ...cloture.rdvs.flatMap((r) => r.aRevoir.map((x) => ({ ...x, qui: `${r.qui} · ${r.heure}`, pieceId: r.pieceId }))),
    ...cloture.pieces.flatMap((p) => p.aRevoir.map((x) => ({ ...x, qui: p.numero, pieceId: p.id }))),
  ];

  return (
    <div className="mnd-rise lj">
      <div className="lj-tete">
        <div className="trv-sec-label trv-sec-label--copper">Finances · La journée · {jourDit}</div>
        <h2 className="lj-titre">La journée.</h2>
        <p className="lj-sous">La clôture de Grenat en haut, la caisse du jour en bas. Grenat relit chaque rendez-vous et chaque facture aux heures réglées, et les dépenses du jour à la dernière ; ce qui est sûr, il le termine ; le reste attend votre geste.</p>
      </div>

      <section className="lj-carte" aria-label="La clôture de Grenat" data-lj="cloture">
        <div className="lj-carte__tete">
          <span className="lj-carte__titre">La clôture de Grenat</span>
          <span className="lj-passage" data-lj="passage">
            {passage
              ? `Dernier passage : ${momentDit(passage.moment)}, écrit à ${new Date(passage.ecritLe).toTimeString().slice(0, 5).replace(':', ' h ')}`
              : 'Grenat n’est pas encore passé ce jour-là : l’écran juge avec la même règle.'}
          </span>
        </div>
        <p className={`lj-verdict ${close ? 'ok' : 'ko'}`} data-lj="verdict">{close ? cloture.verdict.dit : verdictDit}</p>

        <div className="lj-bloc">
          <p className="lj-bloc__tete"><span>Les rendez-vous du jour</span><span>{cloture.rdvs.length}</span></p>
          {cloture.rdvs.length === 0 && <p className="lj-vide">{cloture.ferme ? 'La Maison est fermée ce jour.' : 'Aucun rendez-vous ce jour-là.'}</p>}
          {cloture.rdvs.map((r) => (
            <div className="lj-ligne" key={r.id} data-lj-rdv={r.id} data-etat={r.etat}>
              <span className="lj-heure">{r.heure}</span>
              <span className="lj-qui-dit">
                <span className="lj-qui">{r.qui}</span>
                <span className="lj-dit">{r.dit}</span>
                {r.libelle && <span className="lj-libelle">{r.libelle}</span>}
                {r.aRevoir.map((x) => <span className="lj-revoir" key={x.cle}>{x.dit}</span>)}
              </span>
              <span className={`lj-etat ${ETAT_TON[r.etat] ?? ''}`}>{r.etatDit}</span>
              {r.gestes.length > 0 && (
                <span className="lj-gestes">
                  {r.gestes.map((g, i) => (
                    <button type="button" key={g} className={`lj-g${i === 0 ? ' plein' : ''}`} onClick={() => fais(r.id, g)}>{GESTE_DIT[g]}</button>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* LES DÉPENSES DU JOUR, sous les rendez-vous et avant la caisse du jour (5 novembre 2026). */}
        {depenses?.lues && (
          <div className="lj-bloc" data-lj="depenses">
            <p className="lj-bloc__tete">
              <span>Les dépenses du jour</span>
              <span>{saisiesDites(depenses.saisies)}{depenses.totalXof > 0 ? ` · ${francsDits(depenses.totalXof)}` : ''}{depenses.relues ? ' · relues par Grenat' : ` · relues à ${heureDesDepenses} h`}</span>
            </p>
            {depensesVues.map((c) => {
              const gs = gestesVus(c);
              const pourquoi = gs.length < c.gestes.length ? pourquoiPasCeGeste(c) : '';
              return (
                <div className="lj-ligne" key={c.cle} data-lj-depense={c.cle} data-genre={c.genre} data-bloque={c.bloque ? 'oui' : 'non'}>
                  <span className="lj-heure">{c.heure}</span>
                  <span className="lj-qui-dit">
                    <span className="lj-qui">{c.quoi}</span>
                    <span className="lj-dit">{c.dit}</span>
                    {c.bloque && <span className="lj-revoir">Elle retient le comptage du tiroir tant qu’elle n’est pas validée.</span>}
                    {pourquoi && <span className="lj-libelle">{pourquoi}</span>}
                  </span>
                  <span className={`lj-etat ${DEPENSE_TON[c.genre]}`}>{c.etatDit}</span>
                  {gs.length > 0 && (
                    <span className="lj-gestes">
                      {gs.map((g, i) => (
                        <button type="button" key={g} className={`lj-g${i === 0 ? ' plein' : ''}`} onClick={() => void faisPourLaDepense(c, g)}>
                          {g === 'rien-aujourdhui' ? (jour === aujourdhui ? 'Rien aujourd’hui' : 'Rien ce jour-là') : GESTE_DEPENSE_DIT[g]}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
            {depensesCachees > 0 && (
              <p className="lj-vide">{depensesCachees > 1 ? `${depensesCachees} autres dépenses à relire, que la direction voit.` : 'Une autre dépense à relire, que la direction voit.'}</p>
            )}
            {constatsDepenses.length === 0 && (
              <p className="lj-vide">
                {depenses.relues
                  ? (depenses.saisies ? `Rien à redire : ${saisiesDites(depenses.saisies)}, chacune complète.` : 'Aucune dépense ce jour-là, et rien à redire.')
                  : `Rien à redire pour l’instant ; Grenat relit les dépenses à ${heureDesDepenses} h.`}
              </p>
            )}
            <p className="lj-regle">Grenat ne saisit aucune dépense lui-même. Il les met sous vos yeux avec le geste qui les règle ; la validation reste à la direction, comme aujourd’hui. Une dépense à compléter ne retient pas la journée : seule une dépense à valider du jour retient le comptage.</p>
          </div>
        )}

        {alarmes.length > 0 && (
          <div className="lj-bloc lj-bloc--alarme" data-lj="alarmes">
            <p className="lj-bloc__tete"><span>Les pièces payées effacées</span><span>{alarmesOuvertes.length} à trancher</span></p>
            {alarmes.map((x) => (
              <div className="lj-ligne" key={x.cle}>
                <span className="lj-heure">{x.numero}</span>
                <span className="lj-qui-dit"><span className="lj-dit">{x.dit}</span>
                  {x.tranchee && <span className="lj-dit">Tranché par {x.tranchee.par}{x.tranchee.mot ? ` : « ${x.tranchee.mot} »` : ''}.</span>}
                </span>
                <span className={`lj-etat ${x.ouverte ? 'ko' : 'ok'}`}>{x.ouverte ? (x.sort === 'perdue' ? 'Argent perdu de vue' : 'À dire') : (x.sort === 'fondue' ? 'Fondue' : 'Tranché')}</span>
                {x.ouverte && (
                  <span className="lj-gestes">
                    {souverain && <button type="button" className="lj-g plein" onClick={() => void trancher(x.cle, x.dit)}>Trancher</button>}
                    {x.successeur && <button type="button" className="lj-g" onClick={() => navigate(`/factures?id=${x.successeur!.id}`)}>Voir {x.successeur.numero}</button>}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {aRevoir.length > 0 && (
          <div className="lj-bloc" data-lj="a-revoir">
            <p className="lj-bloc__tete"><span>Les factures à revoir</span><span>{aRevoir.length}</span></p>
            {aRevoir.map((x) => (
              <div className="lj-ligne" key={x.cle}>
                <span className="lj-heure">{x.qui}</span>
                <span className="lj-qui-dit"><span className="lj-dit">{x.dit}</span></span>
                <span className="lj-etat ko">À revoir</span>
                <span className="lj-gestes">
                  {x.pieceId && <button type="button" className="lj-g" onClick={() => navigate(`/factures?id=${x.pieceId}`)}>Ouvrir la facture</button>}
                  {souverain && <button type="button" className="lj-g" onClick={() => void trancher(x.cle, x.dit)}>Trancher</button>}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="lj-bloc" data-lj="grenat">
          <p className="lj-bloc__tete"><span>Ce que Grenat fait seul</span><span>trois gestes sûrs</span></p>
          {fait.map((g) => <p className="lj-fait" key={g.cle}>Fait : {g.dit}</p>)}
          {cloture.gestes.map((g) => <p className="lj-fait lj-fait--attend" key={g.cle}>À son prochain passage : {g.dit}</p>)}
          {fait.length === 0 && cloture.gestes.length === 0 && (
            <p className="lj-vide">{passage ? `Grenat a tout relu à ${momentDit(passage.moment)} : rien à faire seul.` : 'Rien à faire seul pour l’instant.'}</p>
          )}
          <p className="lj-regle">Seul, Grenat envoie le papier pas encore parti (par la salle d’attente), passe « honoré » un rendez-vous réglé en entier encore « confirmé », et relie une facture à son rendez-vous quand il n’y a qu’un candidat. Jamais seul : une absence, un prix, une remise, un paiement, un effacement.</p>
        </div>

        <div className="lj-bloc" data-lj="caisse-resume">
          <p className="lj-bloc__tete"><span>La caisse du jour</span><span>par moyen et par tiroir</span></p>
          <div className="lj-caisse">
            {cloture.caisse.parMoyen.map((m) => <p className="lj-l" key={`m-${m.famille}`}><span>{m.famille}</span><b>{francsDits(m.totalXof)}</b></p>)}
            {cloture.caisse.parTiroir.map((t) => <p className="lj-l lj-l--tiroir" key={`t-${t.tiroir}`}><span>Tiroir · {t.tiroir}</span><b>{francsDits(t.totalXof)}</b></p>)}
            {cloture.caisse.rdvAEncaisser > 0 && <p className="lj-l"><span>Reste à encaisser ({cloture.caisse.rdvAEncaisser} rendez-vous)</span><b>{francsDits(cloture.caisse.resteAEncaisserXof)}</b></p>}
            {cloture.caisse.sortiDesComptesXof > 0 && <p className="lj-l lj-l--ko"><span>Encaissé puis sorti des comptes, toujours compté</span><b>{francsDits(cloture.caisse.sortiDesComptesXof)}</b></p>}
            {cloture.caisse.parMoyen.length === 0 && cloture.caisse.rdvAEncaisser === 0 && <p className="lj-vide">Aucun argent reçu ce jour-là.</p>}
          </div>
        </div>
      </section>

      {/* EN FIN DE PAGE, LA CAISSE DU JOUR — le journal déplacé de la Caisse. */}
      <section className="lj-journal" aria-label="La caisse du jour">
        <JournalDeCaisse
          jour={jour}
          onJour={setJour}
          aujourdhui={aujourdhui}
          clotureOuverteAuxGestes={close}
          pourquoiPasEncore={pourquoiPasEncore}
        />
      </section>

      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}
    </div>
  );
}
