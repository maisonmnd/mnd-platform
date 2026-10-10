import { useEffect, useState, type FormEvent } from 'react';
import { COMMUN } from '../contenu';
import { client, lienWhatsApp, maison } from '../maison';
import { campagne, mesure } from '../mesure';
import { raisonDuRefus } from '../refus-du-serveur';
import type { Besoin } from '../../../shared/qualification';
import { codeNormalise } from '../../../shared/offres-pur';
import { FORME_DU_CODE } from '../../../shared/parrainage-pur';

/* LA DEMANDE SANS COMPTE — un prénom, un numéro, la Maison rappelle.

   Le formulaire ne parle qu'à la fonction Edge `demande-submit` : c'est
   elle qui limite le débit, normalise le numéro, refuse les doublons et
   écrit la ligne avec le service role. Le navigateur n'écrit jamais en base.
   Un seul champ est obligatoire : le numéro. Sans lui, personne ne peut
   rappeler ; avec lui seul, la Maison peut déjà tout faire. */

/** `profil` posé d'avance (« Testeuse ») : le choix du profil disparaît du formulaire. */
type Props = { genre: 'prospect' | 'rdv'; besoin?: Besoin; profil?: string };

const BESOINS = new Set<string>(['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu']);

function besoinDeLAdresse(): Besoin | '' {
  try {
    const b = new URLSearchParams(location.search).get('besoin') ?? '';
    return BESOINS.has(b) ? (b as Besoin) : '';
  } catch { return ''; }
}

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

/* LE CODE D'UNE AMIE SUIT LA DEMANDE DE RAPPEL — 9 octobre 2026 au soir.
   L'amie d'une Graine qui veut créer sa couronne (ou faire soigner ses
   locks) passe par une consultation, donc par ce formulaire : le code de
   sa marraine voyage avec elle depuis la porte de la réservation, part au
   serveur dans `codeAmie` (que l'ancienne fonction ignore), et le serveur
   seul dit s'il est celui d'une Graine. Rien ne se promet ici. */
const codeDAmieDeLAdresse = (): string => {
  try {
    const c = codeNormalise(new URLSearchParams(location.search).get('code') ?? '');
    return FORME_DU_CODE.test(c) ? c : '';
  } catch { return ''; }
};

export default function Demande({ genre, besoin: besoinInitial, profil: profilPose }: Props) {
  const f = COMMUN.formulaire;
  const [prenom, setPrenom] = useState('');
  const [numero, setNumero] = useState('');
  const [besoin, setBesoin] = useState<Besoin | ''>(besoinInitial ?? besoinDeLAdresse());
  const [profil, setProfil] = useState(profilPose ?? '');
  const [mot, setMot] = useState('');
  const [consent, setConsent] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [recu, setRecu] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [codeAmie] = useState(codeDAmieDeLAdresse);
  useEffect(() => { void maison().then((m) => setWhatsapp(m?.whatsapp ?? '')); }, []);

  const cle: Besoin = besoin || 'inconnu';
  const wa = lienWhatsApp(whatsapp, COMMUN.messages[cle]);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (envoi) return;
    if (numero.replace(/\D/g, '').length < 8) { setErreur(f.erreurNumero); return; }
    if (!consent) { setErreur('Cochez la case pour que nous puissions vous rappeler.'); return; }
    setErreur(null);
    setEnvoi(true);
    try {
      const supabase = await client();
      if (!supabase) { setErreur('Le formulaire n’est pas relié pour l’instant. Écrivez-nous sur WhatsApp.'); return; }
      const { data, error } = await supabase.functions.invoke('demande-submit', {
        body: {
          genre,
          data: {
            prenom, telephone: numero, besoin: cle, profil, mot,
            ...(codeAmie ? { codeAmie } : {}),
            page: location.pathname, campagne: campagne() || undefined, consentement: true,
          },
        },
      });
      const r = (data ?? {}) as { ok?: boolean; error?: string };
      if (error || !r.ok) {
        /* La raison est dans le corps de la réponse refusée (refus-du-serveur.ts, 10 octobre 2026). */
        const code = await raisonDuRefus(data, error);
        if (code.includes('rate')) setErreur('Beaucoup de demandes d’un coup : réessayez dans quelques minutes, ou écrivez-nous sur WhatsApp.');
        else if (code.includes('telephone')) setErreur(f.erreurNumero);
        else setErreur('L’envoi n’a pas abouti. Écrivez-nous sur WhatsApp, nous vous répondons.');
        return;
      }
      setRecu(true);
      mesure(genre === 'rdv' ? 'reservation_demandee' : 'prospect_depose', { parcours: cle, genre });
    } catch {
      setErreur('L’envoi n’a pas abouti. Écrivez-nous sur WhatsApp, nous vous répondons.');
    } finally {
      setEnvoi(false);
    }
  };

  /* La demande, écrite pour WhatsApp (28 septembre 2026) : elle l'envoie
     elle-même, la conversation s'ouvre de son côté. */
  const texteDeLaDemande = (): string => [
    `Bonjour MND, je viens de laisser une demande sur le site${prenom.trim() ? ` (${prenom.trim()})` : ''} :`,
    `${f.besoins.find((b) => b.valeur === cle)?.texte ?? 'je ne sais pas encore quel service choisir'}${profil ? ` · ${profil}` : ''}.`,
    mot.trim() ? mot.trim() : '',
    'Merci de me répondre ici.',
  ].filter(Boolean).join('\n');
  if (recu) {
    return (
      <div className="merci">
        <p className="sur">Demande reçue</p>
        <h2>{f.merci.titre}</h2>
        <p>{f.merci.texte}</p>
        <div className="rangee">
          <a className="btn btn--fort" href={lienWhatsApp(whatsapp, texteDeLaDemande())} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { parcours: cle })}>Envoyer ma demande sur WhatsApp</a>
          <a className="btn btn--lien" href={base('/')}>Retour à l’accueil</a>
        </div>
      </div>
    );
  }

  return (
    <form className="formulaire" onSubmit={(e) => void envoyer(e)} noValidate>
      <div className="deux-champs">
        <div className="champ"><label htmlFor="dem-prenom">{f.prenom}</label><input id="dem-prenom" name="prenom" autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
        <div className="champ"><label htmlFor="dem-numero">{f.numero}</label><input id="dem-numero" name="numero" inputMode="tel" autoComplete="tel" value={numero} onChange={(e) => setNumero(e.target.value)} required /></div>
      </div>
      {!profilPose && <div className="deux-champs">
        <div className="champ"><label htmlFor="dem-besoin">{f.besoin}</label>
          <select id="dem-besoin" name="besoin" value={besoin} onChange={(e) => setBesoin(e.target.value as Besoin | '')}>
            <option value="">Choisir</option>
            {f.besoins.map((b) => <option key={b.valeur} value={b.valeur}>{b.texte}</option>)}
          </select></div>
        <div className="champ"><label htmlFor="dem-profil">{f.profil}</label>
          <select id="dem-profil" name="profil" value={profil} onChange={(e) => setProfil(e.target.value)}>
            <option value="">Choisir</option>
            {f.profils.map((p) => <option key={p} value={p}>{p}</option>)}
          </select></div>
      </div>}
      {codeAmie && <p className="code-offre__dit">Le code {codeAmie} accompagne votre demande : la Maison le regarde en vous rappelant.</p>}
      <div className="champ"><label htmlFor="dem-mot">{profilPose ? 'Vos locks en quelques mots (âge, calibre, ce qui vous préoccupe)' : 'Un mot, si vous voulez'}</label><textarea id="dem-mot" name="mot" rows={3} value={mot} onChange={(e) => setMot(e.target.value)} /></div>
      <label className="consentement"><input type="checkbox" id="dem-consent" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{f.consentement}</span></label>
      <button className="btn btn--plein" type="submit" disabled={envoi}>{envoi ? 'Envoi en cours' : f.bouton}</button>
      {erreur && <p className="erreur" role="alert">{erreur}</p>}
    </form>
  );
}
