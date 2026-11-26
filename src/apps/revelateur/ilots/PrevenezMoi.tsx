import { useMemo, useState } from 'react';
import { client } from '../maison';
import { jourFermeALaMaison, type AgendaDeLaMaison } from '../agenda';
import { joursCompletsAProposer, jourDitDeLAttente, reponseDeLAttenteDite } from '../../../shared/liste-d-attente-pur';
import './prevenez-moi.css';

/* ══ « PRÉVENEZ-MOI SI UNE PLACE SE LIBÈRE CE JOUR-LÀ » — 26 novembre 2026 ══
   Audit du Trône, point B3 (validé par Yéman, « construis ») : un jour plein
   n'est plus une porte fermée. Sous le mois, les jours complets pour CE
   rituel (ni fermés, ni passés) se touchent ; son prénom et son numéro
   suffisent, et la demande part à `demande-submit` (`{ prevenir: 'place' }`),
   seule à écrire la liste d'attente. L'équipe la prévient par WhatsApp si une
   place se libère (le Calendrier du Trône la montre).

   Posé dans Réserver par UNE ligne : tout vit ici, pour que la page bouge le
   moins possible. Rien ne s'affiche tant que les places ne sont pas lues
   (`pret`) : une page qui charge croirait tous les jours complets. */

export default function PrevenezMoi({ pret, agenda, horizon, heuresParJour, serviceIds, dureeMin, lourde, aujourdhui }: {
  pret: boolean;
  agenda: AgendaDeLaMaison | null | undefined;
  horizon: { jours: readonly string[] };
  heuresParJour: ReadonlyMap<string, number>;
  serviceIds: readonly string[];
  dureeMin: number;
  lourde: boolean;
  aujourdhui: string;
}) {
  const [jour, setJour] = useState<string | null>(null);
  const [prenom, setPrenom] = useState('');
  const [numero, setNumero] = useState('');
  const [envoi, setEnvoi] = useState<'repos' | 'part' | 'fait'>('repos');
  const [dit, setDit] = useState<{ ok: boolean; texte: string } | null>(null);

  const complets = useMemo(() => {
    if (!pret || !agenda || serviceIds.length === 0) return [];
    return joursCompletsAProposer(
      horizon.jours.map((iso) => ({ iso, complet: !jourFermeALaMaison(agenda, iso) && (heuresParJour.get(iso) ?? 0) === 0 })),
      aujourdhui,
    );
  }, [pret, agenda, horizon.jours, heuresParJour, serviceIds.length, aujourdhui]);

  if (complets.length === 0) return null;

  const envoyer = async () => {
    if (!jour || envoi === 'part') return;
    setEnvoi('part');
    setDit(null);
    let reponse: { ok?: unknown; deja?: unknown; error?: unknown } | null = null;
    try {
      const supabase = await client();
      if (supabase) {
        const { data, error } = await supabase.functions.invoke('demande-submit', {
          body: { prevenir: 'place', data: { jour, prenom, telephone: numero, serviceIds, dureeMin, lourde, branchId: agenda?.branchId } },
        });
        if (!error) reponse = data as typeof reponse;
        else {
          const rep = (error as { context?: Response } | null)?.context;
          reponse = rep && typeof rep.json === 'function' ? await rep.json().catch(() => null) : null;
        }
      }
    } catch { /* la phrase de panne suit */ }
    const r = reponseDeLAttenteDite(reponse);
    setDit(r);
    setEnvoi(r.ok ? 'fait' : 'repos');
  };

  return (
    <div className="prevenez-moi">
      <p className="prevenez-moi__titre">Un jour complet vous convenait mieux ?</p>
      <p className="legende">Touchez-le : si une place s’y libère, nous vous écrivons sur WhatsApp.</p>
      <div className="prevenez-moi__jours" role="group" aria-label="Les jours complets">
        {complets.map((iso) => (
          <button
            type="button"
            key={iso}
            className={`prevenez-moi__jour${jour === iso ? ' est-choisi' : ''}`}
            aria-pressed={jour === iso}
            disabled={envoi === 'fait'}
            onClick={() => { setJour(iso); setDit(null); }}
          >
            {jourDitDeLAttente(iso)}
          </button>
        ))}
      </div>
      {jour && envoi !== 'fait' && (
        <div className="prevenez-moi__form">
          <div className="deux-champs">
            <div className="champ"><label htmlFor="attente-prenom">Prénom</label><input id="attente-prenom" autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
            <div className="champ"><label htmlFor="attente-numero">WhatsApp</label><input id="attente-numero" inputMode="tel" autoComplete="tel" placeholder="01 90 00 00 00" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
          </div>
          <button type="button" className="btn btn--plein" disabled={envoi === 'part' || prenom.trim().length < 2 || numero.replace(/\D/g, '').length < 8} onClick={() => void envoyer()}>
            Prévenez-moi si une place se libère ce jour-là
          </button>
        </div>
      )}
      {dit && <p className={dit.ok ? 'prevenez-moi__dit' : 'erreur'} role={dit.ok ? 'status' : 'alert'}>{dit.texte}</p>}
    </div>
  );
}
