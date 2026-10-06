import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Input, Select, toast } from '../../../../../ds/components';
import { useSecretariat } from '../../../../../shared/secretariat';
import { chargeLeClasseur, papiersDe, personnesDe, useClasseur } from '../../../../../shared/papiers';
import {
  aFaireMaintenant, aSaisir, calendrier, campagneDe, CHAMPS, classeA, dateEnLettres, lis, piecesDuClasseur, type Groupe, type Membres, type Valeurs,
  type EtatPiece,
} from '../../../../../shared/bourse-pur';
import {
  assembleLeDossierDeBourse, bordereauPdf, cleDuDocument, documentsDuDossier, enregistreLeDossier, leDossier, octetsDuDocument, papiersAJoindre,
  prepareLesDocuments, reponsesPdf, type Morceau,
} from '../../../../../shared/bourse';

/* LE DOSSIER DE BOURSE SCOLAIRE — 7 octobre 2026. Maquette
   W7LtTpMSnosdu6zuk8esaL validée (« construis »).

   Cinq volets, un seul ouvert (règle des écrans en liste repliés) : où en
   est le dossier, les constantes, l'année, les documents, déposer. La barre
   collante dit ce qu'on règle et garde les changements. La direction seule
   (le dossier est personnel et privé, 0116 et 0122). */

type Volet = 'etat' | 'constantes' | 'annee' | 'documents' | 'deposer';
const VOLETS: { v: Volet; titre: string }[] = [
  { v: 'etat', titre: 'Où en est le dossier' },
  { v: 'constantes', titre: 'Les constantes, une fois' },
  { v: 'annee', titre: 'L’année de référence' },
  { v: 'documents', titre: 'Les documents à signer' },
  { v: 'deposer', titre: 'Assembler et déposer' },
];
const GROUPES: { g: Groupe; titre: string }[] = [
  { g: 'demandeur', titre: 'Le demandeur' }, { g: 'parent2', titre: 'Le second parent' }, { g: 'enfants', titre: 'Les enfants' },
  { g: 'foyer', titre: 'Le foyer' }, { g: 'tiers', titre: 'M. Thomas BOYA' },
];
const MEMBRES: { cle: keyof Membres; nom: string }[] = [
  { cle: 'yeman', nom: 'Yéman' }, { cle: 'brice', nom: 'Brice' }, { cle: 'e1', nom: 'Enfant 1' }, { cle: 'e2', nom: 'Enfant 2' },
  { cle: 'e3', nom: 'Enfant 3' }, { cle: 'thomas', nom: 'M. Thomas BOYA' },
];
const DIT: Record<EtatPiece, string> = { pret: 'prête', attente: 'au fil des mois', manque: 'à faire', alerte: 'attention' };

const jourDuPoste = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const enregistreSous = (octets: Uint8Array, nom: string) => {
  const url = URL.createObjectURL(new Blob([octets as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

export function LeDossierDeBourse({ branchId, moi, nomMaison, surOuvre }: {
  branchId: string; moi: string; nomMaison: string; surOuvre: (pieceId: string) => void;
}) {
  const [lignes] = useSecretariat();
  const dossier = leDossier(lignes);
  const classeur = useClasseur();
  useEffect(() => { if (classeur.charge === 'jamais') void chargeLeClasseur(); }, [classeur.charge]);

  const [v, setV] = useState<Valeurs>(() => dossier?.valeurs ?? {});
  const [membres, setMembres] = useState<Membres>(() => dossier?.membres ?? {});
  const [modifie, setModifie] = useState(false);
  const [ouvert, setOuvert] = useState<Volet | null>('etat');
  const [occupe, setOccupe] = useState('');
  /* Le dossier arrive du serveur après l'ouverture : on le reprend tant que
     rien n'a été touché ici. */
  useEffect(() => {
    if (dossier && !modifie) { setV(dossier.valeurs ?? {}); setMembres(dossier.membres ?? {}); }
  }, [dossier, modifie]);

  const jour = jourDuPoste();
  const c = campagneDe(jour, v.depot);
  const papiers = papiersDe(classeur.lignes);
  const personnes = personnesDe(classeur.lignes);
  const rappels = useMemo(() => calendrier(c, papiers, membres, v), [c.cle, c.depot, papiers, membres, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const maintenant = aFaireMaintenant(rappels, jour);
  const docs = documentsDuDossier(lignes, c);
  const docDe = (n: string) => docs.find((p) => p.dossier === cleDuDocument(c, n));
  const semaines = Math.max(0, Math.round((Date.parse(`${c.depot}T12:00:00Z`) - Date.parse(`${jour}T12:00:00Z`)) / (7 * 86_400_000)));

  const change = (cle: string, val: string) => { setV((x) => ({ ...x, [cle]: val })); setModifie(true); };
  const relie = (cle: keyof Membres, id: string) => { setMembres((x) => ({ ...x, [cle]: id || undefined })); setModifie(true); };
  const garde = () => { enregistreLeDossier({ branchId, valeurs: v, membres }); setModifie(false); toast('Dossier enregistré.'); };

  /* L'état des treize pièces : les documents du Secrétariat, puis le classeur. */
  const etatDoc = (n: string): { etat: EtatPiece; dit: string } => {
    const p = docDe(n);
    if (!p) return { etat: 'manque', dit: 'à préparer' };
    if (p.etat === 'signe') return { etat: 'pret', dit: `signé · ${p.numero ?? ''}` };
    if (p.etat === 'a-signer') return { etat: 'attente', dit: 'en signature' };
    return { etat: 'attente', dit: 'brouillon prêt' };
  };
  const formulaire = papiers.some((p) => p.titulaire === `pers:${membres.yeman}` && p.type === 'formulaire-aefe' && p.delivreLe >= `${c.reference}-10-01`);
  const quittances = ['06', '07', '08'].map(etatDoc);
  const signees = quittances.filter((q) => q.etat === 'pret').length;
  const bordereau = [
    { n: '1', titre: 'Lettre de demande de bourses', ...etatDoc('03') },
    { n: '2', titre: 'Formulaire AEFE rempli et signé', etat: (formulaire ? 'pret' : 'attente') as EtatPiece, dit: formulaire ? 'rangé' : 'à remplir depuis les réponses, puis ranger' },
    ...piecesDuClasseur(papiers, membres, c, jour).filter((l) => l.n === '3' || l.n === '4'),
    { n: '5a', titre: 'Attestation d’hébergement', ...etatDoc('05') },
    ...piecesDuClasseur(papiers, membres, c, jour).filter((l) => l.n === '5b'),
    { n: '5c', titre: 'Trois quittances des charges', etat: (signees === 3 ? 'pret' : 'attente') as EtatPiece, dit: `${signees} sur 3 signées` },
    { n: '6', titre: 'Attestation de l’employeur NYM SARL', ...etatDoc('04') },
    ...piecesDuClasseur(papiers, membres, c, jour).filter((l) => !['3', '4', '5b'].includes(l.n)),
  ];
  const pretes = bordereau.filter((l) => l.etat === 'pret').length;

  const prepare = () => {
    if (modifie) enregistreLeDossier({ branchId, valeurs: v, membres });
    const r = prepareLesDocuments({ branchId, moi, c, v });
    if (r.erreur) { toast(r.erreur); return; }
    setModifie(false);
    toast(`${r.crees} préparé${r.crees > 1 ? 's' : ''}, ${r.repris} repris${r.laisses ? `, ${r.laisses} déjà en signature ou signé${r.laisses > 1 ? 's' : ''}, laissés tels quels` : ''}.`, 6000);
  };

  const telechargePdf = async (quoi: 'bordereau' | 'reponses') => {
    setOccupe(quoi);
    try {
      const octets = quoi === 'bordereau' ? await bordereauPdf(v, c) : await reponsesPdf(v, c);
      enregistreSous(octets, quoi === 'bordereau' ? `01-bordereau-${c.cle}.pdf` : `02-reponses-au-formulaire-${c.cle}.pdf`);
    } catch { toast('Le PDF n’a pas pu être préparé.'); } finally { setOccupe(''); }
  };

  const assemble = async () => {
    setOccupe('assemble');
    try {
      const nomDe = (id?: string) => personnes.find((p) => p.id === id)?.nom ?? '';
      const joints = papiersAJoindre(papiers, membres, c);
      const papiersDe = (n: string): Morceau[] => joints.filter((j) => j.n === n).map((j) => ({ genre: 'papier', titre: j.qui, papier: j.papier, titulaireNom: nomDe(j.papier.titulaire.slice(5)) || j.qui }));
      const doc = async (n: string): Promise<Morceau[]> => {
        const p = docDe(n);
        return p ? [{ genre: 'pdf', titre: p.titre, octets: await octetsDuDocument(p, nomMaison) }] : [];
      };
      const morceaux: Morceau[] = [
        { genre: 'pdf', titre: 'Bordereau', octets: await bordereauPdf(v, c) },
        ...await doc('03'),
        ...papiersDe('2'),
        ...papiersDe('3'), ...papiersDe('4'),
        ...await doc('05'), ...papiersDe('5b'),
        ...await doc('06'), ...await doc('07'), ...await doc('08'),
        ...await doc('04'),
        ...papiersDe('7'), ...papiersDe('8'), ...papiersDe('9'), ...papiersDe('10'), ...papiersDe('11'), ...papiersDe('12'), ...papiersDe('13'),
      ];
      const { octets, manquants } = await assembleLeDossierDeBourse({ morceaux, jour: dateEnLettres(jour) });
      enregistreSous(octets, `Dossier-bourse-${c.cle}.pdf`);
      toast(manquants.length ? `Assemblé, mais ${manquants.length} page(s) illisible(s) : ${manquants.slice(0, 2).join(', ')}.` : 'Dossier assemblé : un PDF dans l’ordre du bordereau.', 7000);
    } catch { toast('L’assemblage n’a pas abouti. Vérifiez le réseau et recommencez.'); } finally { setOccupe(''); }
  };

  const champ = (cle: string) => {
    const d = CHAMPS.find((x) => x.cle === cle)!;
    return (
      <Field key={cle} label={<>{d.libelle}{d.aide ? <small className="bou-aide"> · {d.aide}</small> : null}</>}>
        {d.type === 'choix' ? (
          <Select value={v[cle] ?? d.defaut ?? ''} onChange={(e) => change(cle, e.target.value)}>
            {(d.choix ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        ) : (
          <Input id={`bourse-${cle}`} type={d.type === 'date' ? 'date' : 'text'} inputMode={d.type === 'montant' ? 'numeric' : undefined}
            value={v[cle] ?? ''} placeholder={d.defaut ?? ''} onChange={(e) => change(cle, e.target.value)} />
        )}
      </Field>
    );
  };

  const volet = (x: Volet, corps: React.ReactNode, resume: string) => (
    <section className="bou-volet" key={x}>
      <button type="button" className="bou-volet__tete" aria-expanded={ouvert === x} onClick={() => setOuvert(ouvert === x ? null : x)}>
        <span className="bou-volet__titre">{VOLETS.find((y) => y.v === x)!.titre}</span>
        <span className="bou-volet__resume">{resume}</span>
      </button>
      {ouvert === x && <div className="bou-volet__corps">{corps}</div>}
    </section>
  );

  const resteConst = aSaisir(v).filter((x) => x.groupe !== 'annee').length;
  const resteAnnee = aSaisir(v, 'annee').length;

  return (
    <div className="bou">
      <div className="bou-tete">
        <div>
          <div className="bou-tete__sur">Campagne {c.cle} · revenus de {c.reference}</div>
          <div className="bou-tete__titre">Famille AHOUANSOU · BOYA</div>
          <div className="bou-tete__dit">
            {[1, 2, 3].map((n) => `${lis(v, `e${n}Prenom`).startsWith('[') ? `Enfant ${n}` : lis(v, `e${n}Prenom`)} en ${classeA(lis(v, `e${n}Classe2027`), c.rentree)}`).join(' · ')}
          </div>
        </div>
        <div className="bou-tete__rebours"><b>{semaines} semaine{semaines > 1 ? 's' : ''}</b>avant le dépôt du {dateEnLettres(c.depot)}</div>
        <div className="bou-tete__barre" role="img" aria-label={`${pretes} pièces sur ${bordereau.length} prêtes`}><i style={{ width: `${Math.round((pretes / bordereau.length) * 100)}%` }} /></div>
        <div className="bou-tete__compte">{pretes} pièce{pretes > 1 ? 's' : ''} sur {bordereau.length} prête{pretes > 1 ? 's' : ''}</div>
      </div>

      {maintenant.length > 0 && (
        <div className="sec-bandeau">
          <b>À faire maintenant · </b>
          {maintenant.slice(0, 3).map((r) => r.titre).join(' · ')}{maintenant.length > 3 ? ` · et ${maintenant.length - 3} autre${maintenant.length - 3 > 1 ? 's' : ''}` : ''}
        </div>
      )}

      {volet('etat', (
        <>
          <div className="bou-pieces">
            {bordereau.map((l) => (
              <div className="bou-piece" key={l.n}>
                <span className="bou-piece__n">{l.n}</span>
                <span className="bou-piece__titre">{l.titre}</span>
                <span className={`bou-etat bou-etat--${l.etat}`}>{l.dit || DIT[l.etat]}</span>
              </div>
            ))}
          </div>
          <p className="mnd-muted" style={{ fontSize: 12.5, margin: 0 }}>
            Les papiers se rangent dans l’onglet « Les papiers », à la personne. Pour un bulletin ou un relevé, la date de délivrance dit le mois.
          </p>
          <details className="bou-calendrier">
            <summary>Le calendrier de la campagne ({rappels.filter((r) => r.fait).length} gestes faits sur {rappels.length})</summary>
            <ul>
              {rappels.map((r, i) => (
                <li key={i} className={r.fait ? 'bou-fait' : r.quand <= jour ? 'bou-du' : ''}>
                  <span className="bou-quand">{dateEnLettres(r.quand)}</span><span>{r.fait ? '✓ ' : ''}{r.titre}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      ), `${pretes} sur ${bordereau.length} prêtes`)}

      {volet('constantes', (
        <>
          <div className="bou-groupe">
            <h3>Relier chacun à ses papiers</h3>
            <div className="bou-grille">
              {MEMBRES.map((m) => (
                <Field key={m.cle} label={m.nom}>
                  <Select value={membres[m.cle] ?? ''} onChange={(e) => relie(m.cle, e.target.value)}>
                    <option value="">Personne du classeur…</option>
                    {personnes.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
            {personnes.length < 6 && <p className="mnd-muted" style={{ fontSize: 12.5, margin: 0 }}>Une personne manque ? Ajoutez-la dans « Les papiers » (bouton « Une personne »).</p>}
          </div>
          {GROUPES.map((g) => (
            <div className="bou-groupe" key={g.g}>
              <h3>{g.titre}</h3>
              <div className="bou-grille">{CHAMPS.filter((x) => x.groupe === g.g).map((x) => champ(x.cle))}</div>
            </div>
          ))}
        </>
      ), resteConst ? `${resteConst} à saisir` : 'complètes')}

      {volet('annee', (
        <div className="bou-groupe">
          <p className="mnd-muted" style={{ margin: 0, fontSize: 13 }}>Les seuls chiffres qui changent chaque année. Ils nourrissent l’attestation de l’employeur, l’attestation d’hébergement, les quittances et les réponses au formulaire.</p>
          <div className="bou-grille">{CHAMPS.filter((x) => x.groupe === 'annee').map((x) => champ(x.cle))}</div>
        </div>
      ), resteAnnee ? `${resteAnnee} à saisir` : 'complète')}

      {volet('documents', (
        <>
          <p className="mnd-muted" style={{ margin: 0, fontSize: 13 }}>
            Six documents du Secrétariat, privés (la direction seule) : préparés en brouillon depuis les constantes et l’année, ils se signent dans l’éditeur. Un champ manquant reste entre crochets et bloque la signature. Les reprendre ne touche pas un document déjà signé.
          </p>
          <div className="sec-actions">
            <Button variant="copper" onClick={prepare}>{docs.length ? 'Reprendre les documents' : 'Préparer les documents'}</Button>
            <Button variant="ghost" onClick={() => void telechargePdf('bordereau')} disabled={!!occupe}>01 · Bordereau (PDF)</Button>
            <Button variant="ghost" onClick={() => void telechargePdf('reponses')} disabled={!!occupe}>02 · Réponses au formulaire (PDF)</Button>
          </div>
          <div className="bou-pieces">
            {[['03', 'Lettre de demande · vos deux signatures'], ['04', 'Attestation NYM SARL · son mandataire, sous le cachet'], ['05', 'Attestation d’hébergement · M. Thomas BOYA'],
              ['06', 'Quittance 1'], ['07', 'Quittance 2'], ['08', 'Quittance 3']].map(([n, dit]) => {
              const p = docDe(n);
              const e = etatDoc(n);
              return (
                <div className="bou-piece" key={n}>
                  <span className="bou-piece__n">{n}</span>
                  <span className="bou-piece__titre">{p?.titre ?? dit}<small>{p ? ` · ${dateEnLettres(p.date)}` : ''}</small></span>
                  {p ? <button type="button" className="sec-puce" onClick={() => surOuvre(p.id)}>{e.dit} · ouvrir</button> : <span className="bou-etat bou-etat--manque">à préparer</span>}
                </div>
              );
            })}
          </div>
        </>
      ), `${docs.filter((p) => p.etat === 'signe').length} sur 6 signés`)}

      {volet('deposer', (
        <>
          <p className="mnd-muted" style={{ margin: 0, fontSize: 13 }}>
            Un seul PDF, dans l’ordre du bordereau : le bordereau, la lettre, le formulaire rangé, les papiers, les attestations et les quittances. Les copies de papiers portent la marque « copie remise à la section consulaire · bourse scolaire ». Il s’envoie par courriel ou s’imprime pour le guichet.
          </p>
          {bordereau.some((l) => l.etat !== 'pret') && (
            <div className="sec-bandeau sec-bandeau--alerte">Encore à finir : {bordereau.filter((l) => l.etat !== 'pret').map((l) => l.n).join(', ')}. On peut assembler quand même, pour relire.</div>
          )}
          <div className="sec-actions">
            <Button variant="copper" onClick={() => void assemble()} disabled={!!occupe}>{occupe === 'assemble' ? 'Assemblage…' : 'Assembler le dossier (PDF)'}</Button>
          </div>
        </>
      ), `dépôt au plus tard le ${dateEnLettres(c.depot)}`)}

      {modifie && (
        <div className="bou-barre">
          <span>{ouvert ? VOLETS.find((x) => x.v === ouvert)!.titre : 'Le dossier'} · des changements ne sont pas encore gardés</span>
          <Button variant="copper" onClick={garde}>Enregistrer</Button>
        </div>
      )}
    </div>
  );
}
