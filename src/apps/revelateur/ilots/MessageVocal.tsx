import { useEffect, useRef, useState } from 'react';
import { COMMUN } from '../contenu';
import { etatDeLaMaison } from '../heures';
import { client, heuresDeLaMaison, lienWhatsApp, maison } from '../maison';
import { mesure } from '../mesure';
import { raisonDuRefus } from '../refus-du-serveur';
import { CIVILITES, appelDe, type Civilite } from '../../../shared/civilite';
import { DUREE_MAX_DE_LA_VOIX_S, dureeDite, formatDEnregistrement, quandOnRappelle } from '../../../shared/message-vocal-pur';

/* ══ LE MESSAGE VOCAL — 19 octobre 2026 ══════════════════════════════════
   Maquette HR7V2tMu… validée (« construis ») : sur la page Contact et dans
   « Être rappelée », la visiteuse qui préfère parler laisse sa voix. Un seul
   gros bouton pour parler, deux minutes au plus, réécouter, recommencer,
   envoyer ; la voix part à `demande-submit` et arrive dans Les demandes du
   Trône. Le micro refusé n'arrête personne : WhatsApp prend le relais.

   `genre="carte"` : la carte de la colonne de /rappel/ ; sans genre : le
   bouton qui s'ouvre dans la carte « Nous écrire » de la page Contact ;
   `genre="bulle"` (19 octobre 2026) : la vue « Vocal » de la bulle du site,
   ouverte d'emblée, puisqu'on vient de toucher le rond. */

type Etape = 'pret' | 'parle' | 'fini' | 'envoi' | 'recu';

export default function MessageVocal({ genre }: { genre?: string }) {
  const [ouvert, setOuvert] = useState(genre === 'bulle');
  const [civilite, setCivilite] = useState<Civilite | ''>('');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [numero, setNumero] = useState('');
  const [consent, setConsent] = useState(false);
  const [etape, setEtape] = useState<Etape>('pret');
  const [secondes, setSecondes] = useState(0);
  const [voix, setVoix] = useState<Blob | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [microRefuse, setMicroRefuse] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [maisonOuverte, setMaisonOuverte] = useState<boolean | null>(null);
  const enregistreur = useRef<MediaRecorder | null>(null);
  const flux = useRef<MediaStream | null>(null);
  const morceaux = useRef<Blob[]>([]);
  const debut = useRef(0);
  const minuterie = useRef<number | undefined>(undefined);
  const lecteur = useRef<HTMLAudioElement | null>(null);
  const adresseDEcoute = useRef('');

  useEffect(() => {
    void maison().then((m) => setWhatsapp(m?.whatsapp ?? ''));
    void heuresDeLaMaison().then(({ semaine, exceptions }) => setMaisonOuverte(etatDeLaMaison(semaine, exceptions, new Date())?.ouvert ?? null));
  }, []);
  /* En quittant la page, le micro se rend et l'écoute s'arrête. */
  useEffect(() => () => {
    window.clearInterval(minuterie.current);
    flux.current?.getTracks().forEach((t) => t.stop());
    lecteur.current?.pause();
    if (adresseDEcoute.current) URL.revokeObjectURL(adresseDEcoute.current);
  }, []);

  const wa = lienWhatsApp(whatsapp, COMMUN.messages.inconnu);
  const rendsLeMicro = () => { flux.current?.getTracks().forEach((t) => t.stop()); flux.current = null; };

  const arreter = () => {
    window.clearInterval(minuterie.current);
    if (enregistreur.current?.state === 'recording') enregistreur.current.stop();
  };

  const parler = async () => {
    setErreur(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setMicroRefuse(true); return; }
    try {
      flux.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicroRefuse(true);
      return;
    }
    const type = formatDEnregistrement((t) => MediaRecorder.isTypeSupported(t));
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(flux.current, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 48_000 });
    } catch {
      rendsLeMicro();
      setMicroRefuse(true);
      return;
    }
    morceaux.current = [];
    r.ondataavailable = (e) => { if (e.data && e.data.size > 0) morceaux.current.push(e.data); };
    r.onstop = () => {
      const duree = Math.min(DUREE_MAX_DE_LA_VOIX_S, Math.round((Date.now() - debut.current) / 1000));
      setSecondes(duree);
      setVoix(new Blob(morceaux.current, { type: r.mimeType || type || 'audio/webm' }));
      setEtape('fini');
      rendsLeMicro();
    };
    enregistreur.current = r;
    debut.current = Date.now();
    setSecondes(0);
    setVoix(null);
    setEtape('parle');
    r.start(1000);
    /* DEUX MINUTES AU PLUS (sa décision) : l'enregistreur s'arrête seul. */
    minuterie.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - debut.current) / 1000);
      setSecondes(Math.min(s, DUREE_MAX_DE_LA_VOIX_S));
      if (s >= DUREE_MAX_DE_LA_VOIX_S) arreter();
    }, 250);
  };

  const recommencer = () => {
    lecteur.current?.pause();
    setVoix(null);
    setSecondes(0);
    setEtape('pret');
  };

  const ecouter = () => {
    if (!voix) return;
    lecteur.current?.pause();
    if (adresseDEcoute.current) URL.revokeObjectURL(adresseDEcoute.current);
    adresseDEcoute.current = URL.createObjectURL(voix);
    lecteur.current = new Audio(adresseDEcoute.current);
    void lecteur.current.play().catch(() => undefined);
  };

  const envoyer = async () => {
    if (!voix || etape === 'envoi') return;
    if (numero.replace(/\D/g, '').length < 8) { setErreur(COMMUN.formulaire.erreurNumero); return; }
    if (!consent) { setErreur('Cochez la case pour que nous puissions garder votre message et vous répondre.'); return; }
    setErreur(null);
    setEtape('envoi');
    try {
      const supabase = await client();
      if (!supabase) { setErreur('Le message vocal n’est pas relié pour l’instant. Écrivez-nous sur WhatsApp.'); setEtape('fini'); return; }
      const f = new FormData();
      if (civilite) f.append('civilite', civilite);
      f.append('prenom', prenom);
      f.append('nom', nom);
      f.append('telephone', numero);
      f.append('duree', String(secondes));
      f.append('consentement', 'oui');
      f.append('page', location.pathname);
      f.append('voix', voix, `message.${voix.type.includes('mp4') ? 'm4a' : voix.type.includes('ogg') ? 'ogg' : 'webm'}`);
      const { data, error } = await supabase.functions.invoke('demande-submit', { body: f });
      const r = (data ?? {}) as { ok?: boolean };
      if (error || !r.ok) {
        const code = await raisonDuRefus(data, error);
        if (code.includes('rate')) setErreur('Beaucoup de messages d’un coup : réessayez dans quelques minutes, ou écrivez-nous sur WhatsApp.');
        else if (code.includes('telephone')) setErreur(COMMUN.formulaire.erreurNumero);
        else if (code.includes('court')) setErreur('Le message est trop court : recommencez en parlant un peu plus longtemps.');
        else setErreur('L’envoi n’a pas abouti. Écrivez-nous sur WhatsApp, nous vous répondons.');
        setEtape('fini');
        return;
      }
      lecteur.current?.pause();
      setEtape('recu');
      mesure('vocal_depose', { parcours: 'vocal' });
    } catch {
      setErreur('L’envoi n’a pas abouti. Écrivez-nous sur WhatsApp, nous vous répondons.');
      setEtape('fini');
    }
  };

  const carte = genre === 'carte';
  const tete = carte && (
    <>
      <p className="sur">Plutôt parler ?</p>
      <h3>Laissez-nous un message vocal</h3>
      <p className="legende">Deux minutes au plus. La Maison écoute et vous rappelle.</p>
    </>
  );

  if (etape === 'recu') {
    return (
      <div className={carte ? 'vocal-carte' : 'vocal'}>
        <div className="vocal-merci" role="status">
          <p>Merci {appelDe(civilite ? { name: prenom, civilite } : { name: prenom })}. Votre message est bien arrivé à la Maison MND : nous vous rappelons {quandOnRappelle(maisonOuverte)}.</p>
          <a className="btn btn--lien" href={wa} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { parcours: 'vocal' })}>Écrire aussi sur WhatsApp</a>
        </div>
      </div>
    );
  }

  return (
    <div className={carte ? 'vocal-carte' : 'vocal'}>
      {tete}
      {!ouvert && (
        <button type="button" className={carte ? 'btn btn--plein' : 'btn jo-bt'} onClick={() => setOuvert(true)}>Laisser un message vocal</button>
      )}
      {ouvert && (
        <div className="vocal-panneau">
          <div className="champ">
            <span className="vocal-etiquette" id="vocal-civ">Vous êtes</span>
            <div className="vocal-civ" role="group" aria-labelledby="vocal-civ">
              {CIVILITES.map((c) => (
                <button key={c.cle} type="button" aria-pressed={civilite === c.cle} onClick={() => setCivilite(c.cle)}>{c.dit}</button>
              ))}
              <button type="button" aria-pressed={civilite === ''} onClick={() => setCivilite('')}>Je préfère ne pas dire</button>
            </div>
          </div>
          <div className="deux-champs">
            <div className="champ"><label htmlFor="vocal-prenom">Prénom</label><input id="vocal-prenom" autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
            <div className="champ"><label htmlFor="vocal-nom">Nom</label><input id="vocal-nom" autoComplete="family-name" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
          </div>
          <div className="champ"><label htmlFor="vocal-numero">Votre numéro WhatsApp</label><input id="vocal-numero" inputMode="tel" autoComplete="tel" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>

          {microRefuse ? (
            <div className="vocal-refus" role="alert">
              <p>Votre téléphone n’a pas ouvert le micro. Autorisez-le pour ce site, ou écrivez-nous plutôt sur WhatsApp.</p>
              <a className="btn btn--plein" href={wa} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { parcours: 'vocal' })}>Écrire sur WhatsApp</a>
            </div>
          ) : (
            <div className={`vocal-micro${etape === 'parle' ? ' vocal-micro--parle' : ''}`}>
              <button
                type="button"
                className="vocal-rond"
                onClick={() => (etape === 'parle' ? arreter() : void parler())}
                disabled={etape === 'envoi'}
                aria-label={etape === 'parle' ? 'Arrêter l’enregistrement' : 'Parler'}
              >
                {etape === 'parle' ? 'Arrêter' : 'Parler'}
              </button>
              <span className="vocal-onde" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</span>
              <span className="vocal-temps" aria-live="polite">{dureeDite(secondes)}</span>
              <span className="vocal-limite">{etape === 'parle' ? 'On vous écoute.' : `${dureeDite(DUREE_MAX_DE_LA_VOIX_S)} au plus`}</span>
            </div>
          )}
          <label className="consentement"><input type="checkbox" id="vocal-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>J’accepte que la Maison MND garde ce message 90 jours pour me répondre, puis l’efface.</span></label>
          <div className="vocal-trio">
            <button type="button" className="btn btn--lien" disabled={etape !== 'fini'} onClick={recommencer}>Recommencer</button>
            <button type="button" className="btn btn--lien" disabled={etape !== 'fini'} onClick={ecouter}>Réécouter</button>
            <button type="button" className="btn btn--plein" disabled={etape !== 'fini' || !voix} onClick={() => void envoyer()}>{etape === 'envoi' ? 'Envoi…' : 'Envoyer'}</button>
          </div>
          {erreur && <p className="erreur" role="alert">{erreur}</p>}
        </div>
      )}
    </div>
  );
}
