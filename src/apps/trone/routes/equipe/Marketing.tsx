import { asset } from '../../../../shared/asset';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OptionsPrestations, PageHead } from '../_ui';
import { Button, Card, Eyebrow, Field, Input, Modal, Select, alerte, demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useSegments } from '../../../../shared/clients';
import { useCategories, useServices } from '../../../../shared/catalog';
import { uid } from '../../../../shared/store';
import { pushBroadcastClients } from '../../../../shared/push';
import { cleDuSegment, estUneAudienceConnue } from '../../../../shared/audiences-pur';
import type { Campagne } from '../../../../shared/campagnes-pur';
import {
  OFFER_AUDIENCES, OFFER_DAYS, OFFER_HOURS,
  useOffers, offerLiveNow,
  etatDeLOffre, saisonsAProposer, saisonsDeLaMaison, offreDepuisLaSaison, SAISONS, FENETRE_PROPOSITION, codeNormalise,
  OFFRES_DE_PARCOURS, offreDeParcours,
  prestationsDesCategories, codeDepuisLOffre,
  type InstantOffer,
} from './data';
import { OngletAudience, OngletAutomatisations, OngletCampagnes, campagneNeuve } from './MarketingBranche';
import { useAbonnesAuxNotifications } from './useAudiences';
import { Pill, Tabs } from './ui';
import './equipe.css';

type Tab = 'campagnes' | 'offres' | 'auto' | 'audience';

type OfferForm = {
  title: string; tag: string; deal: string; sub: string; audience: string;
  days: string[]; heureDebut: string; heureFin: string;
  serviceId: string; serviceIds: string[]; code: string; discountPct: string;
  vitrine: boolean; parcours: string; bouton: string; conditions: string;
  /* LA SAISON — 18 septembre 2026. Vides pour une offre qui se répète, comme
     une heure creuse ; remplies pour Octobre Rose, Noël ou le Ramadan. */
  du: string; au: string;
};

const emptyOffer: OfferForm = {
  title: '', tag: 'Offre éclair', deal: '', sub: '', audience: 'Tous',
  // Tous les jours par défaut (un salon travaille surtout le week-end) et large plage horaire.
  days: [...OFFER_DAYS], heureDebut: '08h', heureFin: '20h',
  serviceId: '', serviceIds: [], code: '', discountPct: '', du: '', au: '',
  vitrine: false, parcours: '', bouton: '', conditions: '',
};

/* UNE OFFRE MUETTE — 24 septembre 2026. « La cliente ne voit pas son total
   avec sa remise, RENTREE10 ne calcule pas » (Yéman), après avoir déployé la
   fonction et testé sur le site.

   Ce n'était pas une panne : l'offre en ligne ne portait ni code, ni
   prestations. Elle annonçait « −10 % » dans son avantage, et rien derrière.

   LA FAUTE ÉTAIT QUAND MÊME DE CE CÔTÉ-CI. L'alerte existait, mais SEULEMENT
   dans la fenêtre d'édition : elle ne se voyait donc qu'une fois qu'on était
   déjà en train de réparer. C'est le pire endroit pour une alerte. Elle
   remonte ici, sur la carte, là où l'offre se regarde.

   On lit l'AVANTAGE affiché (« −10 % », « 2 = 1 ») plutôt que `discountPct` :
   c'est justement quand le pourcentage manque que la promesse est vide. */
const promesseCreuse = (o: InstantOffer): boolean =>
  /[−-]\s?\d/.test(o.deal ?? '') && !(o.discountPct && (o.serviceIds?.length || o.serviceId));

export default function Marketing() {
  const { branch, currency } = useBranch();
  /* ?tab=auto — permet d'arriver droit sur les automatisations depuis ailleurs
     (bouton des Paramètres). Onglet inconnu → on retombe sur les campagnes. */
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const [tab, setTab] = useState<Tab>(
    asked === 'auto' || asked === 'offres' || asked === 'audience' ? asked : 'campagnes',
  );
  const [offers, setOffers] = useOffers();
  const [services] = useServices();
  const [categories] = useCategories();
  /* La liste des prestations est longue : un filtre évite de faire
     défiler cent lignes pour en cocher quatre. */
  const [filtrePresta, setFiltrePresta] = useState('');
  /* UN CODE EN CIRCULATION NE SE RÉÉCRIT PAS — 24 septembre 2026,
     remarque de la session pair, et c'est elle qui porte le risque.

     Le bouton de la carte emporte le code dans l'adresse : une cliente peut
     l'avoir dans un message, sur une affiche, dans un onglet ouvert depuis
     hier. Un code changé sous les pieds d'un lien déjà parti ne se rattrape
     pas, et le serveur, lui, ne retire alors rien du tout, en silence.

     Donc : le code se fabrique tant qu'il n'existe pas, et ne bouge plus dès
     qu'il existe. Corriger un titre après coup est fréquent ; recevoir une
     cliente avec un code mort ne l'est pas. */
  const [codeALaMain, setCodeALaMain] = useState(false);
  /* LE MARKETING BRANCHÉ (21 octobre 2026) : les automatisations, l'audience
     et les campagnes vivent dans `MarketingBranche`. Ici, seulement ce qui les
     relie : la campagne ouverte, et « Écrire » depuis l'Audience qui la
     prépare déjà adressée. Les notifications se lisent une fois pour les deux. */
  const [segmentList] = useSegments();
  const abonnes = useAbonnesAuxNotifications();
  const [brouillon, setBrouillon] = useState<Campagne | null>(null);
  const ecrireA = (cle: string) => {
    setTab('campagnes');
    setBrouillon(campagneNeuve(branch.id, cle));
  };
  const nouvelleCampagne = () => ecrireA(segmentList[0] ? cleDuSegment(segmentList[0]) : 'dormantes');
  /* ?ecrire=<audience> — « Préparer la campagne des dormantes » depuis Les
     prévisions (26 octobre 2026) : la campagne s'ouvre déjà adressée. Elle
     reste un brouillon ; déposée, elle attend retenue le feu vert. */
  const aEcrire = params.get('ecrire');
  useEffect(() => {
    if (!aEcrire) return;
    if (estUneAudienceConnue(aEcrire)) ecrireA(aEcrire);
    setParams((p) => { p.delete('ecrire'); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aEcrire]);

  const [offerModal, setOfferModal] = useState(false);
  const [offerEditId, setOfferEditId] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState<OfferForm>(emptyOffer);
  const [notifBusy, setNotifBusy] = useState<string | null>(null);

  /* Diffuse une notification push à toutes les clientes abonnées pour cette offre. */
  const notifyOffer = async (o: InstantOffer) => {
    if (!await demande({
      quoi: 'Notification aux clientes',
      titre: `Notifier toutes les clientes de l’offre « ${o.title} » ?`,
      dit: 'Elles recevront une notification sur leur téléphone, tout de suite.',
      scelle: 'Une notification partie ne se rappelle pas.',
      accepter: 'Notifier les clientes',
      refuser: 'Ne pas notifier',
    })) return;
    setNotifBusy(o.id);
    const body = [o.deal, o.sub].filter(Boolean).join(' · ') || 'Une offre vous attend à la Maison.';
    const n = await pushBroadcastClients(`${o.tag} · ${o.title}`, body, '/couronne/');
    setNotifBusy(null);
    alerte(
      n > 0
        ? `Notification envoyée à ${n} cliente${n > 1 ? 's' : ''} abonnée${n > 1 ? 's' : ''}.`
        : 'Aucune cliente n’a encore activé les notifications sur Ma Couronne.',
    );
  };

  const branchOffers = useMemo(() => offers.filter((o) => o.branchId === branch.id), [offers, branch.id]);

  const serviceName = (id?: string) => (id ? services.find((s) => s.id === id)?.name ?? 'Prestation retirée du catalogue' : '');

  /* LA SAISON D'OÙ VIENT UNE OFFRE, retrouvée par son nom. Les sept patrons
     portent déjà code, remise, catégories, parcours et conditions : plutôt
     que de faire retaper tout cela, un clic le reprend. Le nom suffit, et
     c'est volontaire : une offre renommée à la main n'est plus la saison, et
     n'a donc plus à en hériter. */
  const saisonDe = (o: InstantOffer) => SAISONS.find((sa) => sa.nom === o.title);

  /* REPRENDRE LES RÉGLAGES DE LA SAISON. C'est le geste de la Maison qui
     écrit, jamais une migration silencieuse : elle voit ce qui change, et
     peut le corriger juste après. Les dates et l'audience NE BOUGENT PAS,
     ce sont les siennes. */
  const reprendreLaSaison = (o: InstantOffer) => {
    const sa = saisonDe(o);
    if (!sa) return;
    const couvertes = sa.categories?.length
      ? prestationsDesCategories(
        sa.categories,
        services.map((sv) => ({ id: sv.id, categoryId: sv.categoryId })),
        categories.map((c) => ({ id: c.id, parentId: c.parentId })),
      )
      : [];
    setOffers((prev) => prev.map((x) => (x.id === o.id ? {
      ...x,
      ...(sa.code ? { code: sa.code } : {}),
      ...(sa.remise ? { discountPct: sa.remise } : {}),
      ...(couvertes.length ? { serviceIds: couvertes } : {}),
      ...(couvertes.length === 1 ? { serviceId: couvertes[0] } : {}),
      ...(sa.parcours ? { parcours: sa.parcours } : {}),
      ...(sa.bouton ? { bouton: sa.bouton } : {}),
      ...(sa.conditions ? { conditions: sa.conditions } : {}),
    } : x)));
    toast(couvertes.length
      ? `« ${sa.nom} » reprend son code ${sa.code} et ${couvertes.length} prestation${couvertes.length > 1 ? 's' : ''}.`
      : `« ${sa.nom} » reprend ses réglages.`);
  };

  /* LES CODES DÉJÀ PRIS, celui qu'on modifie excepté : deux offres au même
     code, c'est la première trouvée qui gagne, et laquelle dépend de
     l'ordre du tableau. */
  const codesPris = (sauf?: string | null) => branchOffers.filter((o) => o.id !== sauf).map((o) => o.code ?? '');

  /* LE CODE SUIT LE TITRE, tant que la Maison ne l'a pas choisi elle-même.
     C'est la demande : « le code ne doit pas être réécrit, il doit se
     reporter automatiquement ». */
  const ecrisLOffre = (champs: Partial<OfferForm>) => {
    setOfferForm((f) => {
      const suite = { ...f, ...champs };
      if (codeALaMain) return suite;
      return { ...suite, code: codeDepuisLOffre(suite.title, suite.deal, codesPris(offerEditId)) };
    });
  };

  const openNewOffer = () => { setOfferEditId(null); setOfferForm(emptyOffer); setCodeALaMain(false); setOfferModal(true); };
  const openEditOffer = (o: InstantOffer) => {
    setOfferEditId(o.id);
    setOfferForm({
      title: o.title, tag: o.tag, deal: o.deal, sub: o.sub, audience: o.audience,
      days: [...o.days], heureDebut: o.heureDebut, heureFin: o.heureFin,
      serviceId: o.serviceId ?? '',
      /* Une offre d'hier n'a qu'une prestation liée : elle devient le
         premier élément de la liste, et rien ne se perd. */
      serviceIds: o.serviceIds ?? (o.serviceId ? [o.serviceId] : []),
      /* UNE OFFRE D'HIER N'A PAS DE CODE : on le lui fabrique À L'OUVERTURE
         plutôt qu'en silence à l'enregistrement. Elle le VOIT avant de
         valider, et peut encore en choisir un autre. */
      code: o.code ?? codeDepuisLOffre(o.title, o.deal, codesPris(o.id)),
      discountPct: o.discountPct != null ? String(o.discountPct) : '',
      du: o.du ?? '', au: o.au ?? '',
      vitrine: !!o.vitrine, parcours: o.parcours ?? '', bouton: o.bouton ?? '', conditions: o.conditions ?? '',
    });
    /* Un code déjà posé est peut-être déjà parti : on ne le refabrique pas. */
    setCodeALaMain(!!o.code);
    setOfferModal(true);
  };
  const saveOffer = () => {
    if (!offerForm.title.trim()) return;
    const disc = parseInt(offerForm.discountPct, 10);
    const payload = {
      title: offerForm.title.trim(), tag: offerForm.tag, deal: offerForm.deal, sub: offerForm.sub,
      audience: offerForm.audience, days: [...offerForm.days], heureDebut: offerForm.heureDebut, heureFin: offerForm.heureFin,
      /* `serviceId` reste la prestation qu'on réserve EN UN GESTE depuis
         Ma Couronne : elle n'a de sens qu'au singulier, et suit la
         première cochée pour que ce geste continue de marcher. */
      serviceId: offerForm.serviceIds.length === 1 ? offerForm.serviceIds[0] : undefined,
      serviceIds: offerForm.serviceIds.length ? [...offerForm.serviceIds] : undefined,
      /* UN CHAMP VIDE SE LAISSE VIDE, et c'est exactement ce qui est
         arrivé : une offre annonçait « −10 % » et ne portait aucun code.
         À l'enregistrement, un code absent se fabrique. */
      code: codeNormalise(offerForm.code)
        || codeDepuisLOffre(offerForm.title, offerForm.deal, codesPris(offerEditId))
        || undefined,
      discountPct: Number.isFinite(disc) && disc > 0 ? Math.min(90, disc) : undefined,
      /* Une date vide NE S ECRIT PAS : l'offre reste alors sans saison et se
         comporte comme avant, ce qui protège toutes celles d'hier. */
      du: offerForm.du || undefined,
      au: offerForm.au || undefined,
      /* LA VITRINE ET SES MOTS (22 septembre 2026) : un vide ne s'écrit pas,
         pour que les offres d'hier restent exactement ce qu'elles étaient. */
      vitrine: offerForm.vitrine || undefined,
      parcours: offerForm.parcours || undefined,
      bouton: offerForm.bouton.trim() || undefined,
      conditions: offerForm.conditions.trim() || undefined,
    };
    if (offerEditId) {
      setOffers((prev) => prev.map((o) => (o.id === offerEditId ? { ...o, ...payload } : o)));
    } else {
      setOffers((prev) => [...prev, { id: `of-${uid()}`, branchId: branch.id, active: true, ...payload }]);
    }
    setOfferModal(false);
  };
  const toggleDay = (d: string) =>
    setOfferForm((f) => ({
      ...f,
      days: f.days.includes(d)
        ? f.days.filter((x) => x !== d)
        : OFFER_DAYS.filter((x) => f.days.includes(x) || x === d),
    }));

  const daysLabel = (o: InstantOffer) =>
    o.days.length === 0 ? 'Aucun jour' : o.days.length === 7 ? 'Tous les jours' : o.days.join(' · ');

  /* ── LES SAISONS ─────────────────────────────────────────────────────
     « Faire une offre pour Octobre Rose, Noël, la Saint-Valentin, le mois de
     la femme, le Ramadan, la fête des mères, et que j'aie la possibilité de
     les activer dès qu'on se rapproche de ces dates à 21 jours près »
     (Yéman, 18 septembre 2026). */

  const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  const ditLeJour = (iso?: string): string => {
    if (!iso) return 'sans borne';
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return 'sans borne';
    return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`;
  };

  /* Les saisons qu'il faut regarder AUJOURD'HUI : datées, à moins de trois
     semaines, et pas déjà posées pour cette occurrence. Le calcul se refait
     à chaque rendu, ce qui suffit : la fenêtre se compte en jours, pas en
     minutes, et l'écran se rouvre plus souvent qu'elle ne bouge. */
  const saisonsProposees = useMemo(
    () => saisonsAProposer(SAISONS, branchOffers),
    [branchOffers],
  );

  /* LES SEPT, TOUTE L'ANNÉE — 24 septembre 2026. « Où sont les sept saisons
     d'offres à venir ? » (Yéman). Elles étaient invisibles onze mois sur
     douze : l'écran ne montrait que celles qui ouvrent dans les trois
     semaines ET qui ne sont pas déjà posées. Ce jour-là, les deux seules
     dans la fenêtre étaient posées, et la carte disparaissait entièrement.
     AVERTIR ET MONTRER SONT DEUX GESTES : la veille garde sa règle, et
     l'almanach ci-dessous les rend toutes. */
  const toutesLesSaisons = useMemo(
    () => saisonsDeLaMaison(SAISONS, branchOffers),
    [branchOffers],
  );

  /* UNE OFFRE PAR PARCOURS — 24 septembre 2026, « crée des offres pour
     chaque parcours du client » (Yéman). Elles n'ont pas de saison : elles
     disent comment la Maison accueille sur chacune de ses cinq portes. Comme
     les saisons, elles attendent d'être allumées. */
  const parcoursProposes = useMemo(
    () => saisonsDeLaMaison(OFFRES_DE_PARCOURS, branchOffers),
    [branchOffers],
  );

  const activerLeParcours = (saison: (typeof OFFRES_DE_PARCOURS)[number]) => {
    setOffers((prev) => [...prev, offreDeParcours(
      saison, branch.id, `of-${uid()}`,
      services.map((sv) => ({ id: sv.id, categoryId: sv.categoryId })),
      categories.map((c) => ({ id: c.id, parentId: c.parentId })),
    )]);
  };

  const basculeLOffre = (offreId: string, enLigne?: boolean) =>
    setOffers((prev) => prev.map((x) => (x.id === offreId ? { ...x, active: !enLigne } : x)));

  /* ACTIVER, C'EST ÉCRIRE UNE VRAIE OFFRE. La saison n'est qu'un patron : ce
     geste en tire une offre datée, modifiable ensuite comme n'importe quelle
     autre, et c'est elle, jamais le patron, qui paraît au salon et sur le
     site. Ainsi une saison revient chaque année sans qu'on redéploie. */
  const activerLaSaison = (saison: (typeof SAISONS)[number], du: string, au: string) => {
    setOffers((prev) => [...prev, offreDepuisLaSaison(
      saison, { du, au }, branch.id, `of-${uid()}`,
      services.map((sv) => ({ id: sv.id, categoryId: sv.categoryId })),
      categories.map((c) => ({ id: c.id, parentId: c.parentId })),
    )]);
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Intelligence · Marketing & IA"
        title="L’intelligence."
        sub="Campagnes · offres · automatisations · audience."
        actions={
          tab === 'offres' ? <Button variant="copper" onClick={openNewOffer}>+ Offre instantanée</Button>
          : tab === 'campagnes' ? <Button variant="copper" onClick={nouvelleCampagne}>+ Campagne</Button>
          : undefined
        }
      />

      <Tabs<Tab>
        tabs={[
          { k: 'campagnes', l: 'Campagnes' },
          { k: 'offres', l: 'Offres instantanées' },
          { k: 'auto', l: 'Automatisations' },
          { k: 'audience', l: 'Audience' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'campagnes' && (
        <OngletCampagnes abonnes={abonnes} brouillon={brouillon} onBrouillon={setBrouillon} />
      )}

      {tab === 'offres' && (
        <div>
          <div className="tre-actions-row">
            <div className="mnd-muted" style={{ fontSize: 13, fontWeight: 300, maxWidth: '60%' }}>
              Promotions instantanées poussées dans <span style={{ color: 'var(--color-indigo)' }}>Ma Couronne</span>, vous choisissez les jours, les heures et qui les voit.
            </div>
            <div className="mnd-muted" style={{ fontSize: 11.5 }}>
              {branchOffers.filter((o) => o.active).length} en ligne · {branchOffers.length} offres
            </div>
          </div>

          {/* LA VEILLE DES SAISONS — 18 septembre 2026. « Que j'aie la
              possibilité de les activer dès qu'on se rapproche de ces dates à
              21 jours près » (Yéman). Une saison se PRÉSENTE, elle ne s'allume
              jamais d'elle-même : la Maison garde la main, et tant qu'elle n'a
              pas cliqué, rien ne paraît nulle part. */}
          {saisonsProposees.length > 0 && (
            <Card className="tre-saisons">
              <Eyebrow>La Maison prépare</Eyebrow>
              <div className="tre-saisons__titre">
                {saisonsProposees.length > 1
                  ? `${saisonsProposees.length} saisons approchent`
                  : 'Une saison approche'}
              </div>
              <div className="mnd-muted" style={{ fontSize: 12.5, fontWeight: 300, marginBottom: 12 }}>
                À trois semaines de l’ouverture, et tant qu’elle court encore. Rien ne s’active sans vous.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {saisonsProposees.map(({ saison, du, au, dans }) => (
                  <div key={saison.cle} className="tre-saison">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tre-saison__nom">
                        {saison.nom}
                        {saison.aConfirmer && <span className="tre-saison__doute">date à confirmer</span>}
                      </div>
                      <div className="mnd-muted" style={{ fontSize: 12, fontWeight: 300 }}>
                        {ditLeJour(du)} → {ditLeJour(au)} · {saison.deal}
                      </div>
                    </div>
                    <div className="mnd-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {/* UNE SAISON COMMENCÉE N'OUVRE PAS AUJOURD'HUI. L'écran
                          le disait pourtant, pour toute valeur négative : la
                          rentrée, entamée depuis seize jours, s'annonçait
                          comme ouvrant le jour même. */}
                      {dans > 0
                        ? `dans ${dans} jour${dans > 1 ? 's' : ''}`
                        : dans === 0
                          ? 'elle ouvre aujourd’hui'
                          : `commencée depuis ${-dans} jour${-dans > 1 ? 's' : ''}`}
                    </div>
                    <Button variant="copper" onClick={() => activerLaSaison(saison, du, au)}>Activer</Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* L'ALMANACH DES SEPT. La veille ci-dessus AVERTIT ; celui-ci
              MONTRE. Une saison lointaine s'active aussi, sobrement : c'est
              la Maison qui décide de son calendrier, et préparer Noël en
              septembre est son droit. */}
          <Card className="tre-saisons">
            <Eyebrow>Les saisons de la Maison</Eyebrow>
            <div className="tre-saisons__titre">Sept saisons, déjà écrites</div>
            <div className="mnd-muted" style={{ fontSize: 12.5, fontWeight: 300, marginBottom: 12 }}>
              Chacune porte son code, sa remise, les prestations qu’elle couvre et ses conditions.
              Activer suffit. Rien ne s’active sans vous.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {toutesLesSaisons.map(({ saison, du, au, dans, etat, offreId, enLigne }) => (
                <div key={saison.cle} className={`tre-saison${etat === 'posee' && enLigne ? ' est-posee' : ''}`}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tre-saison__nom">
                      {saison.nom}
                      {saison.aConfirmer && <span className="tre-saison__doute">date à confirmer</span>}
                    </div>
                    <div className="mnd-muted" style={{ fontSize: 12, fontWeight: 300 }}>
                      {du && au ? `${ditLeJour(du)} → ${ditLeJour(au)} · ` : ''}
                      {saison.deal}
                      {saison.code ? ` · code ${saison.code}` : ''}
                    </div>
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {etat === 'sansDate'
                      ? 'année à inscrire'
                      : etat === 'posee'
                        ? 'déjà posée'
                        : (dans ?? 0) > 0
                          ? `dans ${dans} jour${(dans ?? 0) > 1 ? 's' : ''}`
                          : (dans ?? 0) === 0
                            ? 'elle ouvre aujourd’hui'
                            : `commencée depuis ${-(dans ?? 0)} jour${-(dans ?? 0) > 1 ? 's' : ''}`}
                  </div>
                  {/* ÉTEINDRE N'EST PAS SUPPRIMER — 24 septembre 2026,
                      « mettre le bouton désactiver aussi » (Yéman). Le
                      bouton rend le geste d'activer réversible depuis le
                      même endroit. Il éteint l'offre, il ne l'efface pas :
                      les réglages et les corrections de la Maison restent,
                      et « Réactiver » les rallume tels quels. Pour retirer
                      vraiment, « Retirer » vit sur la carte de l'offre, là
                      où l'on voit ce qu'on jette. */}
                  {etat === 'posee' && offreId
                    ? (
                      <Button
                        variant="ghost"
                        onClick={() => basculeLOffre(offreId, enLigne)}
                      >
                        {enLigne ? 'Désactiver' : 'Réactiver'}
                      </Button>
                    )
                    : etat === 'sansDate' || !du || !au
                      ? <span style={{ width: 92 }} />
                      : (
                        <Button
                          variant={etat === 'proche' ? 'copper' : 'ghost'}
                          onClick={() => activerLaSaison(saison, du, au)}
                        >
                          Activer
                        </Button>
                      )}
                </div>
              ))}
            </div>
          </Card>

          {/* LES CINQ PORTES ONT CHACUNE SON OFFRE. Écrites, jamais allumées
              d'elles-mêmes : les mots et les chiffres sont à la Maison, et
              ce qui lui est épargné, c'est de les écrire à partir de rien. */}
          <Card className="tre-saisons">
            <Eyebrow>Les parcours de la Maison</Eyebrow>
            <div className="tre-saisons__titre">Une offre par parcours</div>
            <div className="mnd-muted" style={{ fontSize: 12.5, fontWeight: 300, marginBottom: 12 }}>
              Sans saison : elles disent comment la Maison accueille sur chacune de ses portes,
              et paraissent sur le site tant qu’elles sont allumées.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {parcoursProposes.map(({ saison, etat, offreId, enLigne }) => (
                <div key={saison.cle} className={`tre-saison${etat === 'posee' && enLigne ? ' est-posee' : ''}`}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tre-saison__nom">{saison.nom}</div>
                    <div className="mnd-muted" style={{ fontSize: 12, fontWeight: 300 }}>
                      {saison.tag} · {saison.deal}{saison.code ? ` · code ${saison.code}` : ''}
                    </div>
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {etat === 'posee' ? (enLigne ? 'en ligne' : 'éteinte') : 'à allumer'}
                  </div>
                  {etat === 'posee' && offreId
                    ? (
                      <Button variant="ghost" onClick={() => basculeLOffre(offreId, enLigne)}>
                        {enLigne ? 'Désactiver' : 'Réactiver'}
                      </Button>
                    )
                    : <Button variant="copper" onClick={() => activerLeParcours(saison)}>Activer</Button>}
                </div>
              ))}
            </div>
          </Card>

          {branchOffers.length === 0 && (
            <Card className="tre-empty">
              <img src={asset("/assets/monograms/mono-indigo.png")} alt="" style={{ width: 36, opacity: 0.4 }} />
              <div className="tre-empty__title">Aucune offre en cours.</div>
              <div className="tre-empty__sub">Créez une offre instantanée pour la faire apparaître dans l’app cliente.</div>
            </Card>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {branchOffers.map((o) => (
              <Card key={o.id} className={`tre-offer ${o.active ? '' : 'is-off'}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span className="tre-pill tre-pill--copper">{o.tag}</span>
                      <span className="tre-offer__deal">{o.deal}</span>
                      {/* Statut HONNÊTE : « En ligne » seulement si visible MAINTENANT côté
                          cliente ; « Programmée » si active mais hors de sa fenêtre jour/heure
                          (les jours/heures ci-dessous disent quand elle apparaîtra). */}
                      {/* DEUX VÉRITÉS, ET ON NE LES CONFOND PAS. La SAISON dit
                          si l'offre est dans ses dates ; la FENÊTRE jour et
                          heure dit si elle est visible à cette minute. Une
                          offre en pleine saison mais hors de sa tranche
                          horaire reste « Programmée » : c'est l'honnêteté que
                          portait déjà cette pastille, et elle est conservée. */}
                      {(() => {
                        const e = etatDeLOffre(o);
                        if (e === 'passee') return <Pill tone="muted">Saison passée</Pill>;
                        if (e === 'dort') return <Pill tone="muted">Hors ligne</Pill>;
                        if (e === 'activer') return <Pill tone="warn">À activer</Pill>;
                        if (e === 'venir') return <Pill tone="warn">À venir</Pill>;
                        return (
                          <Pill tone={offerLiveNow(o) ? 'ok' : 'warn'}>
                            {offerLiveNow(o) ? 'En ligne' : 'Programmée'}
                          </Pill>
                        );
                      })()}
                    </div>
                    <div className="tre-offer__title">{o.title}</div>
                    <div className="mnd-muted" style={{ fontSize: 12.5, fontWeight: 300, marginTop: 2 }}>{o.sub}</div>
                    {promesseCreuse(o) && (
                      <div className="tre-offer__creuse">
                        <b>Cette offre annonce « {o.deal} » et ne retirera rien.</b>
                        <span>
                          {o.code ? 'Elle ne couvre aucune prestation' : 'Elle n’a pas de code'}
                          {o.discountPct ? '' : (o.code ? ' et ne porte pas de pourcentage' : ' ni de pourcentage')}
                          {' : la carte du site promet une remise que rien n’applique.'}
                        </span>
                        {saisonDe(o) ? (
                          <button type="button" className="tre-offer__reprendre" onClick={() => reprendreLaSaison(o)}>
                            Reprendre les réglages de la saison
                          </button>
                        ) : null}
                      </div>
                    )}
                    <div className="tre-offer__meta">
                      <div>
                        <div className="tre-offer__meta-label">Qui la voit</div>
                        <div className="tre-offer__meta-value">{o.audience}</div>
                      </div>
                      <div>
                        <div className="tre-offer__meta-label">Jours</div>
                        <div className="tre-offer__meta-value" style={{ color: 'var(--ink)' }}>{daysLabel(o)}</div>
                      </div>
                      <div>
                        <div className="tre-offer__meta-label">Saison</div>
                        <div className="tre-offer__meta-value" style={{ color: 'var(--ink)' }}>
                          {o.du || o.au ? `${ditLeJour(o.du)} → ${ditLeJour(o.au)}` : 'Elle se répète'}
                        </div>
                      </div>
                      <div>
                        <div className="tre-offer__meta-label">Heures</div>
                        <div className="tre-offer__meta-value" style={{ color: 'var(--ink)' }}>{o.heureDebut} – {o.heureFin}</div>
                      </div>
                      <div>
                        <div className="tre-offer__meta-label">Code</div>
                        <div className="tre-offer__meta-value" style={{ color: 'var(--ink)', letterSpacing: '.1em' }}>{o.code || '—'}</div>
                      </div>
                      <div>
                        <div className="tre-offer__meta-label">Prestations couvertes</div>
                        <div className="tre-offer__meta-value" style={{ color: 'var(--ink)' }}>
                          {o.serviceIds?.length
                            ? (o.serviceIds.length === 1 ? serviceName(o.serviceIds[0]) : `${o.serviceIds.length} prestations`)
                            : (o.serviceId ? serviceName(o.serviceId) : '—')}
                        </div>
                      </div>
                      <div>
                        <div className="tre-offer__meta-label">Remise appliquée</div>
                        <div className="tre-offer__meta-value" style={{ color: 'var(--copper-700)' }}>{o.discountPct ? `−${o.discountPct} %` : '—'}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none', width: 160 }}>
                    <Button size="sm" onClick={() => setOffers((prev) => prev.map((x) => (x.id === o.id ? { ...x, active: !x.active } : x)))}>
                      {o.active ? 'Mettre hors ligne' : 'Mettre en ligne'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEditOffer(o)}>Modifier</Button>
                    <Button size="sm" variant="copper" disabled={notifBusy === o.id} onClick={() => void notifyOffer(o)}>
                      {notifBusy === o.id ? 'Envoi…' : 'Notifier les clientes'}
                    </Button>
                    <button className="tre-link-btn" style={{ color: 'var(--ink-soft)' }} onClick={() => setOffers((prev) => prev.filter((x) => x.id !== o.id))}>
                      Retirer
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'auto' && <OngletAutomatisations />}

      {tab === 'audience' && <OngletAudience abonnes={abonnes} onEcrire={ecrireA} />}

      {offerModal && (
        <Modal title={offerEditId ? 'Modifier l’offre instantanée.' : 'Nouvelle offre instantanée.'} onClose={() => setOfferModal(false)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Prestation / offre">
              <Input value={offerForm.title} onChange={(e) => ecrisLOffre({ title: e.target.value })} />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Accroche">
                <Input value={offerForm.tag} onChange={(e) => setOfferForm({ ...offerForm, tag: e.target.value })} />
              </Field>
              <Field label="Avantage · remise">
                <Input value={offerForm.deal} onChange={(e) => ecrisLOffre({ deal: e.target.value })} />
              </Field>
            </div>
            <Field label="Détail">
              <Input value={offerForm.sub} onChange={(e) => setOfferForm({ ...offerForm, sub: e.target.value })} />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Code de la remise · il se fabrique tout seul">
                <Input
                  value={offerForm.code}
                  placeholder="RENTREE10"
                  style={{ letterSpacing: '.12em', textTransform: 'uppercase' }}
                  onChange={(e) => { setCodeALaMain(true); setOfferForm({ ...offerForm, code: codeNormalise(e.target.value) }); }}
                />
              </Field>
              <Field label="Remise (%) · appliquée au prix">
                <Input
                  inputMode="numeric"
                  value={offerForm.discountPct}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                    setOfferForm({ ...offerForm, discountPct: raw });
                  }}
                />
              </Field>
            </div>
            {/* LES PRESTATIONS SE COCHENT, PLUSIEURS — 24 septembre 2026.
                « Dans réservation liée à une offre je ne peux que choisir 1
                dans la liste. Besoin de cocher plusieurs au besoin » (Yéman).
                La liste à un choix ne pouvait pas dire « les lavages rituels
                ET les reprises de racines », qui est pourtant le texte même
                de l'offre de rentrée. */}
            <Field label="Prestations couvertes · la remise ne porte que sur elles">
              <Input
                value={filtrePresta}
                placeholder="Filtrer : lavage, reprise, soin…"
                onChange={(e) => setFiltrePresta(e.target.value)}
              />
              <div className="tre-presta">
                {(() => {
                  const cherche = filtrePresta.trim().toLowerCase();
                  const vues = services.filter((sv) => !cherche || (sv.name ?? '').toLowerCase().includes(cherche));
                  if (!vues.length) return <p className="tre-presta__vide">Aucune prestation ne porte ces lettres.</p>;
                  return vues.map((sv) => {
                    const coche = offerForm.serviceIds.includes(sv.id);
                    return (
                      <label key={sv.id} className={`tre-presta__l${coche ? ' is-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={coche}
                          onChange={() => setOfferForm({
                            ...offerForm,
                            serviceIds: coche
                              ? offerForm.serviceIds.filter((x) => x !== sv.id)
                              : [...offerForm.serviceIds, sv.id],
                          })}
                        />
                        <span className="tre-presta__nom">{sv.name}</span>
                        <span className="tre-presta__prix">
                          {sv.priceXof && sv.priceMode !== 'devis' ? fmtMoney(sv.priceXof, currency) : 'au salon'}
                        </span>
                      </label>
                    );
                  });
                })()}
              </div>
              <div className="tre-presta__pied">
                <span>
                  {offerForm.serviceIds.length
                    ? `${offerForm.serviceIds.length} prestation${offerForm.serviceIds.length > 1 ? 's' : ''} couverte${offerForm.serviceIds.length > 1 ? 's' : ''}.`
                    : 'Aucune cochée : la remise ne retirerait rien nulle part.'}
                </span>
                {offerForm.serviceIds.length
                  ? <button type="button" className="tre-presta__tout" onClick={() => setOfferForm({ ...offerForm, serviceIds: [] })}>Tout décocher</button>
                  : null}
              </div>
              {/* LA PROMESSE CREUSE A DEUX FORMES, et mon alerte n'en disait
                  qu'une — 24 septembre 2026. « La cliente ne voit pas son total
                  avec sa remise » (Yéman) : il avait posé le code ET coché une
                  prestation, mais laissé la remise vide, et rien ne le lui
                  disait. Un pourcentage sans portée et une portée sans
                  pourcentage sont le même trou vu des deux côtés. */}
              {(() => {
                const pct = parseInt(offerForm.discountPct, 10) > 0;
                const porte = offerForm.serviceIds.length > 0;
                const annonce = /[−-]\s?\d/.test(offerForm.deal ?? '') || !!offerForm.code;
                if (pct && !porte) {
                  return <p className="tre-presta__alerte">Cette offre annonce une remise mais ne couvre aucune prestation : elle ne retirera rien.</p>;
                }
                if (porte && !pct) {
                  return <p className="tre-presta__alerte">Ces prestations sont cochées, mais la remise est vide : le code sera reconnu et ne retirera rien. Écrivez le pourcentage juste au-dessus.</p>;
                }
                if (annonce && !pct && !porte) {
                  return <p className="tre-presta__alerte">Cette offre promet un avantage chiffré et ne porte ni remise ni prestation : la carte du site annoncera une remise que rien n’applique.</p>;
                }
                return null;
              })()}
            </Field>
            <Field label="Qui peut la voir · audience">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {OFFER_AUDIENCES.map((a) => (
                  <button key={a} className={`tre-chip ${offerForm.audience === a ? 'is-on' : ''}`} onClick={() => setOfferForm({ ...offerForm, audience: a })}>{a}</button>
                ))}
              </div>
            </Field>
            <Field label="Jours d’affichage">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                <button
                  className={`tre-chip ${offerForm.days.length === OFFER_DAYS.length ? 'is-on' : ''}`}
                  onClick={() => setOfferForm((f) => ({ ...f, days: [...OFFER_DAYS] }))}
                >
                  Tous les jours
                </button>
                {OFFER_DAYS.map((d) => (
                  <button key={d} className={`tre-chip ${offerForm.days.includes(d) ? 'is-on' : ''}`} onClick={() => toggleDay(d)}>{d}</button>
                ))}
              </div>
            </Field>
            {/* LA SAISON — 18 septembre 2026. Vide pour une heure creuse, qui
                se répète ; remplie pour Octobre Rose, Noël ou le Ramadan, qui
                ont un premier et un dernier jour. Hors de ces bornes l'offre
                ne paraît nulle part, ni au salon ni sur le site. */}
            <div className="tr-grid tr-grid--2">
              <Field label="Premier jour · laisser vide si elle se répète">
                <Input
                  type="date"
                  value={offerForm.du}
                  max={offerForm.au || undefined}
                  onChange={(e) => setOfferForm({ ...offerForm, du: e.target.value })}
                />
              </Field>
              <Field label="Dernier jour · inclus">
                <Input
                  type="date"
                  value={offerForm.au}
                  min={offerForm.du || undefined}
                  onChange={(e) => setOfferForm({ ...offerForm, au: e.target.value })}
                />
              </Field>
            </div>
            {/* LA VITRINE — 22 septembre 2026. Le site ne montre que les offres
                datées ; une offre permanente, « la consultation déduite de votre
                création », n'a pas de saison. Cochée, elle paraît sans date de
                fin. Le parcours choisit le bouton de la carte et sa destination ;
                les conditions se déplient sous la carte, à la place d'une phrase
                écrite en dur dans le site. */}
            <div className="tr-grid tr-grid--2">
              <Field label="Sur le site public">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button
                    type="button"
                    className={`tre-chip ${offerForm.vitrine ? 'is-on' : ''}`}
                    aria-pressed={offerForm.vitrine}
                    onClick={() => setOfferForm({ ...offerForm, vitrine: !offerForm.vitrine })}
                  >
                    En vitrine, sans date de fin
                  </button>
                </div>
              </Field>
              <Field label="Parcours du site qu’elle sert">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {([['creation', 'Première Couronne'], ['reparation', 'Réparation'], ['entretien', 'Entretien'], ['enfant', 'MND Kids'], ['formation', 'Formations']] as const).map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      className={`tre-chip ${offerForm.parcours === k ? 'is-on' : ''}`}
                      aria-pressed={offerForm.parcours === k}
                      onClick={() => setOfferForm({ ...offerForm, parcours: offerForm.parcours === k ? '' : k })}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Texte du bouton sur le site · vide = « J’en profite »">
                <Input value={offerForm.bouton} onChange={(e) => setOfferForm({ ...offerForm, bouton: e.target.value })} placeholder="Réserver ma consultation" />
              </Field>
              <Field label="Conditions, dépliées sous la carte">
                <Input value={offerForm.conditions} onChange={(e) => setOfferForm({ ...offerForm, conditions: e.target.value })} placeholder="Dans la Maison, au règlement, non cumulable." />
              </Field>
            </div>
            <div className="tr-grid tr-grid--2">
              <Field label="Visible dès">
                <Select value={offerForm.heureDebut} onChange={(e) => setOfferForm({ ...offerForm, heureDebut: e.target.value })}>
                  {OFFER_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Field>
              <Field label="Jusqu’à">
                <Select value={offerForm.heureFin} onChange={(e) => setOfferForm({ ...offerForm, heureFin: e.target.value })}>
                  {OFFER_HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setOfferModal(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveOffer} disabled={!offerForm.title.trim()}>
                {offerEditId ? 'Enregistrer l’offre' : 'Publier l’offre'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
