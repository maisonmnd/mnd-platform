import { useNavigate } from 'react-router-dom';
import { useSecretariat } from '../../../../../shared/secretariat';
import { aujourdhui, courriersDe } from '../../../../../shared/secretariat-admin';
import { ceQuiTombe, rappelDit, sousTrenteJours, tientLeSecretariat, voit } from '../../../../../shared/secretariat-admin-pur';
import { useQui } from './_admin';

/* LE RAPPEL DU SECRÉTARIAT DANS « À FAIRE » — 14 octobre 2026 (choix « À
   faire et notification »). Pour qui tient le secrétariat : ce qui tombe
   sous 30 jours ou est dépassé, et le courrier à traiter. Pour les autres :
   le courrier qui leur est confié, seulement. Rien à dire : rien ne s'affiche. */
export function RappelDuSecretariat() {
  const [lignes] = useSecretariat();
  const qui = useQui();
  const navigate = useNavigate();
  const jour = aujourdhui();
  const tient = tientLeSecretariat(qui);
  const aTraiter = courriersDe(lignes).filter((c) => c.sens === 'arrive' && c.etat === 'a-traiter' && voit(c, qui) && (tient || c.traitePar === qui.moi));
  const tombe = tient
    ? sousTrenteJours(ceQuiTombe(lignes as unknown as { [k: string]: unknown }[]), jour)
      .filter((t) => t.genre !== 'courrier' && voit({ genre: t.genre, prive: t.prive, traitePar: t.traitePar }, qui))
    : [];
  if (aTraiter.length === 0 && tombe.length === 0) return null;
  const morceaux = [
    ...(aTraiter.length ? [tient ? `${aTraiter.length} courrier${aTraiter.length > 1 ? 's' : ''} à traiter` : `courrier confié : ${aTraiter.slice(0, 2).map((c) => `${c.numero} (${c.correspondant})`).join(', ')}`] : []),
    ...tombe.slice(0, 3).map((t) => `${t.titre} (${rappelDit(t.date, jour).mot})`),
  ];
  const reste = tombe.length > 3 ? ` · et ${tombe.length - 3} autre${tombe.length - 3 > 1 ? 's' : ''}` : '';
  const urgent = tombe.some((t) => rappelDit(t.date, jour).urgent);
  return (
    <div className={`sec-bandeau${urgent ? ' sec-bandeau--alerte' : ''}`} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
      <span style={{ flex: 1, minWidth: 220 }}><b>Le secrétariat · </b>{morceaux.join(' · ')}{reste}</span>
      <button type="button" className="trp-af-pill" onClick={() => navigate('/secretariat', { state: { onglet: tient ? 'jour' : 'courrier' } })}>Ouvrir le secrétariat</button>
    </div>
  );
}
