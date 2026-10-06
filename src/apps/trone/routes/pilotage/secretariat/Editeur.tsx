import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Input, Select, Textarea, toast } from '../../../../../ds/components';
import { useAuth } from '../../../../../shared/auth';
import { maisonNom } from '../../../../../shared/identite';
import { envoieSurWhatsApp } from '../../../../../shared/whatsapp';
import { ditLePartage, ouvreWhatsAppAvecLePdf } from '../../../../../shared/partage-whatsapp';
import {
  annuleLeDocument, annuleLesSignatures, chargeMaSignature, duplique, effaceLaPiece, entreprises, finalise, metsAJour, pieces, resous,
  signatairesDe, signeLaPiece, useSecretariat, versLePdf, type DocumentResolu,
} from '../../../../../shared/secretariat';
import {
  annulable, APPELS, clotures, modifiable, supprimable, peutSigner, rangeDansLeCadre, restentASigner, type Cadre, type Piece, type Pose,
} from '../../../../../shared/secretariat-pur';
import { aCompleter, modeleDe, remplisDepuisEquipe } from '../../../../../shared/secretariat-modeles';
import { TAMPON_A_DATER, tamponsDe } from '../../../../../shared/secretariat-tampons';
import { useStaff as useEquipe } from '../../equipe/data';
import { Apercu } from './Apercu';

/* L'ÉDITEUR — à gauche ce qu'on écrit, à droite la page A4 telle qu'elle
   sortira (maquette, écran 3). Le texte se garde à chaque frappe. Dès la
   première signature, il ne bouge plus. */

const CADRES: { v: Cadre; l: string }[] = [
  { v: 'droite', l: 'Bas à droite' }, { v: 'centre', l: 'Bas au centre' }, { v: 'gauche', l: 'Bas à gauche' }, { v: 'libre', l: 'À la main' },
];

const dateEnClair = (iso?: string) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export function Editeur({ pieceId, direction, onClose, surOuvre }: {
  pieceId: string;
  direction: boolean;
  onClose: () => void;
  surOuvre: (id: string) => void;
}) {
  const [lignes] = useSecretariat();
  const { session } = useAuth();
  const moi = session?.user?.id ?? '';
  const [equipe] = useEquipe();
  const p = pieces(lignes).find((x) => x.id === pieceId);
  const [r, setR] = useState<DocumentResolu | null>(null);
  const [occupe, setOccupe] = useState('');
  const [numeroWa, setNumeroWa] = useState('');
  /* Le PDF d'un document SIGNÉ se prépare dès l'ouverture : le toucher sur
     « WhatsApp · l'app » partage aussitôt (le navigateur l'exige). */
  const [fichierPret, setFichierPret] = useState<File | null>(null);
  const [annuler, setAnnuler] = useState(false);

  /* L'aperçu se résout à chaque changement (images en cache). */
  useEffect(() => {
    if (!p) return;
    let vivant = true;
    void resous(p, lignes, maisonNom()).then((x) => { if (vivant) setR(x); });
    return () => { vivant = false; };
  }, [p, lignes]);

  useEffect(() => {
    let vivant = true;
    setFichierPret(null);
    if (!r || r.piece.etat !== 'signe') return;
    void import('../../../../../shared/pdf').then((mod) => mod.pieceEcriteEnFichier(versLePdf(r))).then((f) => { if (vivant) setFichierPret(f); }).catch(() => {});
    return () => { vivant = false; };
  }, [r]);

  const sigs = signatairesDe(lignes);
  const entreprise = p?.entrepriseId ? entreprises(lignes).find((e) => e.id === p.entrepriseId) : undefined;
  const reste = useMemo(() => (p ? aCompleter(p.destinataire, p.objet, p.corps) : 0), [p]);

  if (!p) return <div className="mnd-muted" style={{ padding: 20 }}>Ce document n’existe plus.</div>;
  const ouvert = modifiable(p);
  const m = modeleDe(p.modele);
  const maj = (patch: Partial<Piece>) => metsAJour(p, patch);

  /* Changer les signataires ou le cadre range de nouveau la zone. */
  const range = (signataires: Piece['signataires'], cadre: Cadre, tampon = p.tampon) => {
    const cles = [...signataires.map((s) => `sig:${s.userId}`), ...(tampon ? ['tampon'] : [])];
    if (cadre === 'libre') {
      const gardees = p.poses.filter((q) => cles.includes(q.cle));
      const neuves = rangeDansLeCadre('droite', cles.filter((c) => !gardees.some((g) => g.cle === c)));
      return [...gardees, ...neuves];
    }
    return rangeDansLeCadre(cadre, cles);
  };
  const basculeSignataire = (s: { userId: string; nom: string; qualite: string }) => {
    const deja = p.signataires.some((x) => x.userId === s.userId);
    const signataires = deja ? p.signataires.filter((x) => x.userId !== s.userId) : [...p.signataires, s];
    maj({ signataires, poses: range(signataires, p.cadre) });
  };

  const appelChange = (appel: string) => {
    const avant = clotures(p.appel || 'Madame, Monsieur,', p.entite);
    const i = avant.indexOf(p.cloture);
    const apres = clotures(appel || 'Madame, Monsieur,', p.entite);
    maj({ appel, cloture: i >= 0 ? apres[i] : p.cloture });
  };

  /* ── SIGNER ── */
  const signeMoi = async () => {
    if (reste > 0) { toast(`Il reste ${reste} élément${reste > 1 ? 's' : ''} [à compléter] dans le texte.`); return; }
    setOccupe('signe');
    const image = await chargeMaSignature(moi);
    setOccupe('');
    if (!image) { toast('Déposez d’abord votre signature : bouton « Ma signature ».'); return; }
    const suite = signeLaPiece(p, moi, image);
    toast(suite.etat === 'signe' ? `Signé : ${suite.numero}.` : 'Votre signature est posée ; le document attend les autres signatures.');
  };
  const signePourLEntreprise = () => {
    if (reste > 0) { toast(`Il reste ${reste} élément${reste > 1 ? 's' : ''} [à compléter] dans le texte.`); return; }
    if (!entreprise?.signature) { toast('Cette entreprise n’a pas encore de signature : ouvrez-la et dessinez-la.'); return; }
    const suite = signeLaPiece(p, 'entreprise', entreprise.signature);
    toast(suite.etat === 'signe' ? `Signé : ${suite.numero}.` : 'Signature posée.');
  };

  /* ── LE PDF ── */
  const pdf = async (quoi: 'apercu' | 'telecharge' | 'whatsapp' | 'app') => {
    if (!r) return;
    setOccupe(quoi);
    try {
      const mod = await import('../../../../../shared/pdf');
      const d = versLePdf(r);
      if (quoi === 'apercu') await mod.pieceEcriteApercu(d);
      else if (quoi === 'telecharge') await mod.pieceEcritePdf(d);
      else if (quoi === 'app') {
        const fichier = fichierPret ?? await mod.pieceEcriteEnFichier(d);
        if (!fichierPret) setFichierPret(fichier);
        const r2 = await ouvreWhatsAppAvecLePdf({ fichier, numero: numeroWa.trim() || undefined, texte: `${p.titre}${p.numero ? ` n° ${p.numero}` : ''}, ci-joint.` });
        const mot = ditLePartage(r2);
        if (mot) toast(mot, 7000);
      } else {
        if (!numeroWa.trim()) { toast('Le numéro WhatsApp du destinataire.'); return; }
        const piece = await mod.pieceEcriteEnPiece(d);
        const res = await envoieSurWhatsApp({ numero: numeroWa.trim(), texte: `${p.titre}${p.numero ? ` n° ${p.numero}` : ''}, ci-joint.`, piece, branchId: p.branchId });
        toast(res.ok ? (res.enAttente ? 'Hors ligne : le document partira au retour du réseau.' : 'Document envoyé sur WhatsApp.') : `Le document n’est pas parti : ${res.erreur}`);
      }
    } catch { toast('Le PDF n’a pas pu être préparé.'); } finally { setOccupe(''); }
  };

  const attendues = restentASigner(p).map((s) => ({ cle: `sig:${s.userId}`, nom: s.nom }));
  const tampons = tamponsDe(p.entite);
  const etat = p.etat === 'signe' ? `Signé · ${p.numero ?? ''}` : p.etat === 'a-signer' ? `En signature · il manque ${attendues.map((a) => a.nom).join(', ')}` : p.etat === 'annule' ? 'Annulé' : 'Brouillon';

  return (
    <div className="sec-editeur">
      <div className="sec-editeur__tete">
        <div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }}>{p.titre}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{etat}{p.signeLe ? ` · ${dateEnClair(p.signeLe)}` : ''}</div>
        </div>
        <button type="button" className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)' }} onClick={onClose}>Fermer</button>
      </div>

      {p.aRelire && (
        <div className="sec-bandeau sec-bandeau--alerte">Modèle juridique à faire relire par un juriste ou le comptable avant le premier usage.</div>
      )}
      {reste > 0 && ouvert && (
        <div className="sec-bandeau">Il reste {reste} élément{reste > 1 ? 's' : ''} entre crochets [à compléter] : le document ne se signe pas avant.</div>
      )}

      <div className="sec-editeur__corps">
        <div className="sec-editeur__form">
          <fieldset disabled={!ouvert} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 12, minWidth: 0 }}>
            {p.entite !== 'autre' && (
              <Field label="Qui signe">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {sigs.length === 0 && <span className="mnd-muted" style={{ fontSize: 12.5 }}>Personne n’a encore déposé sa signature (bouton « Ma signature »).</span>}
                  {sigs.map((s) => {
                    const on = p.signataires.some((x) => x.userId === s.userId);
                    return (
                      <button key={s.userId} type="button" className={`sec-puce${on ? ' sec-puce--on' : ''}`} aria-pressed={on}
                        onClick={() => basculeSignataire({ userId: s.userId, nom: s.nom, qualite: s.qualite })}>
                        {on ? '✓ ' : '+ '}Signature de {s.nom}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
            {p.entite === 'autre' && entreprise && (
              <div className="mnd-muted" style={{ fontSize: 12.5 }}>Signé pour {entreprise.nom} par {entreprise.signataire || 'son signataire'}.</div>
            )}
            <Field label="Destinataire"><Textarea rows={3} value={p.destinataire} onChange={(e) => maj({ destinataire: e.target.value })} /></Field>
            <Field label="Objet"><Input value={p.objet} onChange={(e) => maj({ objet: e.target.value })} /></Field>
            <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
              <Field label="Lieu"><Input value={p.lieu} onChange={(e) => maj({ lieu: e.target.value })} /></Field>
              <Field label="Date"><Input type="date" value={p.date} onChange={(e) => maj({ date: e.target.value })} /></Field>
            </div>
            <Field label="Formule d’appel">
              <Select value={p.appel} onChange={(e) => appelChange(e.target.value)}>
                <option value="">(aucune)</option>
                {APPELS.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </Field>
            <Field label="Le texte (une ligne vide sépare les paragraphes)">
              <Textarea rows={12} value={p.corps} onChange={(e) => maj({ corps: e.target.value })} />
            </Field>
            {m.depuisEquipe && (
              <Field label="Remplir depuis la fiche d’un membre de l’équipe">
                <Select value="" onChange={(e) => {
                  const mb = equipe.find((x) => x.id === e.target.value);
                  if (!mb) return;
                  const entree = mb.entreeLe ?? mb.since;
                  const v = { name: mb.name, role: mb.role, entree: entree ? new Date(entree).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '', contrat: mb.contractType ?? '' };
                  maj({ corps: remplisDepuisEquipe(p.corps, v), destinataire: remplisDepuisEquipe(p.destinataire, v), objet: remplisDepuisEquipe(p.objet, v) });
                }}>
                  <option value="">Choisir…</option>
                  {equipe.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Formule de politesse">
              <Select value={p.cloture} onChange={(e) => maj({ cloture: e.target.value })}>
                <option value="">(aucune)</option>
                {clotures(p.appel || 'Madame, Monsieur,', p.entite).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            {p.entite !== 'perso' && (
              <Field label="Le tampon">
                <Select value={p.tampon ?? ''} onChange={(e) => { const t = e.target.value || undefined; maj({ tampon: t, poses: range(p.signataires, p.cadre, t) }); }}>
                  <option value="">Sans tampon</option>
                  {p.entite === 'autre' && <option value="auto">Le tampon de {entreprise?.nom ?? 'l’entreprise'}</option>}
                  {tampons.map((t) => <option key={t.cle} value={t.cle}>{t.nom}</option>)}
                </Select>
              </Field>
            )}
            {p.tampon === TAMPON_A_DATER && (
              <Field label="Date écrite dans le tampon « Reçu le »">
                <Input type="date" value={p.dateTampon || p.date} onChange={(e) => maj({ dateTampon: e.target.value || undefined })} />
              </Field>
            )}
            <Field label="Où poser signatures et tampon">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CADRES.map((c) => (
                  <button key={c.v} type="button" className={`sec-puce${p.cadre === c.v ? ' sec-puce--on' : ''}`} aria-pressed={p.cadre === c.v}
                    onClick={() => maj({ cadre: c.v, poses: c.v === 'libre' ? p.poses : range(p.signataires, c.v) })}>{c.l}</button>
                ))}
              </div>
            </Field>
          </fieldset>

          <div className="sec-actions">
            {peutSigner(p, moi) && <Button variant="copper" onClick={() => void signeMoi()} disabled={!!occupe}>{occupe === 'signe' ? 'Signature…' : 'Signer'}</Button>}
            {p.entite === 'autre' && direction && peutSigner(p, 'entreprise') && <Button variant="copper" onClick={signePourLEntreprise}>Signer pour {entreprise?.nom ?? 'l’entreprise'}</Button>}
            {p.signataires.length === 0 && p.etat === 'brouillon' && (
              <Button variant="copper" onClick={() => { if (reste > 0) { toast(`Il reste ${reste} élément(s) [à compléter].`); return; } const s = finalise(p); toast(`Finalisé : ${s.numero}.`); }}>Finaliser</Button>
            )}
            <Button variant="ghost" onClick={() => void pdf('apercu')} disabled={!!occupe || !r}>Imprimer</Button>
            <Button variant="ghost" onClick={() => void pdf('telecharge')} disabled={!!occupe || !r}>Télécharger le PDF</Button>
            <Button variant="ghost" onClick={() => surOuvre(duplique(p, { auteurId: moi }).id)}>Dupliquer</Button>
            {p.etat === 'signe' && <Button variant="ghost" onClick={() => surOuvre(duplique(p, { auteurId: moi, remplace: true }).id)}>Corriger (nouveau numéro)</Button>}
            {direction && (p.etat === 'a-signer' || p.etat === 'signe') && <Button variant="ghost" onClick={() => { annuleLesSignatures(p); toast('Signatures retirées : le document redevient un brouillon.'); }}>Annuler les signatures</Button>}
            {direction && supprimable(p) && <Button variant="ghost" onClick={() => { if (effaceLaPiece(p)) onClose(); }}>Supprimer le brouillon</Button>}
            {direction && annulable(p) && (
              annuler
                ? <Button variant="ghost" onClick={() => { annuleLeDocument(p); setAnnuler(false); toast(`Document ${p.numero ?? ''} annulé : il reste au registre, barré.`); }}>Confirmer l’annulation</Button>
                : <Button variant="ghost" onClick={() => setAnnuler(true)}>Annuler le document</Button>
            )}
          </div>
          {p.etat === 'signe' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
              <Field label="Envoyer par WhatsApp au"><Input value={numeroWa} onChange={(e) => setNumeroWa(e.target.value)} placeholder="+229 01 …" /></Field>
              <Button variant="ghost" onClick={() => void pdf('whatsapp')} disabled={!!occupe} title="Envoyé par la Maison : la conversation entre dans le fil du Trône">{occupe === 'whatsapp' ? 'Envoi…' : 'Envoyer par la Maison'}</Button>
              <Button variant="ghost" onClick={() => void pdf('app')} disabled={!!occupe} title="Votre application WhatsApp, avec le PDF joint. Ce qui s’y écrit n’entre pas dans le fil de la Maison.">{occupe === 'app' ? 'Préparation…' : 'WhatsApp · l’app'}</Button>
            </div>
          )}
        </div>

        <div className="sec-editeur__page">
          {r ? (
            <Apercu
              r={r}
              signaturesAttendues={attendues}
              glissable={ouvert}
              surPoses={(poses: Pose[]) => { if (ouvert) maj({ poses, cadre: 'libre' }); }}
            />
          ) : <div className="mnd-muted">Mise en page…</div>}
          <p className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6 }}>
            {ouvert ? 'Glissez signatures et tampon dans la zone pointillée ; ils tombent au même endroit sur le PDF.' : 'Document figé : il ne se modifie plus.'}
          </p>
        </div>
      </div>
    </div>
  );
}
