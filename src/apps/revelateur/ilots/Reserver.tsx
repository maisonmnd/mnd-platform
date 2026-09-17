import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { COMMUN } from '../contenu';
import { client, lienWhatsApp, maison } from '../maison';
import { campagne, mesure } from '../mesure';
import {
  agendaDeLaMaison, creneauxOccupes, groupesDePrestations, heuresLibres,
  jourCourt, jourDit, prestationsReservables, prochainsJours,
  type AgendaDeLaMaison, type PrestationPublique,
} from '../agenda';
import { porteDuBesoin, type Besoin } from '../../../shared/qualification';
import type { CreneauOccupe } from '../../../shared/agenda-pur';
import Demande from './Demande';

/* RÉSERVER DIRECTEMENT, SANS COMPTE ET SANS WHATSAPP — 17 septembre 2026.

   « Est-ce possible de tomber directement sur les consultations et réserver
   directement ? Même chose pour les entretiens et les soins » (Yéman). Oui :
   le catalogue, les horaires, les murs et les créneaux pris se lisent sans
   être connecté (voir `agenda.ts`), et la fonction Edge `demande-submit`
   pose le rendez-vous avec la clé de service, après avoir REVÉRIFIÉ l'heure.

   TROIS PAS, JAMAIS PLUS : le geste, le jour et l'heure, le numéro. Aucun
   compte, aucun prix affiché (ils se disent au devis), aucun paiement.

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

const besoinDeLAdresse = (): Besoin | '' => {
  try {
    const b = new URLSearchParams(location.search).get('besoin') ?? '';
    return (['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu'] as const)
      .includes(b as Besoin) ? (b as Besoin) : '';
  } catch { return ''; }
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
  const [serviceId, setServiceId] = useState('');
  const [jour, setJour] = useState('');
  const [heure, setHeure] = useState<{ heure: string; maitre: string } | null>(null);
  const [prenom, setPrenom] = useState('');
  const [numero, setNumero] = useState('');
  const [mot, setMot] = useState('');
  const [consent, setConsent] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [recu, setRecu] = useState<{ date: string; heure: string } | null>(null);

  useEffect(() => {
    let vivant = true;
    void maison().then(async (m) => {
      if (!vivant) return;
      setWhatsapp(m?.whatsapp ?? '');
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
    () => (agenda ? groupesDePrestations(agenda, prestations) : []),
    [agenda, prestations],
  );

  /* Les jours qui ont au moins une heure libre pour le geste choisi. */
  const jours = useMemo(() => {
    if (!agenda || !serviceId) return [];
    return prochainsJours(JOURS_PROPOSES)
      .map((iso) => ({ iso, heures: heuresLibres({ agenda, dateIso: iso, serviceIds: [serviceId], occupes }) }))
      .filter((j) => j.heures.length > 0);
  }, [agenda, serviceId, occupes]);

  const heuresDuJour = jours.find((j) => j.iso === jour)?.heures ?? [];
  const wa = lienWhatsApp(whatsapp, COMMUN.messages[besoin] ?? COMMUN.messages.inconnu);
  const choisie: PrestationPublique | undefined = prestations.find((s) => s.id === serviceId);

  const choisirLeGeste = (id: string) => {
    setServiceId(id);
    setJour('');
    setHeure(null);
    mesure('parcours_choisi', { parcours: besoin });
  };

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (envoi || !heure || !jour) return;
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
            serviceIds: [serviceId], date: jour, time: heure.heure, master: heure.maitre,
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
        } else if (code.includes('telephone')) {
          setErreur(f.erreurNumero);
        } else {
          setErreur('L’envoi n’a pas abouti. Écrivez-nous sur WhatsApp, nous vous répondons.');
        }
        return;
      }
      setRecu({ date: jour, heure: heure.heure });
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

  /* ── Les trois pas ────────────────────────────────────────────────── */
  return (
    <div className="reservation">
      <ol className="pas-reservation">
        <li className={serviceId ? 'fait' : 'ici'}>Le geste</li>
        <li className={heure ? 'fait' : serviceId ? 'ici' : ''}>Le jour et l’heure</li>
        <li className={heure ? 'ici' : ''}>Votre numéro</li>
      </ol>

      <div className="bloc-reservation">
        <p className="sur">{consultation ? 'La consultation' : 'Votre geste'}</p>
        <h3>{consultation ? 'Ce que nous allons regarder' : 'Ce dont votre couronne a besoin'}</h3>
        {groupes.map((g) => (
          <div key={g.titre} className="famille">
            {groupes.length > 1 && <p className="famille__titre">{g.titre}</p>}
            <div className="gestes">
              {g.items.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`geste-choix${serviceId === s.id ? ' est-choisi' : ''}`}
                  onClick={() => choisirLeGeste(s.id)}
                >
                  <b>{s.name}</b>
                  {s.durationMin ? <small>{dit(s.durationMin)}</small> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
        {consultation && <p className="legende" style={{ marginTop: 12 }}>Une création ou une réparation commence toujours par une consultation. Le devis vient après, et vous décidez ensuite.</p>}
      </div>

      {serviceId && (
        <div className="bloc-reservation venir">
          <p className="sur">Le jour</p>
          <h3>Quand vous convient-il ?</h3>
          {choisie && <p className="legende" style={{ marginBottom: 14 }}>{choisie.name}{choisie.durationMin ? ` · ${dit(choisie.durationMin)}` : ''}</p>}
          {jours.length === 0
            ? (
              <p className="corps">Aucune heure libre dans les trois prochaines semaines. Écrivez-nous, nous trouverons ensemble.
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
              </>
            )}
        </div>
      )}

      {heure && jour && (
        <form className="formulaire venir" onSubmit={(e) => void envoyer(e)} noValidate>
          <p className="sur">Votre place</p>
          <h3 style={{ marginBottom: 6 }}>{jourDit(jour)}, à {heure.heure}</h3>
          <div className="deux-champs">
            <div className="champ"><label htmlFor="res-prenom">{f.prenom}</label><input id="res-prenom" name="prenom" autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
            <div className="champ"><label htmlFor="res-numero">{f.numero}</label><input id="res-numero" name="numero" inputMode="tel" autoComplete="tel" value={numero} onChange={(e) => setNumero(e.target.value)} required /></div>
          </div>
          <div className="champ"><label htmlFor="res-mot">Un mot, si vous voulez</label><textarea id="res-mot" name="mot" rows={2} value={mot} onChange={(e) => setMot(e.target.value)} /></div>
          <label className="consentement"><input type="checkbox" id="res-consent" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{f.consentement}</span></label>
          <button className="btn btn--plein" type="submit" disabled={envoi}>{envoi ? 'Envoi en cours' : 'Demander cette place'}</button>
          <p className="legende">Rien à payer aujourd’hui. La Maison vous confirme.</p>
          {erreur && <p className="erreur" role="alert">{erreur}</p>}
        </form>
      )}
    </div>
  );
}
