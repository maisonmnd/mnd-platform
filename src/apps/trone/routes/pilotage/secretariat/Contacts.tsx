import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Field, Input, Modal, Textarea, toast } from '../../../../../ds/components';
import { useSecretariat } from '../../../../../shared/secretariat';
import { useFournisseurs } from '../../../../../shared/fournisseurs';
import { contactsDe, courriersDe, effaceLaLigne, nouveauContact, retouche } from '../../../../../shared/secretariat-admin';
import { CATEGORIES_CONTACT, dateCourte, tientLeSecretariat, voit, type CategorieContact, type Contact, type Qui } from '../../../../../shared/secretariat-admin-pur';
import { Repliee } from './_admin';

/* ══ LES CONTACTS — 14 octobre 2026 ══════════════════════════════════
   L'annuaire de la Maison : administrations, conseils, banque, la maison,
   fournisseurs. Les fournisseurs des Dépenses (l'Atelier) se lisent ici sans
   être recopiés. Tout le personnel lit ; le secrétariat écrit (0129). */

const chiffres = (t?: string) => (t ?? '').replace(/[^0-9]/g, '');

export function LesContacts({ qui, branchId }: { qui: Qui; branchId: string }) {
  const [lignes] = useSecretariat();
  const [fournisseurs] = useFournisseurs();
  const [cherche, setCherche] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [edite, setEdite] = useState<Contact | 'neuf' | null>(null);
  const tient = tientLeSecretariat(qui);
  const q = cherche.trim().toLowerCase();
  const courriers = courriersDe(lignes).filter((c) => voit(c, qui));
  const contacts = useMemo(() => contactsDe(lignes)
    .filter((k) => !q || [k.nom, k.personne, k.telephone, k.courriel, k.note].some((t) => (t ?? '').toLowerCase().includes(q)))
    .sort((a, b) => a.nom.localeCompare(b.nom)), [lignes, q]);
  const fourn = fournisseurs.filter((f) => !f.archived && (!q || f.nom.toLowerCase().includes(q)));
  const echanges = (k: Contact) => courriers.filter((c) => c.contactId === k.id || c.correspondant.trim().toLowerCase() === k.nom.trim().toLowerCase())
    .sort((a, b) => b.date.localeCompare(a.date));
  const copie = (t: string) => { void navigator.clipboard?.writeText(t).then(() => toast('Copié.'), () => toast(t)); };

  return (
    <div className="sad-onglet">
      <div className="sad-outils">
        <Input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Chercher : APIEX, banque, comptable…" aria-label="Chercher un contact" />
        {tient && <Button variant="copper" onClick={() => setEdite('neuf')}>+ Nouveau contact</Button>}
      </div>
      {contacts.length === 0 && fourn.length === 0 && <div className="sec-vide">Aucun contact. L’APIEX, le centre des impôts, le comptable, la banque : un par ligne.</div>}
      {(Object.keys(CATEGORIES_CONTACT) as CategorieContact[]).map((cat) => {
        const ceux = contacts.filter((k) => k.categorie === cat);
        if (!ceux.length) return null;
        return (
          <section key={cat} className="sad-groupe">
            <h3 className="sad-mois">{CATEGORIES_CONTACT[cat]}</h3>
            <div className="sad-liste">
              {ceux.map((k) => {
                const ech = echanges(k);
                return (
                  <Repliee key={k.id} ouverte={ouvert === k.id} surBascule={() => setOuvert(ouvert === k.id ? null : k.id)}
                    num={k.personne || CATEGORIES_CONTACT[k.categorie]} titre={k.nom}
                    sous={[k.telephone, k.courriel].filter(Boolean).join(' · ') || undefined}
                    badge={ech.length ? `${ech.length} échange${ech.length > 1 ? 's' : ''}` : undefined}
                  >
                    <dl className="sad-fiche">
                      {k.telephone && <><dt>Téléphone</dt><dd><span className="sad-copiable">{k.telephone}</span> <button type="button" className="sad-lien" onClick={() => copie(k.telephone as string)}>copier</button>{chiffres(k.telephone).length >= 8 && <> · <a className="sad-lien" href={`https://wa.me/${chiffres(k.telephone).length === 10 ? `229${chiffres(k.telephone)}` : chiffres(k.telephone)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}</dd></>}
                      {k.courriel && <><dt>Courriel</dt><dd><span className="sad-copiable">{k.courriel}</span> <button type="button" className="sad-lien" onClick={() => copie(k.courriel as string)}>copier</button></dd></>}
                      {k.adresse && <><dt>Adresse</dt><dd>{k.adresse}</dd></>}
                      {k.site && <><dt>Site</dt><dd><a className="sad-lien" href={k.site.startsWith('http') ? k.site : `https://${k.site}`} target="_blank" rel="noopener noreferrer">{k.site}</a></dd></>}
                      {k.note && <><dt>Note</dt><dd>{k.note}</dd></>}
                      {ech.length > 0 && <><dt>Derniers échanges</dt><dd>{ech.slice(0, 5).map((c) => <div key={c.id}>{c.numero} · {dateCourte(c.date)} · {c.objet || 'sans objet'}</div>)}</dd></>}
                    </dl>
                    {tient && (
                      <div className="sec-actions">
                        <Button size="sm" variant="ghost" onClick={() => setEdite(k)}>Modifier</Button>
                        {qui.direction && <Button size="sm" variant="ghost" onClick={() => { effaceLaLigne(k); toast('Contact effacé.'); }}>Effacer</Button>}
                      </div>
                    )}
                  </Repliee>
                );
              })}
            </div>
          </section>
        );
      })}
      {fourn.length > 0 && (
        <section className="sad-groupe">
          <h3 className="sad-mois">Fournisseurs des dépenses (lus dans l’Atelier)</h3>
          <div className="sad-liste">
            {fourn.map((f) => (
              <Repliee key={f.id} ouverte={false} surBascule={() => {}} num={f.famille || 'Fournisseur'} titre={f.nom} sous={f.telephone || undefined} />
            ))}
          </div>
        </section>
      )}
      {edite && <FicheDuContact branchId={branchId} qui={qui} contact={edite === 'neuf' ? undefined : edite} onClose={() => setEdite(null)} />}
    </div>
  );
}

function FicheDuContact({ branchId, qui, contact, onClose }: { branchId: string; qui: Qui; contact?: Contact; onClose: () => void }) {
  const [nom, setNom] = useState(contact?.nom ?? '');
  const [categorie, setCategorie] = useState<CategorieContact>(contact?.categorie ?? 'administration');
  const [personne, setPersonne] = useState(contact?.personne ?? '');
  const [telephone, setTelephone] = useState(contact?.telephone ?? '');
  const [courriel, setCourriel] = useState(contact?.courriel ?? '');
  const [adresse, setAdresse] = useState(contact?.adresse ?? '');
  const [site, setSite] = useState(contact?.site ?? '');
  const [note, setNote] = useState(contact?.note ?? '');
  const garde = () => {
    if (!nom.trim()) { toast('Le nom du contact.'); return; }
    const champs = {
      nom: nom.trim(), categorie, personne: personne.trim() || undefined, telephone: telephone.trim() || undefined,
      courriel: courriel.trim() || undefined, adresse: adresse.trim() || undefined, site: site.trim() || undefined, note: note.trim() || undefined,
    };
    if (contact) retouche(contact, champs);
    else nouveauContact({ branchId, par: qui.moi, ...champs });
    onClose();
  };
  return createPortal(
    <Modal title={contact ? `Modifier ${contact.nom}` : 'Nouveau contact'} onClose={onClose} width={600}>
      <div className="sad-form">
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Nom"><Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="APIEX, centre des impôts…" /></Field>
          <Field label="Catégorie">
            <select className="mnd-input" value={categorie} onChange={(e) => setCategorie(e.target.value as CategorieContact)}>
              {(Object.keys(CATEGORIES_CONTACT) as CategorieContact[]).map((k) => <option key={k} value={k}>{CATEGORIES_CONTACT[k]}</option>)}
            </select>
          </Field>
        </div>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="La personne (facultatif)"><Input value={personne} onChange={(e) => setPersonne(e.target.value)} placeholder="Le nom de qui répond" /></Field>
          <Field label="Téléphone"><Input value={telephone} onChange={(e) => setTelephone(e.target.value)} inputMode="tel" /></Field>
        </div>
        <div className="tr-grid tr-grid--2" style={{ gap: 12 }}>
          <Field label="Courriel"><Input value={courriel} onChange={(e) => setCourriel(e.target.value)} inputMode="email" /></Field>
          <Field label="Site"><Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="monentreprise.bj" /></Field>
        </div>
        <Field label="Adresse"><Input value={adresse} onChange={(e) => setAdresse(e.target.value)} /></Field>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Heures d’ouverture, à qui demander…" /></Field>
        <div className="sec-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="copper" onClick={garde}>{contact ? 'Garder' : 'Ajouter'}</Button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
