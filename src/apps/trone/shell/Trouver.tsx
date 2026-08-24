import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { NAV, peutVoir, voitLesPrix } from '../routes/index';
import { staffAccessStore } from '../routes/equipe/data';
import { useStore } from '../../../shared/store';
import { useBranch } from '../../../shared/branches';
import { fmtMoney } from '../../../shared/currency';
import { useClients } from '../../../shared/clients';
import { useInvoices, invoiceTotal } from '../../../shared/finance';
import { useServices, useCategories } from '../../../shared/catalog';
import { useStaff } from '../../../shared/auth';
import { frShort } from '../routes/clients/_shared';

/* TROUVER — la recherche globale du Trône (chantier ② de la refonte validée).

   Le remède direct à « retrouver une info prend du temps » : un seul champ,
   depuis partout (Ctrl K, ou le bouton de la topbar), quatre groupes de
   résultats — clientes, factures & devis, prestations, écrans — et l'entrée
   ouvre directement la fiche, la pièce ou l'écran.

   LA RECHERCHE RESPECTE LES ACCÈS, groupe par groupe : elle passe par les
   MÊMES juges que la barre latérale (`peutVoir`) et que les montants
   (`voitLesPrix`). Un maître qui n'ouvre que son mois et le calendrier ne
   verra ni clientes, ni factures, ni prix — chercher ne doit pas être une
   porte dérobée. Ce n'est toujours qu'une garde d'écran : la vraie barrière
   reste la RLS, côté serveur. */

type Resultat = {
  k: string;
  label: string;
  sub?: string;
  extra?: string;
  go: () => void;
};
type Groupe = { nom: string; items: Resultat[] };

/* « Aïcha » se cherche « aicha » : on aplatit accents et casse des deux côtés. */
const fold = (v?: string | null): string =>
  (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const chiffres = (v?: string | null): string => (v ?? '').replace(/\D/g, '');

const PAR_GROUPE = 5; // la palette propose, elle ne liste pas — l'écran dédié liste

export default function Trouver() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const staff = useStaff();
  const role = staff?.role;
  const acces = useStore(staffAccessStore)[0];
  const mesDomaines = acces[staff?.user_id ?? ''] ?? {};
  const prix = voitLesPrix(role, mesDomaines);

  const [clients] = useClients();
  const [invoices] = useInvoices();
  const [services] = useServices();
  const [categories] = useCategories();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [actif, setActif] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const ouvrir = () => { setQ(''); setActif(0); setOpen(true); };
  const fermer = () => setOpen(false);

  /* Ctrl K / Cmd K depuis n'importe quel écran — le clavier du PC de pilotage. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => {
          if (!o) { setQ(''); setActif(0); }
          return !o;
        });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const needle = fold(q).trim();
  const tel = chiffres(q);

  const groupes: Groupe[] = useMemo(() => {
    /* Deux lettres au moins — ou quatre chiffres pour un téléphone : en dessous,
       tout matche et la palette crie au lieu de proposer. */
    if (needle.length < 2 && tel.length < 4) return [];
    const gs: Groupe[] = [];

    if (peutVoir(role, '/customers', mesDomaines)) {
      const tetes = clients
        .filter((c) => c.branchId === branch.id && !c.archived)
        .filter((c) => (needle.length >= 2 && fold(c.name).includes(needle))
          || (tel.length >= 4 && chiffres(c.phone).includes(tel)))
        /* Celle dont le nom COMMENCE par la saisie d'abord — c'est presque
           toujours elle qu'on cherche. */
        .sort((a, b) => Number(fold(b.name).startsWith(needle)) - Number(fold(a.name).startsWith(needle))
          || a.name.localeCompare(b.name, 'fr'))
        .slice(0, PAR_GROUPE)
        .map((c): Resultat => ({
          k: `c-${c.id}`,
          label: c.name,
          sub: c.phone || 'sans téléphone',
          go: () => navigate(`/customers?id=${c.id}`),
        }));
      if (tetes.length) gs.push({ nom: 'Clientes', items: tetes });
    }

    if (peutVoir(role, '/factures', mesDomaines)) {
      const nomDe = (id: string) => clients.find((c) => c.id === id)?.name;
      const pieces = invoices
        .filter((i) => i.branchId === branch.id)
        .filter((i) => fold(i.number).includes(needle)
          || (needle.length >= 2 && (fold(i.clientName).includes(needle) || fold(nomDe(i.clientId)).includes(needle))))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, PAR_GROUPE)
        .map((i): Resultat => ({
          k: `i-${i.id}`,
          label: `${i.number} · ${i.clientName || nomDe(i.clientId) || 'sans cliente'}`,
          sub: `${frShort(i.date)} · ${i.status}`,
          extra: fmtMoney(invoiceTotal(i), currency),
          go: () => navigate(`/factures?id=${i.id}`),
        }));
      if (pieces.length) gs.push({ nom: 'Factures & devis', items: pieces });
    }

    if (peutVoir(role, '/catalogue', mesDomaines) && needle.length >= 2) {
      const catDe = (id: string) => categories.find((c) => c.id === id);
      const prestations = services
        .filter((s) => fold(s.name).includes(needle))
        .sort((a, b) => Number(fold(b.name).startsWith(needle)) - Number(fold(a.name).startsWith(needle))
          || a.name.localeCompare(b.name, 'fr'))
        .slice(0, PAR_GROUPE)
        .map((s): Resultat => {
          const cat = catDe(s.categoryId);
          return {
            k: `s-${s.id}`,
            label: s.name,
            sub: cat ? `${cat.fon} · ${cat.label}` : undefined,
            /* Le prix de repli — celui que la Vitrine annonce « dès ». Et
               seulement pour qui voit les prix : même juge que la Caisse. */
            extra: prix && s.priceXof > 0 ? fmtMoney(s.priceXof, currency) : undefined,
            go: () => navigate('/catalogue'),
          };
        });
      if (prestations.length) gs.push({ nom: 'Prestations', items: prestations });
    }

    if (needle.length >= 2) {
      /* Les écrans — y compris ceux hors menu (le Comptoir) : joignables sans
         être affichés, c'est exactement ce qu'une recherche sait retrouver. */
      const ecrans = NAV.flatMap((g) => g.items.map((it) => ({ g: g.group, it })))
        .filter(({ it }) => peutVoir(role, it.path, mesDomaines))
        .filter(({ g, it }) => fold(it.label).includes(needle) || fold(g).includes(needle))
        .slice(0, PAR_GROUPE)
        .map(({ g, it }): Resultat => ({
          k: `e-${it.path}`,
          label: it.label,
          sub: g,
          go: () => navigate(it.path),
        }));
      if (ecrans.length) gs.push({ nom: 'Écrans', items: ecrans });
    }

    return gs;
  }, [needle, tel, role, mesDomaines, clients, invoices, services, categories, branch.id, currency, prix, navigate]);

  const plat = useMemo(() => groupes.flatMap((g) => g.items), [groupes]);

  useEffect(() => { setActif(0); }, [needle, tel]);
  useEffect(() => {
    document.getElementById(`trf-r-${actif}`)?.scrollIntoView({ block: 'nearest' });
  }, [actif]);

  const clavier = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); fermer(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif((i) => Math.min(i + 1, plat.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActif((i) => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' && plat[actif]) { e.preventDefault(); plat[actif].go(); fermer(); }
  };

  return (
    <>
      <button className="trf-trigger" onClick={ouvrir} title="Trouver, une cliente, une facture, une prestation, un écran (Ctrl K)">
        <Search size={14} />
        <span className="trf-trigger__label">Trouver</span>
        <kbd className="trf-trigger__kbd">Ctrl K</kbd>
      </button>

      {open && createPortal(
        <div className="trf-veil" onClick={fermer}>
          <div className="trf-box" role="dialog" aria-label="Trouver" onClick={(e) => e.stopPropagation()}>
            <div className="trf-field">
              <Search size={15} style={{ flex: 'none', opacity: 0.55 }} />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={clavier}
                placeholder="Une cliente, une facture, une prestation, un écran…"
                aria-label="Trouver"
              />
              <kbd className="trf-trigger__kbd">Échap</kbd>
            </div>
            {needle.length < 2 && tel.length < 4 ? (
              <div className="trf-hint">Tapez deux lettres au moins, ou un bout de numéro de téléphone.</div>
            ) : plat.length === 0 ? (
              <div className="trf-hint">Rien pour «&nbsp;{q.trim()}&nbsp;». Essayez le téléphone, ou une autre orthographe.</div>
            ) : (
              <div className="trf-results">
                {groupes.map((g) => (
                  <div key={g.nom} className="trf-group">
                    <div className="trf-group__name">{g.nom}</div>
                    {g.items.map((r) => {
                      const idx = plat.indexOf(r);
                      return (
                        <button
                          key={r.k}
                          id={`trf-r-${idx}`}
                          className={`trf-row ${idx === actif ? 'is-active' : ''}`}
                          onMouseEnter={() => setActif(idx)}
                          onClick={() => { r.go(); fermer(); }}
                        >
                          <span className="trf-row__label">{r.label}</span>
                          {r.sub && <span className="trf-row__sub">{r.sub}</span>}
                          {r.extra && <span className="trf-row__extra">{r.extra}</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
