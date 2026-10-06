import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageHead } from '../_ui';
import { Button, Card, Field, Input, Modal, Select, Textarea, toast } from '../../../../ds/components';
import { Pill, Tabs } from '../equipe/ui';
import { ChampDeDate } from '../../../../ds/dates';
import { ChoisirUnePiece, TAILLE_MAX, ouvreLaPiece } from '../_piece';
import { authEnabled, useStaff as useMoi } from '../../../../shared/auth';
import { maisonNom, maisonRaison, maisonVille } from '../../../../shared/identite';
import {
  COFFRE_VIDE, EMPLOI_VIDE, ENFANT_VIDE, MOT_DE_L_ETAT, MOT_DE_L_EXPIRATION, MOT_DU_RYTHME, RUBRIQUES,
  champsVides, collecteDuMois, dateEnLettres, echeanceDeCollecte, etatDExpiration, etatDuDossier, jourIso,
  lettreDuDossier, lignesDuBordereau, moisACollecter, moisAttendus, moisEnLettres, ordreDAssemblage,
  piecesAExpirer, retroPlanning, rubriquesSansObjet,
  type Campagne, type ContenuDuCoffre, type Emploi, type Enfant, type EtatDeRubrique, type Fiche, type GenreDeLettre,
  type Lettre, type Piece, type Rubrique, type Rythme,
} from '../../../../shared/bourse';
import {
  campagneCourante, chargeLaPiece, corrigeUnePiece, deposeUnePiece, ecritLaFiche, litLeCoffre, modifieLaCampagne,
  retireUnePiece, useBourse, useCoffreCache,
} from '../../../../shared/bourse-coffre';
import { assembleLeDossier, bordereauPdf, lettrePdf, telechargeLeFichier, type SourceAssemblee } from '../../../../shared/bourse-pdf';
import './bourse.css';

/* ══ LE DOSSIER DE BOURSE — 6 octobre 2026 ═══════════════════════════════

   « Bâtis dans le Trône une page Dossier de bourse au secrétariat : le
   coffre des pièces permanentes avec leurs dates d'expiration, le rappel
   mensuel de collecte, la lettre et les attestations générées depuis
   l'identité de la Maison, et le PDF assemblé dans l'ordre de la liste »
   (Yéman). Le dossier prenait deux à trois semaines chaque février ; ici
   il se remplit cinq minutes par mois, et le jour du dépôt n'assemble que
   ce qui existe déjà.

   LE JUGEMENT EST DANS `shared/bourse`, LE COFFRE DANS `shared/bourse-coffre`,
   LES PAPIERS DANS `shared/bourse-pdf` : cet écran ne fait que montrer et
   poser. Il est réservé à la direction (le dossier dit une famille), et il
   ne porte aucun nom : tout vient de la fiche, rangée au coffre. */

type Onglet = 'dossier' | 'coffre' | 'collecte' | 'lettres' | 'fiche';
const ONGLETS: { k: Onglet; l: string }[] = [
  { k: 'dossier', l: 'Le dossier' }, { k: 'coffre', l: 'Le coffre' }, { k: 'collecte', l: 'La collecte' },
  { k: 'lettres', l: 'Les lettres' }, { k: 'fiche', l: 'La fiche' },
];

const TON: Record<EtatDeRubrique, 'ok' | 'warn' | 'error' | 'muted' | 'copper'> = {
  fournie: 'ok', 'a-rediger': 'copper', manquante: 'warn', 'sans-objet': 'muted', expiree: 'error',
};
const RYTHMES: Rythme[] = ['permanent', 'mensuel', 'janvier', 'redige'];
const maison = () => ({ nom: maisonNom(), raison: maisonRaison(), ville: maisonVille() });

export default function DossierBourse() {
  const moi = useMoi();
  const estDirection = !authEnabled || moi?.role === 'souverain' || moi?.role === 'gerant';
  const [dossier] = useBourse();
  const [cache] = useCoffreCache();
  const [onglet, setOnglet] = useState<Onglet>('dossier');
  const [lecture, setLecture] = useState<'en-cours' | 'coffre' | 'cache' | 'absent'>('en-cours');
  const aujourdhui = jourIso(new Date());

  /* La campagne courante se crée au premier passage, hors du rendu. */
  useEffect(() => { if (estDirection) campagneCourante(aujourdhui); }, [estDirection, aujourdhui]);
  const campagne = useMemo<Campagne | undefined>(
    () => dossier.campagnes.find((c) => c.id === dossier.courante) ?? dossier.campagnes[dossier.campagnes.length - 1],
    [dossier],
  );
  const contenu: ContenuDuCoffre = (campagne && cache[campagne.id]) || COFFRE_VIDE;

  useEffect(() => {
    if (!campagne || !estDirection) return;
    let vivant = true;
    setLecture('en-cours');
    litLeCoffre(campagne.id).then((c) => {
      if (!vivant) return;
      setLecture(c ? 'coffre' : cache[campagne.id] ? 'cache' : 'absent');
    });
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campagne?.id, estDirection]);

  if (!estDirection) {
    return (
      <>
        <PageHead eyebrow="Secrétariat" title="Dossier de bourse" />
        <Card><div className="bse-garde">Réservé à la direction : ce dossier dit une famille, des enfants et des salaires.</div></Card>
      </>
    );
  }
  if (!campagne) return <PageHead eyebrow="Secrétariat" title="Dossier de bourse" sub="Préparation de la campagne…" />;

  const etat = etatDuDossier(contenu.pieces, contenu.fiche, aujourdhui, campagne.dateDepot);
  const compte = (e: EtatDeRubrique) => etat.filter((l) => l.etat === e).length;
  const aExpirer = piecesAExpirer(contenu.pieces, aujourdhui, campagne.dateDepot);
  const sousTitre = lecture === 'coffre' ? 'Lu au coffre de la direction.'
    : lecture === 'cache' ? 'Coffre injoignable : vous lisez la copie de ce poste.'
      : lecture === 'absent' ? 'Rien au coffre encore : la fiche et les pièces s’y rangeront au premier dépôt.' : 'Lecture du coffre…';

  return (
    <>
      <PageHead
        eyebrow="Secrétariat"
        title={`Dossier de bourse · campagne ${campagne.anneeScolaire}`}
        sub={`Revenus de l’année ${campagne.anneeReference}. ${sousTitre}`}
      />
      <Tabs tabs={ONGLETS} value={onglet} onChange={setOnglet} />
      {onglet === 'dossier' && (
        <OngletDossier campagne={campagne} contenu={contenu} aujourdhui={aujourdhui} compte={compte} aExpirer={aExpirer} etat={etat} versCoffre={() => setOnglet('coffre')} />
      )}
      {onglet === 'coffre' && <OngletCoffre campagne={campagne} contenu={contenu} aujourdhui={aujourdhui} />}
      {onglet === 'collecte' && <OngletCollecte campagne={campagne} contenu={contenu} aujourdhui={aujourdhui} versCoffre={() => setOnglet('coffre')} />}
      {onglet === 'lettres' && <OngletLettres campagne={campagne} contenu={contenu} aujourdhui={aujourdhui} />}
      {onglet === 'fiche' && <OngletFiche campagne={campagne} contenu={contenu} />}
    </>
  );
}

/* ── Le dossier : l'état, le bordereau, l'assemblage ────────────────── */
function OngletDossier({ campagne, contenu, aujourdhui, compte, aExpirer, etat, versCoffre }: {
  campagne: Campagne; contenu: ContenuDuCoffre; aujourdhui: string;
  compte: (e: EtatDeRubrique) => number; aExpirer: Piece[];
  etat: ReturnType<typeof etatDuDossier>; versCoffre: () => void;
}) {
  const [travail, setTravail] = useState<'' | 'bordereau' | 'assemblage'>('');
  const [dateDuDepot, setDateDuDepot] = useState('');

  const bordereau = async () => {
    setTravail('bordereau');
    try {
      const pdf = await bordereauPdf({
        titre: `Bordereau du dossier de demande de bourse scolaire · ${campagne.anneeScolaire}`,
        sousTitre: `Campagne boursière ${campagne.anneeScolaire} · année de référence ${campagne.anneeReference}`,
        lignes: lignesDuBordereau(contenu.pieces, contenu.fiche, aujourdhui, campagne.dateDepot),
        date: dateDuDepot || aujourdhui,
      });
      telechargeLeFichier(pdf, `01-bordereau-${campagne.anneeScolaire}.pdf`);
    } finally { setTravail(''); }
  };

  const assemble = async () => {
    setTravail('assemblage');
    try {
      const ordre = ordreDAssemblage(contenu.pieces, contenu.fiche, aujourdhui, campagne.dateDepot);
      const salaries = contenu.fiche.emplois.filter((e) => e.statut === 'salarie');
      let iEmploi = 0;
      const sources: SourceAssemblee[] = [];
      for (const el of ordre) {
        if (el.genre === 'bordereau') {
          sources.push({ element: el, pdf: await bordereauPdf({
            titre: `Bordereau du dossier de demande de bourse scolaire · ${campagne.anneeScolaire}`,
            sousTitre: `Campagne boursière ${campagne.anneeScolaire} · année de référence ${campagne.anneeReference}`,
            lignes: lignesDuBordereau(contenu.pieces, contenu.fiche, aujourdhui, campagne.dateDepot), date: dateDuDepot || aujourdhui,
          }) });
        } else if (el.genre === 'lettre') {
          const emploi = el.lettre === 'employeur' ? salaries[iEmploi++] : undefined;
          const l = lettreDuDossier(el.lettre, contenu.fiche, campagne, maison(), { mois: el.mois, emploi, date: dateDuDepot || undefined });
          if (l) sources.push({ element: el, pdf: await lettrePdf(l) });
        } else {
          sources.push({ element: el, piece: await chargeLaPiece(el.piece), nom: el.piece.nom });
        }
      }
      const r = await assembleLeDossier(sources);
      telechargeLeFichier(r.octets, `dossier-bourse-${campagne.anneeScolaire}.pdf`);
      toast(`Dossier assemblé : ${r.pages} page${r.pages > 1 ? 's' : ''}.${r.manquees.length ? ` ${r.manquees.length} pièce(s) illisible(s), signalée(s) dans le PDF.` : ''}`);
    } catch (e) {
      console.warn('[mnd-bourse] assemblage :', e);
      toast('L’assemblage a échoué. Le coffre répond-il ?');
    } finally { setTravail(''); }
  };

  return (
    <>
      <div className="bse-grille">
        <Card className="bse-chiffre"><div className="bse-chiffre__n">{compte('fournie')}</div><div className="bse-chiffre__l">rubriques au coffre</div></Card>
        <Card className="bse-chiffre"><div className="bse-chiffre__n">{compte('a-rediger')}</div><div className="bse-chiffre__l">rédigées par le Trône</div></Card>
        <Card className="bse-chiffre"><div className="bse-chiffre__n">{compte('manquante') + compte('expiree')}</div><div className="bse-chiffre__l">manquent ou expirent</div></Card>
        <Card className="bse-chiffre"><div className="bse-chiffre__n">{compte('sans-objet')}</div><div className="bse-chiffre__l">sans objet</div></Card>
      </div>

      <Card className="bse-section">
        <div className="bse-section__titre">La campagne</div>
        <div className="bse-section__cap">La date limite paraît en décembre sur le site de l’Ambassade. Posée ici, elle règle le rétro-planning, les trois mois de relevés attendus et la date des lettres.</div>
        <div className="bse-form">
          <Field label="Date limite de dépôt"><ChampDeDate value={campagne.dateDepot ?? ''} onChange={(iso) => modifieLaCampagne(campagne.id, { dateDepot: iso || undefined })} sens="avant" compact /></Field>
          <Field label="Date écrite sur les lettres (le jour du dépôt)"><ChampDeDate value={dateDuDepot} onChange={setDateDuDepot} sens="avant" compact /></Field>
        </div>
        {aExpirer.length > 0 && (
          <div className="bse-section__cap" style={{ color: 'var(--color-brique, #96412E)', marginTop: 10 }}>
            {aExpirer.length} pièce{aExpirer.length > 1 ? 's' : ''} du socle permanent {aExpirer.length > 1 ? 'expirent' : 'expire'} avant le dépôt ou dans les trois mois : {aExpirer.map((p) => p.nom).join(', ')}. Un passeport se renouvelle maintenant, pas en février.
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <Button variant="ghost" size="sm" disabled={!!travail} onClick={bordereau}>{travail === 'bordereau' ? 'Bordereau…' : 'Bordereau (PDF)'}</Button>
          <Button variant="copper" size="sm" disabled={!!travail} onClick={assemble}>{travail === 'assemblage' ? 'Assemblage…' : 'Assembler le dossier (PDF)'}</Button>
          <Button variant="ghost" size="sm" onClick={versCoffre}>Déposer une pièce</Button>
        </div>
      </Card>

      <Card className="bse-section">
        <div className="bse-section__titre">Rubrique par rubrique</div>
        <div className="bse-section__cap">L’ordre de la liste de l’Ambassade, qui est aussi l’ordre d’assemblage. Les rubriques sans objet suivent la fiche : situation, emplois, logement.</div>
        {etat.map((l) => (
          <div className="bse-ligne" key={l.rubrique.n}>
            <div className="bse-ligne__n">{l.rubrique.n}</div>
            <div>
              <div className="bse-ligne__l">{l.rubrique.libelle}</div>
              <div className="bse-ligne__note">{MOT_DU_RYTHME[l.rubrique.rythme]}{l.pieces.length ? ` · ${l.pieces.map((p) => p.nom).join(', ')}` : ''}</div>
            </div>
            <div className="bse-ligne__actions"><Pill tone={TON[l.etat]}>{MOT_DE_L_ETAT[l.etat]}</Pill></div>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ── Le coffre : les pièces, par rythme ─────────────────────────────── */
type Depot = { fichier: File; rubrique: Rubrique; mois: string; expireLe: string; note: string };

function OngletCoffre({ campagne, contenu, aujourdhui }: { campagne: Campagne; contenu: ContenuDuCoffre; aujourdhui: string }) {
  const [depot, setDepot] = useState<Depot | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [retrait, setRetrait] = useState<string>('');
  const sansObjet = rubriquesSansObjet(contenu.fiche);
  const moisParDefaut = moisACollecter(aujourdhui);

  const choisit = (rubrique: Rubrique, fichier: File) => {
    if (fichier.size > TAILLE_MAX) { toast('Dix mégaoctets au plus par pièce. Une photo se réduit avant d’être déposée.'); return; }
    setDepot({ fichier, rubrique, mois: rubrique.rythme === 'mensuel' ? moisParDefaut : '', expireLe: '', note: '' });
  };
  const depose = async () => {
    if (!depot) return;
    setOccupe(true);
    const r = await deposeUnePiece(campagne.id, contenu, depot.fichier, {
      rubrique: depot.rubrique.n, mois: depot.mois || undefined, expireLe: depot.expireLe || undefined, note: depot.note || undefined,
    });
    setOccupe(false);
    if (!r) { toast('Le coffre a refusé le dépôt. Êtes-vous connecté à la Maison ?'); return; }
    toast(`${r.piece.nom} rangé au coffre.`);
    setDepot(null);
  };
  const retire = async (p: Piece) => {
    if (retrait !== p.id) { setRetrait(p.id); return; }
    setOccupe(true);
    const r = await retireUnePiece(campagne.id, contenu, p.id);
    setOccupe(false); setRetrait('');
    toast(r ? `${p.nom} retiré du coffre.` : 'Le coffre n’a pas rendu la pièce. Rien n’a été retiré.');
  };

  return (
    <>
      {RYTHMES.map((rythme) => (
        <Card className="bse-section" key={rythme}>
          <div className="bse-section__titre">{MOT_DU_RYTHME[rythme].split(' · ')[0]}</div>
          <div className="bse-section__cap">{MOT_DU_RYTHME[rythme].split(' · ')[1]}.{rythme === 'permanent' ? ' Une date d’expiration posée sur un passeport ou une carte grise fait prévenir trois mois avant.' : rythme === 'mensuel' ? ' Chaque pièce porte le mois qu’elle couvre ; les trois mois avant le dépôt sont attendus.' : rythme === 'redige' ? ' Le Trône les rédige ; la version signée, scannée, se dépose ici.' : ' Commandées le 5 janvier, déposées quand elles arrivent.'}</div>
          {RUBRIQUES.filter((r) => r.rythme === rythme).map((r) => {
            const siennes = contenu.pieces.filter((p) => p.rubrique === r.n);
            const so = sansObjet.has(r.n);
            return (
              <div className="bse-ligne" key={r.n} style={so ? { opacity: .55 } : undefined}>
                <div className="bse-ligne__n">{r.n}</div>
                <div>
                  <div className="bse-ligne__l">{r.libelle}{so ? ' · sans objet' : ''}</div>
                  <div className="bse-ligne__note">{r.note}</div>
                  {siennes.map((p) => {
                    const ex = etatDExpiration(p.expireLe, aujourdhui);
                    return (
                      <div className="bse-piece" key={p.id}>
                        <span className="bse-piece__nom">{p.nom}</span>
                        {p.mois && <span className="bse-piece__meta">{moisEnLettres(p.mois)}</span>}
                        {p.expireLe && <span className={`bse-piece__meta ${ex === 'expiree' || ex === 'bientot' ? 'is-alerte' : ''}`}>expire le {dateEnLettres(p.expireLe)}{ex !== 'sans' && ex !== 'valide' ? ` · ${MOT_DE_L_EXPIRATION[ex]}` : ''}</span>}
                        {p.note && <span className="bse-piece__meta">{p.note}</span>}
                        <span className="bse-piece__meta">déposé le {dateEnLettres(p.deposeLe)}</span>
                        {p.chemin && <Button variant="ghost" size="sm" onClick={() => void ouvreLaPiece(p.chemin)}>Ouvrir</Button>}
                        {rythme === 'permanent' && (
                          <ChampDeDate value={p.expireLe ?? ''} onChange={(iso) => void corrigeUnePiece(campagne.id, contenu, p.id, { expireLe: iso || undefined })} sens="avant" compact ariaLabel="Date d’expiration" style={{ width: 150 }} />
                        )}
                        <Button variant="ghost" size="sm" disabled={occupe} onClick={() => void retire(p)}>{retrait === p.id ? 'Confirmer le retrait' : 'Retirer'}</Button>
                      </div>
                    );
                  })}
                </div>
                <div className="bse-ligne__actions">
                  <ChoisirUnePiece libelle={siennes.length ? 'Ajouter' : 'Déposer'} onFichier={(f) => choisit(r, f)} disabled={occupe} />
                </div>
              </div>
            );
          })}
        </Card>
      ))}
      {depot && (
        <Modal title={`Déposer · ${depot.rubrique.n} ${depot.rubrique.libelle}`} onClose={() => setDepot(null)} width={520}>
          <div className="bse-form bse-form--large">
            <div className="bse-section__cap">{depot.fichier.name} · {Math.round(depot.fichier.size / 1024)} Ko. Le fichier sera rangé sous un nom qui trie le classeur : numéro, nature, mois.</div>
            {depot.rubrique.rythme === 'mensuel' && (
              <Field label="Le mois que cette pièce couvre">
                <Select value={depot.mois} onChange={(e) => setDepot({ ...depot, mois: e.target.value })}>
                  {[...Array(14)].map((_, i) => { const d = new Date(); d.setMonth(d.getMonth() - i); const m = jourIso(d).slice(0, 7); return <option key={m} value={m}>{moisEnLettres(m)}</option>; })}
                </Select>
              </Field>
            )}
            {depot.rubrique.rythme === 'permanent' && (
              <Field label="Date d’expiration, s’il y en a une (passeport, carte grise)"><ChampDeDate value={depot.expireLe} onChange={(iso) => setDepot({ ...depot, expireLe: iso })} sens="avant" compact /></Field>
            )}
            <Field label="Note (facultative)"><Input value={depot.note} onChange={(e) => setDepot({ ...depot, note: e.target.value })} placeholder="recto, verso, compte 2…" /></Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setDepot(null)}>Annuler</Button>
              <Button variant="copper" size="sm" disabled={occupe} onClick={() => void depose()}>{occupe ? 'Dépôt…' : 'Déposer au coffre'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── La collecte : le mois, l'historique, le rétro-planning ────────── */
function OngletCollecte({ campagne, contenu, aujourdhui, versCoffre }: { campagne: Campagne; contenu: ContenuDuCoffre; aujourdhui: string; versCoffre: () => void }) {
  const mois = moisACollecter(aujourdhui);
  const c = collecteDuMois(campagne, contenu.pieces, mois, aujourdhui, contenu.fiche);
  const marque = (faite: boolean) => modifieLaCampagne(campagne.id, { collecte: { ...campagne.collecte, [mois]: { faite, le: faite ? aujourdhui : undefined } } });
  const historique = [...Array(8)].map((_, i) => { const d = new Date(`${mois}-15T12:00:00`); d.setMonth(d.getMonth() - (7 - i)); return jourIso(d).slice(0, 7); });
  const plan = retroPlanning(aujourdhui, campagne.dateDepot);
  const attendus = moisAttendus(aujourdhui, campagne.dateDepot);

  return (
    <>
      <Card className="bse-section" filet={c.enRetard ? 'copper' : undefined}>
        <div className="bse-section__titre">La collecte de {moisEnLettres(mois)}</div>
        <div className="bse-section__cap">
          Le 5 de chaque mois, cinq minutes : télécharger les relevés, photographier les factures et les quittances, ranger les bulletins. Échéance : {dateEnLettres(c.echeance)}.
          {c.faite ? ' Faite.' : c.enRetard ? ' En retard : le rappel a sonné.' : ' À venir.'}
        </div>
        {c.lignes.map((l) => (
          <div className="bse-ligne" key={l.rubrique.n}>
            <div className="bse-ligne__n">{l.rubrique.n}</div>
            <div><div className="bse-ligne__l">{l.rubrique.libelle}</div><div className="bse-ligne__note">{l.pieces.length ? l.pieces.map((p) => p.nom).join(', ') : 'rien pour ce mois'}</div></div>
            <div className="bse-ligne__actions"><Pill tone={l.fournie ? 'ok' : 'warn'}>{l.fournie ? 'rangée' : 'à déposer'}</Pill></div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <Button variant="ghost" size="sm" onClick={versCoffre}>Déposer au coffre</Button>
          {c.faite
            ? <Button variant="ghost" size="sm" onClick={() => marque(false)}>Rouvrir la collecte</Button>
            : <Button variant="copper" size="sm" onClick={() => marque(true)}>Marquer la collecte comme faite</Button>}
        </div>
        <div className="bse-mois">
          {historique.map((m) => {
            const cm = collecteDuMois(campagne, contenu.pieces, m, aujourdhui, contenu.fiche);
            return <span key={m} className={`bse-mois__case ${cm.faite ? 'is-faite' : cm.enRetard ? 'is-retard' : ''}`} title={cm.faite ? 'faite' : cm.enRetard ? 'en retard' : 'à venir'}>{moisEnLettres(m)}</span>;
          })}
        </div>
        <div className="bse-section__cap" style={{ marginTop: 10 }}>Les trois mois attendus au dépôt : {attendus.map(moisEnLettres).join(', ')}.</div>
      </Card>

      <Card className="bse-section">
        <div className="bse-section__titre">Le rétro-planning</div>
        <div className="bse-section__cap">Tout ce qui peut exister avant le dépôt est prêt trois mois avant ; il ne reste pour janvier que ce qui n’existe pas encore. {campagne.dateDepot ? '' : 'Sans date publiée, le planning vise fin février.'}</div>
        {plan.map((e, i) => (
          <div className={`bse-etape ${e.date < aujourdhui ? 'is-passee' : ''}`} key={i}>
            <div className="bse-etape__date">{dateEnLettres(e.date)}</div>
            <div>{e.quoi}</div>
            <div className="bse-etape__duree">{e.duree}</div>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ── Les lettres : rédigées depuis la fiche, l'identité de la Maison signe les siennes ── */
function OngletLettres({ campagne, contenu, aujourdhui }: { campagne: Campagne; contenu: ContenuDuCoffre; aujourdhui: string }) {
  const [date, setDate] = useState('');
  const [ouverte, setOuverte] = useState<string>('');
  const fiche = contenu.fiche;
  const m = maison();
  const candidats: { cle: string; titre: string; lettre: Lettre | null }[] = [];
  candidats.push({ cle: 'demande', titre: '01 · Lettre de demande de bourse', lettre: lettreDuDossier('demande', fiche, campagne, m, { date: date || undefined }) });
  fiche.emplois.filter((e) => e.statut === 'salarie').forEach((e, i) => candidats.push({
    cle: `employeur-${i}`, titre: `06 · Attestation de l’employeur · ${e.estLaMaison ? m.nom : e.employeur || 'employeur'} (parent ${e.parent})`,
    lettre: lettreDuDossier('employeur', fiche, campagne, m, { emploi: e, date: date || undefined }),
  }));
  if (fiche.logement.statut === 'heberge') {
    candidats.push({ cle: 'hebergement', titre: '05 · Attestation d’hébergement à titre gracieux', lettre: lettreDuDossier('hebergement', fiche, campagne, m, { date: date || undefined }) });
    moisAttendus(aujourdhui, campagne.dateDepot).forEach((mois) => candidats.push({ cle: `quittance-${mois}`, titre: `05 · Quittance des charges · ${moisEnLettres(mois)}`, lettre: lettreDuDossier('quittance', fiche, campagne, m, { mois, date: date || undefined }) }));
  }
  const so = rubriquesSansObjet(fiche);
  if (!so.has('12')) candidats.push({ cle: 'honneur', titre: '12 · Attestation sur l’honneur de non-concubinage', lettre: lettreDuDossier('honneur', fiche, campagne, m, { date: date || undefined }) });
  if (!so.has('19')) candidats.push({ cle: 'avantages', titre: '19 · Attestation d’avantages en nature', lettre: lettreDuDossier('avantages', fiche, campagne, m, { date: date || undefined }) });

  const pdf = async (titre: string, l: Lettre) => {
    const octets = await lettrePdf(l);
    telechargeLeFichier(octets, `${titre.slice(0, 2)}-${titre.slice(5).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)}.pdf`);
  };

  return (
    <>
      <Card className="bse-section">
        <div className="bse-section__titre">Les lettres du dossier</div>
        <div className="bse-section__cap">Rédigées depuis la fiche. Ce qui manque encore sort entre crochets, pour qu’un oubli se voie avant d’être signé. Quand la Maison est l’employeur, l’attestation porte son nom, sa raison, son monogramme et sa devise.</div>
        <div className="bse-form">
          <Field label="Date écrite sur les lettres (vide : crochets)"><ChampDeDate value={date} onChange={setDate} sens="avant" compact /></Field>
        </div>
      </Card>
      {candidats.map(({ cle, titre, lettre }) => lettre && (
        <Card className="bse-section" key={cle}>
          <div className="bse-bloc__tete">
            <div className="bse-section__titre" style={{ fontSize: 17 }}>{titre}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {champsVides(lettre).length > 0 && <Pill tone="warn">{champsVides(lettre).length} champ{champsVides(lettre).length > 1 ? 's' : ''} à remplir</Pill>}
              {lettre.deLaMaison && <Pill tone="copper">signée par la Maison</Pill>}
              <Button variant="ghost" size="sm" onClick={() => setOuverte(ouverte === cle ? '' : cle)}>{ouverte === cle ? 'Replier' : 'Relire'}</Button>
              <Button variant="copper" size="sm" onClick={() => void pdf(titre, lettre)}>PDF</Button>
            </div>
          </div>
          {ouverte === cle && <ApercuDeLettre lettre={lettre} />}
        </Card>
      ))}
    </>
  );
}

function ApercuDeLettre({ lettre }: { lettre: Lettre }) {
  const marque = (s: string): ReactNode => s.split(/(\[[^\]]+\])/g).map((part, i) => (part.startsWith('[') ? <mark key={i}>{part}</mark> : part));
  return (
    <div className="bse-lettre">
      <div className="bse-lettre__tete">{lettre.entete.map((l, i) => <div key={i}>{marque(l)}</div>)}{lettre.destinataire?.map((l, i) => <div key={`d${i}`} style={{ textAlign: 'right' }}>{marque(l)}</div>)}<div style={{ textAlign: 'right' }}>{marque(lettre.lieuDate)}</div></div>
      {lettre.titre && <div style={{ textAlign: 'center', fontSize: 19, color: 'var(--color-indigo)', marginBottom: 6 }}>{lettre.titre}</div>}
      {lettre.objet && <div style={{ marginBottom: 10 }}><strong>{marque(lettre.objet)}</strong></div>}
      {lettre.paragraphes.map((p, i) => <p key={i} style={{ margin: '0 0 8px' }}>{marque(p)}</p>)}
      <div style={{ marginTop: 18, fontStyle: 'italic', color: 'var(--ink-soft)', display: 'flex', justifyContent: 'space-between' }}>{lettre.signatures.map((s, i) => <span key={i}>{marque(s)}</span>)}</div>
    </div>
  );
}

/* ── La fiche : ce qui désigne la famille, rangé au coffre seulement ── */
function OngletFiche({ campagne, contenu }: { campagne: Campagne; contenu: ContenuDuCoffre }) {
  const [f, setF] = useState<Fiche>(contenu.fiche);
  const [sauve, setSauve] = useState(false);
  useEffect(() => { setF(contenu.fiche); }, [contenu.fiche]);
  const pose = <K extends keyof Fiche>(k: K, v: Fiche[K]) => setF({ ...f, [k]: v });
  const poseParent = (n: 1 | 2, k: keyof Fiche['parent1'], v: string) => setF({ ...f, [n === 1 ? 'parent1' : 'parent2']: { ...f[n === 1 ? 'parent1' : 'parent2'], [k]: v } });
  const poseLogement = (k: keyof Fiche['logement'], v: string) => setF({ ...f, logement: { ...f.logement, [k]: v } });
  const poseHebergeant = (k: keyof Fiche['logement']['hebergeant'], v: string) => setF({ ...f, logement: { ...f.logement, hebergeant: { ...f.logement.hebergeant, [k]: v } } });
  const poseEnfant = (i: number, k: keyof Enfant, v: string) => setF({ ...f, enfants: f.enfants.map((e, j) => (j === i ? { ...e, [k]: v } : e)) });
  const poseEmploi = (i: number, patch: Partial<Emploi>) => setF({ ...f, emplois: f.emplois.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const enregistre = async () => {
    setSauve(true);
    await ecritLaFiche(campagne.id, contenu, f);
    setSauve(false);
    toast('Fiche rangée au coffre de la direction.');
  };
  const sansObjetAuto = rubriquesSansObjet({ ...f, sansObjet: [] });

  return (
    <>
      <Card className="bse-section">
        <div className="bse-section__titre">La fiche des renseignements constants</div>
        <div className="bse-section__cap">Le formulaire ne change pas d’une année à l’autre ; ce qu’il demande non plus, à trois lignes près. Cette fiche tient tout le reste, et nourrit les lettres. Elle se range au coffre de la direction, jamais dans le dépôt ni dans un magasin que le personnel lit.</div>

        <div className="bse-sous">Les parents</div>
        <div className="bse-form">
          {([1, 2] as const).map((n) => {
            const p = n === 1 ? f.parent1 : f.parent2;
            return (
              <div className="bse-bloc" key={n} style={{ gridColumn: '1 / -1' }}>
                <div className="bse-bloc__tete"><span>Parent {n}{f.demandeur === n ? ' · demandeur' : ''}</span><Button variant="ghost" size="sm" onClick={() => pose('demandeur', n)} disabled={f.demandeur === n}>Est le demandeur</Button></div>
                <div className="bse-form">
                  <Field label="Nom"><Input value={p.nom} onChange={(e) => poseParent(n, 'nom', e.target.value)} /></Field>
                  <Field label="Prénoms"><Input value={p.prenom} onChange={(e) => poseParent(n, 'prenom', e.target.value)} /></Field>
                  <Field label="Date de naissance"><ChampDeDate value={p.naissance} onChange={(iso) => poseParent(n, 'naissance', iso)} sens="arriere" compact /></Field>
                  <Field label="Lieu et pays de naissance"><Input value={p.lieu} onChange={(e) => poseParent(n, 'lieu', e.target.value)} /></Field>
                  <Field label="Nationalité"><Input value={p.nationalite} onChange={(e) => poseParent(n, 'nationalite', e.target.value)} /></Field>
                  <Field label="N° d’inscription au registre (NUMIC)"><Input value={p.numic} onChange={(e) => poseParent(n, 'numic', e.target.value)} /></Field>
                </div>
              </div>
            );
          })}
          <Field label="Situation familiale">
            <Select value={f.situation} onChange={(e) => pose('situation', e.target.value as Fiche['situation'])}>
              <option value="">…</option><option value="marie">Marié(e)</option><option value="pacs">PACS</option><option value="concubin">Concubin(e)</option>
              <option value="celibataire">Célibataire</option><option value="divorce">Divorcé(e)</option><option value="separe">Séparé(e)</option><option value="veuf">Veuf(ve)</option>
            </Select>
          </Field>
          <Field label="Adresse du foyer (finir par la ville)"><Input value={f.adresse} onChange={(e) => pose('adresse', e.target.value)} /></Field>
          <Field label="Boîte postale"><Input value={f.boitePostale} onChange={(e) => pose('boitePostale', e.target.value)} /></Field>
          <Field label="Téléphone"><Input value={f.telephone} onChange={(e) => pose('telephone', e.target.value)} /></Field>
          <Field label="Courriel"><Input value={f.courriel} onChange={(e) => pose('courriel', e.target.value)} inputMode="email" /></Field>
          <label className="bse-case"><input type="checkbox" checked={f.jamaisResideEnFrance} onChange={(e) => pose('jamaisResideEnFrance', e.target.checked)} /> La famille n’a jamais résidé en France (la rubrique CAF tombe)</label>
        </div>

        <div className="bse-sous">Les enfants</div>
        {f.enfants.map((e, i) => (
          <div className="bse-bloc" key={i}>
            <div className="bse-bloc__tete"><span>Enfant {i + 1}</span><Button variant="ghost" size="sm" onClick={() => pose('enfants', f.enfants.filter((_, j) => j !== i))}>Retirer</Button></div>
            <div className="bse-form">
              <Field label="Prénom"><Input value={e.prenom} onChange={(ev) => poseEnfant(i, 'prenom', ev.target.value)} /></Field>
              <Field label="Nom"><Input value={e.nom} onChange={(ev) => poseEnfant(i, 'nom', ev.target.value)} /></Field>
              <Field label="Date de naissance"><ChampDeDate value={e.naissance} onChange={(iso) => poseEnfant(i, 'naissance', iso)} sens="arriere" compact /></Field>
              <Field label="Fille ou garçon"><Select value={e.sexe} onChange={(ev) => poseEnfant(i, 'sexe', ev.target.value)}><option value="">…</option><option value="f">Fille</option><option value="m">Garçon</option></Select></Field>
              <Field label="Établissement"><Input value={e.etablissement} onChange={(ev) => poseEnfant(i, 'etablissement', ev.target.value)} /></Field>
              <Field label={`Classe en ${campagne.anneeScolaire}`}><Input value={e.classe} onChange={(ev) => poseEnfant(i, 'classe', ev.target.value)} placeholder="CE2, CM2, 4e…" /></Field>
              <Field label="N° d’immatriculation consulaire"><Input value={e.immatriculation} onChange={(ev) => poseEnfant(i, 'immatriculation', ev.target.value)} /></Field>
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => pose('enfants', [...f.enfants, { ...ENFANT_VIDE, nom: f.parent2.nom || f.parent1.nom }])}>Ajouter un enfant</Button>

        <div className="bse-sous">Le logement</div>
        <div className="bse-form">
          <Field label="Statut">
            <Select value={f.logement.statut} onChange={(e) => poseLogement('statut', e.target.value)}>
              <option value="">…</option><option value="proprietaire">Propriétaire</option><option value="locataire">Locataire</option><option value="heberge">Hébergé à titre gracieux</option>
            </Select>
          </Field>
          <Field label="Adresse du logement (si différente)"><Input value={f.logement.adresse} onChange={(e) => poseLogement('adresse', e.target.value)} /></Field>
          <Field label="Loyer mensuel (F CFA)"><Input value={f.logement.loyer} onChange={(e) => poseLogement('loyer', e.target.value)} inputMode="numeric" /></Field>
          <Field label="Charges mensuelles (F CFA)"><Input value={f.logement.charges} onChange={(e) => poseLogement('charges', e.target.value)} inputMode="numeric" /></Field>
          <Field label="Valeur locative estimée, par mois"><Input value={f.logement.valeurLocative} onChange={(e) => poseLogement('valeurLocative', e.target.value)} inputMode="numeric" /></Field>
          <Field label="Superficie (m²)"><Input value={f.logement.superficie} onChange={(e) => poseLogement('superficie', e.target.value)} inputMode="numeric" /></Field>
          <Field label="Nombre de pièces"><Input value={f.logement.pieces} onChange={(e) => poseLogement('pieces', e.target.value)} inputMode="numeric" /></Field>
        </div>
        {f.logement.statut === 'heberge' && (
          <div className="bse-bloc" style={{ marginTop: 10 }}>
            <div className="bse-bloc__tete"><span>L’hébergeant, qui signe l’attestation et les quittances</span></div>
            <div className="bse-form">
              <Field label="Nom et prénoms"><Input value={f.logement.hebergeant.nom} onChange={(e) => poseHebergeant('nom', e.target.value)} /></Field>
              <Field label="Date de naissance"><ChampDeDate value={f.logement.hebergeant.naissance} onChange={(iso) => poseHebergeant('naissance', iso)} sens="arriere" compact /></Field>
              <Field label="Lieu de naissance"><Input value={f.logement.hebergeant.lieu} onChange={(e) => poseHebergeant('lieu', e.target.value)} /></Field>
              <Field label="Son adresse"><Input value={f.logement.hebergeant.adresse} onChange={(e) => poseHebergeant('adresse', e.target.value)} /></Field>
              <Field label="Son téléphone"><Input value={f.logement.hebergeant.telephone} onChange={(e) => poseHebergeant('telephone', e.target.value)} /></Field>
              <Field label="Héberge depuis (en lettres : « 2007 », « dix ans »)"><Input value={f.logement.hebergeant.depuis} onChange={(e) => poseHebergeant('depuis', e.target.value)} /></Field>
            </div>
          </div>
        )}

        <div className="bse-sous">Les emplois</div>
        {f.emplois.map((e, i) => (
          <div className="bse-bloc" key={i}>
            <div className="bse-bloc__tete">
              <span>Emploi {i + 1} · parent {e.parent}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button variant="ghost" size="sm" onClick={() => poseEmploi(i, { estLaMaison: !e.estLaMaison, employeur: e.estLaMaison ? e.employeur : maisonNom() })}>{e.estLaMaison ? 'Employeur : la Maison' : 'L’employeur est la Maison'}</Button>
                <Button variant="ghost" size="sm" onClick={() => pose('emplois', f.emplois.filter((_, j) => j !== i))}>Retirer</Button>
              </div>
            </div>
            <div className="bse-form">
              <Field label="Parent"><Select value={e.parent} onChange={(ev) => poseEmploi(i, { parent: Number(ev.target.value) as 1 | 2 })}><option value={1}>Parent 1</option><option value={2}>Parent 2</option></Select></Field>
              <Field label="Statut"><Select value={e.statut} onChange={(ev) => poseEmploi(i, { statut: ev.target.value as Emploi['statut'] })}><option value="">…</option><option value="salarie">Salarié(e)</option><option value="independant">Indépendant(e)</option><option value="sans-emploi">Sans emploi</option></Select></Field>
              {e.statut === 'sans-emploi' && <Field label="Sans emploi depuis le"><ChampDeDate value={e.sansEmploiDepuis} onChange={(iso) => poseEmploi(i, { sansEmploiDepuis: iso })} sens="arriere" compact /></Field>}
              {e.statut !== 'sans-emploi' && (
                <>
                  <Field label={e.statut === 'independant' ? 'Entreprise' : 'Employeur'}><Input value={e.employeur} disabled={e.estLaMaison} onChange={(ev) => poseEmploi(i, { employeur: ev.target.value })} /></Field>
                  <Field label={e.statut === 'independant' ? 'Activité' : 'Poste'}><Input value={e.poste} onChange={(ev) => poseEmploi(i, { poste: ev.target.value })} /></Field>
                  <Field label="Depuis le"><ChampDeDate value={e.depuis} onChange={(iso) => poseEmploi(i, { depuis: iso })} sens="arriere" compact /></Field>
                  <Field label={`Rémunération ${campagne.anneeReference}, brut (F CFA)`}><Input value={e.salaireBrut} onChange={(ev) => poseEmploi(i, { salaireBrut: ev.target.value })} inputMode="numeric" /></Field>
                  <Field label="Net (F CFA)"><Input value={e.salaireNet} onChange={(ev) => poseEmploi(i, { salaireNet: ev.target.value })} inputMode="numeric" /></Field>
                  <Field label="Signataire de l’attestation"><Input value={e.signataire} onChange={(ev) => poseEmploi(i, { signataire: ev.target.value })} /></Field>
                  <Field label="Sa qualité"><Input value={e.qualite} onChange={(ev) => poseEmploi(i, { qualite: ev.target.value })} /></Field>
                  <Field label="Lien familial avec l’employeur (le formulaire le demande)"><Input value={e.lienFamilial} onChange={(ev) => poseEmploi(i, { lienFamilial: ev.target.value })} placeholder="néant, ou « la gérante est ma mère »" /></Field>
                  {!e.estLaMaison && (
                    <>
                      <Field label="RCCM"><Input value={e.rccm} onChange={(ev) => poseEmploi(i, { rccm: ev.target.value })} /></Field>
                      <Field label="IFU"><Input value={e.ifu} onChange={(ev) => poseEmploi(i, { ifu: ev.target.value })} /></Field>
                      <Field label="Siège (finir par la ville)"><Input value={e.siege} onChange={(ev) => poseEmploi(i, { siege: ev.target.value })} /></Field>
                      <Field label="Téléphone de l’employeur"><Input value={e.telephone} onChange={(ev) => poseEmploi(i, { telephone: ev.target.value })} /></Field>
                    </>
                  )}
                  <label className="bse-case"><input type="checkbox" checked={e.participeAuxFrais} onChange={(ev) => poseEmploi(i, { participeAuxFrais: ev.target.checked })} /> L’employeur participe aux frais de scolarité</label>
                </>
              )}
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => pose('emplois', [...f.emplois, { ...EMPLOI_VIDE, parent: f.emplois.length ? 2 : 1 }])}>Ajouter un emploi</Button>

        <div className="bse-sous">Les frais parascolaires et les rubriques écartées</div>
        <div className="bse-form bse-form--large">
          <Field label="Pourquoi les frais parascolaires sont demandés (une phrase, telle qu’elle ira dans la lettre)"><Textarea value={f.parascolaire} onChange={(e) => pose('parascolaire', e.target.value)} rows={2} placeholder="demi-pension et transport : les deux parents travaillent en journée et l’établissement est à … km du domicile." /></Field>
        </div>
        <div className="bse-section__cap" style={{ marginTop: 8 }}>Déjà sans objet d’après la fiche : {[...sansObjetAuto].sort().join(', ') || 'rien'}. Cocher ci-dessous ce qui ne vous concerne pas en plus.</div>
        <div className="bse-form">
          {RUBRIQUES.filter((r) => !sansObjetAuto.has(r.n)).map((r) => (
            <label className="bse-case" key={r.n}>
              <input type="checkbox" checked={f.sansObjet.includes(r.n)} onChange={(e) => pose('sansObjet', e.target.checked ? [...f.sansObjet, r.n] : f.sansObjet.filter((x) => x !== r.n))} />
              <span>{r.n} · {r.libelle}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="copper" disabled={sauve} onClick={() => void enregistre()}>{sauve ? 'Enregistrement…' : 'Enregistrer la fiche au coffre'}</Button>
        </div>
      </Card>
    </>
  );
}

/* Les genres de lettre que l'écran sait montrer : exporté pour que le type
   reste lu quelque part si une rubrique en gagne un nouveau. */
export type { GenreDeLettre };
