import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { expensesStore, useExpenses } from '../../../../shared/finance';
import { openingForIso } from '../../../../shared/settings';
import { SEUIL_REASSORT, useProducts } from '../../../../shared/catalog';
import {
  ajouterLigneCommande, commandesAchatStore, creerCommande, reappro, useCommandesAchat, useFournisseurs, useMouvementsStock, useProduitsStock,
} from '../../../../shared/stock';
import { useBrouillonsDAvis } from '../../../../shared/ia-avis';
import { estSansReponse, idDeLAvis } from '../../../../shared/ia-avis-pur';
import {
  chargeDuJour, depensesEnAttente, depensesSansJustificatif, etatDesAvis, gammeAReassortir, rangementsProposes, tauxDit,
  SEUIL_DU_JUSTIFICATIF_XOF,
} from '../../../../shared/agents-maison-pur';
import { useReleveDesAvis } from '../clients/releve-des-avis';
import { addDaysISO, apptDurationMin, timeToMin, todayISO, useBranchAppointments, useServicesById } from '../clients/_shared';

/* ═══════════════════════════════════════════════════════════════════
   LES QUATRE AUTRES AGENTS — 24 octobre 2026 (« Construis les quatre
   autres agents »). Les règles : `shared/agents-maison-pur.ts`. Chacun lit
   et propose ; chaque geste est un clic, et aucun n'écrit à une cliente ni
   à un fournisseur.

   DES CHIFFRES, PAS DES PHRASES (« moins de textes, je veux des
   démonstrations de calculs, de chiffres, avec des totaux prévisionnels »,
   même soir) : chaque agent montre un petit tableau et sa ligne de total. */

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const jourDit = (iso: string) => {
  const [a, m, j] = iso.split('-').map(Number);
  return `${JOURS[new Date(Date.UTC(a, m - 1, j)).getUTCDay()]} ${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`;
};
const heureDite = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`; };

/** L'en-tête d'un agent : son nom, son rythme et son autonomie, en deux mots. */
export function TeteDAgent({ nom, rythme, autonomie }: { nom: string; rythme: string; autonomie: string }) {
  return (
    <div className="agt-entre">
      <h3>{nom}</h3>
      <span className="agt-etiquettes"><span className="agt-etat est-on">{rythme}</span><span className="agt-etiquette">{autonomie}</span></span>
    </div>
  );
}

/** UN PETIT TABLEAU DE CHIFFRES : libellé, nombre, montant, geste ; et sa
    ligne de total quand elle a un sens. */
export function Chiffres({ lignes, total }: {
  lignes: { libelle: ReactNode; nombre?: number | string; montant?: string; geste?: ReactNode; alerte?: boolean }[];
  total?: { libelle: string; nombre?: number | string; montant?: string };
}) {
  return (
    <div className="agt-defile">
      <table className="agt-chiffres-table">
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className={l.alerte ? 'est-alerte' : ''}>
              <th scope="row">{l.libelle}</th>
              <td>{l.nombre ?? ''}</td>
              <td>{l.montant ?? ''}</td>
              <td className="agt-chiffres-table__geste">{l.geste ?? null}</td>
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr><th scope="row">{total.libelle}</th><td>{total.nombre ?? ''}</td><td>{total.montant ?? ''}</td><td /></tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Lien({ vers, children }: { vers: string; children: string }) {
  const navigate = useNavigate();
  return <button type="button" className="agt-lien" onClick={() => navigate(vers)}>{children} ›</button>;
}

/* ═══ LE PLANNING ═══════════════════════════════════════════════════ */
export function AgentDuPlanning({ preparerUneListe }: { preparerUneListe: () => void }) {
  const { branch } = useBranch();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const jours = useMemo(() => {
    const aujourdhui = todayISO();
    return Array.from({ length: 14 }, (_, k) => addDaysISO(aujourdhui, k + 1)).map((iso) => chargeDuJour({
      iso,
      ouverture: openingForIso(iso),
      sieges: Math.max(0, branch.seats ?? 0),
      rdvs: appts.filter((a) => a.date === iso && a.status !== 'annulé').map((a) => ({ debutMin: timeToMin(a.time), dureeMin: apptDurationMin(a, byId) })),
    }));
  }, [appts, byId, branch.seats]);
  const ouverts = jours.filter((j) => j.etat !== 'ferme');
  const capacite = ouverts.reduce((s, j) => s + j.capaciteMin, 0);
  const occupe = ouverts.reduce((s, j) => s + Math.min(j.occupeMin, j.capaciteMin), 0);
  const creux = jours.filter((j) => j.etat === 'creux');
  const pleins = jours.filter((j) => j.etat === 'plein');
  const alertes = jours.filter((j) => j.trop.length > 0 || j.surFerme > 0);
  const sansAnnee = (iso: string) => jourDit(iso).replace(/ \d{4}$/, '');
  return (
    <section className="agt-carte agt-agent" aria-label="L’agent du planning">
      <TeteDAgent nom="Le planning" rythme="14 jours" autonomie="propose" />
      <div className="agt-barres" role="img" aria-label="La part des fauteuils occupée, jour par jour, sur 14 jours">
        {jours.map((j) => (
          <span key={j.iso} className={`agt-barre est-${j.etat}`} title={`${jourDit(j.iso)} · ${j.etat === 'ferme' ? 'fermé' : `${tauxDit(j.taux)} · ${j.rdv} rendez-vous`}`}>
            <em>{j.etat === 'ferme' ? '' : Math.round(Math.min(j.taux, 9.99) * 100)}</em>
            <i style={{ height: `${j.etat === 'ferme' ? 0 : Math.max(4, Math.min(100, j.taux * 100)) * 0.62}%` }} />
            <b>{Number(j.iso.slice(8, 10))}</b>
          </span>
        ))}
      </div>
      <Chiffres
        lignes={[
          { libelle: 'Fauteuils occupés', nombre: capacite ? tauxDit(occupe / capacite) : '0 %', montant: `${Math.round(occupe / 60)} h sur ${Math.round(capacite / 60)} h` },
          { libelle: <>Jours creux <span className="agt-doux">(moins de 35 %)</span></>, nombre: creux.length, montant: creux.slice(0, 2).map((j) => sansAnnee(j.iso)).join(', '),
            geste: creux.length > 0 ? <button type="button" className="agt-lien" onClick={preparerUneListe}>Proposer aux reprises ›</button> : null },
          { libelle: <>Jours pleins <span className="agt-doux">(90 % et plus)</span></>, nombre: pleins.length, montant: pleins.slice(0, 2).map((j) => sansAnnee(j.iso)).join(', ') },
          ...alertes.map((j) => ({
            libelle: jourDit(j.iso),
            nombre: j.surFerme > 0 ? `${j.surFerme} sur jour fermé` : `${Math.max(...j.trop.map((t) => t.tetes))} têtes pour ${branch.seats}`,
            montant: j.trop.map((t) => heureDite(t.heure)).join(', '),
            geste: <Lien vers="/calendrier">Le calendrier</Lien>, alerte: true,
          })),
        ]}
        total={{ libelle: 'Heures-fauteuil libres', nombre: `${Math.round((capacite - occupe) / 60)} h` }}
      />
    </section>
  );
}

/* ═══ LA COMPTABILITÉ ═══════════════════════════════════════════════ */
export function AgentDeLaComptabilite() {
  const { branch, currency } = useBranch();
  const [depenses] = useExpenses();
  const debutDuMois = `${todayISO().slice(0, 7)}-01`;
  const sansPiece = useMemo(() => depensesSansJustificatif(depenses, branch.id, debutDuMois), [depenses, branch.id, debutDuMois]);
  const attente = useMemo(() => depensesEnAttente(depenses, branch.id), [depenses, branch.id]);
  const aRanger = useMemo(() => rangementsProposes(depenses, branch.id), [depenses, branch.id]);
  const montantDe = (ids: readonly string[]) => depenses.filter((d) => ids.includes(d.id)).reduce((s, d) => s + d.amountXof, 0);
  const fmt = (x: number) => fmtMoney(x, currency);
  const ranger = (id: string, vers: string, sous?: string) => {
    expensesStore.set((prev) => prev.map((d) => (d.id === id ? { ...d, category: vers, subcategory: sous } : d)));
    toast(`Rangée en « ${vers} ».`);
  };
  return (
    <section className="agt-carte agt-agent" aria-label="L’agent de la comptabilité">
      <TeteDAgent nom="La comptabilité" rythme="à chaque dépense" autonomie="range après votre clic" />
      <Chiffres
        lignes={[
          { libelle: <>Sans justificatif <span className="agt-doux">(ce mois, dès {fmt(SEUIL_DU_JUSTIFICATIF_XOF)})</span></>, nombre: sansPiece.length, montant: fmt(sansPiece.reduce((s, d) => s + d.amountXof, 0)), geste: <Lien vers="/depenses">Joindre</Lien> },
          { libelle: 'Attendent votre oui', nombre: attente.length, montant: fmt(attente.reduce((s, d) => s + d.amountXof, 0)), geste: <Lien vers="/depenses">Décider</Lien> },
          { libelle: 'En « Divers », à ranger', nombre: aRanger.length, montant: fmt(montantDe(aRanger.map((r) => r.depenseId))) },
          ...aRanger.slice(0, 4).map((r) => ({
            libelle: <span className="agt-doux">{r.label} → {r.vers}</span>,
            geste: <Button size="sm" variant="ghost" onClick={() => ranger(r.depenseId, r.vers, r.sous)}>Ranger en {r.vers}</Button>,
          })),
        ]}
        total={{ libelle: 'À reprendre', nombre: sansPiece.length + attente.length + aRanger.length }}
      />
    </section>
  );
}

/* ═══ LES AVIS ══════════════════════════════════════════════════════ */
export function AgentDesAvis() {
  const releve = useReleveDesAvis();
  const [brouillons] = useBrouillonsDAvis();
  const etat = useMemo(() => (releve ? etatDesAvis(releve.avis, (a) => estSansReponse(a, brouillons[idDeLAvis(a)]), (a) => brouillons[idDeLAvis(a)]) : null), [releve, brouillons]);
  const note = (x: number | null | undefined) => (x === null || x === undefined ? '' : `${String(x).replace('.', ',')} / 5`);
  return (
    <section className="agt-carte agt-agent" aria-label="L’agent des avis">
      <TeteDAgent nom="Les avis" rythme="à chaque avis Google" autonomie="propose" />
      {!releve || !etat
        ? <p className="agt-doux">Le relevé des avis n’est pas encore descendu.</p>
        : (
          <Chiffres
            lignes={[
              { libelle: 'Note sur Google', nombre: note(releve.note), montant: `${releve.nombre} avis` },
              { libelle: 'Les dix derniers', nombre: note(etat.noteRecente) },
              { libelle: 'Réponses prêtes à copier', nombre: etat.prets, geste: <Lien vers="/vitrine?onglet=avis">Copier</Lien> },
              { libelle: 'Réponses à préparer', nombre: etat.sansBrouillon },
            ]}
            total={{ libelle: 'Sans réponse', nombre: etat.sansReponse }}
          />
        )}
    </section>
  );
}

/* ═══ LE STOCK ══════════════════════════════════════════════════════ */
export function AgentDuStock() {
  const { branch, currency } = useBranch();
  const [produits] = useProduitsStock();
  const [mouvements] = useMouvementsStock();
  const [fournisseurs] = useFournisseurs();
  const [commandes] = useCommandesAchat();
  const [gamme] = useProducts();
  const groupes = useMemo(() => reappro(produits, mouvements, branch.id), [produits, mouvements, branch.id]);
  const bas = useMemo(() => gammeAReassortir(gamme, SEUIL_REASSORT), [gamme]);
  const nomDu = (id: string) => fournisseurs.find((f) => f.id === id)?.nom;
  const brouillonChez = (fid: string) => commandes.find((c) => c.branchId === branch.id && c.fournisseurId === fid && c.statut === 'brouillon');
  const fmt = (x: number) => fmtMoney(x, currency);
  const totalDesBons = [...groupes.values()].reduce((s, liste) => s + liste.reduce((n, l) => n + l.coutEstimeXof, 0), 0);
  const nombreDeProduits = [...groupes.values()].reduce((s, liste) => s + liste.length, 0);

  /* LE MÊME GESTE QUE « PRÉPARER LE BON » DE STOCK & ACHATS : un bon en
     brouillon, qui attend d'être relu et envoyé là-bas. Jamais deux
     brouillons chez le même fournisseur. */
  const preparerLeBon = (fid: string) => {
    if (brouillonChez(fid)) { toast(`Un bon en brouillon attend déjà chez ${nomDu(fid) ?? 'ce fournisseur'}, dans Stock & Achats.`); return; }
    const liste = groupes.get(fid) ?? [];
    const r = creerCommande(branch.id, fid, todayISO());
    if (!r.ok || !r.id) { toast(r.erreur ?? 'Le bon n’a pas pu être préparé.'); return; }
    const cmd = commandesAchatStore.get().find((c) => c.id === r.id);
    if (cmd) for (const l of liste) ajouterLigneCommande(cmd, l.produit, l.aCommander);
    toast(`Bon préparé chez ${nomDu(fid) ?? 'le fournisseur'}, en brouillon : à relire et envoyer depuis Stock & Achats.`);
  };

  return (
    <section className="agt-carte agt-agent" aria-label="L’agent du stock">
      <TeteDAgent nom="Le stock" rythme="chaque jour" autonomie="bon en brouillon" />
      <Chiffres
        lignes={[
          ...[...groupes.entries()].map(([fid, liste]) => ({
            libelle: fid ? nomDu(fid) ?? 'Un fournisseur' : 'Sans fournisseur',
            nombre: `${liste.length} produit${liste.length > 1 ? 's' : ''}`,
            montant: fmt(liste.reduce((s, l) => s + l.coutEstimeXof, 0)),
            geste: fid
              ? (brouillonChez(fid) ? <Lien vers="/home-rituals">Le bon attend</Lien> : <Button size="sm" variant="ghost" onClick={() => preparerLeBon(fid)}>Préparer le bon</Button>)
              : <Lien vers="/home-rituals">Désigner</Lien>,
          })),
          { libelle: <>Gamme à {SEUIL_REASSORT} ou moins</>, nombre: bas.length, montant: bas.slice(0, 2).map((p) => `${p.name} (${p.stock})`).join(', '), geste: bas.length ? <Lien vers="/home-rituals">Réassortir</Lien> : null },
        ]}
        total={{ libelle: 'Total des bons à préparer', nombre: nombreDeProduits ? `${nombreDeProduits} produit${nombreDeProduits > 1 ? 's' : ''}` : '0', montant: fmt(totalDesBons) }}
      />
    </section>
  );
}
