import { useEffect, useState, type FormEvent } from 'react';
import { COMMUN } from '../contenu';
import { client, lienWhatsApp, maison } from '../maison';
import { mesure } from '../mesure';

/* LA CARTE CADEAU — 27 septembre 2026, maquette validée. « Intègre également
   le concept des cartes cadeaux. L'ERP nous le permet » (Yéman). Trois
   modèles sur les motifs de la Maison (le médaillon seul, l'allover du
   pictogramme, le médaillon en semis sur ivoire), un geste ou un montant,
   un prénom, un mot, une remise.

   RIEN NE SE PAIE EN LIGNE, comme partout sur le site. La commande part par
   la même fonction Edge que le rappel (`demande-submit`, genre prospect) :
   la carte entière tient dans le mot, que le Trône lit dans la demande. La
   Maison confirme sur WhatsApp, encaisse à la Maison ou par mobile money, et
   porte la carte sur le compte de la personne : l'avoir existe déjà au
   Trône. Aucun montant n'est suggéré : la voix du site n'écrit pas de prix,
   c'est l'acheteur qui écrit le sien. */

type Modele = 'medaillon' | 'allover' | 'ivoire';
const MODELES: [Modele, string][] = [['medaillon', 'Le Médaillon'], ['allover', 'L’Allover indigo'], ['ivoire', 'Le Médaillon ivoire']];
const GESTES = ['Un entretien complet', 'Un soin profond', 'Une Première Couronne', 'Une séance MND Kids'];
const REMISES = ['Carte numérique, sur WhatsApp', 'Carte imprimée, à retirer à la Maison'];

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

export default function Offrir() {
  const f = COMMUN.formulaire;
  const [modele, setModele] = useState<Modele>('medaillon');
  const [mode, setMode] = useState<'geste' | 'montant'>('geste');
  const [geste, setGeste] = useState(GESTES[0]);
  const [montant, setMontant] = useState('');
  const [pour, setPour] = useState('');
  const [de, setDe] = useState('');
  const [mot, setMot] = useState('');
  const [remise, setRemise] = useState(REMISES[0]);
  const [tel, setTel] = useState('');
  const [consent, setConsent] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [recu, setRecu] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  useEffect(() => { void maison().then((m) => setWhatsapp(m?.whatsapp ?? '')); }, []);

  const chiffres = montant.replace(/\D/g, '');
  const objet = mode === 'geste' ? geste : (chiffres ? `${Number(chiffres).toLocaleString('fr-FR')} F CFA à la Maison` : 'Un montant à la Maison');
  const resume = [
    `CARTE CADEAU · modèle ${MODELES.find(([m]) => m === modele)?.[1] ?? modele}`,
    mode === 'geste' ? `Geste offert : ${geste}` : `Montant offert : ${chiffres ? `${Number(chiffres).toLocaleString('fr-FR')} F CFA` : 'à préciser'}`,
    `Pour : ${pour.trim() || 'à préciser'}`,
    `De la part de : ${de.trim() || 'à préciser'}`,
    mot.trim() ? `Mot : ${mot.trim()}` : '',
    `Remise : ${remise}`,
  ].filter(Boolean).join('\n');
  const wa = lienWhatsApp(whatsapp, `Bonjour MND, je souhaite commander une carte cadeau.\n${resume}`);

  const commander = async (e: FormEvent) => {
    e.preventDefault();
    if (envoi) return;
    if (mode === 'montant' && !chiffres) { setErreur('Écrivez le montant que vous offrez.'); return; }
    if (tel.replace(/\D/g, '').length < 8) { setErreur(f.erreurNumero); return; }
    if (!consent) { setErreur('Cochez la case pour que la Maison puisse vous écrire.'); return; }
    setErreur(null);
    setEnvoi(true);
    try {
      const supabase = await client();
      if (!supabase) { setErreur('La commande n’est pas reliée pour l’instant. Écrivez-nous sur WhatsApp, la carte se prépare aussi bien.'); return; }
      const { data, error } = await supabase.functions.invoke('demande-submit', {
        body: { genre: 'prospect', data: { prenom: de, telephone: tel, besoin: 'inconnu', profil: 'Carte cadeau', mot: resume, page: location.pathname, consentement: true } },
      });
      const r = (data ?? {}) as { ok?: boolean; error?: string };
      if (error || !r.ok) {
        const code = r.error ?? (error?.message ?? '');
        if (code.includes('rate')) setErreur('Beaucoup de demandes d’un coup : réessayez dans quelques minutes, ou écrivez-nous sur WhatsApp.');
        else if (code.includes('telephone')) setErreur(f.erreurNumero);
        else setErreur('L’envoi n’a pas abouti. Écrivez-nous sur WhatsApp, la carte se prépare aussi bien.');
        return;
      }
      setRecu(true);
      mesure('prospect_depose', { parcours: 'inconnu', genre: 'cadeau' });
    } catch {
      setErreur('L’envoi n’a pas abouti. Écrivez-nous sur WhatsApp, la carte se prépare aussi bien.');
    } finally {
      setEnvoi(false);
    }
  };

  const carte = (
    <div className={`carte-cadeau carte-cadeau--${modele}`} aria-label="Aperçu de la carte">
      <div className="haut">
        <img className="v-ivoire" src="/assets/vectoriel/verrou-couche-ivoire.svg" alt="Maison MND" width="5056" height="1583" />
        <img className="v-indigo" src="/assets/vectoriel/verrou-couche-indigo.svg" alt="Maison MND" width="5056" height="1583" />
        <small>Carte cadeau</small>
      </div>
      <div className="milieu">
        <p className="pour">{pour.trim() ? `Pour ${pour.trim()}` : 'Pour vous'}</p>
        {/* `objet` et non `geste` : les pages de service ont déjà une classe
            .geste, encadrée et claire, qui recouvrait le texte de la carte. */}
        <p className="objet">{objet}</p>
        <p className="mot">{mot.trim()}{de.trim() ? `${mot.trim() ? ' ' : ''}De la part de ${de.trim()}.` : ''}</p>
      </div>
      <div className="bas"><span className="fon">Mi nyɔ́ ɖɛkpɛ.</span><span className="code">MND · carte cadeau</span></div>
    </div>
  );

  if (recu) {
    return (
      <div className="offrir-ilot">
        {carte}
        <div className="merci" style={{ marginTop: 22 }}>
          <p className="sur">Commande reçue</p>
          <h2>Merci. La Maison vous écrit.</h2>
          <p>Sur WhatsApp, pendant ses heures d’ouverture, pour régler et remettre la carte.</p>
          <div className="rangee">
            <a className="btn btn--fort" href={wa} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { parcours: 'inconnu' })}>Parler à MND sur WhatsApp</a>
            <a className="btn btn--lien" href={base('/')}>Retour à l’accueil</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="offrir-ilot">
      {carte}
      <form className="config" onSubmit={(e) => void commander(e)} noValidate>
        <div className="pilules" role="radiogroup" aria-label="Le modèle de la carte">
          {MODELES.map(([m, nom]) => (
            <label key={m}><input type="radio" name="modele" value={m} checked={modele === m} onChange={() => setModele(m)} />{nom}</label>
          ))}
        </div>
        <div className="onglets" role="tablist" aria-label="Offrir">
          <button type="button" role="tab" aria-selected={mode === 'geste'} onClick={() => setMode('geste')}>Un geste</button>
          <button type="button" role="tab" aria-selected={mode === 'montant'} onClick={() => setMode('montant')}>Un montant</button>
        </div>
        {mode === 'geste' ? (
          <div className="pilules" role="radiogroup" aria-label="Le geste offert">
            {GESTES.map((g) => <label key={g}><input type="radio" name="geste" value={g} checked={geste === g} onChange={() => setGeste(g)} />{g}</label>)}
          </div>
        ) : (
          <div className="champ"><label htmlFor="cc-montant">Le montant de votre choix</label><input id="cc-montant" name="montant" inputMode="numeric" placeholder="En francs CFA" value={montant} onChange={(e) => setMontant(e.target.value)} /></div>
        )}
        <div className="deux-champs">
          <div className="champ"><label htmlFor="cc-pour">Pour</label><input id="cc-pour" name="pour" placeholder="Son prénom" value={pour} onChange={(e) => setPour(e.target.value)} /></div>
          <div className="champ"><label htmlFor="cc-de">De la part de</label><input id="cc-de" name="de" autoComplete="given-name" placeholder="Votre prénom" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        </div>
        <div className="champ"><label htmlFor="cc-mot">Un mot</label><textarea id="cc-mot" name="mot" rows={2} maxLength={120} value={mot} onChange={(e) => setMot(e.target.value)} /></div>
        <div className="deux-champs">
          <div className="champ"><label htmlFor="cc-remise">Comment la remettre</label>
            <select id="cc-remise" name="remise" value={remise} onChange={(e) => setRemise(e.target.value)}>
              {REMISES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select></div>
          <div className="champ"><label htmlFor="cc-tel">{f.numero}</label><input id="cc-tel" name="numero" inputMode="tel" autoComplete="tel" value={tel} onChange={(e) => setTel(e.target.value)} required /></div>
        </div>
        <label className="consentement"><input type="checkbox" id="cc-consent" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{f.consentement}</span></label>
        <button className="btn btn--fort" type="submit" disabled={envoi}>{envoi ? 'Envoi en cours' : 'Commander la carte'}</button>
        {erreur && <p className="erreur" role="alert">{erreur}</p>}
      </form>
    </div>
  );
}
