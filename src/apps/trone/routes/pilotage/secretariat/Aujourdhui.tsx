import { useEffect, useMemo } from 'react';
import { pieces, useSecretariat } from '../../../../../shared/secretariat';
import { aujourdhui, contratsDe, courriersDe, demarchesDe } from '../../../../../shared/secretariat-admin';
import {
  aRevoir, attendMaSignature, ceQuiTombe, dateCourte, ecartEnJours, rappelDit, sousTrenteJours, voit, type Qui,
} from '../../../../../shared/secretariat-admin-pur';
import { chargeLeClasseur, papiersDe, useClasseur } from '../../../../../shared/papiers';
import { aRenouveler, titreDuPapier } from '../../../../../shared/papiers-pur';

/* ══ AUJOURD'HUI — l'accueil du secrétariat, 14 octobre 2026 ═════════
   Ce qui attend une réponse, ce qui tombe sous 30 jours, ce qui est à
   signer, en une page. Chaque compteur ouvre sa liste ; la même liste nourrit
   « À faire » de la Direction. */

const ONGLET_DU_GENRE: Record<string, string> = { echeance: 'echeances', courrier: 'courrier', demarche: 'demarches', contrat: 'contrats' };
type Attente = { cle: string; date?: string; quoi: string; titre: string; sous?: string; va: () => void };

export function Aujourdhui({ qui, va, ouvreUnDocument }: { qui: Qui; va: (onglet: string) => void; ouvreUnDocument: (id: string) => void }) {
  const [lignes] = useSecretariat();
  const classeur = useClasseur();
  useEffect(() => { if (qui.direction && classeur.charge === 'jamais') void chargeLeClasseur(); }, [qui.direction, classeur.charge]);
  const jour = aujourdhui();

  const { compteurs, attentes } = useMemo(() => {
    const courriers = courriersDe(lignes).filter((c) => voit(c, qui));
    const aTraiter = courriers.filter((c) => c.sens === 'arrive' && c.etat === 'a-traiter');
    const tombe = sousTrenteJours(ceQuiTombe(lignes as unknown as { [k: string]: unknown }[]), jour)
      .filter((t) => voit({ genre: t.genre, prive: t.prive, traitePar: t.traitePar }, qui));
    const contrats = contratsDe(lignes).filter((c) => voit(c, qui) && aRevoir(c, jour));
    const demarches = demarchesDe(lignes).filter((d) => voit(d, qui) && (d.etat === 'en-cours' || d.etat === 'en-attente'));
    const aSigner = pieces(lignes).filter((p) => (qui.direction || p.entite !== 'perso') && attendMaSignature(p, qui.moi));
    const papiers = qui.direction && classeur.charge === 'pret' ? aRenouveler(papiersDe(classeur.lignes), jour) : [];
    const attentes: Attente[] = [
      ...tombe.map((t) => ({ cle: t.cle, date: t.date, quoi: t.genre === 'echeance' ? 'Échéance' : t.genre === 'courrier' ? 'Courrier' : t.genre === 'demarche' ? 'Démarche' : 'Contrat', titre: t.titre, sous: t.prive ? 'privé' : undefined, va: () => va(ONGLET_DU_GENRE[t.genre] ?? 'jour') })),
      ...aTraiter.filter((c) => !c.reponseAvant).map((c) => ({ cle: c.id, quoi: `Courrier ${c.numero}`, titre: `À traiter : ${c.correspondant}${c.objet ? ` · ${c.objet}` : ''}`, sous: `reçu le ${dateCourte(c.date)}`, va: () => va('courrier') })),
      ...aSigner.map((p) => ({ cle: p.id, quoi: 'Document', titre: `Signer : ${p.titre}`, sous: p.numero ?? 'brouillon', va: () => ouvreUnDocument(p.id) })),
      ...papiers.map((p) => ({ cle: `pap:${p.id}`, date: p.expireLe, quoi: 'Papier', titre: `Renouveler : ${titreDuPapier(p)}`, sous: 'privé', va: () => va('papiers') })),
    ];
    attentes.sort((a, b) => (a.date ?? '0000').localeCompare(b.date ?? '0000'));
    return {
      compteurs: [
        { n: aTraiter.length, mot: `courrier${aTraiter.length > 1 ? 's' : ''} à traiter`, onglet: 'courrier' },
        { n: tombe.length, mot: `échéance${tombe.length > 1 ? 's' : ''} sous 30 jours`, onglet: 'echeances' },
        { n: contrats.length, mot: `contrat${contrats.length > 1 ? 's' : ''} à revoir`, onglet: 'contrats' },
        ...(qui.direction ? [{ n: papiers.length, mot: `papier${papiers.length > 1 ? 's' : ''} qui expire${papiers.length > 1 ? 'nt' : ''}`, onglet: 'papiers' }] : []),
        { n: demarches.length, mot: `démarche${demarches.length > 1 ? 's' : ''} en cours`, onglet: 'demarches' },
        { n: aSigner.length, mot: `document${aSigner.length > 1 ? 's' : ''} à signer`, onglet: 'documents' },
      ],
      attentes,
    };
  }, [lignes, qui, classeur, jour, va, ouvreUnDocument]);

  return (
    <div className="sad-onglet">
      <div className="sad-compteurs">
        {compteurs.map((c) => (
          <button key={c.onglet} type="button" className={`sad-compteur${c.n ? '' : ' est-vide'}`} onClick={() => va(c.onglet)}>
            <b>{c.n}</b><span>{c.mot}</span>
          </button>
        ))}
      </div>
      {attentes.length === 0 ? (
        <div className="sec-vide">Rien n’attend aujourd’hui. Le courrier reçu, une date à tenir, un contrat : tout passe par ici.</div>
      ) : (
        <div className="sad-liste">
          {attentes.slice(0, 15).map((a) => {
            const r = a.date ? rappelDit(a.date, jour) : undefined;
            return (
              <button key={a.cle} type="button" className="sad-ligne__tete sad-attente" onClick={a.va}>
                <span className="sad-ligne__num">{a.quoi}</span>
                <span className="sad-ligne__quoi"><b>{a.titre}</b>{a.sous ? <small>{a.sous}</small> : null}</span>
                <span className={`sad-badge${r?.urgent ? ' est-urgent' : ''}`}>{r ? (a.date && ecartEnJours(jour, a.date) > 1 ? `${r.mot}, le ${dateCourte(a.date)}` : r.mot) : 'à faire'}</span>
              </button>
            );
          })}
          {attentes.length > 15 && <p className="sad-doux">Et {attentes.length - 15} de plus dans leurs onglets.</p>}
        </div>
      )}
    </div>
  );
}
