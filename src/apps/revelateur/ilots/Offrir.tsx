import { useEffect, useState, type FormEvent } from 'react';
import { COMMUN } from '../contenu';
import { client, lienWhatsApp, maison } from '../maison';
import { mesure } from '../mesure';
import { PUBLIC_KEY, payWithKkiapay } from '../../../shared/kkiapay-widget';
import {
  TABLE_CARTES, commandeDuSite, montantRefuse, montantTape, nouvelIdDeCarte, type CarteCadeau, type ModeleDeCarte,
} from '../../../shared/cartes-cadeaux-pur';
import { imageDeLaCarte } from './carte-image';
import { raisonDuRefus } from '../refus-du-serveur';

/* LA CARTE CADEAU — 27 septembre 2026, maquette validée. « Intègre également
   le concept des cartes cadeaux. L'ERP nous le permet » (Yéman). Trois
   modèles sur les motifs de la Maison (le médaillon seul, l'allover du
   pictogramme, le médaillon en semis sur ivoire), un geste ou un montant,
   un prénom, un mot, une remise.

   RÉGLÉE EN LIGNE — 2 octobre 2026, maquette « La carte cadeau en ligne »
   validée. « Sur le site j'aimerais brancher KkiaPay pour offrir les cartes
   cadeaux » (Yéman). Quand on offre UN MONTANT, deux portes :
     - « Régler maintenant » : la commande est déposée (sans code, montant
       écrit), KkiaPay s'ouvre, et `kkiapay-verify` contrôle le paiement sur
       la commande, tire le code et rend la carte, qui s'affiche aussitôt ;
     - « Commander, je règle à la Maison » : comme avant, par `demande-submit`.
   UN GESTE ne se règle pas en ligne : son prix n'apparaît jamais sur le
   site. La Maison le règle avec l'acheteur et fait naître la carte au Trône.

   Le retour de KkiaPay ne prouve rien : seule la réponse du serveur fait
   afficher un code. */

const MODELES: [ModeleDeCarte, string][] = [['medaillon', 'Le Médaillon'], ['allover', 'L’Allover indigo'], ['ivoire', 'Le Médaillon ivoire']];
const GESTES = ['Un entretien complet', 'Un soin profond', 'Une Première Couronne', 'Une séance MND Kids'];
const REMISES = ['Carte numérique, sur WhatsApp', 'Carte imprimée, à retirer à la Maison'];

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

type Reglee = { code: string; valable: string };

const dateLongue = (iso: string): string =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export default function Offrir() {
  const f = COMMUN.formulaire;
  const [modele, setModele] = useState<ModeleDeCarte>('medaillon');
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
  const [branchId, setBranchId] = useState('');
  /* Le paiement en cours : la commande déposée, que l'on peut rouvrir. */
  const [commande, setCommande] = useState<CarteCadeau | null>(null);
  const [reglee, setReglee] = useState<Reglee | null>(null);
  /* Payé, mais la vérification n'a pas répondu : on garde la référence. */
  const [enVerification, setEnVerification] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => { void maison().then((m) => { setWhatsapp(m?.whatsapp ?? ''); setBranchId(m?.branchId ?? ''); }); }, []);

  const peutPayer = PUBLIC_KEY !== '' && !!branchId;
  const chiffres = montantTape(montant);
  const objet = mode === 'geste' ? geste : (chiffres ? `${chiffres.toLocaleString('fr-FR')} F CFA à la Maison` : 'Un montant à la Maison');
  const remiseCle = remise === REMISES[1] ? 'imprimee' : 'numerique';
  const resume = [
    `CARTE CADEAU · modèle ${MODELES.find(([m]) => m === modele)?.[1] ?? modele}`,
    mode === 'geste' ? `Geste offert : ${geste}` : `Montant offert : ${chiffres ? `${chiffres.toLocaleString('fr-FR')} F CFA` : 'à préciser'}`,
    `Pour : ${pour.trim() || 'à préciser'}`,
    `De la part de : ${de.trim() || 'à préciser'}`,
    mot.trim() ? `Mot : ${mot.trim()}` : '',
    `Remise : ${remise}`,
  ].filter(Boolean).join('\n');
  const wa = lienWhatsApp(whatsapp, `Bonjour MND, je souhaite commander une carte cadeau.\n${resume}`);

  /* Ce qui manque avant d'envoyer quoi que ce soit, ou `null`. */
  const manque = (): string | null => {
    if (mode === 'montant' && !chiffres) return 'Écrivez le montant que vous offrez.';
    if (tel.replace(/\D/g, '').length < 8) return f.erreurNumero;
    if (!consent) return 'Cochez la case pour que la Maison puisse vous écrire.';
    return null;
  };

  /* LA COMMANDE AU REGISTRE DU TRÔNE. Jamais bloquante pour « je règle à la
     Maison » : la demande, elle, part de toute façon. */
  const deposeLaCommande = async (origine: 'en-ligne' | 'maison'): Promise<CarteCadeau | null> => {
    const supabase = await client();
    if (!supabase || !branchId) return null;
    const c = commandeDuSite({
      id: nouvelIdDeCarte(), branchId, maintenant: new Date().toISOString(), origine,
      objet: mode, montantXof: mode === 'montant' ? chiffres : undefined, geste: mode === 'geste' ? geste : undefined,
      modele, pour, de, mot, remise: remiseCle, telephone: tel,
    });
    const { error } = await supabase.from(TABLE_CARTES).insert({ id: c.id, branch_id: c.branchId, data: c });
    if (error) { console.warn('[mnd-site] carte refusée :', error.message); return null; }
    return c;
  };

  const commander = async (e?: FormEvent) => {
    e?.preventDefault();
    if (envoi) return;
    const m = manque();
    if (m) { setErreur(m); return; }
    setErreur(null);
    setEnvoi(true);
    try {
      const supabase = await client();
      if (!supabase) { setErreur('La commande n’est pas reliée pour l’instant. Écrivez-nous sur WhatsApp, la carte se prépare aussi bien.'); return; }
      /* Une commande abandonnée en ligne n'en dépose pas une seconde, ET UN
         ESSAI MANQUÉ NON PLUS (10 octobre 2026, revue de code) : la commande
         déposée est gardée avant l'envoi. Sans cela, chaque clic après un échec
         de demande-submit insérait une nouvelle carte « à régler ». */
      const deposee = commande ?? await deposeLaCommande('maison');
      if (deposee && deposee !== commande) setCommande(deposee);
      const { data, error } = await supabase.functions.invoke('demande-submit', {
        body: { genre: 'prospect', data: { prenom: de, telephone: tel, besoin: 'inconnu', profil: 'Carte cadeau', mot: resume, page: location.pathname, consentement: true } },
      });
      const r = (data ?? {}) as { ok?: boolean; error?: string };
      if (error || !r.ok) {
        /* La raison est dans le corps de la réponse refusée (refus-du-serveur.ts). */
        const code = await raisonDuRefus(data, error);
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

  /* RÉGLER MAINTENANT. La promesse de KkiaPay ne se résout que sur un
     paiement abouti : fermer la fenêtre laisse l'écran tel quel, avec ses
     deux portes (rouvrir, ou régler à la Maison). */
  const regler = async () => {
    if (envoi) return;
    const m = manque() ?? montantRefuse(chiffres);
    if (m) { setErreur(m); return; }
    setErreur(null);
    setEnvoi(true);
    try {
      /* UNE COMMANDE « À LA MAISON » NE SE RÈGLE PAS EN LIGNE — 10 octobre
         2026 (reprise de la revue). Depuis qu'un essai manqué de « je règle à
         la Maison » garde sa commande, celle-ci arrivait ici et se payait par
         KkiaPay en restant d'origine 'maison' : le Trône l'aurait dite
         « commandée sur le site », sans « réglée en ligne ». Le site ne peut
         pas réécrire une carte déposée (la base ne lui ouvre que l'insertion) :
         seule une commande déjà 'en-ligne' se reprend, sinon une carte en
         ligne naît, à son origine juste. */
      const c = (commande?.origine === 'en-ligne' ? commande : null) ?? await deposeLaCommande('en-ligne');
      if (!c) { setErreur('Le paiement en ligne n’est pas disponible pour l’instant. Commandez la carte : la Maison la prépare avec vous.'); return; }
      setCommande(c);
      mesure('cadeau_paiement_ouvert', { parcours: 'inconnu' });
      const { transactionId } = await payWithKkiapay({
        amountXof: c.montantXof ?? 0, partnerId: c.id, branchId: c.branchId,
        phone: tel, name: de.trim() || undefined,
      });
      setEnVerification(transactionId);
      const supabase = await client();
      if (!supabase) return;
      const { data, error } = await supabase.functions.invoke('kkiapay-verify', {
        body: { transactionId, carteId: c.id, branchId: c.branchId },
      });
      const r = (data ?? {}) as { ok?: boolean; carte?: { code?: string; valableJusquau?: string } };
      if (error || !r.ok || !r.carte?.code) return; // la référence reste à l'écran ; le filet KkiaPay réglera la carte
      setReglee({ code: r.carte.code, valable: r.carte.valableJusquau ?? '' });
      setEnVerification(null);
      mesure('cadeau_regle', { parcours: 'inconnu' });
    } catch (x) {
      setErreur(x instanceof Error ? x.message : 'Le paiement n’a pas abouti.');
    } finally {
      setEnvoi(false);
    }
  };

  /* L'image de la carte, préparée dès qu'elle est réglée : un lien de
     téléchargement prêt vaut mieux qu'un bouton qui calcule après le clic. */
  useEffect(() => {
    if (!reglee) return;
    let url = '';
    void imageDeLaCarte({ modele, pour: pour.trim(), objet, mot: [mot.trim(), de.trim() ? `De la part de ${de.trim()}.` : ''].filter(Boolean).join(' '), code: reglee.code, valable: dateLongue(reglee.valable) })
      .then((b) => { url = URL.createObjectURL(b); setImage(url); })
      .catch(() => setImage(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [reglee]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="bas">
        <span className="fon">Mi nyɔ́ ɖɛkpɛ.</span>
        {reglee
          ? <span className="code"><b>{reglee.code}</b>{reglee.valable ? ` valable jusqu’au ${dateLongue(reglee.valable)}` : ''}</span>
          : <span className="code">MND · carte cadeau</span>}
      </div>
    </div>
  );

  if (reglee) {
    const partage = `Une carte cadeau pour toi, à la Maison MND : ${objet}. Ton code : ${reglee.code}${reglee.valable ? `, valable jusqu’au ${dateLongue(reglee.valable)}` : ''}. Il suffit de le présenter à la Maison.`;
    return (
      <div className="offrir-ilot">
        {carte}
        <div className="merci" style={{ marginTop: 22 }}>
          <p className="sur">Carte réglée</p>
          <h2>Merci. Voici votre carte.</h2>
          <p>Son code : <b>{reglee.code}</b>. Gardez-le comme un billet : la carte se dépense à la Maison par qui le présente, en une ou plusieurs fois.</p>
          {remiseCle === 'imprimee' && <p>La carte imprimée vous attend à la Maison.</p>}
          <p>La Maison vous écrit aussi sur WhatsApp.</p>
          <div className="rangee">
            {image
              ? <a className="btn btn--fort" href={image} download={`carte-cadeau-${reglee.code}.png`}>Enregistrer la carte</a>
              : <span className="btn btn--fort" aria-disabled="true">Préparation de la carte</span>}
            <a className="btn btn--lien" href={lienWhatsApp('', partage)} target="_blank" rel="noopener">L’envoyer sur WhatsApp</a>
          </div>
        </div>
      </div>
    );
  }

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

  if (enVerification) {
    return (
      <div className="offrir-ilot">
        {carte}
        <div className="merci" style={{ marginTop: 22 }}>
          <p className="sur">Paiement reçu</p>
          <h2>La Maison vérifie votre paiement.</h2>
          <p>Votre référence : <b>{enVerification}</b>. Gardez-la. Dès que le paiement est confirmé, la carte est créée et la Maison vous l’envoie sur WhatsApp.</p>
          <div className="rangee">
            <a className="btn btn--fort" href={lienWhatsApp(whatsapp, `Bonjour MND, j’ai réglé une carte cadeau en ligne. Ma référence : ${enVerification}.`)} target="_blank" rel="noopener">Écrire à MND</a>
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
            <label key={m}><input type="radio" name="modele" value={m} checked={modele === m} onChange={() => setModele(m)} disabled={!!commande} />{nom}</label>
          ))}
        </div>
        <div className="onglets" role="tablist" aria-label="Offrir">
          <button type="button" role="tab" aria-selected={mode === 'geste'} onClick={() => setMode('geste')} disabled={!!commande}>Un geste</button>
          <button type="button" role="tab" aria-selected={mode === 'montant'} onClick={() => setMode('montant')} disabled={!!commande}>Un montant</button>
        </div>
        {mode === 'geste' ? (
          <div className="pilules" role="radiogroup" aria-label="Le geste offert">
            {GESTES.map((g) => <label key={g}><input type="radio" name="geste" value={g} checked={geste === g} onChange={() => setGeste(g)} disabled={!!commande} />{g}</label>)}
          </div>
        ) : (
          <div className="champ"><label htmlFor="cc-montant">Le montant de votre choix</label><input id="cc-montant" name="montant" inputMode="numeric" placeholder="En francs CFA" value={montant} onChange={(e) => setMontant(e.target.value)} disabled={!!commande} /></div>
        )}
        <div className="deux-champs">
          <div className="champ"><label htmlFor="cc-pour">Pour</label><input id="cc-pour" name="pour" placeholder="Son prénom" value={pour} onChange={(e) => setPour(e.target.value)} disabled={!!commande} /></div>
          <div className="champ"><label htmlFor="cc-de">De la part de</label><input id="cc-de" name="de" autoComplete="given-name" placeholder="Votre prénom" value={de} onChange={(e) => setDe(e.target.value)} disabled={!!commande} /></div>
        </div>
        <div className="champ"><label htmlFor="cc-mot">Un mot</label><textarea id="cc-mot" name="mot" rows={2} maxLength={120} value={mot} onChange={(e) => setMot(e.target.value)} disabled={!!commande} /></div>
        <div className="deux-champs">
          <div className="champ"><label htmlFor="cc-remise">Comment la remettre</label>
            <select id="cc-remise" name="remise" value={remise} onChange={(e) => setRemise(e.target.value)} disabled={!!commande}>
              {REMISES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select></div>
          <div className="champ"><label htmlFor="cc-tel">{f.numero}</label><input id="cc-tel" name="numero" inputMode="tel" autoComplete="tel" value={tel} onChange={(e) => setTel(e.target.value)} required disabled={!!commande} /></div>
        </div>
        <label className="consentement"><input type="checkbox" id="cc-consent" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{f.consentement}</span></label>
        {mode === 'montant' && peutPayer ? (
          <>
            <button className="btn btn--fort" type="button" onClick={() => void regler()} disabled={envoi}>
              {envoi ? 'Paiement en cours' : commande?.origine === 'en-ligne' ? 'Rouvrir le paiement' : 'Régler maintenant'}
            </button>
            <p className="note-paiement">Mobile Money, Wave ou carte, avec KkiaPay. Les frais de paiement sont à votre charge.</p>
            <button className="btn btn--lien" type="submit" disabled={envoi}>Commander, je règle à la Maison</button>
          </>
        ) : (
          <>
            <button className="btn btn--fort" type="submit" disabled={envoi}>{envoi ? 'Envoi en cours' : 'Commander la carte'}</button>
            {mode === 'geste' && <p className="note-paiement">Un geste se règle à la Maison : elle vous écrit sur WhatsApp pour le régler et vous remettre la carte.</p>}
          </>
        )}
        {erreur && <p className="erreur" role="alert">{erreur}</p>}
      </form>
    </div>
  );
}
