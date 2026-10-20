/* ══ VOTRE PROCHAINE MARCHE — 1er janvier 2027 (la genèse des prix) ═══════
   Une seule carte sur l'accueil, la première marche qui s'applique à SA
   couronne (juge : `shared/prochaine-marche-pur`). Les formules s'y disent
   avec leur prix pour SA tête, par le même calcul que « Ma formule » ; le
   site, lui, n'en dit jamais un franc.

   Elle se tait avant le 1er janvier 2027 (les formules en lunes sont encore
   au comptoir, pour le pilote) ; `?janvier=1` la montre pour l'essayer. */
import { useMemo } from 'react';
import { useBranch } from '../../shared/branches';
import { useServices, fondeLaCouronne } from '../../shared/catalog';
import { useModelBands, useBandSets, bandsAbonnements, calibreDeLaTete } from '../../shared/pricing';
import { useFamilies } from '../../shared/clients';
import {
  formulesPourElle, prixDeLaFormule, usePlans, useSubscribers, type Plan, type TeteConnue,
} from '../../shared/abonnements';
import type { Appointment } from '../../shared/agenda';
import { formulesVisiblesPour, vitrineConfigStore } from '../../shared/bridges';
import { useStore } from '../../shared/store';
import { decoupesPour } from '../../shared/echeancier';
import { phaseDeLaGrille } from '../../shared/nouvelle-grille-pur';
import { prochaineMarche, CURE_DE_LUMIERE, type Marche } from '../../shared/prochaine-marche-pur';
import { useClient, useVisibleCatalog, todayIso, type BookingPrefill } from './lib';
import { useReleve } from './releve';
import { t, prix } from './i18n';

/** Le nom, le geste offert et la phrase d'une formule en lunes, selon sa famille. */
const ditDeLaFormule = (base: string, prixDit: string): { nom: string; geste: string; phrase: string } | null => {
  switch (base) {
    case 'pl-lune-premieres':
      return { nom: t('Les Premières Lunes'), geste: t('la quatrième visite offerte'), phrase: t('Quatre venues après votre création, aux semaines 6, 12, 18 et 24 : {prix} pour votre tête.', { prix: prixDit }) };
    case 'pl-lune-quatre':
      return { nom: t('Le Carnet de Quatre'), geste: t('la quatrième visite offerte'), phrase: t('Quatre venues en six lunes, la porte du carnet pour une couronne née ailleurs : {prix} pour votre tête.', { prix: prixDit }) };
    case 'pl-lune-six':
      return { nom: t('Le Carnet de Six'), geste: t('la sixième visite offerte'), phrase: t('Six venues en neuf lunes : {prix} pour votre tête.', { prix: prixDit }) };
    case 'pl-lune-annee':
      return { nom: t('Le Carnet de l’Année'), geste: t('la quatrième et la huitième visite offertes'), phrase: t('Huit venues en douze lunes, le prix tenu douze lunes : {prix} pour votre tête.', { prix: prixDit }) };
    default:
      return null;
  }
};

export function ProchaineMarche({ appts, onOpenBooking, goFormule }: {
  appts: readonly Appointment[];
  onOpenBooking: (prefill?: BookingPrefill) => void;
  goFormule?: () => void;
}) {
  const client = useClient();
  const { branch, currency } = useBranch();
  const [services] = useServices();
  /* Ce qui se PROPOSE ne vient que du catalogue visible (comme la
     recommandation de l'accueil) : une prestation masquée ne se propose pas. */
  const { services: servicesVisibles } = useVisibleCatalog();
  const [plans] = usePlans();
  const [subs] = useSubscribers();
  /* LE JUGE UNIQUE DE L'ABONNÉE (20 octobre 2026) : la formule qui court et
     ce qu'il lui reste se lisent au relevé, jamais recomptés ici. */
  const releve = useReleve(client?.id);
  const [familles] = useFamilies();
  const [cfg] = useStore(vitrineConfigStore);
  const [bands] = useModelBands();
  const [jeux] = useBandSets();
  const calibresAbo = useMemo(() => bandsAbonnements(jeux, bands), [jeux, bands]);
  const apercu = typeof location !== 'undefined' && new URLSearchParams(location.search).has('janvier');
  const jour = todayIso();

  const marche: Marche | null = useMemo(() => {
    if (!client || (!apercu && phaseDeLaGrille(jour) !== 'janvier')) return null;
    const parId = new Map(services.map((s) => [s.id, s] as const));
    const estCreation = (id: string) => { const sv = parId.get(id); return !!sv && fondeLaCouronne(sv); };
    const siens = appts.filter((a) => a.clientId === client.id);
    const aUnFoyer = !!client.familyId && familles.some((f) => f.id === client.familyId);
    /* EN VENTE POUR ELLE : les formules ouvertes et visibles, comme « Ma
       formule ». À l'essai (`?janvier=1`), les masques d'avant janvier ne
       comptent pas : les formules en lunes y sont encore cachées. */
    const visibles = apercu ? plans : formulesVisiblesPour({ cfg, masques: client.vitrineMasques, plans });
    const enVente = new Set(formulesPourElle(visibles, aUnFoyer).map((p) => p.id));
    const enCours = releve?.contrats.find((c) => c.etat === 'en-cours' || c.etat === 'epuisee') ?? releve?.contrats[0];
    const bornees = enCours ? enCours.seances.filter((l) => l.disponibles !== null).map((l) => l.disponibles as number) : [];
    const restantes = bornees.length ? Math.min(...bornees) : null;
    return prochaineMarche({
      jour,
      visites: siens,
      estCreation,
      crownSince: client.crownSince,
      formule: enCours ? { planId: enCours.sub.planId, ...(typeof restantes === 'number' ? { restantes } : {}) } : undefined,
      dejaPrises: new Set(subs.filter((s) => s.clientId === client.id).map((s) => s.planId)),
      enVente,
      creationAVenir: siens.some((a) => a.status !== 'honoré' && a.status !== 'annulé' && a.date >= jour && a.serviceIds.some(estCreation)),
    });
  }, [client, apercu, jour, services, appts, familles, plans, cfg, subs, releve]);

  if (!client || !marche) return null;

  const numero = (branch.phone ?? '').replace(/\D/g, '');
  /* CE QUI PART À LA MAISON RESTE EN FRANÇAIS, quelle que soit la langue de
     l'écran : la Maison lit ses messages en français. */
  const parler = (sujetFr: string) => (numero ? (
    <a
      className="mc-cta mc-cta--outline"
      style={{ marginTop: 10, textAlign: 'center', textDecoration: 'none' }}
      href={`https://wa.me/${numero}?text=${encodeURIComponent(`Bonjour, je voudrais parler de « ${sujetFr} ».`)}`}
      target="_blank"
      rel="noreferrer"
    >
      {t('En parler à la Maison')}
    </a>
  ) : null);

  if ('planId' in marche) {
    const plan: Plan | undefined = plans.find((p) => p.id === marche.planId);
    if (!plan) return null;
    const maTete: TeteConnue = {
      bandId: calibreDeLaTete(client.lockCount ?? client.lockCountDeclare, bands, client.margeCalibre)?.id,
      longueur: client.longueur,
    };
    const total = prixDeLaFormule(plan, 'mensuel', maTete, calibresAbo).montantXof;
    const base = marche.planId.replace(/-sig$/, '');
    const dit = ditDeLaFormule(base, prix(total, currency));
    if (!dit) return null;
    const parts = decoupesPour(total);
    const nom = marche.planId.endsWith('-sig') ? `${dit.nom} · Signature` : dit.nom;
    return (
      <div className="mc-marche">
        <div className="mc-marche__k">{t('Votre prochaine marche')}</div>
        {marche.cle === 'rythme-au-dessus' && <p className="mc-marche__p">{t('Votre formule touche à sa fin.')}</p>}
        {marche.cle === 'carnet-annee' && <p className="mc-marche__p">{t('Votre couronne a un an.')}</p>}
        <p className="mc-marche__t">{nom}, <em>{dit.geste}</em></p>
        <p className="mc-marche__p">
          {dit.phrase}
          {parts.includes(3) ? ` ${t('Réglable en trois fois.')}` : parts.includes(2) ? ` ${t('Réglable en deux fois.')}` : ''}
        </p>
        {goFormule && (
          <button type="button" className="mc-cta mc-cta--copper" style={{ marginTop: 14 }} onClick={goFormule}>
            {t('Voir la formule')}
          </button>
        )}
        {parler(plan.name)}
      </div>
    );
  }

  if (marche.cle === 'cure-lumiere') {
    const visible = servicesVisibles.some((s) => s.id === CURE_DE_LUMIERE);
    return (
      <div className="mc-marche">
        <div className="mc-marche__k">{t('Votre prochaine marche')}</div>
        <p className="mc-marche__t">{t('La Cure de Lumière')}, <em>{t('la couleur et ses soins')}</em></p>
        <p className="mc-marche__p">{t('Votre Couleur, puis le Renfort, le DÀNDÀN™, le WÈWÈ™ et l’Éclat, posés au carnet : la composition moins 15 %.')}</p>
        {visible && (
          <button type="button" className="mc-cta mc-cta--copper" style={{ marginTop: 14 }} onClick={() => onOpenBooking({ serviceId: CURE_DE_LUMIERE })}>
            {t('Réserver')}
          </button>
        )}
        {parler('YÈKPÈ™ · Cure de Lumière')}
      </div>
    );
  }

  return (
    <div className="mc-marche">
      <div className="mc-marche__k">{t('Votre prochaine marche')}</div>
      <p className="mc-marche__t">{t('Votre couronne')}, <em>{t('vous attend')}</em></p>
      <p className="mc-marche__p">{t('Votre Regard se déduit de votre création, si elle suit dans les trente jours.')}</p>
      <button type="button" className="mc-cta mc-cta--copper" style={{ marginTop: 14 }} onClick={() => onOpenBooking()}>
        {t('Réserver ma création')}
      </button>
      {parler('ma création')}
    </div>
  );
}
