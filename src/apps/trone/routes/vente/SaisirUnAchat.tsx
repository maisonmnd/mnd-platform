import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field, Input, Select, refus } from '../../../../ds/components';
import { ChampDeDate } from '../../../../ds/dates';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { uid, useStore } from '../../../../shared/store';
import { useStaff } from '../../../../shared/auth';
import { staffAccessStore } from '../equipe/data';
import { useCashboxes, cashboxCurrency, caisseParDefaut, usePorteurs, type PieceJointe } from '../../../../shared/finance';
import { useFournisseurs, useProduitsStock } from '../../../../shared/stock';
import { demandeAClaude, photoPourClaude, versionDeIaMaison } from '../../../../shared/ia-maison';
import { peutDemander, saitLAchatParPhotos } from '../../../../shared/ia-maison-pur';
import { deposerFichier } from '../../../../shared/fil';
import {
  CHANTIER_DE_L_ACHAT, USAGE_DE_L_ACHAT, PHOTOS_MAX, SCHEMA_DE_L_ACHAT, FAMILLES_LUES, FAMILLE_DITE,
  consigneDeLAchat, lectureDeLAchat, lignesDepuisLaLecture, compteurDeLAchat, ceQuiManqueALAchat, ditCeQuiManqueALAchat,
  nomComparable, totalDeLaLigne, type CadreLu, type FamilleLue, type FicheConnue, type LigneDAchat,
} from '../../../../shared/achat-par-photos-pur';
import { saisirLAchat } from '../../../../shared/achat-par-photos';
import { todayISO } from '../clients/_shared';

/* ══ « SAISIR UN ACHAT » — 1er novembre 2026 ══════════════════════════════
   Maquette « Dépenses du jour et achats », validée par « construis ». Les
   photos prises chez le fournisseur ; Claude lit les produits ; elle corrige
   noms, quantités et prix jusqu'à ce que le compteur tombe juste ; « C'est
   saisi » écrit en un geste fournisseur, fiches, bon reçu, stock, dépense et
   photos (`shared/achat-par-photos`). Sans Claude, les lignes se tapent à la
   main : le geste final est le même. */

type Photo = { id: string; fichier: File; url: string };
const NOUVEAU = '__nouveau';
const AVANCEE = '__avancee';

/** La vignette d'un produit, découpée dans sa photo selon le cadre lu. */
async function vignette(fichier: File, cadre: CadreLu): Promise<string | null> {
  try {
    const b = await createImageBitmap(fichier);
    const sx = Math.round(cadre.x * b.width); const sy = Math.round(cadre.y * b.height);
    const sl = Math.max(1, Math.round(cadre.l * b.width)); const sh = Math.max(1, Math.round(cadre.h * b.height));
    const k = Math.min(1, 160 / Math.max(sl, sh));
    const toile = document.createElement('canvas');
    toile.width = Math.max(1, Math.round(sl * k)); toile.height = Math.max(1, Math.round(sh * k));
    const ctx = toile.getContext('2d');
    if (!ctx) { b.close(); return null; }
    ctx.drawImage(b, sx, sy, sl, sh, 0, 0, toile.width, toile.height);
    b.close();
    return toile.toDataURL('image/jpeg', 0.8);
  } catch { return null; }
}

const ligneVide = (): LigneDAchat => ({ id: `la-${uid()}`, nom: '', famille: 'consommable', unite: 'pièce', quantite: 1, prix: null, ficheId: '' });
const entier = (s: string): number | null => { const t = s.replace(/[^\d]/g, ''); return t ? parseInt(t, 10) : null; };

export default function SaisirUnAchat({ onVoirLesAchats }: { onVoirLesAchats?: () => void }) {
  const { branch, currency } = useBranch();
  const moi = useStaff();
  const accesTous = useStore(staffAccessStore)[0];
  const mesDomaines = accesTous[moi?.user_id ?? ''] ?? {};
  const [fournisseurs] = useFournisseurs();
  const [produits] = useProduitsStock();
  const [caisses] = useCashboxes();
  const [porteurs] = usePorteurs();

  const fiches: FicheConnue[] = useMemo(
    () => produits.filter((p) => p.branchId === branch.id).map((p) => ({ id: p.id, nom: p.nom, famille: p.famille, prixAchatXof: p.prixAchatXof, actif: p.actif })),
    [produits, branch.id],
  );
  const mesFournisseurs = useMemo(() => fournisseurs.filter((f) => f.branchId === branch.id && f.actif), [fournisseurs, branch.id]);
  const mesCaisses = useMemo(() => caisses.filter((c) => c.branchId === branch.id && cashboxCurrency(c) === currency), [caisses, branch.id, currency]);
  const caisseDuJour = caisseParDefaut(caisses, branch.id, currency)?.name ?? '';

  const [saisieId, setSaisieId] = useState(() => `sa-${uid()}`);
  const [fournisseurId, setFournisseurId] = useState('');
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauTel, setNouveauTel] = useState('');
  const [date, setDate] = useState(todayISO());
  const [paye, setPaye] = useState('');
  const [caisse, setCaisse] = useState('');
  const [porteur, setPorteur] = useState((moi?.name ?? '').trim());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [lignes, setLignes] = useState<LigneDAchat[]>([]);
  const [vignettes, setVignettes] = useState<Record<string, string>>({});
  const [lit, setLit] = useState(false);
  const [mot, setMot] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<{ numero: string; resume: string[] } | null>(null);
  const [saitLire, setSaitLire] = useState<boolean | null>(null);
  const champPhotos = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivant = true;
    void versionDeIaMaison().then((v) => { if (vivant) setSaitLire(saitLAchatParPhotos(v)); });
    return () => { vivant = false; };
  }, []);
  /* Les adresses locales des photos se rendent quand la photo part. */
  useEffect(() => () => { photos.forEach((p) => URL.revokeObjectURL(p.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const caisseChoisie = caisse === AVANCEE ? '' : (caisse || caisseDuJour);
  const avancee = caisse === AVANCEE;
  const peutLire = saitLire === true && peutDemander(moi?.role, 'achat', mesDomaines);
  const payeXof = entier(paye) ?? 0;
  const compteur = compteurDeLAchat(lignes, payeXof);
  const saisie = {
    saisieId, fournisseurId: fournisseurId === NOUVEAU ? '' : fournisseurId,
    ...(fournisseurId === NOUVEAU || !fournisseurId ? { nouveauFournisseur: { nom: nouveauNom, telephone: nouveauTel } } : {}),
    date, payeXof, caisse: caisseChoisie, avancee, porteur, lignes,
  };
  const manques = ceQuiManqueALAchat(saisie, todayISO());

  const ajoutePhotos = (liste: FileList | null) => {
    if (!liste) return;
    const neuves = [...liste].filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, PHOTOS_MAX - photos.length))
      .map((f) => ({ id: `ph-${uid()}`, fichier: f, url: URL.createObjectURL(f) }));
    if (neuves.length < liste.length) refus(`Six photos au plus par achat.`);
    setPhotos((p) => [...p, ...neuves]);
  };
  const retirePhoto = (id: string) => setPhotos((p) => {
    const x = p.find((q) => q.id === id); if (x) URL.revokeObjectURL(x.url);
    return p.filter((q) => q.id !== id);
  });

  const lireLesPhotos = async () => {
    if (!photos.length) { refus('Ajoutez d’abord les photos de l’achat.'); return; }
    setLit(true); setMot('Claude lit les photos…');
    try {
      const images = await Promise.all(photos.map((p) => photoPourClaude(p.fichier)));
      const r = await demandeAClaude<unknown>({
        chantier: CHANTIER_DE_L_ACHAT, usage: USAGE_DE_L_ACHAT,
        systeme: consigneDeLAchat({ fiches }),
        messages: [{ role: 'user', content: `Voici ${photos.length === 1 ? 'la photo' : `les ${photos.length} photos`} d’un achat. Rends chaque produit, rien de plus.` }],
        images, schema: SCHEMA_DE_L_ACHAT, maxTokens: 4000,
      });
      if (!r.ok) { setMot(`${r.message} Ajoutez les produits à la main.`); return; }
      const lu = lectureDeLAchat(r.data, { photos: photos.length, fiches });
      if (!lu || lu.produits.length === 0) { setMot('Aucun produit lu sur ces photos. Ajoutez-les à la main.'); return; }
      const neuves = lignesDepuisLaLecture(lu, fiches, () => `la-${uid()}`);
      setLignes((l) => [...l, ...neuves]);
      if (!fournisseurId && lu.fournisseur) {
        const connu = mesFournisseurs.find((f) => nomComparable(f.nom) === nomComparable(lu.fournisseur));
        if (connu) setFournisseurId(connu.id); else { setFournisseurId(NOUVEAU); setNouveauNom(lu.fournisseur); }
      }
      const connues = neuves.filter((l) => l.ficheId).length;
      setMot(`${neuves.length} produit${neuves.length > 1 ? 's' : ''} lu${neuves.length > 1 ? 's' : ''}, dont ${connues} déjà au stock. Les quantités et les prix sont à vous.${lu.avertissements.length ? ` ${lu.avertissements.join(' ')}` : ''}`);
      const v: Record<string, string> = {};
      for (const l of neuves) {
        const p = l.photo !== undefined ? photos[l.photo] : undefined;
        if (p && l.cadre) { const d = await vignette(p.fichier, l.cadre); if (d) v[l.id] = d; }
      }
      setVignettes((x) => ({ ...x, ...v }));
    } finally {
      setLit(false);
    }
  };

  const change = (id: string, champ: Partial<LigneDAchat>) => setLignes((l) => l.map((x) => (x.id === id ? { ...x, ...champ } : x)));
  const choisitLaFiche = (id: string, ficheId: string) => {
    const f = fiches.find((x) => x.id === ficheId);
    change(id, f ? { ficheId, nom: f.nom, famille: (FAMILLES_LUES.includes(f.famille as FamilleLue) ? f.famille : 'consommable') as FamilleLue, ...((f.prixAchatXof ?? 0) > 0 ? { prix: Math.round(f.prixAchatXof as number) } : {}) } : { ficheId: '' });
  };

  const cEstSaisi = async () => {
    if (manques.length) { refus(ditCeQuiManqueALAchat(manques)); return; }
    setEnCours(true);
    try {
      /* Les photos d'abord, au coffre des pièces des dépenses : la preuve
         compte plus que la vitesse. Une photo refusée ne bloque pas l'achat. */
      const pieces: PieceJointe[] = [];
      for (const p of photos) {
        const pj = await deposerFichier(branch.id, p.fichier, 'depense');
        if (pj) pieces.push(pj);
      }
      const r = saisirLAchat(saisie, { branchId: branch.id, parNom: (moi?.name ?? '').trim(), role: moi?.role, photos: pieces, aujourdhui: todayISO() });
      if (!r.ok) { refus(r.erreur); return; }
      const perdues = photos.length - pieces.length;
      setResultat({ numero: r.numero, resume: perdues > 0 ? [...r.resume, `${perdues} photo${perdues > 1 ? 's n’ont' : ' n’a'} pas pu être jointe${perdues > 1 ? 's' : ''}.`] : r.resume });
    } finally {
      setEnCours(false);
    }
  };

  const recommence = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setSaisieId(`sa-${uid()}`); setFournisseurId(''); setNouveauNom(''); setNouveauTel(''); setDate(todayISO()); setPaye('');
    setCaisse(''); setPhotos([]); setLignes([]); setVignettes({}); setMot(''); setResultat(null);
  };

  if (resultat) {
    return (
      <section style={{ marginTop: 16, border: '1px solid #4c7a4c', borderRadius: 3, padding: '16px 18px', background: 'var(--surface-card)' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}>Saisi, en un geste.</div>
        <ul style={{ margin: '10px 0 14px', paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13.5 }}>
          {resultat.resume.map((l) => <li key={l}>{l}</li>)}
        </ul>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="copper" onClick={recommence}>Saisir un autre achat</Button>
          {onVoirLesAchats && <Button variant="ghost" onClick={onVoirLesAchats}>Voir le bon {resultat.numero}</Button>}
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.55, maxWidth: '72ch' }}>
        Un achat payé et emporté chez le fournisseur. Ajoutez les photos, {peutLire ? 'Claude propose les produits, ' : ''}corrigez noms, quantités et prix
        jusqu’à ce que le compte tombe juste. « C’est saisi » écrit le fournisseur, les fiches, le bon reçu, le stock, la dépense et les photos.
      </div>

      <div className="tr-grid tr-grid--3">
        <Field label="Fournisseur">
          <Select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)}>
            <option value="">Choisir…</option>
            {mesFournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            <option value={NOUVEAU}>Nouveau fournisseur…</option>
          </Select>
        </Field>
        <Field label="Date de l’achat"><ChampDeDate compact sens="arriere" value={date} onChange={(iso) => setDate(iso)} /></Field>
        <Field label={`Payé · ${currency === 'XOF' ? 'F' : currency}`}>
          <Input inputMode="numeric" value={paye} placeholder="0" onChange={(e) => setPaye(e.target.value.replace(/[^\d]/g, ''))} />
        </Field>
      </div>
      {fournisseurId === NOUVEAU && (
        <div className="tr-grid tr-grid--2">
          <Field label="Nom du fournisseur"><Input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} /></Field>
          <Field label="Son téléphone (facultatif)"><Input value={nouveauTel} onChange={(e) => setNouveauTel(e.target.value)} /></Field>
        </div>
      )}
      <div className="tr-grid tr-grid--2">
        <Field label="D’où sort l’argent">
          <Select value={caisse || caisseDuJour} onChange={(e) => setCaisse(e.target.value)}>
            {mesCaisses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            <option value={AVANCEE}>Avancé de sa poche</option>
          </Select>
        </Field>
        <Field label="Qui a fait l’achat">
          <Select value={porteur} onChange={(e) => setPorteur(e.target.value)}>
            <option value="">Choisir…</option>
            {[...new Set([...(moi?.name ? [moi.name.trim()] : []), ...porteurs])].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
      </div>

      {/* ── Les photos ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {photos.map((p, i) => (
          <div key={p.id} style={{ position: 'relative', width: 96, height: 72, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--hairline)' }}>
            <img src={p.url} alt={`Photo ${i + 1} de l’achat`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button type="button" onClick={() => retirePhoto(p.id)} aria-label={`Retirer la photo ${i + 1}`}
              style={{ position: 'absolute', top: 2, right: 2, border: 'none', borderRadius: 99, width: 20, height: 20, background: 'rgba(31,35,80,.75)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '20px' }}>×</button>
          </div>
        ))}
        {photos.length < PHOTOS_MAX && (
          <Button size="sm" variant="ghost" onClick={() => champPhotos.current?.click()}>+ Photos</Button>
        )}
        <input ref={champPhotos} type="file" accept="image/*" multiple hidden onChange={(e) => { ajoutePhotos(e.target.files); e.target.value = ''; }} />
        {peutLire && photos.length > 0 && (
          <Button size="sm" variant="copper" disabled={lit} onClick={() => void lireLesPhotos()}>{lit ? 'Lecture…' : 'Lire les photos'}</Button>
        )}
      </div>
      {mot && <div style={{ fontSize: 12.5, borderLeft: '2px solid var(--color-copper)', paddingLeft: 10 }}>{mot}</div>}

      {/* ── Les lignes ── */}
      <div style={{ overflowX: 'auto' }}>
        <table className="trv-mag-kardex" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th></th><th>Produit</th><th>Famille</th><th>Fiche du stock</th>
              <th style={{ textAlign: 'right' }}>Qté</th><th style={{ textAlign: 'right' }}>Prix unitaire</th><th style={{ textAlign: 'right' }}>Total</th><th></th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr><td colSpan={8} className="mnd-muted" style={{ textAlign: 'center', padding: 18 }}>
                Aucun produit. {peutLire ? '« Lire les photos » les propose, ou ' : ''}« + Produit » en ajoute un.
              </td></tr>
            )}
            {lignes.map((l) => (
              <tr key={l.id}>
                <td style={{ width: 52 }}>
                  {vignettes[l.id]
                    ? <img src={vignettes[l.id]} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 3 }} />
                    : <span style={{ display: 'inline-block', width: 44, height: 44, borderRadius: 3, background: 'var(--hairline)' }} />}
                </td>
                <td><Input value={l.nom} onChange={(e) => change(l.id, { nom: e.target.value })} aria-label="Nom du produit" disabled={!!l.ficheId} /></td>
                <td>
                  <Select value={l.famille} onChange={(e) => change(l.id, { famille: e.target.value as FamilleLue })} aria-label="Famille" disabled={!!l.ficheId}>
                    {FAMILLES_LUES.map((f) => <option key={f} value={f}>{FAMILLE_DITE[f]}</option>)}
                  </Select>
                </td>
                <td>
                  <Select value={l.ficheId} onChange={(e) => choisitLaFiche(l.id, e.target.value)} aria-label="Fiche du stock">
                    <option value="">Nouvelle fiche</option>
                    {fiches.filter((f) => f.actif !== false).map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </Select>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Input inputMode="numeric" value={String(l.quantite || '')} aria-label="Quantité" style={{ width: 64, textAlign: 'right' }}
                    onChange={(e) => change(l.id, { quantite: entier(e.target.value) ?? 0 })} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Input inputMode="numeric" value={l.prix === null ? '' : String(l.prix)} placeholder="à écrire" aria-label="Prix unitaire" style={{ width: 96, textAlign: 'right' }}
                    onChange={(e) => change(l.id, { prix: entier(e.target.value) })} />
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{l.prix === null ? '·' : fmtMoney(totalDeLaLigne(l), currency)}</td>
                <td><button type="button" className="trv-minibtn" onClick={() => setLignes((x) => x.filter((y) => y.id !== l.id))} aria-label="Retirer ce produit">Retirer</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div><Button size="sm" variant="ghost" onClick={() => setLignes((l) => [...l, ligneVide()])}>+ Produit</Button></div>

      {/* ── Le compteur ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '8px 22px', alignItems: 'baseline', padding: '10px 14px', borderRadius: 3, fontSize: 13.5,
        border: `1px solid ${compteur.juste ? '#4c7a4c' : 'var(--color-copper)'}`, background: 'var(--surface-card)',
      }} aria-live="polite">
        <span>Lignes <b style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400 }}>{fmtMoney(compteur.totalXof, currency)}</b></span>
        <span>Payé <b style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 400 }}>{fmtMoney(compteur.payeXof, currency)}</b></span>
        <span className="mnd-muted" style={{ flex: '1 1 220px' }}>{compteur.dit}</span>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="copper" disabled={enCours || manques.length > 0} onClick={() => void cEstSaisi()}>{enCours ? 'Saisie…' : 'C’est saisi'}</Button>
        {manques.length > 0 && <span className="mnd-muted" style={{ fontSize: 12 }}>{ditCeQuiManqueALAchat(manques)}</span>}
      </div>
    </section>
  );
}
