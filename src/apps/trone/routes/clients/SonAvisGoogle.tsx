import { useNavigate } from 'react-router-dom';
import { jourCourtAn } from '../../../../shared/calendrier';
import { useLiensDesAvis } from '../../../../shared/avis-fiches';
import { avisDeLaCliente, jourACotonou, jourDeLAvis } from '../../../../shared/avis-fiches-pur';
import { useBrouillonsDAvis } from '../../../../shared/ia-avis';
import { estSansReponse, idDeLAvis, jourLocalDe } from '../../../../shared/ia-avis-pur';
import { useEnvois } from '../equipe/data';
import { useReleveDesAvis } from './releve-des-avis';

/* ══ SON AVIS GOOGLE, SUR SA FICHE — 20 octobre 2026 ═════════════════════
   « Lier un avis à une fiche » (Yéman, maquette DNVVXdkd…). L'avis relié
   dans Vitrines › Les avis Google paraît ici : les étoiles, le jour, le
   texte, et ce qu'est devenue la réponse de la Maison.

   Sans avis relié, le bloc ne dit quelque chose que si la demande d'avis
   lui est partie (« demande partie le …, pas encore d'avis relié ») ; sinon
   il se tait, pour ne pas charger chaque fiche d'une ligne vide.

   Le lien reste au Trône : rien de la fiche ne part sur Google. */

const ETOILES = (n: number) => '★'.repeat(Math.max(0, Math.min(5, Math.round(n))));

export function SonAvisGoogle({ client }: { client: { id: string } }) {
  const navigate = useNavigate();
  const releve = useReleveDesAvis();
  const [liens] = useLiensDesAvis();
  const [brouillons] = useBrouillonsDAvis();
  const [envois] = useEnvois();

  const siens = releve ? avisDeLaCliente(client.id, releve.avis, liens, releve.le) : [];
  const demande = envois
    .filter((e) => e.type === 'avis-google' && e.clientId === client.id && (e.statut === 'envoyé' || e.statut === 'à-la-main'))
    .map((e) => jourACotonou(e.quand))
    .filter((j): j is string => !!j)
    .sort()
    .pop();

  if (siens.length === 0 && !demande) return null;

  return (
    <div>
      <span className="trc-microlabel">Son avis Google</span>
      {siens.length === 0 && (
        <p className="mnd-muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
          Demande d’avis partie le {jourCourtAn(demande as string)} · pas encore d’avis relié.
        </p>
      )}
      {siens.length > 0 && (
        <p className="mnd-muted" style={{ fontSize: 12, margin: '2px 0 0' }}>Elle a laissé son avis : la Maison ne lui en redemande pas.</p>
      )}
      {siens.map((a) => {
        const id = idDeLAvis(a);
        const b = brouillons[id];
        const jour = releve ? jourDeLAvis(a, releve.le) : null;
        const reponse = estSansReponse(a, b)
          ? 'Réponse de la Maison : pas encore publiée.'
          : b?.publieeLe ? `Réponse de la Maison : publiée sur Google, notée le ${jourCourtAn(jourLocalDe(b.publieeLe))}.` : 'Réponse de la Maison : publiée sur Google.';
        return (
          <div key={id} style={{ marginTop: 6, background: 'var(--copper-50, #FAF1E9)', border: '1px solid var(--copper-300, #E3C9AE)', borderRadius: 'var(--radius-md)', padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 12.5 }}>
              <span style={{ color: 'var(--color-copper)', letterSpacing: 1 }}>{ETOILES(a.note)}</span>
              {jour ? <span className="mnd-muted">{` · ${jourCourtAn(jour)}`}</span> : null}
            </span>
            {a.texte
              ? <span style={{ fontSize: 12.5, lineHeight: 1.45, overflowWrap: 'anywhere' }}>« {a.texte.length > 220 ? `${a.texte.slice(0, 217).trimEnd()}…` : a.texte} »</span>
              : <span className="mnd-muted" style={{ fontSize: 12 }}>Une note seulement, sans texte.</span>}
            <span className="mnd-muted" style={{ fontSize: 11.5 }}>{reponse}</span>
            <span>
              <button type="button" className="trc-c360-linkbtn" onClick={() => navigate(`/avis-google?avis=${encodeURIComponent(id)}`)}>
                Ouvrir l’avis dans « Les avis Google » →
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
