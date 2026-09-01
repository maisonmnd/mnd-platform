/* ══ LES MAISONS CHEZ QUI L'ON ACHÈTE — 1er septembre 2026 ═══════════════
   « J'achète dans certains supermarchés de manière très répétitive au fil
   d'une année. J'aimerais qu'ils aient un suivi de manière très précise et un
   compte que j'interroge facilement » (Yéman). Maquette validée :
   `public/maquette-le-compte-fournisseur.html`.

   PAS DE SOLDE : la Maison paie à chaque passage. Ce compte est une mémoire,
   pas une ardoise. La règle et les calculs vivent dans `shared/fournisseurs`,
   cet écran ne fait que les montrer. */
import { useMemo, useState } from 'react';
import { Eyebrow, Modal, Button, Field, Input } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { useExpenses, expenseTotal } from '../../../../shared/finance';
import { summaryPdf } from '../../../../shared/pdf';
import { maisonNom } from '../../../../shared/identite';
import { downloadCsv } from './_shared';
import {
  useFournisseurs, fournisseursStore, comptesFournisseurs, articlesDuFournisseur,
  libellesVoisins, maisonsARanger, type Fournisseur,
} from '../../../../shared/fournisseurs';
import './finances.css';

const todayISO = () => new Date().toISOString().slice(0, 10);
const ilYAUnAn = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};
const frDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const joursDepuis = (iso: string) =>
  Math.max(0, Math.round((Date.parse(`${todayISO()}T00:00:00`) - Date.parse(`${iso}T00:00:00`)) / 86_400_000));

type Form = { id: string | null; nom: string; famille: string; telephone: string; note: string; alias: string };

export default function Fournisseurs() {
  const { branch, currency } = useBranch();
  const [expenses] = useExpenses();
  const [fournisseurs] = useFournisseurs();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [q, setQ] = useState('');
  const [famille, setFamille] = useState('');

  /* DOUZE MOIS GLISSANTS : c'est l'horizon où « chez qui j'achète le plus »
     prend un sens. Sur un seul mois, la réponse n'est que le hasard du mois. */
  const du = ilYAUnAn();
  const desMoi = useMemo(() => fournisseurs.filter((f) => f.branchId === branch.id), [fournisseurs, branch.id]);

  const comptes = useMemo(
    () => comptesFournisseurs({ expenses, fournisseurs: desMoi, branchId: branch.id, du }),
    [expenses, desMoi, branch.id, du],
  );
  const aRanger = useMemo(
    () => maisonsARanger({ expenses, fournisseurs: desMoi, branchId: branch.id, du }),
    [expenses, desMoi, branch.id, du],
  );

  /* Ce que la Maison a dépensé sur douze mois, pour dire la PART de chacun :
     un million chez Super U ne veut rien dire sans son dénominateur. */
  const totalDesDepenses = useMemo(() => expenses
    .filter((e) => e.branchId === branch.id && !e.stopped && e.date >= du)
    .reduce((n, e) => n + expenseTotal(e), 0), [expenses, branch.id, du]);

  const familles = useMemo(
    () => [...new Set(desMoi.map((f) => (f.famille ?? '').trim()).filter(Boolean))].sort(),
    [desMoi],
  );
  const vus = useMemo(() => {
    const t = q.trim().toLowerCase();
    return comptes.filter((c) => (!famille || (c.fournisseur.famille ?? '') === famille)
      && (!t || c.fournisseur.nom.toLowerCase().includes(t)));
  }, [comptes, q, famille]);

  const haut = Math.max(1, ...vus.map((c) => c.totalXof));

  const ouvrirNeuf = (nom = '') =>
    setForm({ id: null, nom, famille: '', telephone: '', note: '', alias: '' });
  const ouvrirFiche = (f: Fournisseur) =>
    setForm({ id: f.id, nom: f.nom, famille: f.famille ?? '', telephone: f.telephone ?? '', note: f.note ?? '', alias: (f.alias ?? []).join(', ') });

  const enregistrer = () => {
    if (!form || !form.nom.trim()) return;
    const alias = form.alias.split(',').map((a) => a.trim()).filter(Boolean);
    const base = {
      nom: form.nom.trim(),
      famille: form.famille.trim() || undefined,
      telephone: form.telephone.trim() || undefined,
      note: form.note.trim() || undefined,
      alias: alias.length ? alias : undefined,
    };
    fournisseursStore.set((prev) => (form.id
      ? prev.map((f) => (f.id === form.id ? { ...f, ...base } : f))
      : [...prev, { id: `fo-${uid()}`, branchId: branch.id, ...base }]));
    setForm(null);
  };

  /* ADOPTER UN LIBELLÉ VOISIN, C'EST APPRENDRE UN NOM DE PLUS — jamais toucher
     à l'écriture. La dépense reste exactement ce qu'elle était ; c'est la
     fiche qui s'élargit. */
  const adopter = (id: string, libelle: string) =>
    fournisseursStore.set((prev) => prev.map((f) => (f.id === id
      ? { ...f, alias: [...(f.alias ?? []), libelle] } : f)));
  const oublier = (id: string, libelle: string) =>
    fournisseursStore.set((prev) => prev.map((f) => (f.id === id
      ? { ...f, alias: (f.alias ?? []).filter((a) => a !== libelle) } : f)));

  const compteOuvert = ouvert ? comptes.find((c) => c.fournisseur.id === ouvert) : undefined;

  return (
    <div className="mnd-rise">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Finances · chez qui la Maison achète</Eyebrow>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0', lineHeight: 1 }}>Les fournisseurs.</h2>
        </div>
        <button className="trf-act" style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)', padding: '12px 18px' }} onClick={() => ouvrirNeuf()}>
          + Nommer une maison
        </button>
      </div>

      <div className="trf-panel" style={{ marginTop: 18, padding: '18px 22px' }}>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input
            className="mnd-input"
            style={{ maxWidth: 260 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher une maison…"
          />
          <button className={`tre-chip ${!famille ? 'is-on' : ''}`} onClick={() => setFamille('')}>Toutes · {comptes.length}</button>
          {familles.map((fa) => (
            <button key={fa} className={`tre-chip ${famille === fa ? 'is-on' : ''}`} onClick={() => setFamille(fa)}>{fa}</button>
          ))}
        </div>

        {vus.length === 0 && (
          <div className="trf-empty">
            Aucune maison nommée pour l’instant. Celles chez qui vous achetez sont déjà
            dans la liste « à ranger », plus bas : un clic leur donne une fiche.
          </div>
        )}

        {vus.map((c) => (
          <button key={c.fournisseur.id} className="trf-four" onClick={() => setOuvert(c.fournisseur.id)}>
            <span className="trf-four__nom">{c.fournisseur.nom}</span>
            {c.fournisseur.famille && <span className="trf-four__tag">{c.fournisseur.famille}</span>}
            <span className="trf-four__n">
              {c.n} passage{c.n > 1 ? 's' : ''}
              {c.rythmeJours ? ` · tous les ${c.rythmeJours} j` : ''}
            </span>
            <span className="trf-four__xof">{fmtMoney(c.totalXof, currency)}</span>
            <span className="trf-four__barre"><i style={{ width: `${Math.max(2, Math.round((c.totalXof / haut) * 100))}%` }} /></span>
          </button>
        ))}
      </div>

      {/* ══ LE RÉPERTOIRE NAÎT PLEIN, PAS VIDE ══════════════════════════
          Il se construit des libellés déjà écrits, exactement comme « Où va
          l'argent ». La Maison n'a rien à saisir pour qu'il serve dès le
          premier jour : elle n'a qu'à nommer ceux qui comptent. */}
      {aRanger.length > 0 && (
        <div className="trf-panel" style={{ marginTop: 18, padding: '18px 22px' }}>
          <div className="trf-panel__title">À ranger · {aRanger.length}</div>
          <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '4px 0 12px', maxWidth: 720 }}>
            Ces noms sont sortis de vos dépenses des douze derniers mois et n’ont pas encore de
            fiche. Un clic leur en donne une, avec tout leur historique d’un coup.
          </div>
          {aRanger.slice(0, 40).map((m) => (
            <div key={m.libelle} className="trf-four" style={{ cursor: 'default' }}>
              <span className="trf-four__nom" style={{ fontSize: 17 }}>{m.libelle}</span>
              <span className="trf-four__n">{m.n} passage{m.n > 1 ? 's' : ''}</span>
              <span className="trf-four__xof" style={{ fontSize: 17 }}>{fmtMoney(m.totalXof, currency)}</span>
              <button className="trf-act trf-act--ghost" style={{ flex: 'none' }} onClick={() => ouvrirNeuf(m.libelle)}>
                Lui donner une fiche
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ══ LA FICHE ═══════════════════════════════════════════════════ */}
      {compteOuvert && (() => {
        const c = compteOuvert;
        const arts = articlesDuFournisseur(c.lignes);
        const voisins = libellesVoisins(c.fournisseur, expenses, desMoi, branch.id);
        const part = totalDesDepenses > 0 ? Math.round((c.totalXof / totalDesDepenses) * 1000) / 10 : 0;
        const avecPiece = c.lignes.filter((e) => !!e.fichier).length;
        const relevePdf = () => void summaryPdf({
          eyebrow: 'Relevé fournisseur',
          title: c.fournisseur.nom,
          houseName: maisonNom(),
          meta: [`Établi le ${frDate(todayISO())}`, branch.name ?? '', 'Douze mois glissants'],
          sections: [
            {
              heading: 'Les passages',
              rows: c.lignes.map((e) => ({
                label: `${frDate(e.date)} · ${e.label}${e.category ? ` · ${e.category}` : ''}`,
                value: fmtMoney(expenseTotal(e), currency),
              })),
            },
            {
              heading: 'Ce que cela représente',
              rows: [
                { label: `${c.n} passage${c.n > 1 ? 's' : ''}`, value: fmtMoney(c.totalXof, currency) },
                { label: 'Par passage, en moyenne', value: fmtMoney(c.moyenneXof, currency) },
                ...(c.rythmeJours ? [{ label: 'Un passage tous les', value: `${c.rythmeJours} jours` }] : []),
              ],
            },
          ],
          filename: `fournisseur-${c.fournisseur.nom.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.pdf`,
        });
        const releveCsv = () => downloadCsv(
          `fournisseur-${c.fournisseur.nom.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.csv`,
          [['Date', 'Libellé', 'Catégorie', 'Caisse', 'Porteur', 'Montant'],
            ...c.lignes.map((e) => [e.date, e.label, e.category, e.cashbox ?? '', e.porteur ?? '', String(expenseTotal(e))])],
        );
        return (
          <Modal title={c.fournisseur.nom} onClose={() => setOuvert(null)} width={720}>
            <div className="trf-releve-stats">
              <div>
                <div className="trf-releve-stats__l">Douze mois</div>
                <div className="trf-releve-stats__v">{fmtMoney(c.totalXof, currency)}</div>
                <div className="trf-releve-stats__attente" style={{ color: 'var(--ink-soft)' }}>
                  {part} % de vos dépenses
                </div>
              </div>
              <div>
                <div className="trf-releve-stats__l">Le rythme</div>
                <div className="trf-releve-stats__v">
                  {c.rythmeJours ? `tous les ${c.rythmeJours} j` : 'un seul passage'}
                </div>
                <div className="trf-releve-stats__attente" style={{ color: 'var(--ink-soft)' }}>
                  {c.n} passage{c.n > 1 ? 's' : ''} · dernier il y a {joursDepuis(c.dernier)} j
                </div>
              </div>
              <div>
                <div className="trf-releve-stats__l">Par passage</div>
                <div className="trf-releve-stats__v">{fmtMoney(c.moyenneXof, currency)}</div>
                <div className="trf-releve-stats__attente" style={{ color: 'var(--ink-soft)' }}>
                  du plus petit {fmtMoney(c.minXof, currency)} au plus gros {fmtMoney(c.maxXof, currency)}
                </div>
              </div>
              <div>
                <div className="trf-releve-stats__l">Les preuves</div>
                <div className="trf-releve-stats__v">{avecPiece} / {c.n}</div>
                <div className="trf-releve-stats__attente" style={{ color: 'var(--ink-soft)' }}>
                  passages avec une pièce jointe
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 16px' }}>
              <button className="trf-act" onClick={() => ouvrirFiche(c.fournisseur)}>Modifier la fiche</button>
              <button className="trf-act trf-act--ghost" onClick={relevePdf}>Relevé PDF</button>
              <button className="trf-act trf-act--ghost" onClick={releveCsv}>CSV</button>
            </div>

            {/* ON PROPOSE, ON NE RATTACHE JAMAIS D'OFFICE : une autre boutique
                a d'autres prix, et mélanger deux comptes ne se verrait qu'au
                moment de comparer des chiffres devenus faux. */}
            {(voisins.length > 0 || (c.fournisseur.alias?.length ?? 0) > 0) && (
              <div style={{ marginBottom: 18 }}>
                <div className="mnd-field__label" style={{ marginBottom: 7 }}>Ses autres noms</div>
                <div>
                  <span className="tre-chip is-on" style={{ marginRight: 6 }}>{c.fournisseur.nom}</span>
                  {(c.fournisseur.alias ?? []).map((a) => (
                    <button key={a} className="tre-chip" style={{ marginRight: 6 }} onClick={() => oublier(c.fournisseur.id, a)} title="Retirer ce nom">
                      {a} ✕
                    </button>
                  ))}
                </div>
                {voisins.length > 0 && (
                  <>
                    <div className="mnd-muted" style={{ fontSize: 12, margin: '10px 0 6px' }}>
                      Ces libellés lui ressemblent, la Maison les a repérés :
                    </div>
                    <div>
                      {voisins.map((v) => (
                        <button key={v.libelle} className="trf-four__prop" onClick={() => adopter(c.fournisseur.id, v.libelle)}>
                          + {v.libelle} · {v.n} dépense{v.n > 1 ? 's' : ''} · {fmtMoney(v.totalXof, currency)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="mnd-field__label" style={{ marginBottom: 7 }}>Les passages</div>
            <div className="mnd-scroll-x">
              <table className="tre-table" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>Quand</th><th>Catégorie</th><th>Qui</th><th>Caisse</th>
                    <th style={{ textAlign: 'right' }}>Montant</th><th>Pièce</th>
                  </tr>
                </thead>
                <tbody>
                  {c.lignes.slice(0, 60).map((e) => (
                    <tr key={e.id}>
                      <td>{frDate(e.date)}</td>
                      <td>{e.category}</td>
                      <td>{e.porteur ?? '—'}</td>
                      <td>{e.cashbox || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(expenseTotal(e), currency)}</td>
                      <td style={{ color: e.fichier ? 'var(--ink-soft)' : 'var(--trf-error)' }}>
                        {e.fichier ? 'oui' : 'manquante'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ELLE NE PARAÎT QUE SI L'ON DÉTAILLE : une fiche sans articles ne
                montre pas un tableau vide, elle n'en montre aucun. */}
            {arts.length > 0 && (
              <>
                <div className="mnd-field__label" style={{ margin: '20px 0 7px' }}>Ce qu’on y achète, et à quel prix</div>
                <div className="mnd-scroll-x">
                  <table className="tre-table" style={{ minWidth: 480 }}>
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th style={{ textAlign: 'right' }}>Fois</th>
                        <th style={{ textAlign: 'right' }}>Dernier prix</th>
                        <th style={{ textAlign: 'right' }}>Avant</th>
                        <th>Écart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arts.slice(0, 30).map((a) => (
                        <tr key={a.label}>
                          <td><b style={{ fontWeight: 500 }}>{a.label}</b></td>
                          <td style={{ textAlign: 'right' }}>{a.n}</td>
                          <td style={{ textAlign: 'right' }}>{fmtMoney(a.dernierPrixXof, currency)}</td>
                          <td style={{ textAlign: 'right' }}>
                            {a.premierPrixXof !== null ? fmtMoney(a.premierPrixXof, currency) : '—'}
                          </td>
                          <td style={{ color: a.ecartPct === null ? 'var(--ink-soft)' : a.ecartPct > 0 ? 'var(--trf-error)' : a.ecartPct < 0 ? '#4A6B52' : 'var(--ink-soft)' }}>
                            {a.ecartPct === null ? 'vu une fois'
                              : a.ecartPct === 0 ? 'stable'
                                : `${a.ecartPct > 0 ? '+' : ''}${a.ecartPct} %`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.6 }}>
                  Le prix suivi est celui de <b>l’unité</b> : deux litres à 2 900 F comptent
                  pour 1 450 F le litre, sinon une commande double se lirait comme une flambée.
                </div>
              </>
            )}
          </Modal>
        );
      })()}

      {/* ══ LA FICHE D'IDENTITÉ ════════════════════════════════════════ */}
      {form && (
        <Modal title={form.id ? 'Modifier la maison' : 'Nommer une maison'} onClose={() => setForm(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nom">
              <Input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex. Super U" />
            </Field>
            <Field label="Famille · facultatif">
              <Input value={form.famille} onChange={(e) => setForm({ ...form, famille: e.target.value })} placeholder="Supermarché, matières, local…" />
            </Field>
            <Field label="Téléphone · facultatif">
              <Input value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} placeholder="+229…" />
            </Field>
            <Field label="Ses autres noms · séparés par des virgules">
              <Input value={form.alias} onChange={(e) => setForm({ ...form, alias: e.target.value })} placeholder="SuperU, SUPER-U" />
              <span className="mnd-muted" style={{ fontSize: 11, marginTop: 5, display: 'block', lineHeight: 1.55 }}>
                Chaque nom rassemble les dépenses qui le portent. <b>Aucune dépense n’est
                modifiée</b> : c’est la fiche qui apprend un nom de plus.
              </span>
            </Field>
            <Field label="Note · facultatif">
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Livre le mardi, demander Séraphin…" />
            </Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="ghost" style={{ flex: 1 }} onClick={() => setForm(null)}>Annuler</Button>
              <Button variant="copper" onClick={enregistrer}>Enregistrer</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
