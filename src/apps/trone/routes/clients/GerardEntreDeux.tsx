import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBranch } from '../../../../shared/branches';
import { useReponsesEntreDeux, useSignalements } from '../../../../shared/entre-deux';
import { ceQueGerardSait, consigneEntreDeux, souciOuvertDe } from '../../../../shared/gerard-entre-deux-pur';
import { useBranchClients } from './_shared';
import './gerard-entre-deux.css';

/* ══ CE QUE GÉRARD SAIT D'« ENTRE DEUX SÉANCES » — 26 octobre 2026 ════════
   Une carte de sa rubrique : les huit rubriques avec ce que Gérard répond
   (la réponse validée, sinon l'accusé), ce qui s'est dit en soixante jours,
   les clientes qu'il laisse tranquilles tant qu'un souci est ouvert, et ce
   que disent les clientes, en leurs mots, sans nom ni numéro. Plus bas, la
   consigne telle que Claude la lira (règle : gerard-entre-deux-pur). */
export function GerardEntreDeux() {
  const { branch } = useBranch();
  const tous = useSignalements();
  const signalements = useMemo(() => tous.filter((s) => !s.branchId || s.branchId === branch.id), [tous, branch.id]);
  const reponses = useReponsesEntreDeux();
  const clientes = useBranchClients();
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [consigneVue, setConsigneVue] = useState(false);

  const sait = useMemo(() => ceQueGerardSait({
    signalements,
    validees: Object.fromEntries(reponses.filter((r) => (r.texteValide ?? '').trim()).map((r) => [r.id, r.texteValide as string])),
    noms: clientes.map((c) => c.name ?? ''),
    maintenant: new Date().toISOString(),
  }), [signalements, reponses, clientes]);
  /* Les clientes que Gérard laisse tranquilles : un souci À voir ou Santé encore ouvert. */
  const auCalme = useMemo(() => {
    const parCliente = new Map<string, typeof signalements>();
    for (const s of signalements) parCliente.set(s.clientId, [...(parCliente.get(s.clientId) ?? []), s]);
    return [...parCliente.values()].filter((siens) => !!souciOuvertDe(siens)).length;
  }, [signalements]);

  const t = sait.total;
  return (
    <section className="trc-ger__carte trc-gerd">
      <h3>Entre deux séances <span>ce que Gérard en sait</span></h3>
      <div className="trc-gerd__chiffres">
        <span><b>{t.dits}</b><small>soucis dits en 60 jours</small></span>
        <span><b>{t.ouverts}</b><small>encore ouverts</small></span>
        <span className={t.enRetard ? 'est-du' : ''}><b>{t.enRetard}</b><small>en retard</small></span>
        <span><b>{auCalme}</b><small>{auCalme > 1 ? 'clientes qu’il laisse tranquilles' : 'cliente qu’il laisse tranquille'}</small></span>
        <span className={t.sansReponse ? 'est-du' : ''}><b>{t.sansReponse}</b><small>{t.sansReponse > 1 ? 'rubriques sans réponse validée' : 'rubrique sans réponse validée'}</small></span>
      </div>

      <div className="trc-gerd__cadre">
        <table>
          <thead>
            <tr><th>Rubrique</th><th>Niveau</th><th>Ce que Gérard répond</th><th className="d">Dits</th><th className="d">Ouverts</th></tr>
          </thead>
          <tbody>
            {sait.rubriques.map((r) => (
              <tr key={r.cle}>
                <td className="trc-gerd__rub">{r.dit}</td>
                <td className="trc-gerd__niv">{r.niveauDit}{r.niveau !== 'conseil' ? ` · ${r.delaiHeures} h` : ''}</td>
                <td className="trc-gerd__rep">
                  {r.niveau === 'sante'
                    ? <span className="trc-gerd__doux">Aucun conseil écrit : l’accusé santé, et l’équipe est prévenue.</span>
                    : r.reponse
                      ? <span title={r.reponse}>« {r.reponse} »{r.avancer ? <em> Il propose d’avancer le RDV.</em> : null}</span>
                      : <span className="est-du">Pas encore validée : il n’envoie qu’un accusé. <Link to="/entre-deux">Valider dans Les réponses</Link></span>}
                </td>
                <td className="d">{r.dits}</td>
                <td className={`d${r.ouverts ? ' est-ouvert' : ''}`}>{r.ouverts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="trc-gerd__dits">
        <h4>Ce que disent les clientes <span>leurs mots, sans nom ni numéro, depuis 60 jours</span></h4>
        {sait.rubriques.every((r) => r.mots.length === 0)
          ? <p className="trc-ger__doux">Aucune phrase écrite par une cliente ces 60 derniers jours.</p>
          : sait.rubriques.filter((r) => r.mots.length).map((r) => {
            const ouvert = ouverte === r.cle;
            return (
              <div key={r.cle} className={`trc-gerd__rubrique${ouvert ? ' est-ouvert' : ''}`}>
                <button type="button" aria-expanded={ouvert} onClick={() => setOuverte(ouvert ? null : r.cle)}>
                  <span className="trc-gerd__chevron" aria-hidden="true" />
                  <span>{r.dit}</span>
                  <small>{r.mots.length} phrase{r.mots.length > 1 ? 's' : ''}</small>
                </button>
                {ouvert && <ul>{r.mots.map((m, i) => <li key={i}>« {m} »</li>)}</ul>}
              </div>
            );
          })}
      </div>

      <ul className="trc-gerd__regles">
        <li>Un souci <b>À voir</b> ou <b>Santé</b> encore ouvert : Gérard ne propose ni envie ni remise, il garde seulement son rendez-vous.</li>
        <li>Elle lui parle de ses cheveux : il répond avec votre réponse validée, jamais un brouillon ; en Santé, jamais de conseil écrit.</li>
        <li>Sèches ou cassantes : son envie du mois devient un soin hydratant.</li>
      </ul>

      <div className="trc-gerd__consigne">
        <button type="button" className="trc-gerd__lien" aria-expanded={consigneVue} onClick={() => setConsigneVue(!consigneVue)}>
          {consigneVue ? 'Cacher la consigne' : 'Voir la consigne que Claude lira'}
        </button>
        {consigneVue && <pre>{consigneEntreDeux(sait)}</pre>}
      </div>
    </section>
  );
}
