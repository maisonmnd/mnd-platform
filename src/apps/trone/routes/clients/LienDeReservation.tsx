import { useMemo, useState } from 'react';
import { Button, Field, Input, Modal, Select, toast } from '../../../../ds/components';
import { useServices, useCategories } from '../../../../shared/catalog';
import { useModelBands } from '../../../../shared/pricing';
import { lienDeReservation, messageDuLien, jetonDuLien, URL_DU_MODELE, type BesoinDuLien } from '../../../../shared/lien-reservation';

/* LE LIEN DE RÉSERVATION PRÉPARÉ — 28 septembre 2026. « J'aimerais envoyer
   un lien de réservation avec les services présélectionnés pour que la
   cliente finalise elle-même son rendez-vous » (Yéman). On coche les gestes,
   on dit le calibre si on le connaît, et le message part avec le lien : la
   cliente arrive sur le site, gestes cochés, prix à son calibre, et n'a plus
   qu'à prendre son heure. Le format du lien vit dans `shared/lien-reservation`. */

const BESOINS: { k: BesoinDuLien; l: string }[] = [
  { k: 'entretien', l: 'Entretien et soins' },
  { k: 'creation', l: 'Création (consultation)' },
  { k: 'reparation', l: 'Réparation (consultation)' },
  { k: 'enfant', l: 'MND Kids' },
];

export function LienDeReservation({ prenom, fenetreOuverte, surMessage, surModele, surFermer }: {
  prenom: string;
  fenetreOuverte: boolean;
  surMessage: (message: string) => void;
  /** Le modèle approuvé `reservation_preparee` : {{1}} prénom, {{2}} les
      gestes, et le mot du bouton. Il part hors de la fenêtre de 24 h. */
  surModele: (variables: string[], boutonUrl: string, texteAffiche: string) => void;
  surFermer: () => void;
}) {
  const [services] = useServices();
  const [categories] = useCategories();
  const [bandes] = useModelBands();
  const [besoin, setBesoin] = useState<BesoinDuLien>('entretien');
  const [calibre, setCalibre] = useState('');
  const [choisis, setChoisis] = useState<string[]>([]);
  const [cherche, setCherche] = useState('');

  const actifs = useMemo(
    () => services.filter((s) => { const x = s as typeof s & { enabled?: boolean; archived?: boolean }; return !!s && x.enabled !== false && !x.archived && !!s.name; }),
    [services],
  );
  const visibles = useMemo(() => {
    const q = cherche.trim().toLowerCase();
    return q ? actifs.filter((s) => s.name.toLowerCase().includes(q)) : actifs;
  }, [actifs, cherche]);
  const parFamille = useMemo(() => {
    const m = new Map<string, typeof visibles>();
    for (const s of visibles) m.set(s.categoryId, [...(m.get(s.categoryId) ?? []), s]);
    return [...m.entries()].map(([id, items]) => ({ id, titre: categories.find((c) => c.id === id)?.label ?? 'Autres gestes', items }));
  }, [visibles, categories]);

  const site = `${window.location.origin}/`;
  const lien = lienDeReservation(site, { besoin, gestes: choisis, ...(calibre ? { calibre } : {}) });
  const noms = choisis.map((id) => actifs.find((s) => s.id === id)?.name ?? id);
  const message = messageDuLien(prenom, noms, lien);
  const jeton = jetonDuLien({ besoin, gestes: choisis, ...(calibre ? { calibre } : {}) });
  const prenomDit = prenom.trim() || 'Madame';
  const gestesDits = noms.join(' et ') || 'vos gestes';
  const texteDuModele = `Bonjour ${prenomDit}, la Maison MND a préparé votre réservation : ${gestesDits}. Il ne vous reste qu'à choisir votre jour et votre heure. [Choisir mon heure : ${URL_DU_MODELE}${jeton}]`;
  const bascule = (id: string) => setChoisis((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(0, 6)));

  return (
    <Modal title="Un lien de réservation préparé." onClose={surFermer} width={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          Cochez les gestes : la cliente les trouvera déjà choisis, au prix de son calibre, et n’aura plus qu’à prendre son heure.
        </div>
        <div className="tr-grid tr-grid--2">
          <Field label="Le parcours">
            <Select value={besoin} onChange={(e) => setBesoin(e.target.value as BesoinDuLien)}>
              {BESOINS.map((b) => <option key={b.k} value={b.k}>{b.l}</option>)}
            </Select>
          </Field>
          <Field label="Son calibre, si vous le connaissez">
            <Select value={calibre} onChange={(e) => setCalibre(e.target.value)}>
              <option value="">Elle le dira sur le site</option>
              {bandes.map((b) => <option key={b.id} value={b.id}>{b.name}{b.maxLocks ? ` · jusqu’à ${b.maxLocks} locks` : ''}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={`Les gestes · ${choisis.length} sur 6`}>
          <Input value={cherche} placeholder="Chercher un geste" onChange={(e) => setCherche(e.target.value)} />
        </Field>
        <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--hairline)', borderRadius: 4, padding: '6px 10px' }}>
          {parFamille.map((f) => (
            <div key={f.id} style={{ padding: '6px 0' }}>
              <div className="mnd-muted" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', margin: '4px 0' }}>{f.titre}</div>
              {f.items.map((s) => (
                <label key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: 13.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={choisis.includes(s.id)} onChange={() => bascule(s.id)} />
                  <span>{s.name}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 3, padding: '10px 12px', fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {fenetreOuverte ? message : texteDuModele}
        </div>
        {!fenetreOuverte && (
          <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
            Sa fenêtre est fermée : le lien part par le modèle approuvé « réservation préparée », avec un bouton « Choisir mon heure ». Meta facture ce message.
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(lien).then(() => toast('Lien copié.')).catch(() => toast(lien)); }}>Copier le lien</Button>
          {fenetreOuverte && <Button variant="ghost" disabled={choisis.length === 0} onClick={() => surModele([prenomDit, gestesDits], jeton, texteDuModele)}>Par le modèle</Button>}
          {fenetreOuverte
            ? <Button variant="copper" disabled={choisis.length === 0} onClick={() => surMessage(message)}>Poser dans le message</Button>
            : <Button variant="copper" disabled={choisis.length === 0} onClick={() => surModele([prenomDit, gestesDits], jeton, texteDuModele)}>Envoyer par le modèle</Button>}
        </div>
      </div>
    </Modal>
  );
}
