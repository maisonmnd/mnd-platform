import { useCallback, useEffect, useRef, useState } from 'react';
import { COMMUN } from '../contenu';
import { lienWhatsApp, maison } from '../maison';
import { mesure } from '../mesure';
import { appelleLeChat, chatGarde, gardeLeChat, oublieLeChat, quelquUnEstLa } from '../chat';
import { CIVILITES, appelDe, type Civilite } from '../../../shared/civilite';
import {
  GARDE_DES_DISCUSSIONS_JOURS, LECTURE_LENTE_MS, LONGUEUR_MAX_DU_MESSAGE, prochaineLecture, texteDuMessage,
  type ChatGarde, type MessageDuChat,
} from '../../../shared/chat-du-site-pur';

/* ══ LE CHAT DE LA MAISON — 19 octobre 2026 ══════════════════════════════
   Maquette BPWmpyyw… validée (« construis »). Dans la bulle du site (genre
   « bulle », ouvert d'emblée) et dans la carte « Nous écrire » de la page
   Contact (genre « contact », derrière un bouton). D'abord, à qui l'on
   parle : civilité, prénom, nom, numéro WhatsApp (sa décision) ; puis le
   fil. L'équipe répond depuis le Trône ; personne de permanence, Claude
   répond seul et le dit ; trois minutes sans réponse, le chat le dit.

   Le fil se relit toutes les quatre secondes tant qu'elle attend une
   réponse, toutes les douze sinon, et plus du tout quand l'onglet est
   caché. La discussion vit sur son téléphone (le jeton), 90 jours. */

const heureDe = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
};

export default function ChatDuSite({ genre }: { genre?: string }) {
  const contact = genre === 'contact';
  const [garde, setGarde] = useState<ChatGarde | null>(() => chatGarde());
  const [ouvert, setOuvert] = useState(() => !contact || !!chatGarde());
  const [civilite, setCivilite] = useState<Civilite | ''>('');
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [numero, setNumero] = useState('');
  const [messages, setMessages] = useState<MessageDuChat[]>([]);
  const [enLigne, setEnLigne] = useState<boolean | null>(null);
  const [texte, setTexte] = useState('');
  const [enVol, setEnVol] = useState<string | null>(null);
  const [ouverture, setOuverture] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState('');
  const dernierId = useRef(0);
  const lus = useRef<MessageDuChat[]>([]);
  const fil = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void maison().then((m) => setWhatsapp(m?.whatsapp ?? ''));
    if (!chatGarde()) void quelquUnEstLa().then(setEnLigne);
  }, []);

  const ajoute = useCallback((nouveaux: readonly MessageDuChat[] | undefined) => {
    if (!nouveaux?.length) return;
    const vus = new Set(lus.current.map((m) => m.id));
    const fusion = [...lus.current, ...nouveaux.filter((m) => !vus.has(m.id))].sort((a, b) => a.id - b.id);
    lus.current = fusion;
    dernierId.current = fusion.length ? fusion[fusion.length - 1].id : 0;
    setMessages(fusion);
  }, []);

  const repartDeZero = useCallback(() => {
    oublieLeChat();
    lus.current = [];
    dernierId.current = 0;
    setMessages([]);
    setGarde(null);
  }, []);

  /* LE FIL SE RELIT, tant que la discussion est ouverte à l'écran. */
  useEffect(() => {
    if (!garde || !ouvert) return;
    let vivant = true;
    let minuterie: number | undefined;
    const tour = async () => {
      window.clearTimeout(minuterie);
      if (!vivant) return;
      if (document.hidden) { minuterie = window.setTimeout(tour, LECTURE_LENTE_MS); return; }
      const r = await appelleLeChat({ action: 'lire', id: garde.id, jeton: garde.jeton, apres: dernierId.current });
      if (!vivant) return;
      /* Discussion effacée (90 jours) ou jeton perdu : on repart d'une page blanche. */
      if (r.error === 'discussion') { repartDeZero(); return; }
      ajoute(r.messages);
      if (typeof r.enLigne === 'boolean') setEnLigne(r.enLigne);
      minuterie = window.setTimeout(tour, prochaineLecture(lus.current, Date.now()));
    };
    void tour();
    const reveil = () => { if (!document.hidden) void tour(); };
    document.addEventListener('visibilitychange', reveil);
    return () => { vivant = false; window.clearTimeout(minuterie); document.removeEventListener('visibilitychange', reveil); };
  }, [garde, ouvert, ajoute, repartDeZero]);

  /* Le dernier message en vue. */
  useEffect(() => {
    const f = fil.current;
    if (f) f.scrollTop = f.scrollHeight;
  }, [messages.length, enVol]);

  const wa = lienWhatsApp(whatsapp, COMMUN.messages.inconnu);

  const commencer = async () => {
    if (ouverture) return;
    if (!prenom.trim() && !nom.trim()) { setErreur('Dites-nous votre prénom, pour savoir à qui nous parlons.'); return; }
    if (numero.replace(/\D/g, '').length < 8) { setErreur(COMMUN.formulaire.erreurNumero); return; }
    setErreur(null);
    setOuverture(true);
    const r = await appelleLeChat({ action: 'ouvrir', civilite, prenom, nom, telephone: numero, page: location.pathname });
    setOuverture(false);
    if (!r.ok || !r.id || !r.jeton) {
      if (r.error === 'telephone') setErreur(COMMUN.formulaire.erreurNumero);
      else if (r.error === 'rate_limited' || r.error === 'http_429') setErreur('Beaucoup de discussions d’un coup : réessayez dans quelques minutes, ou écrivez-nous sur WhatsApp.');
      else if (r.error === 'non_relie') setErreur('Le chat n’est pas relié pour l’instant. Écrivez-nous sur WhatsApp, nous vous répondons.');
      else setErreur('La discussion n’a pas pu s’ouvrir. Écrivez-nous sur WhatsApp, nous vous répondons.');
      return;
    }
    const g: ChatGarde = {
      id: r.id, jeton: r.jeton, telephone: numero, dernier: Date.now(),
      appel: r.appel || appelDe(civilite ? { name: prenom || nom, civilite } : null, prenom || nom),
    };
    gardeLeChat(g);
    if (typeof r.enLigne === 'boolean') setEnLigne(r.enLigne);
    setGarde(g);
    mesure('chat_ouvert', { parcours: 'chat', sortie: contact ? 'contact' : 'flottant' });
  };

  const envoyer = async () => {
    const t = texteDuMessage(texte);
    if (!t || !garde || enVol) return;
    setErreur(null);
    setEnVol(t);
    setTexte('');
    const r = await appelleLeChat({ action: 'ecrire', id: garde.id, jeton: garde.jeton, texte: t, apres: dernierId.current });
    setEnVol(null);
    if (r.error === 'discussion') { repartDeZero(); setTexte(t); setErreur('Cette discussion n’existe plus : présentez-vous à nouveau, votre message vous attend.'); return; }
    if (!r.ok) {
      setTexte(t);
      setErreur(r.error === 'rate_limited' || r.error === 'http_429'
        ? 'Beaucoup de messages d’un coup : patientez un instant.'
        : 'Votre message n’est pas parti. Vérifiez votre connexion et réessayez.');
      return;
    }
    ajoute(r.messages);
    if (typeof r.enLigne === 'boolean') setEnLigne(r.enLigne);
    const g = { ...garde, dernier: Date.now() };
    gardeLeChat(g);
    mesure('chat_message', { parcours: 'chat' });
  };

  const etat = enLigne === true
    ? <span className="chat-etat chat-etat--la"><i aria-hidden="true" />En ligne</span>
    : enLigne === false
      ? <span className="chat-etat"><i aria-hidden="true" />Réponse automatique, puis WhatsApp</span>
      : null;

  const classe = contact ? 'chat chat--contact' : 'chat';

  if (!ouvert) {
    return (
      <div className={classe}>
        <button type="button" className="btn jo-bt" onClick={() => setOuvert(true)}>Discuter en direct</button>
      </div>
    );
  }

  if (!garde) {
    return (
      <div className={classe}>
        <div className="chat-qui">
          {etat}
          <p className="chat-note">Pour vous répondre, et reprendre sur WhatsApp si la discussion coupe :</p>
          <div className="champ">
            <span className="vocal-etiquette" id="chat-civ">Vous êtes</span>
            <div className="vocal-civ" role="group" aria-labelledby="chat-civ">
              {CIVILITES.map((c) => (
                <button key={c.cle} type="button" aria-pressed={civilite === c.cle} onClick={() => setCivilite(c.cle)}>{c.dit}</button>
              ))}
              <button type="button" aria-pressed={civilite === ''} onClick={() => setCivilite('')}>Je préfère ne pas dire</button>
            </div>
          </div>
          <div className="deux-champs">
            <div className="champ"><label htmlFor={`chat-prenom-${genre ?? 'bulle'}`}>Prénom</label><input id={`chat-prenom-${genre ?? 'bulle'}`} autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
            <div className="champ"><label htmlFor={`chat-nom-${genre ?? 'bulle'}`}>Nom</label><input id={`chat-nom-${genre ?? 'bulle'}`} autoComplete="family-name" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
          </div>
          <div className="champ"><label htmlFor={`chat-numero-${genre ?? 'bulle'}`}>Votre numéro WhatsApp</label><input id={`chat-numero-${genre ?? 'bulle'}`} inputMode="tel" autoComplete="tel" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
          <button type="button" className="btn btn--plein" disabled={ouverture} onClick={() => void commencer()}>{ouverture ? 'Un instant…' : 'Commencer'}</button>
          <p className="chat-mention">
            En commençant, vous acceptez que la Maison MND garde cette discussion {GARDE_DES_DISCUSSIONS_JOURS} jours pour vous répondre.
            Quand personne n’est là, une réponse automatique, rédigée par une intelligence artificielle, vous aide. <a href="/confidentialite/">Vos données</a>
          </p>
          {erreur && <p className="erreur" role="alert">{erreur}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={classe}>
      <div className="chat-fil-entete">{etat}</div>
      <div className="chat-fil" ref={fil} aria-live="polite">
        <div className="chat-msg chat-msg--maison">
          Bonjour {garde.appel}, bienvenue à la Maison MND.{' '}
          {enLigne === false
            ? 'Personne n’est disponible à l’instant : une réponse automatique vous aide, et l’équipe vous répond ensuite sur WhatsApp.'
            : 'Écrivez votre question : une personne de l’équipe vous répond ici.'}
          <small>Maison MND</small>
        </div>
        {messages.map((m) => (
          m.de === 'systeme'
            ? <p key={m.id} className="chat-msg chat-msg--systeme">{m.texte}</p>
            : (
              <div key={m.id} className={`chat-msg chat-msg--${m.de}`}>
                {m.texte}
                <small>{m.de === 'visiteuse' ? heureDe(m.cree_le) : m.de === 'auto' ? 'Maison MND · réponse automatique' : 'Maison MND'}</small>
              </div>
            )
        ))}
        {enVol && <div className="chat-msg chat-msg--visiteuse chat-msg--envoi">{enVol}<small>Envoi…</small></div>}
        {enVol && <p className="chat-ecrit" aria-hidden="true"><i /><i /><i /></p>}
      </div>
      <form className="chat-saisie" onSubmit={(e) => { e.preventDefault(); void envoyer(); }}>
        <label className="cache" htmlFor={`chat-texte-${genre ?? 'bulle'}`}>Votre message</label>
        <input
          id={`chat-texte-${genre ?? 'bulle'}`}
          value={texte}
          maxLength={LONGUEUR_MAX_DU_MESSAGE}
          placeholder="Votre message"
          autoComplete="off"
          onChange={(e) => setTexte(e.target.value)}
        />
        <button type="submit" className="chat-envoi" disabled={!texte.trim() || !!enVol} aria-label="Envoyer">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 20 4l-7.5 17-2-7.5z" fill="currentColor" /></svg>
        </button>
      </form>
      {erreur && <p className="erreur" role="alert">{erreur}</p>}
      <div className="chat-pied">
        <a href={wa} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { parcours: 'chat' })}>Plutôt WhatsApp</a>
        <button type="button" className="chat-lien" onClick={repartDeZero}>Nouvelle discussion</button>
      </div>
    </div>
  );
}
