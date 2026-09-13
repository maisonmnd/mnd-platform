import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../../shared/store';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { todayISO } from '../finances/_shared';
import {
  cleDeLaMain, initiales, litLeGeste, litLesTracesDeLaPeriode, resumeParPersonne, type Trace,
} from '../../../../shared/traces';
import { GesteDeLaVie, ModaleDeLaVie, useContexteDeLecture } from '../_vie';
import { postePartageStore, DELAI_DU_POSTE_MS } from '../../shell/useVerrouDuPoste';

/* ══ QUI FAIT QUOI — 13 septembre 2026 ══════════════════════════════════
   « J'ai besoin d'un résumé détaillé dans le Journal des gestes : qui fait
   quoi » (Yéman). Maquette « La vie d'un rendez-vous » validée.

   Lu dans la trace de la base (migration 0092), jamais dans le journal écrit
   par l'application. Un chiffre se clique, un geste ouvre la vie de sa pièce,
   même supprimée. */

type Echelle = 'jour' | 'semaine' | 'mois';
const pad = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const auMidi = (iso: string) => new Date(`${iso}T12:00:00`);

function bornes(echelle: Echelle, ancre: string): { debut: Date; fin: Date; titre: string } {
  const a = auMidi(ancre);
  if (echelle === 'jour') {
    const debut = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const fin = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 1);
    return { debut, fin, titre: debut.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) };
  }
  if (echelle === 'semaine') {
    /* LA SEMAINE DU SALON s'ouvre le mardi, comme la facture du prestataire. */
    const recul = (a.getDay() + 5) % 7;
    const debut = new Date(a.getFullYear(), a.getMonth(), a.getDate() - recul);
    const fin = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + 7);
    return { debut, fin, titre: `semaine du ${debut.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}` };
  }
  const debut = new Date(a.getFullYear(), a.getMonth(), 1);
  const fin = new Date(a.getFullYear(), a.getMonth() + 1, 1);
  return { debut, fin, titre: debut.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) };
}

const decale = (echelle: Echelle, ancre: string, sens: number): string => {
  const a = auMidi(ancre);
  if (echelle === 'jour') a.setDate(a.getDate() + sens);
  else if (echelle === 'semaine') a.setDate(a.getDate() + 7 * sens);
  else a.setMonth(a.getMonth() + sens, 1);
  return isoLocal(a);
};

const LIMITE_DE_LA_LISTE = 250;

export default function QuiFaitQuoi() {
  const ctx = useContexteDeLecture();
  const { currency } = useBranch();
  const [echelle, setEchelle] = useState<Echelle>('jour');
  const [ancre, setAncre] = useState(todayISO());
  const [sensibles, setSensibles] = useState(false);
  const [qui, setQui] = useState<string | null>(null);
  const [lecture, setLecture] = useState<{ etat: 'charge' | 'pret' | 'fermee'; traces: Trace[] }>({ etat: 'charge', traces: [] });
  const [ouverte, setOuverte] = useState<Trace | null>(null);
  const [postePartage, setPostePartage] = useStore(postePartageStore);

  const { debut, fin, titre } = bornes(echelle, ancre);
  const debutIso = debut.toISOString();
  const finIso = fin.toISOString();

  useEffect(() => {
    let vivant = true;
    setLecture((l) => ({ ...l, etat: 'charge' }));
    void litLesTracesDeLaPeriode(debutIso, finIso).then((r) => {
      if (!vivant) return;
      setLecture(r === null ? { etat: 'fermee', traces: [] } : { etat: 'pret', traces: r });
    });
    return () => { vivant = false; };
  }, [debutIso, finIso]);

  const resume = useMemo(() => resumeParPersonne(lecture.traces, ctx), [lecture.traces, ctx]);
  const lus = useMemo(() => lecture.traces.map((t) => ({ t, lu: litLeGeste(t, ctx) })), [lecture.traces, ctx]);
  const nbSensibles = lus.filter(({ lu }) => lu.sensible).length;
  const liste = lus.filter(({ t, lu }) => !lu.automatique && (!sensibles || lu.sensible) && (!qui || cleDeLaMain(t) === qui));
  const choisie = resume.find((l) => l.cle === qui);

  return (
    <div className="trf-panel" style={{ marginTop: 16 }}>
      <div className="tvie-corps">
        <div className="tvie-periode">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="tvie-nav" aria-label="Période précédente" onClick={() => setAncre(decale(echelle, ancre, -1))}>‹</button>
            <span className="tvie-periode__titre">{titre}</span>
            <button type="button" className="tvie-nav" aria-label="Période suivante" onClick={() => setAncre(decale(echelle, ancre, 1))}>›</button>
          </div>
          <div className="tvie-filtres">
            {([['jour', 'Le jour'], ['semaine', 'La semaine'], ['mois', 'Le mois']] as [Echelle, string][]).map(([k, l]) => (
              <button key={k} type="button" className={`tvie-puce ${echelle === k ? 'actif' : ''}`} onClick={() => setEchelle(k)}>{l}</button>
            ))}
            <button type="button" className="tvie-puce" onClick={() => setAncre(todayISO())}>Aujourd’hui</button>
            <button type="button" className={`tvie-puce alerte ${sensibles ? 'actif' : ''}`} onClick={() => setSensibles(!sensibles)}>
              Sensibles · {nbSensibles}
            </button>
          </div>
        </div>

        {lecture.etat === 'charge' && <div className="tvie-note">Lecture de la trace…</div>}
        {lecture.etat === 'fermee' && (
          <div className="tvie-note">
            La trace de la base ne répond pas : la migration 0092 n’est pas encore passée, ou ce compte n’a pas le rang de la
            direction. Le journal écrit par l’application reste lisible plus bas.
          </div>
        )}
        {lecture.etat === 'pret' && resume.length === 0 && (
          <div className="tvie-note">Aucun geste signé par la base sur cette période. La trace commence le jour de sa mise en service.</div>
        )}

        {resume.length > 0 && (
          <div className="tvie-table-wrap">
            <table className="tvie-table">
              <thead>
                <tr>
                  <th>Qui</th><th className="num">RDV créés</th><th className="num">RDV modifiés</th><th className="num">Honorés</th>
                  <th className="num">Factures</th><th className="num">Encaissé</th><th className="num">Remises</th>
                  <th className="num">Suppressions</th><th className="num">Sensibles</th><th>Appareils</th>
                </tr>
              </thead>
              <tbody>
                {resume.map((l) => (
                  <tr
                    key={l.cle}
                    className={qui === l.cle ? 'est-choisie' : ''}
                    tabIndex={0}
                    onClick={() => setQui(qui === l.cle ? null : l.cle)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setQui(qui === l.cle ? null : l.cle); }}
                    title={qui === l.cle ? 'Voir tout le monde' : 'Ne voir que ses gestes'}
                  >
                    <td>
                      <span className="tvie-personne">
                        <span className={`tvie-qui ${l.porte !== 'trone' ? 'dehors' : ''}`} aria-hidden="true">{l.porte === 'trone' ? initiales(l.nom) : '·'}</span>
                        {l.nom}
                      </span>
                    </td>
                    <td className="num">{l.rdvCrees}</td>
                    <td className="num">{l.rdvModifies}</td>
                    <td className="num">{l.honores}</td>
                    <td className="num">{l.factures}</td>
                    <td className="num">{fmtMoney(l.encaisseXof, currency)}</td>
                    <td className={`num ${l.remises ? 'tvie-rouge' : ''}`}>{l.remises}{l.remiseXof ? ` · ${fmtMoney(l.remiseXof, currency)}` : ''}</td>
                    <td className={`num ${l.suppressions ? 'tvie-rouge' : ''}`}>{l.suppressions}</td>
                    <td className={`num ${l.sensibles ? 'tvie-rouge' : ''}`}>{l.sensibles}</td>
                    <td>{l.appareils.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lecture.etat === 'pret' && lus.length > 0 && (
          <>
            <div className="tvie-filtres" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>
                {sensibles ? 'Les gestes sensibles' : 'Les gestes'}{choisie ? ` · ${choisie.nom}` : ''} · {liste.length}
              </span>
              {qui && <button type="button" className="tvie-lien" onClick={() => setQui(null)}>Voir tout le monde</button>}
            </div>
            {liste.length === 0 ? (
              <div className="tvie-note">Aucun geste ne répond à ce filtre.</div>
            ) : (
              <ol className="tvie-liste">
                {liste.slice(0, LIMITE_DE_LA_LISTE).map(({ t, lu }) => (
                  <GesteDeLaVie key={t.id} t={t} lu={lu} montrePiece onOuvre={() => setOuverte(t)} />
                ))}
              </ol>
            )}
            {liste.length > LIMITE_DE_LA_LISTE && (
              <div className="tvie-note">
                Les {LIMITE_DE_LA_LISTE} plus récents sont affichés sur {liste.length}. Choisissez une personne, le jour ou les
                gestes sensibles pour resserrer.
              </div>
            )}
          </>
        )}

        {/* LE POSTE COMMUN SE DÉCLARE ICI, sur le poste lui-même. */}
        <div className="tvie-poste">
          <span>
            <b style={{ fontWeight: 600 }}>Ce poste</b> ·{' '}
            {postePartage
              ? `poste commun : il se déconnecte seul après ${DELAI_DU_POSTE_MS / 60000} minutes sans geste.`
              : 'poste personnel : il reste connecté. À déclarer commun sur l’ordinateur du comptoir.'}
          </span>
          <button type="button" className="tvie-voir" onClick={() => setPostePartage(!postePartage)}>
            {postePartage ? 'Ce poste n’est plus commun' : 'Déclarer ce poste commun'}
          </button>
        </div>
      </div>

      {ouverte && (
        <ModaleDeLaVie
          principal={{ table: ouverte.table, id: ouverte.pieceId }}
          titre={`${litLeGeste(ouverte, ctx).piece} · sa vie`}
          onClose={() => setOuverte(null)}
        />
      )}
    </div>
  );
}
