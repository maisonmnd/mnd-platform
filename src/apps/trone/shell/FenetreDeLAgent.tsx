import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Sparkles } from 'lucide-react';
import { Button, Modal } from '../../../ds/components';
import { useClients } from '../../../shared/clients';
import { useServices } from '../../../shared/catalog';
import { appointmentsStore, useAppointments, type Appointment } from '../../../shared/agenda';
import { blocagesStore, plagesBloquees } from '../../../shared/blocages';
import { openingForIso } from '../../../shared/settings';
import { useBranch } from '../../../shared/branches';
import { jourEnLettres } from '../../../shared/calendrier';
import { heureDuMessage, momentDuMessage } from '../../../shared/salle-des-envois';
import { demandeAClaude } from '../../../shared/ia-maison';
import {
  CHANTIER_DE_L_AGENT, USAGE_DE_L_AGENT, SCHEMA_DE_L_AGENT, SIGNES_MAX_DE_LA_PHRASE,
  consigneDeLAgent, laCliente, laPlaceDuSouhait, lectureDeLAgent, leRendezVousADeplacer, phraseDuSouhait, phrasePourClaude,
  type DemandeLue,
} from '../../../shared/agent-des-rendez-vous-pur';
import { ClientPicker, RdvModal, apptDurationMin, timeToMin, todayISO, useServicesById } from '../routes/clients/_shared';
import { placesDuJour, type Occupant } from '../routes/clients/rdv-fluide-pur';
import { deplaceAvecLeFoyer, quiSuit } from '../routes/clients/foyer-gestes';
import { SonProchainRituel, type VueDeLaCarte } from '../routes/vente/SonProchainRituel';

/* ══ LA FENÊTRE DE L'AGENT DES RENDEZ-VOUS — 18 novembre 2026 ═════════════
   Trois temps, et le plus souvent un seul geste :
     1. LA PHRASE, tapée ou dictée : « Mme T., sa reprise, la semaine prochaine ».
     2. LA CLIENTE, cherchée au carnet du Trône (`laCliente`) : retenue
        d'office quand elle est seule à répondre, sinon un toucher parmi
        celles qui répondent. Aucune fiche ne part vers Claude.
     3. LA CARTE « Son prochain rituel », avec le souhait : elle trouve la
        place, sur Team, et L'AGENT LA VALIDE SEUL. Le rendez-vous est posé ;
        « Pas de prochain rendez-vous » le retire sans rien envoyer ;
        « Terminer » (ou fermer la fenêtre) envoie la confirmation WhatsApp,
        une fois, comme à la Caisse.
     3 bis. DÉPLACER (18 novembre 2026, « j'ai testé : déplacer du samedi au
        mardi », Yéman) : Perle ne savait que poser, elle montrait le rendez-vous
        déjà là. Elle lit désormais l'intention : le rendez-vous à déplacer (la
        date dite, sinon le prochain), la nouvelle place (à la même heure si
        elle est libre, sinon la plus proche), et le DÉPLACE ELLE-MÊME, comme le
        calendrier quand on le glisse (`deplaceAvecLeFoyer` : le foyer suit, rien
        ne part vers la cliente). « Annuler le déplacement » le remet à sa place.

   Les prix ne viennent jamais de Claude : il ne lit que la phrase. Elle
   s'appelle Perle : « C'est Perle son nom » (Yéman, 18 novembre 2026). */

/** La reconnaissance vocale du navigateur (celle de l'assistant des devis) : le micro n'apparaît pas sans elle. */
type Reconnaissance = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const creeLaReconnaissance = (): Reconnaissance | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Reconnaissance; webkitSpeechRecognition?: new () => Reconnaissance };
  const Classe = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Classe ? new Classe() : null;
};

const EXEMPLE = 'Ex. : Mme T., sa reprise, la semaine prochaine, plutôt le matin';

type Etape =
  | { genre: 'phrase' }
  | { genre: 'cliente'; lu: DemandeLue; parmi: string[]; dit: string }
  | { genre: 'carte'; lu: DemandeLue; clientId: string }
  | {
    genre: 'deplace'; lu: DemandeLue; clientId: string;
    /** Le rendez-vous déplacé, son ancienne et sa nouvelle place ; sans nouvelle place : rien n'a bougé, `pourquoi` le dit. */
    rdvId: string; avant: { date: string; time: string } | null; apres: { date: string; time: string } | null; pourquoi: string;
  };

const jourDit = (iso: string) => jourEnLettres(iso).replace(/^./, (c) => c.toLowerCase());

export default function FenetreDeLAgent({ onClose }: { onClose: () => void }) {
  const [clients] = useClients();
  const [services] = useServices();
  const [rdvs] = useAppointments();
  const { branch } = useBranch();
  const byId = useServicesById();
  const [ouvert, setOuvert] = useState<Appointment | null>(null);
  const [texte, setTexte] = useState('');
  const [lit, setLit] = useState(false);
  const [mot, setMot] = useState('');
  const [etape, setEtape] = useState<Etape>({ genre: 'phrase' });
  const [ecoute, setEcoute] = useState(false);
  const reco = useRef<Reconnaissance | null>(null);
  const [vocalPossible] = useState(() => creeLaReconnaissance() !== null);
  useEffect(() => () => { reco.current?.stop(); }, []);

  /* Sa venue la plus récente : à force égale, la cliente qu'on voit le plus départage. */
  const derniere = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of rdvs) {
      if (!a.clientId || a.status === 'annulé') continue;
      if ((m.get(a.clientId) ?? '') < a.date) m.set(a.clientId, a.date);
    }
    return m;
  }, [rdvs]);

  const dicter = () => {
    if (ecoute) { reco.current?.stop(); return; }
    const r = creeLaReconnaissance();
    if (!r) return;
    r.lang = 'fr-FR'; r.interimResults = false; r.continuous = true;
    r.onresult = (e) => {
      let dit = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) dit += ` ${e.results[i][0].transcript}`;
      if (dit.trim()) setTexte((t) => `${t}${t && !/\s$/.test(t) ? ' ' : ''}${dit.trim()}`.slice(0, SIGNES_MAX_DE_LA_PHRASE));
    };
    r.onend = () => setEcoute(false);
    r.onerror = () => setEcoute(false);
    reco.current = r;
    setEcoute(true);
    r.start();
  };

  /* LES PLACES D'UN JOUR POUR CE RENDEZ-VOUS, comme la carte et le « + RDV » :
     les fauteuils, les murs de son maître, l'ouverture du jour ; lui-même et
     son foyer ne s'occupent pas leur propre place. */
  const placesPour = (rdv: Appointment) => (iso: string) => {
    const m = new Date();
    const occupes: Occupant[] = appointmentsStore.get()
      .filter((a) => a.branchId === branch.id && a.date === iso && a.status !== 'annulé' && a.id !== rdv.id && !(rdv.foyerId && a.foyerId === rdv.foyerId))
      .map((a) => ({ maitre: a.master, debutMin: timeToMin(a.time), dureeMin: apptDurationMin(a, byId) }));
    const p = placesDuJour({
      iso, aujourdhui: todayISO(), maintenantMin: m.getHours() * 60 + m.getMinutes(), ouverture: openingForIso(iso),
      durationMin: apptDurationMin(rdv, byId), occupes, bloques: plagesBloquees(blocagesStore.get(), branch.id, iso, rdv.master),
      sieges: Math.max(0, branch.seats ?? 0),
    });
    return { ferme: p.ferme, heures: p.heures };
  };

  /** DÉPLACER : le sien, à la nouvelle place, par Perle seule. Rien ne bouge sans place. */
  const deplace = (lu: DemandeLue, clientId: string) => {
    const aujourdhui = todayISO();
    const base = { genre: 'deplace' as const, lu, clientId };
    const rdv = leRendezVousADeplacer(appointmentsStore.get().filter((a) => a.clientId === clientId && a.branchId === branch.id), lu.ancien, aujourdhui);
    if (!rdv) {
      setEtape({ ...base, rdvId: '', avant: null, apres: null, pourquoi: lu.ancien ? `Elle n’a pas de rendez-vous le ${jourDit(lu.ancien)} : rien n’est déplacé.` : 'Elle n’a aucun rendez-vous à venir : rien n’est déplacé.' });
      return;
    }
    const avant = { date: rdv.date, time: rdv.time };
    if (!lu.du) {
      setEtape({ ...base, rdvId: rdv.id, avant, apres: null, pourquoi: 'La nouvelle date n’est pas dite : rien n’est déplacé. Dites le jour voulu.' });
      return;
    }
    const souhait = { du: lu.du, au: lu.au, heure: lu.heure, moment: lu.moment };
    /* SANS HEURE DITE, LA SIENNE : le rendez-vous garde son heure si elle est libre ce jour-là. */
    const place = laPlaceDuSouhait({ souhait, aujourdhui, heureHabituelle: rdv.time, placesDe: placesPour(rdv) });
    if (!place) {
      setEtape({ ...base, rdvId: rdv.id, avant, apres: null, pourquoi: `${phraseDuSouhait({ souhait, place: null, jourDit, heureDite: heureDuMessage }).replace(' : touchez une des places proposées.', '.')} Rien n’est déplacé.` });
      return;
    }
    if (place.iso === rdv.date && place.heure === rdv.time) {
      setEtape({ ...base, rdvId: rdv.id, avant, apres: null, pourquoi: 'Il est déjà à cette place : rien n’est déplacé.' });
      return;
    }
    deplaceAvecLeFoyer(rdv, { date: place.iso, time: place.heure });
    setEtape({ ...base, rdvId: rdv.id, avant, apres: { date: place.iso, time: place.heure }, pourquoi: place.ecart === 'heure' ? phraseDuSouhait({ souhait, place, jourDit, heureDite: heureDuMessage }) : '' });
  };

  /** La suite, une fois la cliente connue : poser (la carte) ou déplacer. */
  const suite = (lu: DemandeLue, clientId: string) => {
    if (lu.intention === 'deplacer') deplace(lu, clientId);
    else setEtape({ genre: 'carte', lu, clientId });
  };

  const lire = async () => {
    const phrase = phrasePourClaude(texte);
    if (!phrase) { setMot('Dites pour qui, et quand.'); return; }
    reco.current?.stop();
    setLit(true); setMot('Perle lit la demande…');
    try {
      const aujourdhui = todayISO();
      const r = await demandeAClaude<unknown>({
        chantier: CHANTIER_DE_L_AGENT, usage: USAGE_DE_L_AGENT,
        systeme: consigneDeLAgent({ services, aujourdhui }),
        messages: [{ role: 'user', content: phrase }],
        schema: SCHEMA_DE_L_AGENT, maxTokens: 600,
      });
      if (!r.ok) { setMot(`${r.message} Vous pouvez toujours poser le rendez-vous par « Créer ».`); return; }
      const lu = lectureDeLAgent(r.data, services, aujourdhui);
      if (!lu) { setMot('La demande n’a pas pu être lue. Reformulez : pour qui, quel geste, quand.'); return; }
      setMot('');
      if (!lu.cliente) { setEtape({ genre: 'cliente', lu, parmi: [], dit: '' }); return; }
      const trouvee = laCliente(lu.cliente, clients, (id) => derniere.get(id) ?? '');
      if (trouvee.genre === 'une') suite(lu, trouvee.fiche.id);
      else setEtape({ genre: 'cliente', lu, parmi: trouvee.genre === 'plusieurs' ? trouvee.fiches.map((f) => f.id) : [], dit: lu.cliente });
    } finally {
      setLit(false);
    }
  };

  /* ── 3 bis. LE DÉPLACEMENT, FAIT PAR PERLE ── */
  if (etape.genre === 'deplace') {
    const { lu, clientId, rdvId, avant, apres, pourquoi } = etape;
    const fiche = clients.find((c) => c.id === clientId);
    const nom = fiche?.name ?? 'Cliente';
    const frais = () => appointmentsStore.get().find((a) => a.id === rdvId) ?? null;
    const lui = rdvId ? frais() : null;
    const suit = lui ? quiSuit(lui) : '';
    const annuler = () => {
      const a = frais();
      if (a && avant) deplaceAvecLeFoyer(a, avant);
      setEtape({ ...etape, apres: null, pourquoi: 'Déplacement annulé : il est revenu à sa place.' });
    };
    return (
      <>
        <Modal title="Perle" onClose={onClose} width={560}>
          <div className="tra-agent">
            <p className="tra-agent__dit">{`${nom} · « ${texte.trim()} »`}</p>
            {apres && avant ? (
              <div className="tra-agent__deplace" role="status">
                <span className="tra-agent__etat">Déplacé</span>
                <p className="tra-agent__avant">{momentDuMessage(avant.date, avant.time)}</p>
                <p className="tra-agent__apres">{momentDuMessage(apres.date, apres.time)}</p>
                {pourquoi && <p className="tra-agent__note">{pourquoi}</p>}
                {suit && <p className="tra-agent__note">{`Son foyer suit : ${suit}.`}</p>}
                <p className="tra-agent__note">Rien n’est parti vers elle : prévenez-la si besoin.</p>
              </div>
            ) : (
              <p className="tra-agent__question">{avant ? `${pourquoi} Son rendez-vous reste le ${momentDuMessage(avant.date, avant.time)}.` : pourquoi}</p>
            )}
            {lu.reserves.length > 0 && <ul className="tra-agent__reserves">{lu.reserves.map((r, i) => <li key={i}>{r}</li>)}</ul>}
            <div className="tra-agent__actions">
              {apres && avant && <Button variant="ghost" onClick={annuler}>Annuler le déplacement</Button>}
              {lui && <Button variant="ghost" onClick={() => setOuvert(frais())}>Ouvrir le rendez-vous</Button>}
              {!rdvId && <Button variant="ghost" onClick={() => setEtape({ genre: 'carte', lu: { ...lu, intention: 'poser' }, clientId })}>Poser un nouveau rendez-vous</Button>}
              <Button variant="ghost" onClick={() => setEtape({ genre: 'phrase' })}>Reformuler</Button>
              <Button onClick={onClose}>Fermer</Button>
            </div>
          </div>
        </Modal>
        {ouvert && <RdvModal appt={ouvert} onClose={() => setOuvert(null)} />}
      </>
    );
  }

  /* ── 3. LA CARTE, VALIDÉE PAR L'AGENT ── */
  if (etape.genre === 'carte') {
    const fiche = clients.find((c) => c.id === etape.clientId);
    return (
      <LaCarteDeLAgent
        clientId={etape.clientId}
        nom={fiche?.name ?? 'Cliente'}
        longueur={fiche?.longueur ?? 'mi-long'}
        lu={etape.lu}
        phrase={texte}
        onFerme={onClose}
      />
    );
  }

  /* ── 2. LA CLIENTE, QUAND ELLE N'EST PAS SEULE À RÉPONDRE ── */
  if (etape.genre === 'cliente') {
    const { lu, parmi, dit } = etape;
    const choisir = (id: string) => { if (id) suite(lu, id); };
    return (
      <Modal title="Perle" onClose={onClose} width={560}>
        <div className="tra-agent">
          <p className="tra-agent__dit">{`« ${texte.trim()} »`}</p>
          <p className="tra-agent__question">
            {parmi.length > 0 ? `Plusieurs clientes répondent à « ${dit} » : laquelle ?`
              : dit ? `Aucune cliente du carnet ne répond à « ${dit} ». Cherchez-la :` : 'Pour quelle cliente ?'}
          </p>
          {parmi.length > 0 && (
            <div className="tra-agent__clientes" role="group" aria-label="Les clientes qui répondent">
              {parmi.map((id) => {
                const c = clients.find((x) => x.id === id);
                if (!c) return null;
                const venue = derniere.get(id);
                return (
                  <button key={id} type="button" className="tra-agent__cliente" onClick={() => choisir(id)}>
                    <b>{c.name}</b>
                    <small>{venue ? `dernière venue le ${venue.split('-').reverse().join('/')}` : 'aucune venue'}</small>
                  </button>
                );
              })}
            </div>
          )}
          <ClientPicker value="" onChange={choisir} placeholder={parmi.length ? 'Une autre cliente…' : 'Rechercher une cliente…'} />
          <div className="tra-agent__actions">
            <Button variant="ghost" onClick={() => setEtape({ genre: 'phrase' })}>Reformuler</Button>
          </div>
        </div>
      </Modal>
    );
  }

  /* ── 1. LA PHRASE ── */
  return (
    <Modal title="Perle" onClose={onClose} width={560}>
      <div className="tra-agent">
        <p className="tra-agent__aide"><Sparkles size={13} aria-hidden /> Dites pour qui, le geste et quand. Perle trouve la place sur Team et pose le rendez-vous ; la confirmation part quand vous fermez.</p>
        <div className="tra-agent__champ">
          <input
            className="mnd-input tra-agent__texte"
            autoFocus
            maxLength={SIGNES_MAX_DE_LA_PHRASE}
            placeholder={EXEMPLE}
            value={texte}
            disabled={lit}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !lit) { e.preventDefault(); void lire(); } }}
            aria-label="La demande à Perle"
          />
          {vocalPossible && (
            <button type="button" className={`tra-agent__micro${ecoute ? ' is-actif' : ''}`} onClick={dicter} disabled={lit} title={ecoute ? 'Arrêter la dictée' : 'Dicter la demande'} aria-pressed={ecoute}>
              <Mic size={15} aria-hidden />
            </button>
          )}
        </div>
        <div className="tra-agent__actions">
          <Button onClick={() => void lire()} disabled={lit || texte.trim().length < 4}>{lit ? 'Lecture en cours…' : 'Poser le rendez-vous'}</Button>
          {mot && <span className="tra-agent__mot" role="status">{mot}</span>}
        </div>
      </div>
    </Modal>
  );
}

/* La carte « Son prochain rituel », hébergée : l'agent valide la place trouvée,
   une fois, dès qu'elle se montre et qu'elle se pose ici. */
function LaCarteDeLAgent({ clientId, nom, longueur, lu, phrase, onFerme }: {
  clientId: string;
  nom: string;
  longueur: NonNullable<Parameters<typeof SonProchainRituel>[0]['longueur']>;
  lu: DemandeLue;
  phrase: string;
  onFerme: () => void;
}) {
  const [jour] = useState(todayISO);
  const souhait = useMemo(() => ({ gestes: lu.gestes, du: lu.du, au: lu.au, heure: lu.heure, moment: lu.moment }), [lu]);
  return (
    <SonProchainRituel clientId={clientId} serviceIds={[]} jour={jour} longueur={longueur} souhait={souhait} onFerme={onFerme}>
      {(v) => <LaVueDeLAgent v={v} nom={nom} lu={lu} phrase={phrase} />}
    </SonProchainRituel>
  );
}

function LaVueDeLAgent({ v, nom, lu, phrase }: { v: VueDeLaCarte; nom: string; lu: DemandeLue; phrase: string }) {
  const tente = useRef(false);
  const { aPoser, valider } = v;
  useEffect(() => {
    if (tente.current || !aPoser) return;
    tente.current = true;
    valider();
  }, [aPoser, valider]);
  return (
    <Modal title="Perle" onClose={v.terminer} width={760}>
      <div className="trv-regle trv-regle--seule">
        <p className="trv-regle__qui">{`${nom} · « ${phrase.trim()} »`}</p>
        {v.dejaLa && <p className="tra-agent__note">{`Elle a déjà un rendez-vous${v.dejaLaDit ? `, ${v.dejaLaDit}` : ''} : Perle n’en pose pas un second.`}</p>}
        {lu.reserves.length > 0 && (
          <ul className="tra-agent__reserves">{lu.reserves.map((r, i) => <li key={i}>{r}</li>)}</ul>
        )}
        {v.carte}
        <div className="trv-regle__pied">
          <div className="trv-regle__pied-gauche">{v.pied}</div>
          <Button variant={v.plein ? 'copper' : 'ghost'} className="trv-regle__terminer" onClick={v.terminer}>Terminer</Button>
        </div>
      </div>
    </Modal>
  );
}
