import { useEffect, useState } from 'react';
import { client, lienWhatsApp } from '../maison';
import { mesure } from '../mesure';
import { fmtMoney } from '../../../shared/currency';
import { payWithKkiapay, PUBLIC_KEY } from '../../../shared/kkiapay-widget';
import { PRIX_DE_LA_CONSULTATION_PRIVEE_XOF } from '../../../shared/estimation-pur';
import {
  DUREE_MIN, creneauDit, heureDite, jourCourtDit, parJour, type Creneau,
} from '../../../shared/visio-pur';

/* ══ LES DEUX PORTES DE CONFIRMATION — 13 novembre 2026 (lot 3) ═════════════
   Maquette S6 et S7. La lecture déposée, la cliente choisit comment la Maison
   la confirme :
     · LA VISIO GRATUITE de quinze minutes : un quart d'heure libre (fonction
       `visio-salle`), un lien d'entrée vers sa salle dans Ma Couronne ; la
       porte n'existe que si la Maison l'a allumée ET que le service de visio
       est branché ;
     · LA CONSULTATION PRIVÉE, payée ici, APRÈS sa lecture : le paiement
       existant (KkiaPay), que `kkiapay-verify` revérifie sur l'identifiant de
       la consultation, la barre de 15 000 F tenue par le serveur. La Maison
       lui écrit ensuite pour fixer le moment (file C du Trône).
   Ce que la consultation payée apporte est écrit AVANT qu'on la demande. */

export type Depot = { id: string; prenom: string; tel: string };
type Visio = { debut: string; chemin: string };

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

async function appelle(nom: string, corps: Record<string, unknown>): Promise<Record<string, unknown>> {
  const supabase = await client();
  if (!supabase) throw new Error('hors-ligne');
  const { data, error } = await supabase.functions.invoke(nom, { body: corps });
  if (!error) return (data ?? {}) as Record<string, unknown>;
  try {
    const r = (error as { context?: Response }).context;
    const d = r && typeof r.json === 'function' ? ((await r.json()) as Record<string, unknown>) : null;
    if (d) return d;
  } catch { /* corps illisible */ }
  throw error;
}

export function PortesDeLaConsultation({ depot, branchId, devise, whatsapp, atelier, seulementPrivee = false }: {
  depot: Depot; branchId: string; devise: string; whatsapp: string;
  /** Création ou réparation : la consultation privée est l'étape qui ouvre l'atelier. */
  atelier: boolean;
  /** Arrivée par `?privee=` (après la visio) : la seule porte de la privée. */
  seulementPrivee?: boolean;
}) {
  const [creneaux, setCreneaux] = useState<Creneau[] | null>(null);
  const [ouverte, setOuverte] = useState<'visio' | 'privee' | null>(seulementPrivee ? 'privee' : null);
  const argent = (n: number) => fmtMoney(n, devise);

  useEffect(() => {
    if (seulementPrivee) return;
    appelle('visio-salle', { geste: 'creneaux' })
      .then((r) => setCreneaux(r.ok && r.actif && Array.isArray(r.creneaux) ? (r.creneaux as Creneau[]) : []))
      .catch(() => setCreneaux([]));
  }, [seulementPrivee]);

  const visioPossible = !seulementPrivee && !!creneaux && creneaux.length > 0;

  return (
    <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
      {!seulementPrivee && <p className="sur">La Maison confirme · deux façons</p>}
      {visioPossible && (
        <div className="merci">
          <p className="sur">Échanger {DUREE_MIN} minutes · gratuit</p>
          <p>Un membre de la Maison regarde vos locks avec vous, en visio dans votre espace, et ajuste votre estimation. Quinze minutes, pas une de plus : à treize minutes, on résume et on vous propose la suite.</p>
          {ouverte !== 'visio'
            ? <p className="rangee"><button type="button" className="btn btn--plein" onClick={() => setOuverte('visio')}>Choisir un créneau</button></p>
            : <ReserverLaVisio depot={depot} creneaux={creneaux ?? []} whatsapp={whatsapp} />}
        </div>
      )}
      <div className="merci">
        <p className="sur">La consultation privée · {argent(PRIX_DE_LA_CONSULTATION_PRIVEE_XOF)}</p>
        <p>À la Maison. Diagnostic approfondi, deux à trois locks témoins faites devant vous, votre devis ferme et votre plan de soin. Les {argent(PRIX_DE_LA_CONSULTATION_PRIVEE_XOF)} sont déduits de votre rituel.</p>
        {atelier && <p className="legende">Pour une création ou une réparation, la consultation privée est l’étape qui ouvre l’atelier.</p>}
        {ouverte !== 'privee'
          ? <p className="rangee"><button type="button" className={`btn ${visioPossible ? 'btn--lien' : 'btn--plein'}`} onClick={() => setOuverte('privee')}>Réserver la consultation privée</button></p>
          : <ReglerLaPrivee depot={depot} branchId={branchId} devise={devise} whatsapp={whatsapp} />}
      </div>
    </div>
  );
}

/* ── S6 · LA VISIO ────────────────────────────────────────────────────── */
function ReserverLaVisio({ depot, creneaux, whatsapp }: { depot: Depot; creneaux: Creneau[]; whatsapp: string }) {
  const jours = parJour(creneaux);
  const [jour, setJour] = useState(jours[0]?.jour ?? '');
  const [choisi, setChoisi] = useState<string>('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [visio, setVisio] = useState<Visio | null>(null);
  const duJour = jours.find((j) => j.jour === jour)?.creneaux ?? [];

  const reserve = async () => {
    if (!choisi || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appelle('visio-salle', { geste: 'reserver', debut: choisi, nom: depot.prenom, telephone: depot.tel, consultationId: depot.id });
      if (r.ok && typeof r.chemin === 'string') {
        mesure('visio_reservee');
        setVisio({ debut: String(r.debut), chemin: r.chemin });
        return;
      }
      setErreur(r.motif === 'pris' ? 'Ce quart d’heure vient d’être pris. Choisissez-en un autre.'
        : r.motif === 'deja' ? 'Une visio est déjà réservée à ce numéro. Le lien est dans votre WhatsApp, ou écrivez à la Maison.'
        : r.motif === 'rate_limited' ? 'Trop d’essais d’un coup. Réessayez dans quelques minutes.'
        : 'La réservation n’a pas abouti. Réessayez, ou écrivez à la Maison.');
    } catch {
      setErreur('La réservation n’a pas abouti. Réessayez, ou écrivez à la Maison.');
    } finally {
      setEnvoi(false);
    }
  };

  if (visio) {
    const lien = `${location.origin}${visio.chemin}`;
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: '4px 0' }}>Votre visio : {creneauDit(visio.debut)}</h2>
        <p>Gardez ce lien : c’est votre entrée dans la salle, dans Ma Couronne, sans mot de passe. La salle s’ouvre cinq minutes avant.</p>
        <p className="legende" style={{ wordBreak: 'break-all' }}>{lien}</p>
        <p className="rangee">
          <a className="btn btn--plein" href={visio.chemin}>Ouvrir ma salle</a>
          <a className="btn btn--lien" target="_blank" rel="noopener" href={lienWhatsApp(whatsapp, `Bonjour, j’ai réservé ma visio du ${creneauDit(visio.debut)}. Mon lien : ${lien}`)}>Garder le lien dans WhatsApp</a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p className="legende">Choisissez votre quart d’heure.</p>
      <div className="heures" role="group" aria-label="Le jour">
        {jours.map((j) => (
          <button type="button" key={j.jour} className={`heure${jour === j.jour ? ' est-choisie' : ''}`} aria-pressed={jour === j.jour} onClick={() => { setJour(j.jour); setChoisi(''); }}>
            {jourCourtDit(j.jour)}
          </button>
        ))}
      </div>
      <div className="heures" role="group" aria-label="L’heure">
        {duJour.map((c) => (
          <button type="button" key={c.debut} className={`heure${choisi === c.debut ? ' est-choisie' : ''}`} aria-pressed={choisi === c.debut} onClick={() => setChoisi(c.debut)}>
            {heureDite(c.debut)}
          </button>
        ))}
      </div>
      <p className="legende">Quelques visios par jour seulement : au-delà, la consultation privée prend le relais.</p>
      <p className="rangee" style={{ marginTop: 6 }}>
        <button type="button" className="btn btn--fort" disabled={!choisi || envoi} onClick={() => void reserve()}>
          {envoi ? 'Réservation en cours' : choisi ? `Réserver ${creneauDit(choisi)}` : 'Choisissez une heure'}
        </button>
      </p>
      {erreur && <p className="erreur" role="alert">{erreur}</p>}
    </div>
  );
}

/* ── S7 · RÉGLER LA CONSULTATION PRIVÉE ───────────────────────────────── */
function ReglerLaPrivee({ depot, branchId, devise, whatsapp }: { depot: Depot; branchId: string; devise: string; whatsapp: string }) {
  const [etat, setEtat] = useState<'pret' | 'paie' | 'verifie' | 'reglee'>('pret');
  const [reference, setReference] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const prix = PRIX_DE_LA_CONSULTATION_PRIVEE_XOF;
  const argent = (n: number) => fmtMoney(n, devise);
  const ecrire = lienWhatsApp(whatsapp, `Bonjour, je souhaite réserver ma consultation privée${depot.prenom ? ` (${depot.prenom})` : ''}. Ma consultation en ligne : ${depot.id}.`);

  /* Le serveur relit la transaction chez KkiaPay et tient la barre : c'est LUI qui dit « reçu ». */
  const verifie = async (transactionId: string) => {
    setEtat('verifie');
    const r = await appelle('kkiapay-verify', { transactionId, apptId: '', consultationId: depot.id, expectedXof: prix, branchId });
    if (r.ok !== true) throw new Error(`Vérification impossible pour l’instant. Gardez votre référence : ${transactionId}.`);
    mesure('consultation_reglee');
    setEtat('reglee');
  };
  const paie = async () => {
    if (etat !== 'pret') return;
    setErreur(null);
    setEtat('paie');
    try {
      const { transactionId } = await payWithKkiapay({ amountXof: prix, partnerId: depot.id, branchId, phone: depot.tel || undefined, name: depot.prenom || undefined });
      /* L'argent est parti : la référence se garde AVANT la vérification. */
      setReference(transactionId);
      await verifie(transactionId);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le paiement n’a pas abouti.');
      setEtat('pret');
    }
  };
  const reverifie = async () => {
    if (!reference) return;
    setErreur(null);
    try { await verifie(reference); } catch (e) { setErreur(e instanceof Error ? e.message : 'La vérification n’a pas abouti.'); setEtat('pret'); }
  };

  if (etat === 'reglee') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: '4px 0' }}>C’est réglé, merci.</h2>
        <p>La Maison vous écrit sur WhatsApp pour fixer votre moment. Les {argent(prix)} sont déduits de votre rituel.</p>
        <p className="rangee"><a className="btn btn--lien" target="_blank" rel="noopener" href={ecrire}>Écrire à la Maison</a></p>
      </div>
    );
  }
  if (!PUBLIC_KEY) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <p>Le paiement en ligne n’est pas encore ouvert. Réservez votre moment, ou écrivez-nous : la consultation se règle à la Maison.</p>
        <p className="rangee">
          <a className="btn btn--plein" href={base('/reserver/?besoin=reparation')}>Réserver ma consultation à la Maison</a>
          <a className="btn btn--lien" target="_blank" rel="noopener" href={ecrire}>Écrire à la Maison</a>
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px' }}>
        <dt>Consultation privée</dt><dd style={{ margin: 0 }}>{argent(prix)}</dd>
        <dt>Déduits de votre rituel</dt><dd style={{ margin: 0 }}>− {argent(prix)}</dd>
      </dl>
      <p className="legende">KkiaPay ou Mobile Money. La Maison vous écrit ensuite sur WhatsApp pour fixer votre moment.</p>
      <p className="rangee">
        {reference
          ? <button type="button" className="btn btn--fort" disabled={etat !== 'pret'} onClick={() => void reverifie()}>{etat === 'verifie' ? 'Vérification' : 'Revérifier mon paiement'}</button>
          : <button type="button" className="btn btn--fort" disabled={etat !== 'pret'} onClick={() => void paie()}>{etat === 'pret' ? `Régler ${argent(prix)}` : etat === 'paie' ? 'Paiement en cours' : 'Vérification'}</button>}
        <a className="btn btn--lien" target="_blank" rel="noopener" href={ecrire}>Une question avant ?</a>
      </p>
      {erreur && <p className="erreur" role="alert">{erreur}</p>}
    </div>
  );
}
