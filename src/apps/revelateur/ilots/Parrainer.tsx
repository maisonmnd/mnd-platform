import { useState, type FormEvent } from 'react';
import { COMMUN } from '../contenu';
import { client } from '../maison';
import { mesure } from '../mesure';

/* PARRAINER UNE AMIE — 28 septembre 2026, maquette « La communauté MND »
   validée. Un prénom, un numéro, et la fonction Edge `demande-submit` (mode
   `parrainage`) rend le code de cette marraine : le même à chaque fois pour
   un même numéro. Le code se partage sur WhatsApp avec le lien de
   réservation déjà rempli ; la filleule le voit reconnu au moment où elle
   réserve. Les deux cadeaux sont des phrases écrites au Trône
   (Marketing & Fidélité → Parrainages), rendues par la fonction : la page
   n'en invente aucun. */

const base = (chemin: string): string => import.meta.env.BASE_URL.replace(/\/$/, '') + chemin;

type Cadeaux = { filleule?: string; marraine?: string };

export default function Parrainer() {
  const f = COMMUN.formulaire;
  const [prenom, setPrenom] = useState('');
  const [numero, setNumero] = useState('');
  const [consent, setConsent] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [code, setCode] = useState('');
  const [cadeaux, setCadeaux] = useState<Cadeaux>({});
  const [copie, setCopie] = useState(false);

  const lien = code ? `${location.origin}${base('/reserver/')}?code=${encodeURIComponent(code)}` : '';
  const message = [
    `Je t’offre la Maison MND : réserve avec mon code ${code}${cadeaux.filleule ? `, tu as ${cadeaux.filleule} à ta première visite` : ', tu as un cadeau de bienvenue à ta première visite'}.`,
    lien,
  ].join('\n');

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (envoi) return;
    if (!prenom.trim()) { setErreur('Votre prénom : il ouvre votre code.'); return; }
    if (numero.replace(/\D/g, '').length < 8) { setErreur(f.erreurNumero); return; }
    if (!consent) { setErreur('Cochez la case pour que la Maison puisse vous remercier.'); return; }
    setErreur(null);
    setEnvoi(true);
    try {
      const supabase = await client();
      if (!supabase) { setErreur('Le parrainage n’est pas relié pour l’instant. Écrivez-nous sur WhatsApp.'); return; }
      const { data, error } = await supabase.functions.invoke('demande-submit', {
        body: { parrainage: true, data: { prenom, telephone: numero, page: location.pathname, consentement: true } },
      });
      const r = (data ?? {}) as { ok?: boolean; error?: string; code?: string; cadeaux?: Cadeaux };
      if (error || !r.ok || !r.code) {
        const c = r.error ?? (error?.message ?? '');
        if (c.includes('rate')) setErreur('Beaucoup de demandes d’un coup : réessayez dans quelques minutes.');
        else if (c.includes('telephone')) setErreur(f.erreurNumero);
        else if (c.includes('ferme')) setErreur('Le parrainage est en pause. La Maison vous le dira dès qu’il reprend.');
        else setErreur('Le code n’a pas pu être créé. Écrivez-nous sur WhatsApp, la Maison vous le donne.');
        return;
      }
      setCode(r.code);
      setCadeaux(r.cadeaux ?? {});
      mesure('parrainage_code', {});
    } catch {
      setErreur('Le code n’a pas pu être créé. Écrivez-nous sur WhatsApp, la Maison vous le donne.');
    } finally {
      setEnvoi(false);
    }
  };

  const copier = async () => {
    try { await navigator.clipboard.writeText(message); setCopie(true); } catch { setCopie(false); }
  };

  if (code) {
    return (
      <div className="bon bon--code sombre">
        <p className="sur">Votre code de marraine</p>
        <p className="bon__code">{code}</p>
        <p className="bon__petit">
          {cadeaux.filleule ? `Votre amie reçoit ${cadeaux.filleule} à sa première visite.` : 'Votre amie reçoit un cadeau de bienvenue à sa première visite.'}
          {' '}
          {cadeaux.marraine ? `Quand elle est venue, vous recevez ${cadeaux.marraine}.` : 'Quand elle est venue, la Maison vous remercie.'}
        </p>
        <div className="rangee">
          <a className="btn btn--plein" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener" onClick={() => mesure('parrainage_partage', {})}>Partager sur WhatsApp</a>
          <button type="button" className="btn" onClick={() => void copier()}>{copie ? 'Message copié' : 'Copier le message'}</button>
        </div>
        <p className="bon__petit">Un code ne sert qu’une fois par nouvelle cliente. Gardez-le : le même numéro vous rendra toujours le même code.</p>
      </div>
    );
  }

  return (
    <form className="bon sombre" onSubmit={(e) => void envoyer(e)} noValidate>
      <p className="sur">Votre code de marraine</p>
      <h3>Parrainez une amie.</h3>
      <div className="bon__champ"><label htmlFor="par-prenom">Votre prénom</label><input id="par-prenom" autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
      <div className="bon__champ"><label htmlFor="par-numero">Votre numéro WhatsApp</label><input id="par-numero" inputMode="tel" autoComplete="tel" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
      <label className="consentement consentement--clair"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>J’accepte que la Maison garde mon prénom et mon numéro pour suivre mes parrainages et me remercier.</span></label>
      <button className="btn btn--plein" type="submit" disabled={envoi}>{envoi ? 'Création du code' : 'Recevoir mon code'}</button>
      {erreur && <p className="erreur" role="alert">{erreur}</p>}
    </form>
  );
}
