import { useEffect, useRef } from 'react';
import { useAuth } from '../../../shared/auth';
import { useBranch } from '../../../shared/branches';
import { fmtMoney } from '../../../shared/currency';
import { useClients } from '../../../shared/clients';
import { invoiceResteXof, invoicesStore, useInvoices } from '../../../shared/finance';
import { useAppointments } from '../../../shared/agenda';
import { envoieLeRecu, MODELE_RECU } from '../../../shared/recu-whatsapp';
import { enRouteAilleurs, marqueLaPiecePartie } from '../../../shared/une-piece-un-message-pur';
import { quandTablePrete, tablePrete } from '../../../shared/sync';
import { PART_POURBOIRE_DEFAUT, repartirPourboire, tipsStore, type Tip } from '../../../shared/tips';
import { toast } from '../../../ds/components';
import { sonne } from '../../../shared/sonnette';
import { useStaff } from '../routes/equipe/data';
import { useLaPieceEnPdf } from '../routes/vente/pdf-de-la-piece';
import { aAnnoncer, jourDuReglement, marqueLeReglement, partsDuReglement, reglementsATraiter } from '../../../shared/reglements-en-ligne-pur';

/* ══ RÉGLÉ EN DIRECT — 25 octobre 2026 (« Régler sa séance ») ═══════════
   La cliente vient de payer sa séance depuis son téléphone : la fonction
   `regler-la-seance` a posé l'argent sur la pièce. Sur tout poste ouvert,
   le Trône l'annonce (un son, un mot), partage le pourboire de l'équipe et
   envoie le reçu, chacun une seule fois (règles :
   reglements-en-ligne-pur.ts). Rien ne s'écrit avant la première lecture
   des pièces. */
const VUS = 'mnd_reglements_annonces';
const lisLesVus = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(VUS) ?? '[]') as string[]); } catch { return new Set(); }
};
const gardeLesVus = (s: Set<string>): void => {
  try { localStorage.setItem(VUS, JSON.stringify([...s].slice(-200))); } catch { /* la mémoire du poste peut manquer */ }
};

export function useReglementsEnLigne(): void {
  const { session } = useAuth();
  const { branch, currency } = useBranch();
  const [invoices] = useInvoices();
  const [appts] = useAppointments();
  const [clients] = useClients();
  const [team] = useStaff();
  const { buildPdfData } = useLaPieceEnPdf();
  const enCours = useRef(new Set<string>());

  useEffect(() => {
    if (!session || !tablePrete('invoices')) return;
    const siennes = invoices.filter((p) => p.branchId === branch.id && (p.reglementsEnLigne?.length ?? 0) > 0);
    if (!siennes.length) return;
    const maintenant = Date.now();
    const aujourdhui = jourDuReglement(new Date(maintenant).toISOString());

    /* ① L'annonce. */
    const vus = lisLesVus();
    let annonce = false;
    for (const p of siennes) {
      for (const r of p.reglementsEnLigne ?? []) {
        if (!aAnnoncer(r, maintenant, vus)) continue;
        vus.add(r.id);
        annonce = true;
        const qui = p.clientName ?? clients.find((c) => c.id === p.clientId)?.name ?? 'Une cliente';
        /* DÉPART SANS CAISSE (6 novembre 2026, Terminer et régler) : elle avait
           terminé elle-même et sa pièce est soldée ; rien à encaisser au comptoir. */
        const sansCaisse = !!appts.find((a) => a.id === p.apptId)?.termineParElle && invoiceResteXof(p) <= 0;
        toast(`Réglé en direct · ${qui} · ${fmtMoney(r.montantXof, currency)}${r.moyen ? ` par ${r.moyen}` : ''}${r.pourboireXof > 0 ? ` · pourboire ${fmtMoney(r.pourboireXof, currency)} pour l’équipe` : ''}${sansCaisse ? ' · Départ sans caisse' : ''}.`, 7000);
      }
    }
    if (annonce) { gardeLesVus(vus); sonne(); }

    /* ② Le pourboire et le reçu. */
    for (const t of reglementsATraiter(siennes, aujourdhui)) {
      const cle = `${t.r.id}:${t.parts ? 'p' : ''}${t.recu ? 'r' : ''}`;
      if (enCours.current.has(cle)) continue;
      enCours.current.add(cle);
      const piece = siennes.find((p) => p.id === t.pieceId);
      if (!piece) continue;
      const nomDeLaCliente = piece.clientName ?? clients.find((c) => c.id === piece.clientId)?.name;

      if (t.parts) {
        quandTablePrete('tips', () => {
          const membres = team.filter((s) => s.branchId === branch.id).map((s) => ({ id: s.id, part: s.partPourboire ?? PART_POURBOIRE_DEFAUT }));
          const lignes = partsDuReglement(t.r, repartirPourboire(t.r.pourboireXof, membres), piece.id, nomDeLaCliente ?? undefined);
          if (!lignes.length) return;
          /* L'instant de l'inscription (5 novembre 2026) : l'écran de chacun
             dit « à l'instant » sur sa part. */
          const quand = new Date().toISOString();
          tipsStore.set((prev) => [...prev, ...(lignes.filter((l) => !prev.some((x) => x.id === l.id)).map((l) => ({ ...l, inscritLe: quand })) as Tip[])]);
          invoicesStore.set((prev) => prev.map((p) => (p.id === piece.id ? marqueLeReglement(p, t.r.id, 'partsLe', quand) : p)));
        });
      }

      if (t.recu) {
        const payeuse = clients.find((c) => c.id === piece.clientId);
        const soignee = clients.find((c) => c.id === (piece.forClientId ?? piece.clientId));
        const destinataire = payeuse?.phone?.trim() ? payeuse : soignee;
        if (!destinataire?.phone?.trim()) continue;
        void envoieLeRecu({
          client: { ...destinataire, branchId: destinataire.branchId }, pdf: buildPdfData(piece),
          montant: fmtMoney(t.r.montantXof + (t.r.pourboireXof ?? 0), currency), jourIso: jourDuReglement(t.r.payeLe),
          parQui: 'la Maison, automatiquement', cleUnique: `recu-en-ligne-${t.r.id}`,
        }).then((r) => {
          /* Parti, ou déjà parti d'un autre poste (la clé d'unicité répond
             « déjà », donc ok) : on le marque. Un refus se retentera au
             prochain chargement.
             ET LA PIÈCE PORTE SA MARQUE « PARTIE » (1er novembre 2026,
             une-piece-un-message-pur.ts) : le comptoir ne renverra plus ce
             papier après un règlement en ligne. La clé `recu-en-ligne-…`
             reste la sienne : ce reçu répond à SON geste, pas à une retouche
             du comptoir. Jamais de marque sur un envoi gardé hors ligne :
             rien n'est encore parti. Ni sur un « deja » sans waId : l'autre
             poste attend encore Meta, et si Meta refuse, rien ne sera parti. */
          if (r.ok) {
            const quand = new Date().toISOString();
            const partie = r.enAttente || enRouteAilleurs(r) ? null : {
              partieLe: r.quand ?? quand, modele: MODELE_RECU, parQui: 'la Maison, automatiquement', ...(r.deja ? { dAilleurs: true as const } : {}),
            };
            invoicesStore.set((prev) => prev.map((p) => {
              if (p.id !== piece.id) return p;
              const q = marqueLeReglement(p, t.r.id, 'recuLe', quand);
              return partie ? marqueLaPiecePartie(q, partie) : q;
            }));
          } else {
            console.warn('[réglé en direct] reçu :', r.erreur);
          }
        });
      }
    }
  }, [session, branch.id, invoices, appts, clients, team, currency, buildPdfData]);
}
