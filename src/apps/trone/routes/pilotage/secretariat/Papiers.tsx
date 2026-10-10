import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Input, Modal, Select, Textarea, toast } from '../../../../../ds/components';
import { jourAn } from '../../../../../shared/calendrier';
import { envoieSurWhatsApp } from '../../../../../shared/whatsapp';
import { ditLePartage, ouvreWhatsAppAvecLePdf } from '../../../../../shared/partage-whatsapp';
import { enregistreLesMentions, mentionsDe, useSecretariat } from '../../../../../shared/secretariat';
import {
  aRenouveler, completude, DOSSIERS, estPersonne, etatDe, etatDit, expirationProposee, lignesDuDossier,
  manquantsDe, marqueObligatoire, numeroDouteux, piecesDe, texteDeLaMarque, titreDuPapier, typeDe, typesPour,
  type Papier, type Titulaire,
} from '../../../../../shared/papiers-pur';
import {
  ajouteUnePersonne, assembleLeDossier, chargeLeClasseur, retireUnePersonne, copieEnMemoire, deposeLesPages, effaceUnPapier, enDataUrl, gardeUnPapier,
  lienDUnePage, modifieUnPapier, noteAuJournal, oublieLeClasseur, papiersDe, personnesDe, remplaceUnPapier, useClasseur,
  motDuRefus,
} from '../../../../../shared/papiers';

/* LES PAPIERS — l'onglet du secrétariat (maquette FBNmp7Q5PPrS9gpd1r613D).

   Une chemise par titulaire, chaque pièce avec son état ; la fiche d'une
   pièce (pages, numéro, dates, original, versions, journal) ; l'ajout ; la
   remise d'un dossier en un PDF marqué. EN LIGNE seulement : rien n'est
   gardé sur l'appareil (shared/papiers). */

export type TitulaireVu = { cle: Titulaire; nom: string; genre: 'entreprise' | 'personne'; qualite?: string };

const aujourdhui = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const quandDit = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const CLASSE: Record<string, string> = { ok: 'pap-etat--ok', bientot: 'pap-etat--bientot', expire: 'pap-etat--expire' };

type Filtre = 'tout' | 'renouveler' | 'manquantes' | 'entreprises' | 'personnes';

export function LesPapiers({ branchId, qui, titulairesEntreprises, suggestions }: {
  branchId: string;
  /** Le nom de qui agit, pour le journal des pièces. */
  qui: string;
  titulairesEntreprises: TitulaireVu[];
  /** Les noms proposés comme personnes (les signataires du secrétariat). */
  suggestions: string[];
}) {
  const classeur = useClasseur();
  const [filtre, setFiltre] = useState<Filtre>('tout');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [ajout, setAjout] = useState<{ titulaire?: Titulaire; type?: string } | null>(null);
  const [dossier, setDossier] = useState<{ papierId?: string } | null>(null);
  const [personne, setPersonne] = useState(false);
  const [enCours, setEnCours] = useState('');
  const [aRetirer, setARetirer] = useState<string | null>(null);

  useEffect(() => { void chargeLeClasseur(); return () => oublieLeClasseur(); }, []);

  const papiers = papiersDe(classeur.lignes);
  const titulaires: TitulaireVu[] = useMemo(() => [
    ...titulairesEntreprises,
    ...personnesDe(classeur.lignes).map((p) => ({ cle: `pers:${p.id}`, nom: p.nom, genre: 'personne' as const, qualite: p.qualite })),
  ], [titulairesEntreprises, classeur.lignes]);
  const nomDe = (t: Titulaire) => titulaires.find((x) => x.cle === t)?.nom ?? 'Titulaire';
  const jour = aujourdhui();

  if (classeur.charge === 'refuse') return <div className="sec-vide">{classeur.erreur}</div>;
  if (classeur.charge !== 'pret') return <div className="sec-vide">Lecture des papiers au serveur…</div>;

  const renouv = aRenouveler(papiers, jour);
  const manquantes = titulaires.reduce((n, t) => n + manquantsDe(papiers, t.cle).length, 0);
  const vus = titulaires.filter((t) => (filtre === 'entreprises' ? t.genre === 'entreprise' : filtre === 'personnes' ? t.genre === 'personne' : true));
  const ouvertPapier = papiers.find((p) => p.id === ouvert);
  const pasEncore = suggestions.filter((n) => !personnesDe(classeur.lignes).some((p) => p.nom.trim().toLowerCase() === n.trim().toLowerCase()));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="pap-resume">
        <span><b>{papiers.length}</b>pièce{papiers.length > 1 ? 's' : ''}</span>
        <span><b>{renouv.filter((p) => etatDe(p, jour) === 'bientot').length}</b>à renouveler bientôt</span>
        <span><b>{renouv.filter((p) => etatDe(p, jour) === 'expire').length}</b>expirée{renouv.filter((p) => etatDe(p, jour) === 'expire').length > 1 ? 's' : ''}</span>
        <span><b>{manquantes}</b>à déposer</span>
      </div>
      <div className="sec-filtres" style={{ margin: 0 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {([['tout', 'Tout'], ['renouveler', 'À renouveler'], ['manquantes', 'À déposer'], ['entreprises', 'Entreprises'], ['personnes', 'Personnes']] as [Filtre, string][]).map(([v, l]) => (
            <button key={v} type="button" className={`sec-puce${filtre === v ? ' sec-puce--on' : ''}`} aria-pressed={filtre === v} onClick={() => setFiltre(v)}>{l}</button>
          ))}
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={() => setDossier({})}>Remettre un dossier</Button>
          <Button variant="copper" onClick={() => setAjout({})}>+ Ajouter un papier</Button>
        </div>
      </div>

      {filtre === 'renouveler' ? (
        renouv.length === 0 ? <div className="sec-vide">Rien à renouveler : toutes les pièces sont à jour.</div> : (
          <div className="sec-registre">
            {renouv.map((p) => (
              <div key={p.id} className="sec-rangee">
                <button type="button" className="sec-ligne pap-ligne" onClick={() => setOuvert(p.id)}>
                  <span className="sec-ligne__titre">{titreDuPapier(p)}</span>
                  <span className="sec-ligne__pour">{nomDe(p.titulaire)}</span>
                  <span className="sec-ligne__date">expire le {jourAn(p.expireLe)}</span>
                  <span className={`pap-etat ${CLASSE[etatDe(p, jour)]}`}>{etatDit(p, jour)}</span>
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="pap-chemises">
          {vus.map((t) => {
            const pieces = piecesDe(papiers, t.cle);
            const manque = manquantsDe(papiers, t.cle);
            const c = completude(papiers, t.cle);
            if (filtre === 'manquantes' && manque.length === 0) return null;
            return (
              <div key={t.cle} className={`pap-chemise${t.cle === 'ent:acia' ? ' pap-chemise--acia' : ''}`}>
                <div className="pap-chemise__onglet">
                  <span className="pap-chemise__qui">{t.nom}</span>
                  <span className="pap-chemise__quoi">{t.genre === 'entreprise' ? 'Entreprise' : (t.qualite || 'Personne')} · {c.faits} sur {c.attendus}</span>
                  <div className="pap-jauge"><i style={{ width: `${c.attendus ? (100 * c.faits) / c.attendus : 100}%` }} /></div>
                </div>
                <ul className="pap-pieces">
                  {filtre !== 'manquantes' && pieces.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setOuvert(p.id)}>{titreDuPapier(p)}{p.numero ? <span className="pap-num"> · {p.numero}</span> : null}</button>
                      <span className={`pap-etat ${CLASSE[etatDe(p, jour)]}`}>{etatDit(p, jour)}</span>
                    </li>
                  ))}
                  {manque.map((m) => (
                    <li key={m.cle}>
                      <button type="button" onClick={() => setAjout({ titulaire: t.cle, type: m.cle })}>{m.titre}</button>
                      <span className="pap-etat pap-etat--manque">à déposer</span>
                    </li>
                  ))}
                </ul>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="pap-ajouter" onClick={() => setAjout({ titulaire: t.cle })}>+ un papier</button>
                  {/* Une chemise de personne VIDE se retire (deux clics). */}
                  {t.genre === 'personne' && pieces.length === 0 && (aRetirer === t.cle ? (
                    <>
                      <button type="button" className="sec-supprimer sec-supprimer--oui" onClick={() => {
                        const p = personnesDe(classeur.lignes).find((x) => `pers:${x.id}` === t.cle);
                        setARetirer(null);
                        if (p) void retireUnePersonne(p).then((r) => toast(r.ok ? 'Chemise retirée.' : r.erreur ?? 'Refusé.'));
                      }}>Confirmer</button>
                      <button type="button" className="sec-supprimer" onClick={() => setARetirer(null)}>Non</button>
                    </>
                  ) : (
                    <button type="button" className="sec-supprimer" style={{ marginLeft: 'auto', marginRight: 12 }} onClick={() => setARetirer(t.cle)}>Retirer cette chemise</button>
                  ))}
                </div>
              </div>
            );
          })}
          {(filtre === 'tout' || filtre === 'personnes') && (
            <div className="pap-chemise pap-chemise--nouvelle">
              <div className="pap-chemise__onglet"><span className="pap-chemise__qui">Une personne</span><span className="pap-chemise__quoi">Carte d’identité, résidence…</span></div>
              <div style={{ display: 'grid', gap: 6, padding: 12 }}>
                {pasEncore.map((n) => (
                  <button key={n} type="button" className="sec-puce" disabled={!!enCours} onClick={() => {
                    setEnCours(n);
                    void ajouteUnePersonne({ branchId, nom: n, qualite: 'Direction' }).then((r) => { setEnCours(''); toast(r.ok ? `${n} a sa chemise.` : r.erreur ?? 'Refusé.'); });
                  }}>{enCours === n ? 'Création…' : `+ ${n}`}</button>
                ))}
                <button type="button" className="sec-puce" onClick={() => setPersonne(true)}>+ Une autre personne</button>
              </div>
            </div>
          )}
        </div>
      )}

      {ajout && <AjouterUnPapier branchId={branchId} qui={qui} titulaires={titulaires} depart={ajout} onClose={() => setAjout(null)} />}
      {ouvertPapier && (
        <FicheDUnPapier papier={ouvertPapier} qui={qui} titulaireNom={nomDe(ouvertPapier.titulaire)} onClose={() => setOuvert(null)}
          surRemettre={() => { setDossier({ papierId: ouvertPapier.id }); setOuvert(null); }} />
      )}
      {dossier && <RemettreUnDossier papiers={papiers} titulaires={titulaires} qui={qui} branchId={branchId} depart={dossier.papierId} onClose={() => setDossier(null)} />}
      {personne && <NouvellePersonne branchId={branchId} onClose={() => setPersonne(false)} />}
    </div>
  );
}

/* ══ AJOUTER (ou REMPLACER) UN PAPIER ══════════════════════════════════ */

function ChoixDesFichiers({ fichiers, surChange }: { fichiers: File[]; surChange: (f: File[]) => void }) {
  const entree = useRef<HTMLInputElement>(null);
  const [lecture, setLecture] = useState(false);
  /* Chaque fichier est copié en mémoire DÈS LE CHOIX : un fichier resté
     dans le cloud du téléphone se dit maintenant, pas à l'envoi. */
  const choisis = async (liste: File[]) => {
    if (!liste.length) return;
    setLecture(true);
    const copies: File[] = [];
    for (const f of liste) {
      const r = await copieEnMemoire(f);
      if (r.erreur) { toast(r.erreur); continue; }
      if (r.fichier) copies.push(r.fichier);
    }
    setLecture(false);
    if (copies.length) surChange(copies);
  };
  return (
    <div className="pap-depot">
      {/* UN VRAI BOUTON hors de toute étiquette (leçon du 6 octobre : une
          étiquette dans un champ-étiquette n'ouvre jamais le fichier). */}
      <Button variant="ghost" onClick={() => entree.current?.click()} disabled={lecture}>{lecture ? 'Lecture du fichier…' : fichiers.length ? 'Changer les fichiers' : 'Choisir les pages (photo ou PDF)'}</Button>
      <input ref={entree} type="file" accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.heic" multiple hidden
        onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ''; void choisis(l); }} />
      <span className="mnd-muted" style={{ fontSize: 12 }}>
        {fichiers.length ? fichiers.map((f) => f.name).join(' · ') : 'Recto et verso, ou un PDF entier · 10 Mo par fichier · les photos sont allégées avant l’envoi'}
      </span>
    </div>
  );
}

function AjouterUnPapier({ branchId, qui, titulaires, depart, onClose, remplacer }: {
  branchId: string; qui: string; titulaires: TitulaireVu[]; depart: { titulaire?: Titulaire; type?: string }; onClose: () => void;
  /** Remplacer une pièce existante : nouvelle version, l'ancienne est gardée. */
  remplacer?: Papier;
}) {
  const [secretariat] = useSecretariat();
  const [titulaire, setTitulaire] = useState<Titulaire>(remplacer?.titulaire ?? depart.titulaire ?? titulaires[0]?.cle ?? 'ent:mnd');
  const types = typesPour(titulaire);
  const [type, setType] = useState<string>(remplacer?.type ?? depart.type ?? types[0]?.cle ?? 'autre-ent');
  const [titre, setTitre] = useState(remplacer?.titre ?? '');
  const [numero, setNumero] = useState(remplacer?.numero ?? '');
  const [delivreLe, setDelivreLe] = useState('');
  const [expireLe, setExpireLe] = useState('');
  const [proposee, setProposee] = useState('');
  const [original, setOriginal] = useState(remplacer?.original ?? '');
  const [note, setNote] = useState(remplacer?.note ?? '');
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [envoi, setEnvoi] = useState(false);

  const typeVu = typeDe(type);
  const changeTitulaire = (t: Titulaire) => {
    setTitulaire(t);
    if (!typesPour(t).some((x) => x.cle === type)) setType(typesPour(t)[0]?.cle ?? '');
  };
  /* La date proposée suit la délivrance, tant qu'on ne l'a pas corrigée. */
  const changeDelivre = (d: string) => {
    setDelivreLe(d);
    const p = expirationProposee(type, d);
    if (!expireLe || expireLe === proposee) { setExpireLe(p); setProposee(p); }
  };

  const garde = async () => {
    if (!fichiers.length) { toast('Choisissez au moins une page (photo ou PDF).'); return; }
    setEnvoi(true);
    try { await gardeVraiment(); } catch (e) {
      toast(`La pièce n’a pas été gardée : ${e instanceof Error ? e.message : String(e)}`);
    } finally { setEnvoi(false); }
  };
  const gardeVraiment = async () => {
    const id = remplacer?.id ?? `pap-${Math.random().toString(36).slice(2, 12)}`;
    const { pages, erreur } = await deposeLesPages(titulaire, id, fichiers);
    if (erreur) { toast(erreur, 9000); return; }
    const r = remplacer
      ? await remplaceUnPapier(remplacer, { pages, numero: numero.trim(), delivreLe, expireLe }, qui)
      : await gardeUnPapier({ id, branchId, titulaire, type, titre: type.startsWith('autre') ? titre.trim() : undefined, numero: numero.trim(), delivreLe, expireLe, original: original.trim(), note: note.trim(), pages, deposePar: qui }, qui);
    if (!r.ok) { toast(r.erreur ?? 'La pièce n’a pas été gardée.', 9000); return; }
    /* LE RCCM ET L'IFU NOURRISSENT L'EN-TÊTE DES LETTRES : une seule source. */
    if ((type === 'rccm' || type === 'ifu') && numero.trim() && (titulaire === 'ent:mnd' || titulaire === 'ent:acia')) {
      const entite = titulaire === 'ent:mnd' ? 'mnd' : 'acia';
      const m = mentionsDe(secretariat, entite);
      enregistreLesMentions({ branchId, entite, rccm: type === 'rccm' ? numero.trim() : (m?.rccm ?? ''), ifu: type === 'ifu' ? numero.trim() : (m?.ifu ?? '') });
    }
    toast(remplacer ? 'Nouvelle version gardée ; l’ancienne reste dans l’historique.' : 'Pièce gardée.');
    onClose();
  };

  return createPortal(
    <Modal title={remplacer ? `Nouvelle version · ${titreDuPapier(remplacer)}` : 'Ajouter un papier'} onClose={onClose} width={660}>
      <div style={{ display: 'grid', gap: 12 }}>
        <ChoixDesFichiers fichiers={fichiers} surChange={setFichiers} />
        {!remplacer && (
          <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
            <Field label="Pour qui">
              <Select value={titulaire} onChange={(e) => changeTitulaire(e.target.value)}>
                {titulaires.map((t) => <option key={t.cle} value={t.cle}>{t.nom}</option>)}
              </Select>
            </Field>
            <Field label="Quel papier">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {types.map((t) => <option key={t.cle} value={t.cle}>{t.titre}</option>)}
              </Select>
            </Field>
          </div>
        )}
        {!remplacer && type.startsWith('autre') && <Field label="Nom du papier"><Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. : attestation de domicile" /></Field>}
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Numéro"><Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder={type === 'ifu' ? '13 chiffres' : 'tel qu’il est écrit'} /></Field>
          <Field label="Délivré le"><Input type="date" value={delivreLe} onChange={(e) => changeDelivre(e.target.value)} /></Field>
          <Field label={typeVu?.duree === 'sans' ? 'Expire le (sans expiration d’ordinaire)' : 'Expire le'}><Input type="date" value={expireLe} onChange={(e) => setExpireLe(e.target.value)} /></Field>
          {!remplacer && <Field label="Original (où se trouve le papier)"><Input value={original} onChange={(e) => setOriginal(e.target.value)} placeholder="Classeur du bureau, comptable…" /></Field>}
        </div>
        {numeroDouteux(type, numero) && <span style={{ fontSize: 12, color: 'var(--copper-700)' }}>Un IFU du Bénin compte 13 chiffres : vérifiez-le.</span>}
        {expireLe && expireLe === proposee && <span className="mnd-muted" style={{ fontSize: 12 }}>Date proposée selon la durée courante de ce papier : corrigez-la si le vôtre dit autre chose.</span>}
        {!remplacer && <Field label="Note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="copper" onClick={() => void garde()} disabled={envoi}>{envoi ? 'Envoi…' : 'Garder la pièce'}</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

/* ══ LA FICHE D'UNE PIÈCE ════════════════════════════════════════════ */

function FicheDUnPapier({ papier: p, qui, titulaireNom, onClose, surRemettre }: {
  papier: Papier; qui: string; titulaireNom: string; onClose: () => void; surRemettre: () => void;
}) {
  /* LE TYPE SE CORRIGE (6 octobre : la carte et le CIP séparés, une pièce
     déposée sous l'ancien nom doit pouvoir changer de case). */
  const [type, setType] = useState(p.type);
  const [numero, setNumero] = useState(p.numero);
  const [delivreLe, setDelivreLe] = useState(p.delivreLe);
  const [expireLe, setExpireLe] = useState(p.expireLe);
  const [original, setOriginal] = useState(p.original);
  const [note, setNote] = useState(p.note);
  const [remplacer, setRemplacer] = useState(false);
  const [effacer, setEffacer] = useState(false);
  const jour = aujourdhui();
  const change = type !== p.type || numero !== p.numero || delivreLe !== p.delivreLe || expireLe !== p.expireLe || original !== p.original || note !== p.note;

  /* VOIR : un lien d'une minute, ouvert dans un nouvel onglet ; le regard
     s'écrit au journal de la pièce. */
  const voir = async (chemin: string) => {
    const url = await lienDUnePage(chemin);
    if (!url) { toast('La page ne s’ouvre pas : vérifiez la connexion.'); return; }
    window.open(url, '_blank', 'noopener');
    void noteAuJournal(p, qui, 'vue');
  };

  return createPortal(
    <Modal title={`${titreDuPapier(p)} · ${titulaireNom}`} onClose={onClose} width={720}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`pap-etat ${CLASSE[etatDe(p, jour)]}`}>{etatDit(p, jour)}</span>
          <span className="mnd-muted" style={{ fontSize: 12.5 }}>Déposée par {p.deposePar || '…'} le {quandDit(p.deposeLe)}</span>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <span className="mnd-eyebrow">Les pages</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {p.pages.map((pg, i) => (
              <Button key={pg.chemin} variant="ghost" onClick={() => void voir(pg.chemin)}>Voir la page {i + 1}{pg.type === 'application/pdf' ? ' (PDF)' : ''}</Button>
            ))}
          </div>
          <span className="mnd-muted" style={{ fontSize: 12 }}>Chaque page s’ouvre par un lien qui expire en une minute.</span>
        </div>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Quel papier">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {typesPour(p.titulaire).map((t) => <option key={t.cle} value={t.cle}>{t.titre}</option>)}
            </Select>
          </Field>
          <Field label="Numéro"><Input value={numero} onChange={(e) => setNumero(e.target.value)} /></Field>
          <Field label="Original"><Input value={original} onChange={(e) => setOriginal(e.target.value)} placeholder="Où se trouve le papier" /></Field>
          <Field label="Délivré le"><Input type="date" value={delivreLe} onChange={(e) => setDelivreLe(e.target.value)} /></Field>
          <Field label="Expire le"><Input type="date" value={expireLe} onChange={(e) => setExpireLe(e.target.value)} /></Field>
        </div>
        {numeroDouteux(p.type, numero) && <span style={{ fontSize: 12, color: 'var(--copper-700)' }}>Un IFU du Bénin compte 13 chiffres : vérifiez-le.</span>}
        <Field label="Note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="sec-actions">
          {change && <Button variant="copper" onClick={() => { void modifieUnPapier(p, { type, numero: numero.trim(), delivreLe, expireLe, original: original.trim(), note: note.trim() }, qui).then((r) => toast(r.ok ? 'Corrigé.' : r.erreur ?? 'Refusé.')); }}>Garder les corrections</Button>}
          <Button variant="ghost" onClick={surRemettre}>Remettre dans un dossier</Button>
          <Button variant="ghost" onClick={() => setRemplacer(true)}>Nouvelle version</Button>
          {effacer
            ? <Button variant="ghost" onClick={() => { void effaceUnPapier(p).then((r) => { toast(r.ok ? 'Pièce supprimée, avec ses pages.' : r.erreur ?? 'Refusé.'); if (r.ok) onClose(); }); }}>Confirmer la suppression</Button>
            : <Button variant="ghost" onClick={() => setEffacer(true)}>Supprimer</Button>}
        </div>
        {p.versions.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            <span className="mnd-eyebrow">Les versions remplacées</span>
            <ul className="pap-journal">
              {p.versions.map((v) => (
                <li key={v.remplaceeLe}>
                  <span style={{ textDecoration: 'line-through' }}>{v.numero || 'sans numéro'}{v.expireLe ? ` · expirait le ${jourAn(v.expireLe)}` : ''}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    remplacée le {quandDit(v.remplaceeLe)}
                    {v.pages.map((pg, i) => <button key={pg.chemin} type="button" className="sec-supprimer" onClick={() => void voir(pg.chemin)}>page {i + 1}</button>)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ display: 'grid', gap: 6 }}>
          <span className="mnd-eyebrow">Le journal</span>
          <ul className="pap-journal">
            {p.journal.map((t, i) => <li key={i}><span>{t.qui} · {t.quoi}</span><span>{quandDit(t.quand)}</span></li>)}
          </ul>
        </div>
      </div>
      {remplacer && <AjouterUnPapier branchId={p.branchId} qui={qui} titulaires={[]} depart={{}} remplacer={p} onClose={() => setRemplacer(false)} />}
    </Modal>,
    document.body,
  );
}

/* ══ REMETTRE UN DOSSIER ═════════════════════════════════════════════ */

function RemettreUnDossier({ papiers, titulaires, qui, branchId, depart, onClose }: {
  papiers: Papier[]; titulaires: TitulaireVu[]; qui: string; branchId: string; depart?: string; onClose: () => void;
}) {
  const jour = aujourdhui();
  const premier = papiers.find((p) => p.id === depart);
  const entreprises = titulaires.filter((t) => t.genre === 'entreprise');
  const personnes = titulaires.filter((t) => t.genre === 'personne');
  const [destinataire, setDestinataire] = useState('');
  const [motif, setMotif] = useState('');
  const [modele, setModele] = useState(premier ? 'libre' : 'banque');
  const [entreprise, setEntreprise] = useState<Titulaire | ''>(premier && !estPersonne(premier.titulaire) ? premier.titulaire : (entreprises[0]?.cle ?? ''));
  const [personne, setPersonne] = useState<Titulaire | ''>(premier && estPersonne(premier.titulaire) ? premier.titulaire : (personnes[0]?.cle ?? ''));
  const [choisis, setChoisis] = useState<Set<string>>(new Set(premier ? [premier.id] : []));
  const [marque, setMarque] = useState(true);
  const [numeroWa, setNumeroWa] = useState('');
  const [occupe, setOccupe] = useState('');
  const [dossierPret, setDossierPret] = useState<File | null>(null);
  /* Un dossier prêt est oublié dès que la sélection change : on n'enverrait
     jamais un dossier qui ne correspond plus à l'écran. */
  useEffect(() => { setDossierPret(null); }, [choisis, destinataire, motif, marque]);

  const lignes = lignesDuDossier(modele, entreprise || undefined, personne || undefined, papiers, jour);
  /* LA SÉLECTION SUIT LE CHOIX — 6 octobre 2026. « Quand on choisit une
     société, ça ne retient pas la sélection » (Yéman, Remettre un dossier).
     Les cases s'AJOUTAIENT à chaque changement : passer de Maison MND à
     ACIA 1 laissait cochés les papiers de Maison MND. Changer d'entreprise,
     de personne ou de modèle REMPLACE désormais la sélection par ce que ce
     choix demande ; la pièce d'où l'on est parti n'est gardée qu'au début. */
  const auDepart = useRef(true);
  useEffect(() => {
    const demandes = lignes.filter((l) => l.piece).map((l) => l.piece!.id);
    setChoisis(new Set(auDepart.current && premier ? [premier.id, ...demandes] : demandes));
    auDepart.current = false;
  }, [modele, entreprise, personne]); // eslint-disable-line react-hooks/exhaustive-deps

  const pieces = papiers.filter((p) => choisis.has(p.id));
  /* On ne propose que les papiers de l'entreprise et de la personne choisies
     (et ce qui est déjà coché) ; sans choix, tous. */
  const visibles = papiers.filter((p) => (!entreprise && !personne) || p.titulaire === entreprise || p.titulaire === personne || choisis.has(p.id));
  const obligatoire = marqueObligatoire(pieces);
  const avecMarque = obligatoire || marque;
  const nomDe = (t: Titulaire) => titulaires.find((x) => x.cle === t)?.nom ?? '';
  const bascule = (id: string) => setChoisis((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const fabrique = async (): Promise<Uint8Array | null> => {
    if (!pieces.length) { toast('Cochez au moins une pièce.'); return null; }
    if (avecMarque && !destinataire.trim()) { toast('À qui remettez-vous ce dossier ? La marque porte son nom.'); return null; }
    const jourDit = jourAn(jour);
    return assembleLeDossier({
      pieces: pieces.map((p) => ({ papier: p, titulaireNom: nomDe(p.titulaire) })),
      destinataire: destinataire.trim(), jour: jourDit,
      marque: avecMarque ? texteDeLaMarque(destinataire, jourDit, motif.trim() || undefined) : undefined,
      maison: 'Les papiers de la Maison',
    });
  };
  const trace = async (comment: string) => {
    for (const p of pieces) await noteAuJournal(p, qui, `remise à ${destinataire.trim() || 'un destinataire'} (${comment}${avecMarque ? ', copie marquée' : ''})`);
  };
  const telecharge = async () => {
    setOccupe('pdf');
    try {
      const octets = await fabrique();
      if (!octets) return;
      const url = URL.createObjectURL(new Blob([octets as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `Dossier-${(destinataire.trim() || 'remis').replace(/[^A-Za-z0-9À-ÿ-]+/g, '-')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      await trace('téléchargé');
      toast('Dossier prêt.');
    } catch (e) { toast(motDuRefus(e)); } finally { setOccupe(''); }
  };
  /* WHATSAPP · L'APP : la feuille de partage, le dossier déjà joint. */
  const parLApp = async () => {
    setOccupe('app');
    try {
      /* Un dossier déjà assemblé (le navigateur a demandé un second toucher)
         part aussitôt ; sinon on l'assemble. */
      let fichier = dossierPret;
      if (!fichier) {
        const octets = await fabrique();
        if (!octets) return;
        fichier = new File([octets as Uint8Array<ArrayBuffer>], `Dossier-${(destinataire.trim() || 'remis').replace(/[^A-Za-z0-9À-ÿ-]+/g, '-')}.pdf`, { type: 'application/pdf' });
      }
      const r = await ouvreWhatsAppAvecLePdf({ fichier, numero: numeroWa.trim() || undefined, texte: `Dossier remis${destinataire.trim() ? ` à ${destinataire.trim()}` : ''}, ci-joint.` });
      setDossierPret(r === 'relance' ? fichier : null);
      if (r !== 'annule' && r !== 'relance') await trace('WhatsApp · l’app');
      const mot = ditLePartage(r);
      if (mot) toast(mot, 7000);
    } catch (e) { toast(motDuRefus(e)); } finally { setOccupe(''); }
  };
  const whatsapp = async () => {
    if (!numeroWa.trim()) { toast('Le numéro WhatsApp du destinataire.'); return; }
    setOccupe('wa');
    try {
      const octets = await fabrique();
      if (!octets) return;
      const res = await envoieSurWhatsApp({
        numero: numeroWa.trim(), texte: `Dossier remis${destinataire.trim() ? ` à ${destinataire.trim()}` : ''}, ci-joint.`,
        piece: { nom: 'Dossier.pdf', type: 'application/pdf', donnees: enDataUrl(octets) }, branchId,
      });
      if (res.ok) { await trace('WhatsApp'); toast(res.enAttente ? 'Hors ligne : le dossier partira au retour du réseau.' : 'Dossier envoyé sur WhatsApp.'); }
      else toast(`Le dossier n’est pas parti : ${res.erreur}`);
    } catch (e) { toast(motDuRefus(e)); } finally { setOccupe(''); }
  };

  return createPortal(
    <Modal title="Remettre un dossier" onClose={onClose} width={720}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="À qui"><Input value={destinataire} onChange={(e) => setDestinataire(e.target.value)} placeholder="Ex. : Ecobank" /></Field>
          <Field label="Pour quoi (facultatif)"><Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : ouverture de compte" /></Field>
          <Field label="Modèle de dossier">
            <Select value={modele} onChange={(e) => setModele(e.target.value)}>
              {DOSSIERS.map((d) => <option key={d.cle} value={d.cle}>{d.titre}</option>)}
            </Select>
          </Field>
          <Field label="Entreprise">
            <Select value={entreprise} onChange={(e) => setEntreprise(e.target.value)}>
              <option value="">(aucune)</option>
              {entreprises.map((t) => <option key={t.cle} value={t.cle}>{t.nom}</option>)}
            </Select>
          </Field>
          <Field label="Personne">
            <Select value={personne} onChange={(e) => setPersonne(e.target.value)}>
              <option value="">(aucune)</option>
              {personnes.map((t) => <option key={t.cle} value={t.cle}>{t.nom}</option>)}
            </Select>
          </Field>
        </div>
        {lignes.some((l) => l.alerte) && (
          <div className="sec-bandeau">
            {lignes.filter((l) => l.alerte).map((l) => (
              <div key={`${l.titulaire}-${l.type}`}>
                {typeDe(l.type)?.titre} · {nomDe(l.titulaire)} : {l.alerte === 'manque' ? 'à déposer d’abord' : l.alerte === 'expire' ? 'expirée' : `expire ${etatDit(l.piece!, jour)}`}
              </div>
            ))}
          </div>
        )}
        <div className="pap-paquet">
          {visibles.map((p) => (
            <label key={p.id}>
              <input type="checkbox" checked={choisis.has(p.id)} onChange={() => bascule(p.id)} />
              <span>{titreDuPapier(p)} · {nomDe(p.titulaire)}</span>
              {etatDe(p, jour) !== 'ok' && <span className={`pap-etat ${CLASSE[etatDe(p, jour)]}`} style={{ marginLeft: 'auto' }}>{etatDit(p, jour)}</span>}
            </label>
          ))}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={avecMarque} disabled={obligatoire} onChange={(e) => setMarque(e.target.checked)} />
          Marquer chaque page « Copie remise à … · usage unique »{obligatoire ? ' (obligatoire : un papier d’une personne part)' : ''}
        </label>
        {avecMarque && <span className="mnd-muted" style={{ fontSize: 12 }}>{texteDeLaMarque(destinataire || '…', jourAn(jour), motif.trim() || undefined)}</span>}
        <div className="sec-actions">
          <Button variant="copper" onClick={() => void telecharge()} disabled={!!occupe}>{occupe === 'pdf' ? 'Assemblage…' : 'Télécharger le PDF'}</Button>
          <Input value={numeroWa} onChange={(e) => setNumeroWa(e.target.value)} placeholder="WhatsApp : +229 01 …" style={{ maxWidth: 220 }} />
          <Button variant="ghost" onClick={() => void whatsapp()} disabled={!!occupe}>{occupe === 'wa' ? 'Envoi…' : 'Envoyer par la Maison'}</Button>
          <Button variant="ghost" onClick={() => void parLApp()} disabled={!!occupe} title="Votre application WhatsApp, avec le dossier joint">{occupe === 'app' ? 'Préparation…' : dossierPret ? 'WhatsApp · l’app (touchez pour envoyer)' : 'WhatsApp · l’app'}</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

/* ══ UNE PERSONNE ════════════════════════════════════════════════════ */

function NouvellePersonne({ branchId, onClose }: { branchId: string; onClose: () => void }) {
  const [nom, setNom] = useState('');
  const [qualite, setQualite] = useState('');
  return createPortal(
    <Modal title="Une personne" onClose={onClose} width={480}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Nom et prénom"><Input value={nom} onChange={(e) => setNom(e.target.value)} /></Field>
        <Field label="Qualité"><Input value={qualite} onChange={(e) => setQualite(e.target.value)} placeholder="Associé, gérant…" /></Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="copper" onClick={() => {
            if (!nom.trim()) { toast('Le nom.'); return; }
            void ajouteUnePersonne({ branchId, nom, qualite }).then((r) => { toast(r.ok ? 'Chemise créée.' : r.erreur ?? 'Refusé.'); if (r.ok) onClose(); });
          }}>Créer sa chemise</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
