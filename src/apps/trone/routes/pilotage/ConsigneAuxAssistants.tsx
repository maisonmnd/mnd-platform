import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { Button, toast, demande } from '../../../../ds/components';
import { useAuth, useStaff as useMonProfil } from '../../../../shared/auth';
import { useSettings } from '../../../../shared/settings';
import { useBranch } from '../../../../shared/branches';
import { useAppointments } from '../../../../shared/agenda';
import { reglagesComplets, type Assistant, type Decision } from '../../../../shared/assistants-pur';
import { PORTEURS, PROFESSIONNELS, professionnel, type Professionnel } from '../../../../shared/maison-intelligente-pur';
import { litLesAssistants, prenomDe } from '../../../../shared/assistants';
import {
  defaireJusqua, ligneDuFil, momentDit, ordreDuChoix, peutDefaire, planDuDefaire, veilleDe, TEXTE_AU_PLUS,
  type Consigne, type RdvLu, type Veille,
} from '../../../../shared/consignes-pur';
import { envoieUneConsigne, litLesConsignes, noteLeDefaire } from '../../../../shared/consignes';
import { fabriqueDOreille, DIT_L_ERREUR_DE_L_OREILLE, type Oreille } from '../../../../shared/oreille';
import './consignes.css';

/* ═══ ÉCRIRE À UN ASSISTANT · 5 novembre 2026, lot 1 ═══════════════════
   Maquette « Une consigne aux assistants » (2AqfEEiPvpdfUUkXzs2XUC),
   validée (« construis »). En haut de Direction › Les assistants : on choisit
   l'assistant au-dessus du champ (il dit s'il veille, ou s'il n'est pas encore
   relié), on écrit ou on dicte, on envoie ; le fil dit Envoyée, Lue, Fait,
   Votre oui, Passée à…, En attente, avec la réponse dessous.

   DÉFAIRE pendant une heure, sur ce qu'un assistant a fait seul : par les
   magasins du Trône (le rendez-vous revient, la note s'en va), donc au
   Journal des gestes au nom de qui touche, comme tout geste du Trône. Tout
   ou rien : un rendez-vous qui a bougé autrement depuis bloque, et l'écran
   dit pourquoi.

   La direction seule : la route est souveraine, la table aussi (RLS, 0162).
   Rien en temps réel : relu toutes les 20 secondes quand l'onglet est
   ouvert. Indigo et cuivre, aucun vert, rouge ni jaune. */

const EXEMPLES: { mot: string; texte: string }[] = [
  { mot: 'Un rappel', texte: 'Rappelle-moi demain à 12 h le rendez-vous de 13 h.' },
  { mot: 'Un message', texte: 'Réponds à la fournisseuse qu’on prend 3 bouteilles pour vendredi.' },
  { mot: 'Un rendez-vous', texte: 'Pose à la cliente de ce matin un rendez-vous mardi prochain à 11 h, sa reprise habituelle.' },
];
const RELU_TOUTES_LES_MS = 20_000;
const MONTRES_D_EMBLEE = 6;

const majuscule = (t: string): string => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const porteursDits = (p: Professionnel | null): string => (p ? p.porteurs.map((k) => PORTEURS[k].prenom).join(' et ') : 'la direction');

export default function ConsigneAuxAssistants({ decisions, ouvrirLaCarte }: {
  /** Les cartes en attente que la direction connectée voit (les siennes). */
  decisions: Decision[];
  ouvrirLaCarte: (decisionId: string) => void;
}) {
  const { session } = useAuth();
  const monProfil = useMonProfil();
  const monId = session?.user?.id ?? null;
  const monNom = (monProfil?.name ?? '').trim();
  const { branch } = useBranch();
  const [reglages] = useSettings();
  const [appts, setAppts] = useAppointments();
  const r = reglagesComplets(reglages.assistants);

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [consignes, setConsignes] = useState<Consigne[]>([]);
  const [absente, setAbsente] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [tour, setTour] = useState(0);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [autres, setAutres] = useState(false);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [toutLeFil, setToutLeFil] = useState(false);
  const [defaitEnCours, setDefaitEnCours] = useState<string | null>(null);
  const [ecoute, setEcoute] = useState(false);
  const oreille = useRef<Oreille | null>(null);
  const entendu = useRef<{ base: string; finals: string[] }>({ base: '', finals: [] });

  /* LA LECTURE : à l'ouverture, après chaque geste, et toutes les 20 secondes
     tant que l'onglet est sous les yeux. Une lecture arrivée après la
     fermeture ne touche rien. */
  const relis = () => setTour((n) => n + 1);
  useEffect(() => {
    let vivant = true;
    const lis = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const [a, c] = await Promise.all([litLesAssistants(), litLesConsignes(40)]);
      if (!vivant) return;
      setAssistants(a.assistants);
      setConsignes(c.consignes);
      setAbsente(c.absente);
      setMaintenant(Date.now());
    };
    void lis();
    const t = setInterval(() => { void lis(); }, RELU_TOUTES_LES_MS);
    return () => { vivant = false; clearInterval(t); };
  }, [tour]);
  useEffect(() => () => { try { oreille.current?.abort(); } catch { /* déjà arrêtée */ } }, []);

  const { visibles, autres: lesAutres } = useMemo(() => ordreDuChoix(PROFESSIONNELS, assistants, monId), [assistants, monId]);
  const idChoisi = choisi ?? visibles[0]?.id ?? 'opale';
  const pro = professionnel(idChoisi) ?? PROFESSIONNELS[0];
  const assistantDe = (id: string): Assistant | null => assistants.find((a) => a.id === id) ?? null;
  const veilleDuPro = (p: Professionnel): Veille => veilleDe(assistantDe(p.id), p, maintenant, r);
  const veille = veilleDuPro(pro);
  const nomDe = (id: string): string => professionnel(id)?.nom ?? assistantDe(id)?.nom ?? id;
  const autreChoisi = lesAutres.some((p) => p.id === idChoisi);
  const montrerAutres = autres || autreChoisi;

  /* ── La dictée : l'oreille de la Dictée MND, ajoutée à ce qui est déjà écrit. ── */
  const peutDicter = fabriqueDOreille() !== null;
  const dicte = () => {
    if (ecoute) { try { oreille.current?.stop(); } catch { setEcoute(false); } return; }
    const Fabrique = fabriqueDOreille();
    if (!Fabrique) return;
    entendu.current = { base: texte.trim(), finals: [] };
    const o = new Fabrique();
    o.lang = 'fr-FR'; o.continuous = false; o.interimResults = true; o.maxAlternatives = 1;
    o.onresult = (e) => {
      let suspens = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        const t = (res[0]?.transcript ?? '').trim();
        if (!t) continue;
        if (res.isFinal) entendu.current.finals.push(t); else suspens += `${t} `;
      }
      setTexte(`${entendu.current.base} ${entendu.current.finals.join(' ')} ${suspens}`.replace(/\s+/g, ' ').trim().slice(0, TEXTE_AU_PLUS));
    };
    o.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      toast(DIT_L_ERREUR_DE_L_OREILLE[e.error] ?? `Le micro dit : ${e.error}.`);
    };
    o.onend = () => setEcoute(false);
    oreille.current = o;
    try { o.start(); setEcoute(true); } catch { setEcoute(false); }
  };

  /* ── Envoyer ── */
  const envoyer = async () => {
    if (envoi || !texte.trim()) return;
    setEnvoi(true);
    const res = await envoieUneConsigne({ pour: pro.id, texte, de: monNom || 'La direction', deUserId: monId, branchId: branch?.id ?? null });
    setEnvoi(false);
    if (!res.ok) { toast(res.erreur); return; }
    setTexte('');
    setConsignes((prev) => [res.consigne, ...prev.filter((c) => c.id !== res.consigne.id)]);
    toast(veille.cle === 'veille' ? `Envoyée à ${pro.nom} : la consigne est vue en une minute environ.` : `Envoyée. ${veille.phrase}`);
    relis();
  };

  /* ── Défaire ── */
  const defaire = async (c: Consigne) => {
    const ms = Date.now();
    if (!peutDefaire(c, ms)) { toast('L’heure est passée : Défaire ne se tient qu’une heure.'); relis(); return; }
    const rdvs: Record<string, RdvLu> = {};
    for (const g of c.defaire ?? []) {
      const a = appts.find((x) => x.id === g.rdvId);
      if (a) rdvs[a.id] = { id: a.id, date: a.date, time: a.time, status: a.status, note: a.note ?? '' };
    }
    const plan = planDuDefaire(c.defaire ?? [], rdvs, ms);
    if (!plan.ok) { toast(`Rien n’est défait : ${plan.pourquoi.join(' ; ')}.`); return; }
    const accepte = await demande({
      quoi: 'Défaire', titre: `Défaire ce que ${nomDe(c.pour)} a fait ?`,
      dit: plan.dits.length ? `${majuscule(plan.dits.join(' ; '))}.` : 'Tout est déjà revenu comme avant : le fil le notera.',
      accepter: 'Défaire', refuser: 'Garder',
    });
    if (!accepte) return;
    setDefaitEnCours(c.id);
    if (plan.changements.length) {
      setAppts((prev) => prev.map((a) => {
        const ch = plan.changements.find((x) => x.rdvId === a.id);
        return ch ? { ...a, ...ch.apres } : a;
      }));
    }
    const noted = await noteLeDefaire(c.id, monNom || 'La direction');
    setDefaitEnCours(null);
    toast(noted.ok ? 'Défait : tout est revenu comme avant.' : noted.erreur);
    relis();
  };

  const fil = toutLeFil ? consignes : consignes.slice(0, MONTRES_D_EMBLEE);
  const ctx = { nomDe, prenomDe: (n: string) => prenomDe(n) || n, veilleDuPour: null as Veille | null };

  return (
    <section className="ast-carte csg" aria-label="Écrire à un assistant" data-consigne="carte">
      <div className="csg-haut">
        <h3 className="csg-titre">Écrire à un assistant</h3>
        <span className={`csg-veille est-${veille.cle}`}><i aria-hidden="true" />{pro.nom} · {veille.mot}</span>
      </div>

      <form className="csg-saisie" onSubmit={(e) => { e.preventDefault(); void envoyer(); }}>
        <div className="csg-choix" role="radiogroup" aria-label="À quel assistant">
          {[...visibles, ...(montrerAutres ? lesAutres : [])].map((p) => {
            const v = veilleDuPro(p);
            const oui = p.id === idChoisi;
            return (
              <button key={p.id} type="button" role="radio" aria-checked={oui} className={`csg-puce${oui ? ' est-choisie' : ''} est-${v.cle}`}
                onClick={() => setChoisi(p.id)}>
                {p.nom} · {v.mot}
              </button>
            );
          })}
          {!montrerAutres && lesAutres.length > 0 && (
            <button type="button" className="csg-puce csg-puce--autres" onClick={() => setAutres(true)}>Les autres…</button>
          )}
        </div>
        <p className="csg-dit" data-consigne="veille">{veille.phrase}</p>
        {pro.horsDuTrone && (
          <p className="csg-dit">{pro.nom} est à part : ici, seulement les lettres et attestations de la Maison, jamais un papier de la famille.</p>
        )}
        {absente && <p className="csg-dit csg-dit--fort">La table des consignes n’est pas encore en ligne (migration 0162) : rien ne peut partir pour l’instant.</p>}

        <label htmlFor="csg-texte" className="csg-etiquette">Votre consigne, comme vous la diriez</label>
        <textarea
          id="csg-texte"
          className="mnd-textarea csg-texte"
          rows={3}
          maxLength={TEXTE_AU_PLUS}
          value={texte}
          placeholder={`Écrivez à ${pro.nom}…`}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void envoyer(); } }}
        />
        <div className="csg-exemples" aria-label="Exemples">
          {EXEMPLES.map((x) => (
            <button key={x.mot} type="button" className="csg-puce csg-puce--exemple" onClick={() => setTexte(x.texte)}>{x.mot}</button>
          ))}
        </div>
        <div className="csg-rangee">
          {peutDicter
            ? (
              <button type="button" className={`mnd-btn mnd-btn--ghost csg-dicter${ecoute ? ' est-ecoute' : ''}`} aria-pressed={ecoute} onClick={dicte}
                title="La Dictée MND : parlez, la consigne s’écrit">
                <Mic size={14} /> {ecoute ? 'J’écoute…' : 'Dicter'}
              </button>
            )
            : <span />}
          <Button type="submit" variant="copper" disabled={envoi || !texte.trim()}>Envoyer à {pro.nom}</Button>
        </div>
        <p className="csg-regle">Seul, puis il vous le dit : un rendez-vous posé, déplacé ou annulé, une note, un rappel, une recherche ; Défaire pendant une heure. Jamais sans votre oui : un message, l’argent, un effacement. Votre téléphone sonne seulement pour un oui.</p>
      </form>

      {consignes.length > 0 && (
        <ul className="csg-fil" aria-label="Le fil des consignes" data-consigne="fil">
          {fil.map((c) => {
            const p = professionnel(c.pour);
            const v = p ? veilleDuPro(p) : null;
            const l = ligneDuFil(c, { ...ctx, veilleDuPour: v }, maintenant);
            const carteVue = c.decisionId ? decisions.find((d) => d.id === c.decisionId) ?? null : null;
            const jeSuisLePorteur = !!monId && assistantDe(c.pour)?.porteurUserId === monId;
            const fin = defaireJusqua(c.faiteLe);
            const finDite = fin ? momentDit(new Date(fin).toISOString(), maintenant).replace(/^à /, '') : '';
            return (
              <li key={c.id} className="csg-item">
                <div className="csg-etat">
                  <span className={`csg-pastille est-${l.ton}`}>{l.pastille}</span>
                  <small>{l.ligne}</small>
                </div>
                <p className="csg-texte-dit">« {c.texte} »</p>
                {c.passeeDe && c.passeeMot && <p className="csg-dit">{nomDe(c.passeeDe)} l’a passée à {nomDe(c.pour)} : {c.passeeMot}</p>}
                {l.attend && <p className="csg-dit" data-consigne="attend">{l.attend}</p>}
                {c.reponse && (
                  <div className={`csg-reponse${c.statut === 'oui-attendu' && !c.defaiteLe ? ' est-oui' : ''}`}>
                    <span>{c.reponse}</span>
                    {c.statut === 'oui-attendu' && (
                      carteVue
                        ? <span><Button size="sm" variant="copper" onClick={() => ouvrirLaCarte(carteVue.id)}>Voir la carte</Button></span>
                        : <span className="csg-dit">{jeSuisLePorteur
                          ? `Votre carte est tranchée : ${nomDe(c.pour)} l’exécute à son prochain passage.`
                          : `La carte attend le oui de ${porteursDits(p)}.`}</span>
                    )}
                    {peutDefaire(c, maintenant) && (
                      <span>
                        <button type="button" className="csg-lien" disabled={defaitEnCours === c.id} onClick={() => { void defaire(c); }}>
                          Défaire (jusqu’à {finDite})
                        </button>
                      </span>
                    )}
                  </div>
                )}
                {c.defaiteLe && (
                  <div className="csg-reponse">Défait par {prenomDe(c.defaitePar ?? '') || 'la direction'} {momentDit(c.defaiteLe, maintenant)} : tout est revenu comme avant.</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {consignes.length > MONTRES_D_EMBLEE && (
        <div className="csg-plus">
          <Button size="sm" variant="ghost" onClick={() => setToutLeFil((x) => !x)}>
            {toutLeFil ? 'Ne garder que les plus récentes' : `Voir les plus anciennes (${consignes.length - MONTRES_D_EMBLEE})`}
          </Button>
        </div>
      )}
    </section>
  );
}
