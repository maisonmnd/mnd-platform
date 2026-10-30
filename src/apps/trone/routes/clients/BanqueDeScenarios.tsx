import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../../../../ds/components';
import { useAuth } from '../../../../shared/auth';
import { conseilDeLaMaison } from '../../../../shared/automate-wa';
import { useConseil } from '../../../../shared/conseil-wa';
import { useMessagesWa } from '../../../../shared/conversations';
import { banqueStore, useBanque } from '../../../../shared/banque-scenarios';
import {
  GESTES_LUS, QUI_DIT, SIGNES, SOURCE_DITE, ajouteDesCas, banqueLue, casDUnExport, clienteDeLExport, ecartsDeLaVariante, ecartsDuCas,
  litLeCas, litUnExport, passeLaBanque, poseLesVariantes, reprendsLeCas, retireLeCas, signeDit, toursDesConversations, valideLeCas,
  type BanqueBrute, type CasDeLaBanque, type EtatDuCas, type Lecture, type Qui,
} from '../../../../shared/banque-scenarios-pur';
import { supabase } from '../../../../shared/supabase';
import { useEstDirection } from '../_vie';
import './banque-de-scenarios.css';

/* ══ LA BANQUE DE SCÉNARIOS, AU TRÔNE · 30 octobre 2026 ═══════════════════
   Maquette 8c48d9mc… validée (« tout me va ») : chaque vrai message d'une
   cliente devient un cas ; la Maison dit si ce que fait l'automate est
   juste, ou ce qu'elle attend à la place. Une ligne par cas, repliée ; une
   seule ouverte à la fois. Le personnel ajoute ; la direction seule valide,
   reprend ou retire, comme pour les réponses de la Maison.

   Trois portes d'entrée : les premiers messages du numéro de la Maison, une
   discussion exportée de WhatsApp (le numéro de Brice), et « Mauvaise
   réponse » sur une bulle de l'automate ou de l'assistant. */

const ETAT_DIT: Record<EtatDuCas, string> = { propose: 'À valider', valide: 'Validé', 'a-reprendre': 'À reprendre' };
type Filtre = EtatDuCas | 'tous';
const FILTRES: { v: Filtre; l: string }[] = [
  { v: 'propose', l: 'À valider' }, { v: 'a-reprendre', l: 'À reprendre' }, { v: 'valide', l: 'Validés' }, { v: 'tous', l: 'Tous' },
];
const PAR_PAGE = 30;
const dateDite = (iso: string): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Porto-Novo' });
};

export default function BanqueDeScenarios({ casAOuvrir }: { casAOuvrir?: { id: string; n: number } | null }) {
  const [brute] = useBanque();
  const [conseilBrut] = useConseil();
  const [messages] = useMessagesWa();
  const direction = useEstDirection();
  const { session } = useAuth();
  const banque = useMemo(() => banqueLue(brute), [brute]);
  const conseil = useMemo(() => conseilDeLaMaison(conseilBrut), [conseilBrut]);
  const passage = useMemo(() => passeLaBanque(banque, conseil), [banque, conseil]);
  const [filtre, setFiltre] = useState<Filtre>('propose');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [reprise, setReprise] = useState<{ id: string; qui: Qui; signes: string[]; note: string } | null>(null);
  const [enVol, setEnVol] = useState<string | null>(null);
  const fichier = useRef<HTMLInputElement | null>(null);

  /* « Mauvaise réponse » ouvre son cas, où qu'il soit rangé. */
  useEffect(() => {
    if (!casAOuvrir) return;
    setFiltre('tous');
    setPage(1);
    setReprise(null);
    setOuvert(casAOuvrir.id);
    window.setTimeout(() => document.getElementById(`cas-${casAOuvrir.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }, [casAOuvrir?.id, casAOuvrir?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const compte = useMemo(() => {
    const c: Record<EtatDuCas, number> = { propose: 0, valide: 0, 'a-reprendre': 0 };
    for (const x of banque.cas) c[x.etat] += 1;
    return c;
  }, [banque]);
  const visibles = useMemo(() => banque.cas
    .filter((c) => filtre === 'tous' || c.etat === filtre)
    .sort((a, b) => (b.quand || b.creeLe).localeCompare(a.quand || a.creeLe)), [banque, filtre]);

  const ecris = (f: (b: BanqueBrute) => BanqueBrute) => banqueStore.set((b) => f(banqueLue(b)));
  const maintenant = () => new Date().toISOString();
  const par = () => session?.user?.id ?? 'direction';

  const ajouteDuNumeroDeLaMaison = () => {
    const lignes = (messages ?? [])
      .filter((m) => m.canal !== 'site' && (m.type ?? 'text') === 'text' && typeof m.texte === 'string')
      .map((m) => ({ fil: String(m.numero ?? ''), deLaCliente: m.sens === 'entrant', texte: m.texte ?? '', quand: m.quand }));
    const tours = toursDesConversations(lignes);
    let n = 0;
    ecris((b) => { const r = ajouteDesCas(b, tours.map((t) => ({ ...t, source: 'maison' as const })), maintenant()); n = r.ajoutes; return r.banque; });
    window.setTimeout(() => toast(n > 0 ? `${n} cas ajoutés, à valider.` : 'Rien de neuf : ces messages sont déjà dans la banque.'), 0);
    setFiltre('propose');
  };

  const ajouteDesExports = async (fichiers: FileList | null) => {
    if (!fichiers || fichiers.length === 0) return;
    let total = 0;
    const clientes: string[] = [];
    for (const f of Array.from(fichiers)) {
      const lignes = litUnExport(await f.text());
      if (lignes.length === 0) { toast(`« ${f.name} » ne ressemble pas à une discussion exportée de WhatsApp.`); continue; }
      const cliente = clienteDeLExport(lignes, f.name);
      clientes.push(cliente);
      const tours = casDUnExport(lignes, cliente);
      ecris((b) => { const r = ajouteDesCas(b, tours.map((t) => ({ ...t, source: 'export' as const })), maintenant()); total += r.ajoutes; return r.banque; });
    }
    if (fichier.current) fichier.current.value = '';
    window.setTimeout(() => toast(total > 0 ? `${total} cas ajoutés (${clientes.join(', ')}), à valider.` : 'Rien de neuf dans ces discussions.'), 0);
    setFiltre('propose');
  };

  const valide = (c: CasDeLaBanque, lu: Lecture) => {
    ecris((b) => valideLeCas(b, c.id, lu, par(), maintenant()));
    toast('Cas validé : le banc le rejouera à chaque changement.');
  };
  const enregistreLaReprise = () => {
    if (!reprise) return;
    ecris((b) => reprendsLeCas(b, reprise.id, { qui: reprise.qui, signes: reprise.signes }, reprise.note, par(), maintenant()));
    setReprise(null);
    toast('Noté : ce cas dit maintenant ce que la Maison attend.');
  };
  /** VINGT VARIANTES PAR CLAUDE (`variantes-wa`, sur les crédits API inclus). */
  const ecritLesVariantes = async (c: CasDeLaBanque) => {
    if (!supabase) { toast('Hors ligne : les variantes demandent le serveur.'); return; }
    setEnVol(c.id);
    try {
      const { data, error } = await supabase.functions.invoke('variantes-wa', { body: { texte: c.texte } });
      const r = (data ?? null) as { ok?: boolean; variantes?: unknown; motif?: string } | null;
      if (error || !r?.ok || !Array.isArray(r.variantes)) {
        const motif = r?.motif ?? '';
        toast(motif === 'plafond' ? 'Le plafond du mois est atteint : 400 demandes de variantes.'
          : motif === 'reserve-au-personnel' ? 'Réservé au personnel connecté.'
            : motif === 'cle-claude-absente' ? 'La clé de Claude n’est pas posée dans Supabase.'
              : error && !r ? 'La fonction variantes-wa ne répond pas : est-elle collée dans Supabase ?'
                : 'Claude n’a pas répondu. Réessayez dans un instant.');
        return;
      }
      const variantes = (r.variantes as unknown[]).filter((v): v is string => typeof v === 'string');
      ecris((b) => poseLesVariantes(b, c.id, variantes));
      toast(`${variantes.length} variantes écrites : le banc les rejouera.`);
    } finally {
      setEnVol(null);
    }
  };
  const retire = (c: CasDeLaBanque) => {
    ecris((b) => retireLeCas(b, c.id));
    setOuvert(null);
    toast('Cas retiré de la banque.');
  };

  return (
    <div className="trc-bq">
      <p className="trc-bq__resume">
        <b>{compte.valide}</b> validé{compte.valide > 1 ? 's' : ''} · <b>{compte['a-reprendre']}</b> à reprendre · <b>{compte.propose}</b> à valider
        {banque.cas.length > 0 && (
          <span className={passage.casses.length > 0 ? 'trc-bq__alarme' : 'trc-bq__doux'}>
            {' · '}{passage.casses.length > 0
              ? `${passage.casses.length} cas validé${passage.casses.length > 1 ? 's' : ''} ne tien${passage.casses.length > 1 ? 'nent' : 't'} plus`
              : passage.justes === 1 ? 'le cas validé tient' : `les ${passage.justes} cas validés tiennent`}
            {passage.reprisAValider.length > 0 ? ` · ${passage.reprisAValider.length} repris à revalider` : ''}
            {passage.variantesJustes + passage.variantesRatees.length > 0
              ? ` · variantes : ${passage.variantesJustes} comprises, ${passage.variantesRatees.length} à renforcer` : ''}
          </span>
        )}
      </p>

      <div className="trc-bq__ajouts">
        <button type="button" className="trc-ger__btn" onClick={ajouteDuNumeroDeLaMaison}>Ajouter les messages du numéro de la Maison</button>
        <label className="trc-ger__btn trc-bq__fichier">
          Ajouter une discussion exportée (.txt)
          <input ref={fichier} id="bq-export" type="file" accept=".txt,text/plain" multiple onChange={(e) => { void ajouteDesExports(e.target.files); }} />
        </label>
      </div>
      <p className="trc-bq__doux trc-bq__aide">Sur le téléphone de Brice : ouvrir la discussion d’une cliente, ⋮, Plus, Exporter la discussion, Sans médias. Les numéros et les adresses e-mail sont ôtés à l’entrée.</p>

      <div className="trc-bq__filtres" role="tablist" aria-label="Les cas">
        {FILTRES.map((f) => {
          const n = f.v === 'tous' ? banque.cas.length : compte[f.v];
          return (
            <button key={f.v} type="button" role="tab" aria-selected={filtre === f.v} className={filtre === f.v ? 'est-choisi' : ''}
              onClick={() => { setFiltre(f.v); setPage(1); setOuvert(null); }}>{f.l} · {n}</button>
          );
        })}
      </div>

      {visibles.length === 0 && (
        <p className="trc-bq__doux">
          {banque.cas.length === 0
            ? 'La banque est vide. Ajoutez les messages du numéro de la Maison, ou une discussion exportée.'
            : 'Aucun cas ici.'}
        </p>
      )}

      <ul className="trc-bq__liste">
        {visibles.slice(0, page * PAR_PAGE).map((c) => {
          const estOuvert = ouvert === c.id;
          const lu = estOuvert ? litLeCas(c.texte, c.quand, conseil) : null;
          const ecarts = lu && c.attendu ? ecartsDuCas(c.attendu, lu) : [];
          const enReprise = reprise?.id === c.id ? reprise : null;
          return (
            <li key={c.id} id={`cas-${c.id}`} className={`trc-bq__cas${estOuvert ? ' est-ouvert' : ''}`}>
              <button type="button" className="trc-bq__tete" aria-expanded={estOuvert} onClick={() => { setOuvert(estOuvert ? null : c.id); setReprise(null); }}>
                <span className="trc-bq__citation">« {c.texte} »</span>
                <span className={`trc-bq__tampon trc-bq__tampon--${c.etat}`}>{ETAT_DIT[c.etat]}</span>
                <span className="trc-bq__source">{SOURCE_DITE[c.source]}{c.quand ? ` · ${dateDite(c.quand)}` : ''}</span>
              </button>
              {estOuvert && lu && (
                <div className="trc-bq__panneau">
                  <div>
                    <h4>Ce qu’il comprend aujourd’hui</h4>
                    <div className="trc-bq__puces">
                      {lu.signes.length > 0 ? lu.signes.map((s) => <span key={s} className="trc-bq__puce">{signeDit(s)}</span>) : <span className="trc-bq__puce trc-bq__puce--vide">rien de reconnu</span>}
                    </div>
                  </div>
                  <div>
                    <h4>Qui répond aujourd’hui</h4>
                    <p className="trc-bq__qui">{QUI_DIT[lu.qui]}</p>
                  </div>
                  {c.attendu && (
                    <div>
                      <h4>Ce que la Maison attend</h4>
                      <p className="trc-bq__qui">{QUI_DIT[c.attendu.qui]}</p>
                      <div className="trc-bq__puces">
                        {c.attendu.signes.map((s) => <span key={s} className="trc-bq__puce">{signeDit(s)}</span>)}
                      </div>
                    </div>
                  )}
                  {c.note && <p className="trc-bq__note">Ce qu’il fallait répondre : {c.note}</p>}
                  {c.attendu && (
                    <p className={ecarts.length > 0 ? 'trc-bq__alarme trc-bq__ecarts' : 'trc-bq__bon trc-bq__ecarts'}>
                      {ecarts.length > 0 ? `L’automate n’y est pas : ${ecarts.join(' ; ')}.` : 'L’automate fait ce que la Maison attend.'}
                    </p>
                  )}

                  {direction && !enReprise && (
                    <div className="trc-bq__gestes">
                      {(c.etat !== 'valide' || ecarts.length > 0) && (
                        <button type="button" className="trc-ger__btn trc-bq__btn--cuivre" onClick={() => valide(c, lu)}>C’est juste</button>
                      )}
                      <button type="button" className="trc-ger__btn" onClick={() => setReprise({ id: c.id, qui: c.attendu?.qui ?? lu.qui, signes: [...(c.attendu?.signes ?? lu.signes)], note: c.note ?? '' })}>À reprendre</button>
                      <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => retire(c)}>Retirer</button>
                    </div>
                  )}
                  {!direction && <p className="trc-bq__doux">La direction valide ou reprend ce cas.</p>}

                  {c.etat === 'valide' && (direction || (c.variantes ?? []).length > 0) && (
                    <div className="trc-bq__variantes">
                      <h4>Les variantes{(c.variantes ?? []).length > 0 ? ` · ${(c.variantes ?? []).filter((v) => ecartsDeLaVariante(c, v, conseil).length === 0).length} sur ${(c.variantes ?? []).length} comprises comme l’original` : ''}</h4>
                      {(c.variantes ?? []).length > 0 && (
                        <ul>
                          {(c.variantes ?? []).map((v) => {
                            const ev = ecartsDeLaVariante(c, v, conseil);
                            return (
                              <li key={v} className={ev.length === 0 ? 'est-comprise' : 'est-ratee'}>
                                <span className="trc-bq__marque" aria-label={ev.length === 0 ? 'comprise' : 'à renforcer'}>{ev.length === 0 ? '✓' : '✗'}</span>
                                <span>« {v} »{ev.length > 0 ? <small> {ev.join(' ; ')}</small> : null}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {direction && (
                        <button type="button" className="trc-ger__btn" disabled={enVol === c.id} onClick={() => { void ecritLesVariantes(c); }}>
                          {enVol === c.id ? 'Claude écrit…' : (c.variantes ?? []).length > 0 ? 'Écrire 20 nouvelles variantes' : 'Écrire 20 variantes'}
                        </button>
                      )}
                    </div>
                  )}

                  {enReprise && (
                    <div className="trc-bq__reprise">
                      <fieldset>
                        <legend>Qui doit répondre</legend>
                        {(Object.keys(QUI_DIT) as Qui[]).map((q) => (
                          <label key={q} className="trc-bq__choix">
                            <input type="radio" name={`qui-${c.id}`} id={`qui-${c.id}-${q}`} checked={enReprise.qui === q} onChange={() => setReprise({ ...enReprise, qui: q })} />
                            {QUI_DIT[q]}
                          </label>
                        ))}
                      </fieldset>
                      <fieldset>
                        <legend>Ce qu’il doit comprendre</legend>
                        <div className="trc-bq__puces">
                          {[...SIGNES.map((s) => s.id), ...GESTES_LUS.map((g) => `geste:${g}`)].map((s) => {
                            const oui = enReprise.signes.includes(s);
                            return (
                              <button key={s} type="button" aria-pressed={oui} className={`trc-bq__puce trc-bq__puce--choix${oui ? ' est-choisie' : ''}`}
                                onClick={() => setReprise({ ...enReprise, signes: oui ? enReprise.signes.filter((x) => x !== s) : [...enReprise.signes, s] })}>{signeDit(s)}</button>
                            );
                          })}
                        </div>
                      </fieldset>
                      <label className="trc-bq__etiquette" htmlFor={`note-${c.id}`}>Ce qu’il fallait répondre</label>
                      <textarea id={`note-${c.id}`} className="trc-bq__texte" rows={3} value={enReprise.note} placeholder="« Bien noté, nous vous attendons », puis le plan pour venir."
                        onChange={(e) => setReprise({ ...enReprise, note: e.target.value })} />
                      <div className="trc-bq__gestes">
                        <button type="button" className="trc-ger__btn trc-bq__btn--cuivre" onClick={enregistreLaReprise}>Enregistrer</button>
                        <button type="button" className="trc-ger__btn trc-am__btn--calme" onClick={() => setReprise(null)}>Annuler</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {visibles.length > page * PAR_PAGE && (
        <button type="button" className="trc-ger__btn trc-bq__plus" onClick={() => setPage((p) => p + 1)}>Voir {Math.min(PAR_PAGE, visibles.length - page * PAR_PAGE)} cas de plus</button>
      )}
    </div>
  );
}
