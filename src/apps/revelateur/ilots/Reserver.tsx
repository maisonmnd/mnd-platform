import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { COMMUN } from '../contenu';
import { client, lienWhatsApp, maison } from '../maison';
import { campagne, mesure } from '../mesure';
import {
  agendaDeLaMaison, creneauxOccupes, groupesDePrestations, heuresLibres,
  jourCourt, jourDit, prestationsReservables, prochainsJours, PLAFOND_GESTES,
  type AgendaDeLaMaison, type PrestationPublique,
} from '../agenda';
import { porteDuBesoin, type Besoin } from '../../../shared/qualification';
import { fmtMoney } from '../../../shared/currency';
import type { CreneauOccupe } from '../../../shared/agenda-pur';
import Demande from './Demande';

/* RÉSERVER DIRECTEMENT, SANS COMPTE ET SANS WHATSAPP — 17 septembre 2026.

   « Est-ce possible de tomber directement sur les consultations et réserver
   directement ? Même chose pour les entretiens et les soins » (Yéman). Oui :
   le catalogue, les horaires, les murs et les créneaux pris se lisent sans
   être connecté (voir `agenda.ts`), et la fonction Edge `demande-submit`
   pose le rendez-vous avec la clé de service, après avoir REVÉRIFIÉ l'heure.

   TROIS PAS, JAMAIS PLUS : les gestes, le jour et l'heure, le numéro. Aucun
   compte, aucun paiement. LE PRIX, LUI, SE DIT depuis le 17 septembre :
   « il faut mettre les prix pour que le client comprenne d'entrée de jeu »
   (Yéman). Il vient du catalogue, jamais du code, et chaque porte propose
   SA consultation plutôt que les trois.

   PLUSIEURS GESTES DANS UNE MÊME VENUE — 18 septembre 2026. « J'aimerais
   avoir la possibilité de réserver plusieurs services à la fois. Aussi quand
   je réserve un entretien je veux les lavage et la reprise de racines »
   (Yéman). On coche donc, on ne choisit plus. La Maison additionne les
   durées et les prix à mesure, le calendrier ne propose que les heures où
   TOUT tient, et le serveur revérifie ce total avant d'écrire. Le plafond de
   six vient de `demande-submit`, il n'est pas décoratif.

   CE QUE LA RÈGLE IMPOSE (`shared/qualification.ts`) : une création ou une
   réparation se réserve en CONSULTATION, jamais en acte direct. Un entretien
   et des soins se réservent tels quels. QUELLES prestations exactement, et
   comment on les reconnaît quand la Maison les renomme, c'est
   `prestationsReservables` qui le dit.

   IL NE FERME JAMAIS LA PORTE, et cette leçon a coûté une mise en ligne :
   sans prestation à proposer, il retombe sur la DEMANDE DE RAPPEL, jamais
   sur un cul-de-sac. Sans base du tout, sur WhatsApp. */

type Props = { besoin?: Besoin };

const JOURS_PROPOSES = 21;

/** Ce que la porte ouvre d'emblée, dit à la visiteuse. Seul l'entretien a
    des familles prioritaires aujourd'hui (voir `FAMILLES_DABORD`). */
const POUR_LA_PORTE: Readonly<Partial<Record<Besoin, string>>> = {
  entretien: 'Pour votre entretien',
};

const besoinDeLAdresse = (): Besoin | '' => {
  try {
    const b = new URLSearchParams(location.search).get('besoin') ?? '';
    return (['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu'] as const)
      .includes(b as Besoin) ? (b as Besoin) : '';
  } catch { return ''; }
};

/** LE PRIX FERME D'UNE PRESTATION, ou zéro. Un devis, un prix absent : la
    Maison ne l'invente pas. C'est le même juge pour la ligne et pour le
    total, de sorte qu'un geste sans prix ferme ne peut pas se fondre
    silencieusement dans une somme. */
const prixFerme = (s: PrestationPublique): number => {
  const p = Number(s.priceXof ?? 0);
  return !p || s.priceMode === 'devis' ? 0 : p;
};

/** CE QUE ÇA COÛTE, DIT SIMPLEMENT. « Il faut mettre les prix pour que le
    client comprenne d'entrée de jeu » (Yéman, 17 septembre 2026). Le montant
    vient du catalogue ; un prix variable se dit « à partir de », et une
    prestation sans prix ferme ne dit rien plutôt que d'inventer. */
const prixDit = (s: PrestationPublique, devise: string): string => {
  const p = prixFerme(s);
  if (!p) return '';
  return s.priceMode === 'variable' ? `à partir de ${fmtMoney(p, devise)}` : fmtMoney(p, devise);
};

const dit = (min?: number): string => {
  if (!min) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};

export default function Reserver({ besoin: besoinInitial }: Props) {
  const f = COMMUN.formulaire;
  /* `||` et non `??` : l'adresse rend une chaîne VIDE quand elle ne porte
     aucun parcours, et `??` la laisserait passer pour une réponse. */
  const besoin: Besoin = besoinInitial || besoinDeLAdresse() || 'inconnu';
  const consultation = porteDuBesoin(besoin) === 'consultation';

  const [agenda, setAgenda] = useState<AgendaDeLaMaison | null | undefined>(undefined);
  const [occupes, setOccupes] = useState<CreneauOccupe[]>([]);
  const [whatsapp, setWhatsapp] = useState('');
  const [devise, setDevise] = useState('XOF');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  /* `null` tant que la visiteuse n'a rien plié ni déplié : l'ouverture par
     défaut se calcule alors depuis la porte, sans effet ni synchronisation. */
  const [plies, setPlies] = useState<Record<string, boolean> | null>(null);
  const [jour, setJour] = useState('');
  const [heure, setHeure] = useState<{ heure: string; maitre: string } | null>(null);
  const [prenom, setPrenom] = useState('');
  const [numero, setNumero] = useState('');
  const [mot, setMot] = useState('');
  const [consent, setConsent] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [recu, setRecu] = useState<{ date: string; heure: string; gestes: string[] } | null>(null);

  useEffect(() => {
    let vivant = true;
    void maison().then(async (m) => {
      if (!vivant) return;
      setWhatsapp(m?.whatsapp ?? '');
      setDevise(m?.devise ?? 'XOF');
      if (!m) { setAgenda(null); return; }
      const a = await agendaDeLaMaison(m.branchId);
      if (!vivant) return;
      setAgenda(a);
      if (a) {
        const jours = prochainsJours(JOURS_PROPOSES);
        const pris = await creneauxOccupes(a.branchId, jours[0], jours[jours.length - 1]);
        if (vivant) setOccupes(pris);
      }
    }).catch(() => { if (vivant) setAgenda(null); });
    return () => { vivant = false; };
  }, []);

  useEffect(() => { if (consultation) mesure('consultation_ouverte', { parcours: besoin }); }, [besoin, consultation]);

  const prestations = useMemo(
    () => (agenda ? prestationsReservables(agenda, besoin) : []),
    [agenda, besoin],
  );
  const groupes = useMemo(
    () => (agenda ? groupesDePrestations(agenda, prestations, besoin) : []),
    [agenda, prestations, besoin],
  );

  /* L'ÉTAT D'OUVERTURE, SANS EFFET. La porte ouvre ses familles ; si elle
     n'en désigne aucune, la première s'ouvre, pour qu'un écran ne soit
     jamais entièrement plié. */
  const ouvert = useMemo(() => {
    const aucunePorte = !groupes.some((g) => g.deLaPorte);
    const parDefaut: Record<string, boolean> = {};
    groupes.forEach((g, i) => { parDefaut[g.id] = g.deLaPorte || (aucunePorte && i === 0); });
    return plies ? { ...parDefaut, ...plies } : parDefaut;
  }, [groupes, plies]);

  const choisies = useMemo(
    () => serviceIds.map((id) => prestations.find((s) => s.id === id)).filter(Boolean) as PrestationPublique[],
    [serviceIds, prestations],
  );

  /* LES TOTAUX, CUMULÉS (Yéman, au sélecteur : « la durée et le prix
     cumulés »). La durée est la SOMME VRAIE, celle du catalogue ; le
     calendrier, lui, applique le plancher d'une heure du serveur. Le prix
     ne compte que les prix fermes, et dès qu'un geste n'en a pas, le total
     se dit « à partir de » : on ne promet jamais un chiffre qui bougerait. */
  const dureeTotale = choisies.reduce((t, s) => t + Number(s.durationMin ?? 0), 0);
  const prixTotal = choisies.reduce((t, s) => t + prixFerme(s), 0);
  const prixFlou = choisies.some((s) => !prixFerme(s) || s.priceMode === 'variable');
  const plein = serviceIds.length >= PLAFOND_GESTES;

  /* Les jours qui ont au moins une heure libre pour TOUS les gestes cochés. */
  const jours = useMemo(() => {
    if (!agenda || serviceIds.length === 0) return [];
    return prochainsJours(JOURS_PROPOSES)
      .map((iso) => ({ iso, heures: heuresLibres({ agenda, dateIso: iso, serviceIds, occupes }) }))
      .filter((j) => j.heures.length > 0);
  }, [agenda, serviceIds, occupes]);

  const heuresDuJour = jours.find((j) => j.iso === jour)?.heures ?? [];
  const wa = lienWhatsApp(whatsapp, COMMUN.messages[besoin] ?? COMMUN.messages.inconnu);

  const basculerLaFamille = (id: string) => setPlies({ ...ouvert, [id]: !ouvert[id] });

  const basculerLeGeste = (id: string) => {
    setServiceIds((prec) => {
      if (prec.includes(id)) return prec.filter((x) => x !== id);
      /* Le septième ne rentre pas : `demande-submit` le retirerait sans un
         mot, autant le dire ici. */
      if (prec.length >= PLAFOND_GESTES) return prec;
      if (prec.length === 0) mesure('parcours_choisi', { parcours: besoin });
      return [...prec, id];
    });
    /* La durée change, donc les heures libres changent : ce qui était choisi
       ne vaut plus. */
    setJour('');
    setHeure(null);
  };

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (envoi || !heure || !jour || serviceIds.length === 0) return;
    if (numero.replace(/\D/g, '').length < 8) { setErreur(f.erreurNumero); return; }
    if (!consent) { setErreur('Cochez la case pour que nous puissions vous confirmer.'); return; }
    setErreur(null);
    setEnvoi(true);
    try {
      const supabase = await client();
      if (!supabase) { setErreur('La réservation n’est pas reliée pour l’instant. Écrivez-nous sur WhatsApp.'); return; }
      const { data, error } = await supabase.functions.invoke('demande-submit', {
        body: {
          genre: 'rdv',
          data: {
            prenom, telephone: numero, besoin, mot,
            serviceIds, date: jour, time: heure.heure, master: heure.maitre,
            page: location.pathname, campagne: campagne() || undefined, consentement: true,
          },
        },
      });
      const r = (data ?? {}) as { ok?: boolean; error?: string };
      if (error || !r.ok) {
        const code = r.error ?? (error?.message ?? '');
        if (code.includes('creneau')) {
          setErreur('Cette heure vient d’être prise. Choisissez-en une autre, la liste est à jour.');
          const suite = prochainsJours(JOURS_PROPOSES);
          if (agenda) setOccupes(await creneauxOccupes(agenda.branchId, suite[0], suite[suite.length - 1]));
          setHeure(null);
        } else if (code.includes('rate')) {
          setErreur('Beaucoup de demandes d’un coup : réessayez dans quelques minutes, ou écrivez-nous sur WhatsApp.');
        } else if (code.includes('retiree')) {
          setErreur('Un des gestes choisis ne se réserve plus en ligne. Retirez-le, ou écrivez-nous sur WhatsApp.');
        } else if (code.includes('telephone')) {
          setErreur(f.erreurNumero);
        } else {
          setErreur('L’envoi n’a pas abouti. Écrivez-nous sur WhatsApp, nous vous répondons.');
        }
        return;
      }
      setRecu({ date: jour, heure: heure.heure, gestes: choisies.map((s) => s.name) });
      mesure('reservation_demandee', { parcours: besoin, genre: 'rdv' });
    } catch {
      setErreur('L’envoi n’a pas abouti. Écrivez-nous sur WhatsApp, nous vous répondons.');
    } finally {
      setEnvoi(false);
    }
  };

  /* ── Reçue ───────────────────────────────────────────────────────── */
  if (recu) {
    return (
      <div className="merci">
        <p className="sur">Demande reçue</p>
        <h2>Votre place est demandée.</h2>
        <p>{jourDit(recu.date)}, à {recu.heure}. La Maison vous confirme sur WhatsApp ou par téléphone, pendant ses heures d’ouverture.</p>
        {recu.gestes.length > 0 && (
          <ul className="panier">
            {recu.gestes.map((n) => <li key={n} className="panier__ligne"><span className="panier__quoi">{n}</span></li>)}
          </ul>
        )}
        <div className="rangee">
          <a className="btn btn--fort" href={wa} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { parcours: besoin })}>Parler à MND sur WhatsApp</a>
        </div>
      </div>
    );
  }

  /* ── Le calendrier se charge ──────────────────────────────────────── */
  if (agenda === undefined) return <div className="formulaire"><p className="corps">Le calendrier se charge.</p></div>;

  /* ── Sans base : WhatsApp, qui marche toujours ────────────────────── */
  if (agenda === null) {
    return (
      <div className="formulaire">
        <p className="corps">La réservation en ligne n’est pas disponible pour l’instant. Écrivez-nous, nous vous répondons personnellement.</p>
        <a className="btn btn--plein" href={wa} target="_blank" rel="noopener">Parler à MND sur WhatsApp</a>
      </div>
    );
  }

  /* ── Rien à proposer ici : LA DEMANDE DE RAPPEL, jamais un cul-de-sac.
     C'est la leçon du 17 septembre : l'écran cherchait une catégorie que la
     Maison avait renommée, et n'offrait plus qu'un lien WhatsApp. ── */
  if (prestations.length === 0) {
    return (
      <>
        <p className="corps" style={{ marginBottom: 16 }}>
          {consultation
            ? 'Les consultations se prennent avec la Maison, de vive voix. Laissez-nous votre numéro, nous vous rappelons pour fixer l’heure.'
            : 'Dites-nous ce dont votre couronne a besoin. Nous vous rappelons pour fixer l’heure.'}
        </p>
        <Demande genre="rdv" besoin={besoin} />
      </>
    );
  }

  const choisi = serviceIds.length > 0;
  const seuleFamille = groupes.length === 1;

  /* ── Les trois pas ────────────────────────────────────────────────── */
  return (
    <div className="reservation">
      <ol className="pas-reservation">
        <li className={choisi ? 'fait' : 'ici'}>{consultation ? 'La consultation' : 'Vos gestes'}</li>
        <li className={heure ? 'fait' : choisi ? 'ici' : ''}>Le jour et l’heure</li>
        <li className={heure ? 'ici' : ''}>Votre numéro</li>
      </ol>

      <div className="bloc-reservation">
        <p className="sur">{consultation ? 'La consultation' : 'Vos gestes'}</p>
        <h3>{consultation ? 'Ce que nous allons regarder' : 'Ce dont votre couronne a besoin'}</h3>
        {!consultation && !seuleFamille && (
          <p className="legende" style={{ marginBottom: 14 }}>
            Cochez tout ce que vous voulez faire en une seule venue. La Maison additionne la durée et le prix.
          </p>
        )}
        {groupes.map((g) => {
          const deplie = seuleFamille || ouvert[g.id];
          const pris = g.items.filter((s) => serviceIds.includes(s.id)).length;
          return (
            <div key={g.id} className={`famille${deplie ? ' est-depliee' : ''}${g.deLaPorte ? ' de-la-porte' : ''}`}>
              {!seuleFamille && (
                <button
                  type="button"
                  className="famille__tete"
                  aria-expanded={deplie}
                  onClick={() => basculerLaFamille(g.id)}
                >
                  <span className="famille__nom">
                    {g.deLaPorte && POUR_LA_PORTE[besoin] && <span className="famille__pour">{POUR_LA_PORTE[besoin]}</span>}
                    {g.titre}
                  </span>
                  <span className="famille__compte">
                    {pris > 0 ? `${pris} sur ${g.items.length}` : `${g.items.length} ${g.items.length > 1 ? 'gestes' : 'geste'}`}
                  </span>
                  <span className="famille__chevron" aria-hidden="true" />
                </button>
              )}
              {deplie && (
                <div className="gestes">
                  {g.items.map((s) => {
                    const coche = serviceIds.includes(s.id);
                    const ferme = plein && !coche;
                    return (
                      <button
                        type="button"
                        key={s.id}
                        className={`geste-choix${coche ? ' est-choisi' : ''}${ferme ? ' est-ferme' : ''}`}
                        aria-pressed={coche}
                        aria-disabled={ferme || undefined}
                        onClick={() => { if (!ferme) basculerLeGeste(s.id); }}
                      >
                        <span className="case" aria-hidden="true" />
                        <b>{s.name}</b>
                        <small>
                          {s.durationMin ? dit(s.durationMin) : ''}
                          {s.durationMin && prixDit(s, devise) ? ' · ' : ''}
                          {prixDit(s, devise)
                            ? <span className="prix">{prixDit(s, devise)}</span>
                            : <span className="au-salon">prix au salon</span>}
                        </small>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {consultation && <p className="legende" style={{ marginTop: 12 }}>Une création ou une réparation commence toujours par une consultation. Le devis vient après, et vous décidez ensuite.</p>}
      </div>

      {choisi && (
        <div className="bloc-reservation venir">
          <p className="sur">Votre venue</p>
          <ul className="panier">
            {choisies.map((s) => (
              <li key={s.id} className="panier__ligne">
                <span className="panier__quoi">{s.name}</span>
                <span className="panier__combien">
                  {s.durationMin ? dit(s.durationMin) : ''}
                  {s.durationMin && prixDit(s, devise) ? ' · ' : ''}
                  {prixDit(s, devise)}
                </span>
                <button
                  type="button"
                  className="panier__oter"
                  aria-label={`Retirer ${s.name}`}
                  onClick={() => basculerLeGeste(s.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="totaux">
            <p className="total"><span>Durée</span><b>{dit(dureeTotale) || 'à voir ensemble'}</b></p>
            <p className="total">
              <span>Prix</span>
              <b>{prixFlou && prixTotal > 0 ? <em>à partir de </em> : null}{prixTotal > 0 ? fmtMoney(prixTotal, devise) : 'au salon'}</b>
            </p>
          </div>
          {plein && <p className="legende avertit">Six gestes au plus dans une même venue. Retirez-en un pour en cocher un autre.</p>}
          {prixFlou && prixTotal > 0 && <p className="legende">Un geste au moins se règle au salon : ce total est un plancher, jamais une promesse.</p>}
        </div>
      )}

      {choisi && (
        <div className="bloc-reservation venir">
          <p className="sur">Le jour</p>
          <h3>Quand vous convient-il ?</h3>
          {jours.length === 0
            ? (
              <p className="corps">
                {serviceIds.length > 1
                  ? `Aucune journée des trois prochaines semaines ne peut accueillir ${dit(dureeTotale)} d’affilée. Retirez un geste, ou écrivez-nous et nous poserons votre venue sur deux fois.`
                  : 'Aucune heure libre dans les trois prochaines semaines. Écrivez-nous, nous trouverons ensemble.'}
                <br /><a className="btn btn--plein" style={{ marginTop: 12 }} href={wa} target="_blank" rel="noopener">Parler à MND sur WhatsApp</a>
              </p>
            )
            : (
              <>
                <div className="jours">
                  {jours.map((j) => {
                    const c = jourCourt(j.iso);
                    return (
                      <button type="button" key={j.iso} className={`jour${jour === j.iso ? ' est-choisi' : ''}`} onClick={() => { setJour(j.iso); setHeure(null); }}>
                        <span>{c.lettre}</span><b>{c.chiffre}</b>
                      </button>
                    );
                  })}
                </div>
                {jour && (
                  <div className="heures venir">
                    <p className="legende" style={{ width: '100%' }}>{jourDit(jour)}</p>
                    {heuresDuJour.map((h) => (
                      <button type="button" key={h.heure} className={`heure${heure?.heure === h.heure ? ' est-choisie' : ''}`} onClick={() => setHeure(h)}>
                        {h.heure}
                      </button>
                    ))}
                  </div>
                )}
                {jour && (
                  <p className="legende" style={{ marginTop: 12 }}>
                    Ces heures tiennent compte de {dit(dureeTotale)} sur place.
                  </p>
                )}
              </>
            )}
        </div>
      )}

      {heure && jour && (
        <form className="formulaire venir" onSubmit={(e) => void envoyer(e)} noValidate>
          <p className="sur">Votre place</p>
          <h3 style={{ marginBottom: 6 }}>{jourDit(jour)}, à {heure.heure}</h3>
          <p className="legende" style={{ marginTop: -2 }}>
            {choisies.length > 1 ? `${choisies.length} gestes · ` : ''}
            {dit(dureeTotale)}
            {prixTotal > 0 ? ` · ${prixFlou ? 'à partir de ' : ''}${fmtMoney(prixTotal, devise)}` : ''}
          </p>
          <div className="deux-champs">
            <div className="champ"><label htmlFor="res-prenom">{f.prenom}</label><input id="res-prenom" name="prenom" autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
            <div className="champ"><label htmlFor="res-numero">{f.numero}</label><input id="res-numero" name="numero" inputMode="tel" autoComplete="tel" value={numero} onChange={(e) => setNumero(e.target.value)} required /></div>
          </div>
          <div className="champ"><label htmlFor="res-mot">Un mot, si vous voulez</label><textarea id="res-mot" name="mot" rows={2} value={mot} onChange={(e) => setMot(e.target.value)} /></div>
          <label className="consentement"><input type="checkbox" id="res-consent" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{f.consentement}</span></label>
          <button className="btn btn--plein" type="submit" disabled={envoi}>{envoi ? 'Envoi en cours' : 'Demander cette place'}</button>
          <p className="legende">Rien à payer aujourd’hui, le règlement se fait à la Maison.</p>
          {erreur && <p className="erreur" role="alert">{erreur}</p>}
        </form>
      )}
    </div>
  );
}
