/* LES PRÊTS — leur propre écran, 23 août 2026.

   « Les prêts sont des mouvements qui n'ont rien à voir avec Foyer des
   clients, compte famille, et les avoirs. Retire-les de là et crée-leur un
   onglet à part. » Elle a raison, et le rangement était de moi : les prêts
   sont nés sous Comptes & Avoirs parce que la dette et l'avoir se ressemblent
   de loin. De près, tout les sépare. Un avoir est de l'argent que la MAISON
   DOIT à une cliente, porté par un compte client ; un prêt est de l'argent
   qu'ON DOIT À LA MAISON, et l'emprunteur n'est pas forcément une cliente —
   un membre de l’équipe, un associé, un tiers, le foyer.

   Les mêler obligeait à lire le titre pour savoir de quel côté penchait la
   somme affichée. */

import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { useCashboxes } from '../../../../shared/finance';
import { useClients } from '../../../../shared/clients';
import { usePrets, soldesParEmprunteur, detteEnCours, type GenreEmprunteur, type Pret } from '../../../../shared/foyer';
import { ClientPicker } from '../clients/_shared';
import { ContrepartieMaison, montantsDuTiroir, libelleDuMontant, nettoieLeMontant } from './tiroirs';
import { todayISO } from './_shared';
import './finances.css';

/** Le genre d'un emprunteur, en français — ce que l'œil lit sur la carte. */
const LIBELLE_GENRE: Record<GenreEmprunteur, string> = {
  foyer: 'foyer', associe: 'associé', equipe: 'équipe', cliente: 'cliente', tiers: 'tiers',
};

const frJour = (iso: string): string =>
  (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—');

export default function Prets() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [prets, setPrets] = usePrets();
  const soldes = useMemo(() => soldesParEmprunteur(prets, branch.id), [prets, branch.id]);
  const dette = detteEnCours(prets, branch.id);
  const [pretOuvert, setPretOuvert] = useState(false);
  /* CORRIGER OU EFFACER UNE LIGNE DE PRÊT — 22 août 2026. Une ligne posée sur
     la mauvaise caisse déplaçait de l’argent qui n’a jamais bougé, et rien ne
     permettait de la reprendre. Même modale que la saisie : deux formulaires
     pour une même écriture finissent toujours par se contredire. */
  const [pretEdite, setPretEdite] = useState<Pret | null>(null);
  const corrigerLePret = (p: Pret) => {
    setFPret({
      type: p.type,
      genre: (p.genre ?? 'tiers') as GenreEmprunteur,
      nom: p.associe, personneId: p.personneId ?? '',
      motif: p.motif ?? '',
      cashbox: p.cashbox ?? '', method: p.method ?? 'Espèces', date: p.date.slice(0, 10),
      montant: p.fx ? String(p.fx.amount) : String(p.amountXof),
      enDevise: p.fx ? String(p.amountXof) : '',
    });
    setPretEdite(p);
  };
  const effacerLePret = () => {
    if (!pretEdite) return;
    setPrets((prev) => prev.filter((x) => x.id !== pretEdite.id));
    setPretEdite(null);
  };
  const [fPret, setFPret] = useState({
    type: 'pret' as 'pret' | 'remboursement',
    genre: 'equipe' as GenreEmprunteur,
    nom: '', personneId: '', motif: '', montant: '',
    cashbox: '', method: 'Espèces', date: todayISO(), enDevise: '',
  });
  const [toutesCaisses] = useCashboxes();
  /* TOUTES LES CAISSES, DEVISES COMPRISES — 22 août 2026. Elles étaient
     écartées parce que le montant se saisit en francs ; elles reviennent avec
     leur propre champ (voir `MontantDuTiroir`). */
  const caissesMaison = toutesCaisses.filter((c) => c.branchId === branch.id);
  const caisseDuPret = caissesMaison.find((c) => c.name === fPret.cashbox);
  /* LE MONTANT SE DIT DANS LA MONNAIE DU TIROIR — 23 août 2026. On connaît
     les dollars qui sortent ; le franc les suit, au taux indicatif, et se
     corrige à la main. */
  const montantsPret = montantsDuTiroir(caisseDuPret, currency, fPret.montant, fPret.enDevise);

  const enregistrerPret = () => {
    const montant = montantsPret.xof;
    const nom = fPret.nom.trim();
    if (!nom || montant <= 0 || montantsPret.saisi <= 0) return;
    const ligne: Pret = {
      id: `prt-${uid()}`,
      branchId: branch.id,
      date: fPret.date || todayISO(),
      type: fPret.type,
      associe: nom,
      motif: fPret.motif.trim() || (fPret.type === 'pret' ? 'Prêt' : 'Remboursement'),
      amountXof: montant,
      genre: fPret.genre,
      personneId: fPret.personneId || undefined,
      /* LA CAISSE EST LE POINT DE TOUTE CETTE PIÈCE : sans elle, prêter
         200 000 F ne les retire d'aucun tiroir, et les mêmes francs vivent
         dans la caisse ET chez l'emprunteur. */
      cashbox: fPret.cashbox || undefined,
      method: fPret.method || undefined,
      fx: montantsPret.fx,
    };
    if (pretEdite) {
      /* L’IDENTIFIANT NE BOUGE PAS : le journal des gestes suit la pièce par
         lui, et une correction doit rester la MÊME écriture, corrigée. */
      setPrets((prev) => prev.map((x) => (x.id === pretEdite.id ? { ...ligne, id: pretEdite.id } : x)));
      setPretEdite(null);
      setFPret((f) => ({ ...f, nom: '', personneId: '', motif: '', montant: '' }));
      return;
    }
    setPrets((prev) => [...prev, ligne]);
    setPretOuvert(false);
    setFPret((f) => ({ ...f, nom: '', personneId: '', motif: '', montant: '' }));
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Finances"
        title="Les prêts."
        sub="Ce que la Maison a prêté et ce qu'on lui doit encore. Un prêt sort d'une caisse, un remboursement y rentre — l'argent se déplace, il ne se duplique pas."
        actions={<Button variant="copper" onClick={() => setPretOuvert(true)}>+ Prêt ou remboursement</Button>}
      />
          {soldes.length === 0 ? (
            <Card style={{ padding: 22 }}>
              <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                <b style={{ color: 'var(--color-indigo)', fontWeight: 600 }}>Aucun prêt enregistré.</b><br />
                Une avance sur salaire, un dépannage, un prêt au foyer : notez-le ici, et chaque
                remboursement viendra s’imputer dessus. Le solde de chacun se tient tout seul.
              </div>
            </Card>
          ) : (
            <>
              <Card style={{ padding: 18, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                  <div>
                    <div className="mnd-stat__label">Dette en cours envers la Maison</div>
                    <div className="mnd-stat__value" style={{ fontSize: 30 }}>{fmtMoney(dette, currency)}</div>
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, maxWidth: 380, lineHeight: 1.55 }}>
                    La somme de ce que chacun doit encore. Un trop-remboursé n’y devient jamais une
                    dette de la Maison — c’est une erreur de saisie, pas un dû.
                  </div>
                </div>
              </Card>

              {soldes.map((d) => {
                const lignes = prets
                  .filter((p) => p.branchId === branch.id && p.associe.trim().toLowerCase() === d.nom.toLowerCase())
                  .sort((a, b) => (a.date < b.date ? 1 : -1));
                return (
                  <Card key={d.nom} filet={d.reste > 0 ? 'copper' : 'indigo'} style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                        <b style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)', fontWeight: 400 }}>{d.nom}</b>
                        <span className="trc-src">{LIBELLE_GENRE[d.genre]}</span>
                      </span>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: d.reste > 0 ? 'var(--copper-700)' : 'var(--trf-success)' }}>
                        {d.reste > 0 ? `reste ${fmtMoney(d.reste, currency)}` : `soldé le ${frJour(d.dernier)}`}
                      </span>
                    </div>
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                      prêté {fmtMoney(d.prete, currency)} · remboursé {fmtMoney(d.rembourse, currency)}
                    </div>
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
                      {lignes.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => corrigerLePret(p)}
                          title="Corriger ou effacer cette ligne"
                          style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 12.5, flexWrap: 'wrap', background: 'none', border: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
                        >
                          <span>
                            <span style={{ color: p.type === 'pret' ? 'var(--copper-700)' : 'var(--trf-success)' }}>
                              {p.type === 'pret' ? 'Prêté' : 'Remboursé'}
                            </span>
                            {' · '}{frJour(p.date)}
                            {p.motif ? ` · ${p.motif}` : ''}
                            {p.cashbox ? <span className="mnd-muted"> · {p.cashbox}</span> : null}
                          </span>
                          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}>
                            {fmtMoney(p.amountXof, currency)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </>
          )}

      {(pretOuvert || pretEdite) && (
        <Modal
          title={pretEdite ? (pretEdite.type === 'pret' ? "Corriger ce prêt" : "Corriger ce remboursement") : "Prêt ou remboursement"}
          onClose={() => { setPretOuvert(false); setPretEdite(null); }}
          width={520}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="De quel geste s’agit-il ?">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {([['pret', 'La Maison prête'], ['remboursement', 'On lui rembourse']] as const).map(([k, mot]) => (
                  <button
                    key={k}
                    type="button"
                    className={`trc-chip ${fPret.type === k ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({ ...f, type: k }))}
                  >
                    {mot}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="À qui">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 9 }}>
                {(['equipe', 'cliente', 'tiers', 'associe', 'foyer'] as GenreEmprunteur[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`trc-chip ${fPret.genre === g ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({ ...f, genre: g, nom: g === 'foyer' ? 'Foyer' : f.nom, personneId: '' }))}
                  >
                    {LIBELLE_GENRE[g]}
                  </button>
                ))}
              </div>
              {/* Une cliente se choisit à la fiche : c'est ce lien qui permettra
                  de relire le prêt depuis son dossier, dans l'autre sens. */}
              {fPret.genre === 'cliente' ? (
                <ClientPicker
                  value={fPret.personneId}
                  onChange={(id) => setFPret((f) => ({
                    ...f, personneId: id,
                    nom: clients.find((c) => c.id === id)?.name ?? f.nom,
                  }))}
                  placeholder="Choisir la cliente…"
                />
              ) : (
                <Input
                  value={fPret.nom}
                  placeholder={fPret.genre === 'equipe' ? 'Nom du membre de l’équipe' : 'Nom de la personne'}
                  onChange={(e) => setFPret((f) => ({ ...f, nom: e.target.value }))}
                />
              )}
            </Field>

            <Field label={libelleDuMontant(caisseDuPret, currency)}>
              <Input
                inputMode="decimal"
                value={fPret.montant}
                placeholder="0"
                onChange={(e) => setFPret((f) => ({ ...f, montant: nettoieLeMontant(e.target.value, montantsPret.enDevise) }))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </Field>

            <Field label={fPret.type === 'pret' ? 'De quelle caisse sort cet argent ?' : 'Dans quelle caisse rentre-t-il ?'}>
              <Select value={fPret.cashbox} onChange={(e) => setFPret((f) => ({ ...f, cashbox: e.target.value }))}>
                {caissesMaison.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                <option value="">Hors caisse — l’argent n’est pas passé par un tiroir</option>
              </Select>
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, lineHeight: 1.5 }}>
                {fPret.type === 'pret'
                  ? 'La caisse choisie baisse d’autant : l’argent se déplace, il ne se duplique pas.'
                  : 'La caisse choisie monte d’autant — l’argent revient dans le tiroir.'}
              </div>
            </Field>

            <ContrepartieMaison
              caisse={caisseDuPret}
              maison={currency}
              saisie={fPret.montant}
              contrepartie={fPret.enDevise}
              onChange={(v: string) => setFPret((f) => ({ ...f, enDevise: v }))}
              sortant={fPret.type === 'pret'}
            />

            <Field label="Par quel moyen">
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {['Espèces', 'Mobile Money', 'Virement', 'Autre'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`trc-chip ${fPret.method === m ? 'is-active' : ''}`}
                    onClick={() => setFPret((f) => ({ ...f, method: m }))}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Motif · facultatif">
              <Input
                value={fPret.motif}
                placeholder="Avance sur salaire · dépannage · …"
                onChange={(e) => setFPret((f) => ({ ...f, motif: e.target.value }))}
              />
            </Field>

            <Field label="Date">
              <Input type="date" value={fPret.date} onChange={(e) => setFPret((f) => ({ ...f, date: e.target.value }))} />
            </Field>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap' }}>
              {/* EFFACER VIT DANS LA FICHE, à gauche, loin d’Enregistrer : un
                  geste sans retour ne voisine pas avec le geste courant.
                  Effacer un prêt REND l’argent à sa caisse — c’est bien ce
                  qu’on veut d’une ligne qui n’aurait jamais dû exister. */}
              {pretEdite ? (
                <button
                  className="mnd-btn mnd-btn--ghost"
                  style={{ color: 'var(--copper-700)' }}
                  onClick={effacerLePret}
                >
                  Effacer cette ligne
                </button>
              ) : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="mnd-btn mnd-btn--ghost" onClick={() => { setPretOuvert(false); setPretEdite(null); }}>Annuler</button>
                <button className="mnd-btn" onClick={enregistrerPret}>Enregistrer</button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
