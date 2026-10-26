import { useMemo, useState } from 'react';
import { demande, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { invoicesStore, invoiceTotal, ligneNetXof, type Invoice } from '../../../../shared/finance';
import { appointmentsStore, useAppointments } from '../../../../shared/agenda';
import { useServices } from '../../../../shared/catalog';
import { frJourAn } from './_shared';
import { downloadBackup } from '../../backup';
import {
  LIBELLE_AJUSTEMENT, dernierRemplacement, piecesSansLeRemplacement, rdvSansLeRemplacement,
  remplacementsDesPieces, remplacementsDesRdv,
} from './remplacer-une-prestation-pur';

/* ══ REMPLACER UNE PRESTATION — 26 octobre 2026 ══════════════════════════
   Sur l'onglet Documents d'une fiche : une ligne de ses factures (« Le
   Souffle ») devient une autre prestation du catalogue (« L'Ancrage »), à un
   prix posé à la main, sur une année. Le tableau dit pièce par pièce ce qui
   change ; le total de chaque facture ne bouge pas (son choix) ; les
   rendez-vous de l'année prennent la même prestation. La sauvegarde
   d'abord, un geste, et « Défaire » (règle : remplacer-une-prestation-pur). */
export function RemplacerUnePrestation({ clientId, documents, onFerme }: {
  clientId: string;
  documents: Invoice[];
  onFerme: () => void;
}) {
  const { currency } = useBranch();
  const [services] = useServices();
  const [rdvs] = useAppointments();
  const [de, setDe] = useState('');
  const [versId, setVersId] = useState('');
  const [prix, setPrix] = useState('');
  const [annee, setAnnee] = useState<string>('');
  const [sauvee, setSauvee] = useState(false);
  const m = (x: number) => fmtMoney(x, currency);

  const factures = useMemo(() => documents.filter((o) => o.kind !== 'devis'), [documents]);
  /* Les lignes qu'on peut remplacer : celles de ses factures, la plus
     fréquente d'abord ; jamais l'ajustement lui-même. */
  const lignes = useMemo(() => {
    const n = new Map<string, number>();
    for (const o of factures) {
      for (const l of new Set(o.lines.map((x) => x.label))) if (l && l !== LIBELLE_AJUSTEMENT) n.set(l, (n.get(l) ?? 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
  }, [factures]);
  const annees = useMemo(
    () => [...new Set(factures.filter((o) => o.lines.some((l) => l.label === de)).map((o) => o.date.slice(0, 4)))].sort().reverse(),
    [factures, de],
  );
  const catalogue = useMemo(
    () => services.filter((s) => !s.archived).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [services],
  );
  const vers = catalogue.find((s) => s.id === versId);
  const deId = services.find((s) => s.name === de)?.id ?? '';
  const prixXof = Math.round(Number(String(prix).replace(/\s/g, '')) || 0);
  const pret = !!de && !!vers && vers.name !== de && prixXof > 0;
  const an = annee || null;

  const apercu = useMemo(() => {
    if (!pret || !vers) return { pieces: [], rdv: [] };
    const le = 'apercu';
    return {
      pieces: remplacementsDesPieces(factures, { de, vers: vers.name, prixXof, annee: an }, invoiceTotal, le),
      rdv: remplacementsDesRdv(rdvs.filter((a) => a.clientId === clientId), { deId, versId: vers.id, annee: an }, le),
    };
  }, [pret, vers, factures, de, prixXof, an, rdvs, clientId, deId]);
  const aChanger = apercu.pieces.filter((c) => c.ok);
  const aRevoir = apercu.pieces.filter((c) => !c.ok);

  const appliquer = () => {
    if (!vers) return;
    const le = new Date().toISOString();
    const pieces = remplacementsDesPieces(factures, { de, vers: vers.name, prixXof, annee: an }, invoiceTotal, le).filter((c) => c.ok);
    const rdv = remplacementsDesRdv(appointmentsStore.get().filter((a) => a.clientId === clientId), { deId, versId: vers.id, annee: an }, le);
    const parPiece = new Map(pieces.map((c) => [c.piece.id, c.apres]));
    const parRdv = new Map(rdv.map((c) => [c.rdv.id, c.apres]));
    invoicesStore.set((prev) => prev.map((i) => parPiece.get(i.id) ?? i));
    if (parRdv.size) appointmentsStore.set((prev) => prev.map((a) => parRdv.get(a.id) ?? a));
    toast(`${pieces.length} facture${pieces.length > 1 ? 's' : ''} et ${rdv.length} rendez-vous corrigé${rdv.length > 1 ? 's' : ''}. Les totaux n'ont pas bougé.`);
    onFerme();
  };

  const dernier = dernierRemplacement(documents);
  const defaire = async () => {
    if (!dernier) return;
    if (!await demande({
      quoi: 'Ses factures',
      titre: 'Défaire le dernier remplacement ?',
      dit: `« ${dernier.vers} » redevient « ${dernier.de} » sur les factures et les rendez-vous touchés le ${frJourAn(dernier.le.slice(0, 10))}, avec leurs lignes d'avant.`,
      accepter: 'Défaire',
      refuser: 'Garder',
    })) return;
    invoicesStore.set((prev) => prev.map((i) => (i.clientId === clientId ? piecesSansLeRemplacement(i, dernier.le) : i)));
    appointmentsStore.set((prev) => prev.map((a) => (a.clientId === clientId ? rdvSansLeRemplacement(a, dernier.le) : a)));
    toast('Le remplacement est défait.');
  };

  return (
    <div className="trc-remplace">
      <div className="trc-remplace__tete">
        <span className="trc-remplace__titre">Remplacer une prestation sur ses factures</span>
        <button type="button" className="mnd-btn mnd-btn--ghost" onClick={onFerme}>Fermer</button>
      </div>

      <div className="trc-remplace__champs">
        <label>
          <span>Prestation à remplacer</span>
          <select value={de} onChange={(e) => { setDe(e.target.value); setAnnee(''); setSauvee(false); }}>
            <option value="">Choisir une ligne de ses factures…</option>
            {lignes.map(([l, n]) => <option key={l} value={l}>{l} · {n} facture{n > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <label>
          <span>Par</span>
          <select value={versId} onChange={(e) => { const s = catalogue.find((x) => x.id === e.target.value); setVersId(e.target.value); if (s) setPrix(String(s.priceXof ?? '')); setSauvee(false); }}>
            <option value="">Choisir dans le catalogue…</option>
            {catalogue.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="est-court">
          <span>Prix (F)</span>
          <input inputMode="numeric" value={prix} onChange={(e) => { setPrix(e.target.value); setSauvee(false); }} />
        </label>
        <label className="est-court">
          <span>Année</span>
          <select value={annee} onChange={(e) => { setAnnee(e.target.value); setSauvee(false); }}>
            <option value="">Toutes</option>
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>

      {pret && (
        <>
          <div className="trc-remplace__dit">
            {aChanger.length} facture{aChanger.length > 1 ? 's' : ''} et {apercu.rdv.length} rendez-vous changent. Le total de chaque facture reste le même.
            {!deId && ' « ' + de + ' » n\'est pas au catalogue : les rendez-vous ne changent pas.'}
          </div>
          {apercu.pieces.length > 0 && (
            <div className="trc-annees-cadre">
              <table className="trc-annees trc-remplace__table">
                <thead>
                  <tr><th>Date</th><th>Pièce</th><th className="num">Ligne avant</th><th className="num">Ligne après</th><th>Ce qui absorbe l'écart</th><th className="num">Total</th></tr>
                </thead>
                <tbody>
                  {apercu.pieces.map((c) => {
                    const avant = c.piece.lines.find((l) => l.label === de);
                    const apres = c.apres.lines.find((l) => l.label === vers?.name);
                    const net = (l?: (typeof c.piece.lines)[number]) => (l ? ligneNetXof(l) : 0);
                    return (
                      <tr key={c.piece.id}>
                        <td>{frJourAn(c.piece.date)}</td>
                        <td className="trc-remplace__no">{(c.piece as Invoice).number}</td>
                        <td className="num">{m(net(avant))}</td>
                        <td className="num">{m(net(apres))}</td>
                        <td>
                          {!c.ok ? <b className="est-du">à reprendre à la main</b>
                            : c.ajustement ? <>prix consenti {m(c.ajustement.avant)} → {m(c.ajustement.apres)}</>
                              : c.remiseLigne ? <>remise de {m(c.remiseLigne)} sur la ligne</>
                                : c.ajoute ? <>prix consenti + {m(c.ajoute)}</>
                                  : <span className="est-nul">rien, même prix</span>}
                        </td>
                        <td className="num">{m(c.totalAvant)}{c.totalApres !== c.totalAvant ? ` → ${m(c.totalApres)}` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {aRevoir.length > 0 && (
            <div className="trc-remplace__dit est-du">
              {aRevoir.length} facture{aRevoir.length > 1 ? 's' : ''} ne retombe{aRevoir.length > 1 ? 'nt' : ''} pas sur son total (remise en pourcentage) : elle{aRevoir.length > 1 ? 's' : ''} ne sera{aRevoir.length > 1 ? 'ont' : ''} pas touchée{aRevoir.length > 1 ? 's' : ''}.
            </div>
          )}
          <div className="trc-remplace__gestes">
            <button
              type="button"
              className={sauvee ? 'mnd-btn mnd-btn--ghost' : 'mnd-btn'}
              onClick={() => {
                try { downloadBackup(); setSauvee(true); toast('Sauvegarde téléchargée. Gardez le fichier.'); } catch { toast('La sauvegarde n’a pas pu se faire. Réessayez.'); }
              }}
            >
              1. Télécharger la sauvegarde
            </button>
            <button type="button" className="mnd-btn mnd-btn--copper" disabled={!sauvee || aChanger.length + apercu.rdv.length === 0} onClick={appliquer}>
              2. Appliquer
            </button>
            {!sauvee && <span className="trc-remplace__aide">La sauvegarde d’abord.</span>}
          </div>
        </>
      )}

      {dernier && (
        <div className="trc-remplace__dit">
          Dernier remplacement, le {frJourAn(dernier.le.slice(0, 10))} : « {dernier.de} » → « {dernier.vers} ».{' '}
          <button type="button" className="trc-remplace__lien" onClick={defaire}>Défaire</button>
        </div>
      )}
    </div>
  );
}
