import { asset } from '../../shared/asset';
import { DEVISE_COMPLETE } from '../../shared/identite';
import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Select } from '../../ds/components';
import { PARCOURS_MND } from '../../shared/parcours';

/* Certificat Académie — template A4 paysage prêt à imprimer.
   Panneau de réglage à gauche (masqué à l'impression), le papier à droite.
   L'ERP Académie pré-remplit via l'URL : ?apprenant=…&parcours=… */

type Formation = {
  id: string;
  titre: string;
  niveau: string;
  duree: string;
  competences: string;
};

/* LA LISTE VIT DANS `shared/parcours`, ET PLUS ICI — 6 septembre 2026.

   « Pourrions-nous retrouver toutes les formations de l'Académie ? » (Yéman).
   Elles n'étaient pas perdues : elles étaient EN DUR dans ce fichier, et le
   magasin de l'Académie n'avait jamais été rempli. Deux vérités pour une
   notion — un certificat aurait nommé un parcours absent de l'Académie, et
   l'inverse aussi. */
const FORMATIONS: Formation[] = PARCOURS_MND.map((p) => ({
  id: p.id, titre: p.titre, niveau: p.niveau, duree: p.duree, competences: p.competences,
}));

const MENTIONS = ['Honorable', 'Distinction', 'Excellence'];

const SHEET_W = 1120;
const SHEET_H = 792;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function findFormation(q: string | null): Formation | undefined {
  if (!q) return undefined;
  const n = norm(q.trim());
  if (!n) return undefined;
  return (
    FORMATIONS.find((f) => f.id === n) ??
    FORMATIONS.find((f) => norm(f.titre) === n) ??
    FORMATIONS.find((f) => norm(f.titre).includes(n))
  );
}

function dateLongue(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const annee = new Date().getFullYear();
  const parcours = params.get('parcours')?.trim() || '';
  const match = findFormation(parcours);
  /* Parcours absent du catalogue (formation maison, intitulé libre venu de l'ERP) :
     on forge une formation sur-mesure — sans quoi le certificat affichait un autre
     parcours que celui délivré. */
  const custom: Formation | null =
    !match && parcours
      ? {
          id: 'sur-mesure',
          titre: parcours,
          // Niveau et durée réels transmis par l'ERP (sinon repli générique).
          niveau: params.get('niveau')?.trim() || 'Parcours de la Maison',
          duree: params.get('duree')?.trim() || 'sur dossier',
          competences: 'les gestes et le protocole de la Maison MND',
        }
      : null;
  /* Numéro, date et mention transmis par l'ERP à la délivrance (F6 → certificat). */
  const numero = params.get('numero')?.trim();
  const dateParam = params.get('date')?.trim();
  const validDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : '';
  const mentionParam = params.get('mention')?.trim();
  const mention = mentionParam && MENTIONS.includes(mentionParam) ? mentionParam : 'Excellence';
  return {
    apprenant: params.get('apprenant')?.trim() || 'Rachelle A.',
    formationId: match?.id ?? custom?.id ?? FORMATIONS[1].id,
    dateIso: validDate || new Date().toISOString().slice(0, 10),
    certNo: numero || `MND-AC-${annee}-0042`,
    mention,
    custom,
  };
}

export default function App() {
  const [init] = useState(initFromUrl);
  /* Le catalogue affiché inclut, le cas échéant, la formation sur-mesure reçue par URL. */
  const [formations] = useState<Formation[]>(() => (init.custom ? [init.custom, ...FORMATIONS] : FORMATIONS));
  const [apprenant, setApprenant] = useState(init.apprenant);
  const [formationId, setFormationId] = useState(init.formationId);
  const [dateIso, setDateIso] = useState(init.dateIso);
  const [certNo, setCertNo] = useState(init.certNo);
  const [mention, setMention] = useState(init.mention);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (el) setScale(Math.min(1, el.clientWidth / SHEET_W));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const formation = formations.find((f) => f.id === formationId) ?? formations[0];
  const nom = apprenant.trim() || 'Nom de l’apprenant';
  const dateAffichee = dateLongue(dateIso);

  const waMessage =
    `Maison MND — votre certificat « ${formation.titre} » est prêt, ${nom}. ` +
    `Toutes nos félicitations. ${DEVISE_COMPLETE}.`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  const mailSubject = 'Votre certificat Maison MND';
  const mailBody =
    `Chère ${nom},\n\n` +
    `Votre certificat « ${formation.titre} » (n° ${certNo}) est délivré par la Maison MND, ` +
    `fait à Cotonou le ${dateAffichee}.\n\n` +
    `Avec fierté,\nMaison MND · Académie du Lock`;
  const mailHref = `mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;

  return (
    <div className="ct-page">
      <div className="ct-inner">
        <header className="ct-toolbar mnd-rise">
          <div>
            <div className="mnd-eyebrow">Académie · Certification</div>
            <div className="ct-toolbar__title">Prêt à imprimer, envoyer, sceller.</div>
          </div>
          <div className="ct-actions">
            <Button onClick={() => window.print()}>Imprimer / PDF</Button>
            <a className="ct-action ct-action--wa" href={waHref} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            <a className="ct-action ct-action--mail" href={mailHref}>
              E-mail
            </a>
          </div>
        </header>

        <div className="ct-layout">
          <aside className="ct-controls mnd-rise">
            <div>
              <div className="mnd-eyebrow">Réglage</div>
              <div className="ct-controls__head">Le certificat</div>
            </div>

            <Field label="Parcours · formations de l’Académie">
              <Select value={formationId} onChange={(e) => setFormationId(e.target.value)}>
                {formations.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.titre}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="ct-controls__meta">
              {formation.niveau} · {formation.duree}
            </div>

            <Field label="Nom de l’apprenant">
              <Input
                value={apprenant}
                onChange={(e) => setApprenant(e.target.value)}
                placeholder="Prénom et nom"
              />
            </Field>

            <Field label="Date de délivrance">
              <Input type="date" value={dateIso} onChange={(e) => setDateIso(e.target.value)} />
            </Field>

            <Field label="Numéro de certificat">
              <Input value={certNo} onChange={(e) => setCertNo(e.target.value)} />
            </Field>

            <Field label="Mention">
              <Select value={mention} onChange={(e) => setMention(e.target.value)}>
                {MENTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="ct-controls__note">
              L’ERP Académie pré-remplit ce panneau par le lien
              «&nbsp;?apprenant=…&amp;parcours=…&nbsp;». Le panneau disparaît à l’impression&nbsp;;
              seul le papier demeure.
            </div>
          </aside>

          <div className="ct-stage">
            <div
              className="ct-scalewrap"
              ref={wrapRef}
              style={{ height: Math.round(SHEET_H * scale) }}
            >
              <section
                className="ct-sheet"
                style={{ transform: `scale(${scale})` }}
                aria-label={`Certificat ${formation.titre} décerné à ${nom}`}
              >
                <div className="ct-frame ct-frame--copper" aria-hidden="true" />
                <div className="ct-frame ct-frame--indigo" aria-hidden="true" />
                <div className="ct-watermark" aria-hidden="true" />

                <div className="ct-body">
                  <img className="ct-mono" src={asset("/assets/monograms/mono-indigo.png")} alt="" />
                  <div className="ct-sigle">MND</div>
                  <div className="ct-adresse">Maison MND · Académie du Lock · Cotonou · Bénin</div>
                  <span className="ct-filet" aria-hidden="true" />

                  <div className="ct-kicker">MND Académie</div>
                  <h1 className="ct-title">Certificat</h1>

                  <div className="ct-decerne">est décerné à</div>
                  <div className="ct-nom">{nom}</div>
                  <span className="ct-filet ct-filet--fin" aria-hidden="true" />

                  <p className="ct-texte">
                    qui a accompli le parcours <b>{formation.titre}</b> — {formation.niveau} ·{' '}
                    {formation.duree} — à l’atelier MND de Cotonou, et démontré devant le maître
                    loctician {formation.competences}, selon la méthode des quatre temps — Purifier
                    · Nourrir · Sceller · Couronner — et les exigences de la Maison.
                  </p>

                  <div className="ct-meta">
                    <span>Certificat n° {certNo}</span>
                    <span>Mention {mention}</span>
                    <span>Fait à Cotonou, le {dateAffichee}</span>
                  </div>

                  <div className="ct-signatures">
                    <div className="ct-sign">
                      <div className="ct-sign__nom">Brice Ahouansou</div>
                      <span className="ct-sign__ligne" aria-hidden="true" />
                      <div className="ct-sign__role">Le Maître Loctician</div>
                    </div>

                    {/* ══ LE TAMPON DE LA MAISON, EN CUIVRE — 6 septembre 2026 ══
                        « Change le tampon de l'Académie, mets celui qu'on a
                        utilisé pour les contrats » (Yéman).

                        L'ANCIEN AVAIT LE DÉFAUT QUE LE TAMPON A CORRIGÉ : son
                        texte faisait le tour complet du cercle sur un seul
                        chemin, donc la moitié basse se lisait la tête en bas.
                        Deux arcs désormais, chacun centré sur son axe — le nom
                        sur le sommet, la ville sur le bas — et le bas suit un
                        chemin tracé dans l'autre sens pour que ses lettres se
                        redressent.

                        MÊME GÉOMÉTRIE QUE `tamponDeLaMaison` (shared/pdf) : les
                        deux cercles, les deux losanges aux flancs, le vrai
                        monogramme au centre. Ce qui change ici, c'est l'encre —
                        cuivre, comme le veut un certificat — et les mots :
                        l'Académie signe en son nom. */}
                    <div className="ct-sceau" aria-hidden="true">
                      <svg viewBox="0 0 160 160">
                        <defs>
                          {/* Le haut : de gauche à droite PAR LE SOMMET, les
                              lettres debout vers l'extérieur. */}
                          <path id="ct-seal-haut" d="M 24,80 a 56,56 0 0,1 112,0" />
                          {/* Le bas : de gauche à droite PAR LE BAS, les lettres
                              debout vers le centre. Sans ce second chemin, la
                              ville se lirait à l'envers. */}
                          <path id="ct-seal-bas" d="M 24,80 a 56,56 0 0,0 112,0" />
                        </defs>
                        <circle cx="80" cy="80" r="78" fill="none" stroke="var(--copper-400)" strokeWidth="3.4" />
                        <circle cx="80" cy="80" r="67" fill="none" stroke="var(--copper-400)" strokeWidth="1.2" />
                        <text
                          fontFamily="var(--font-sans)" fontSize="13" fontWeight="500"
                          letterSpacing="1.6" fill="var(--copper-600)" textAnchor="middle"
                        >
                          <textPath href="#ct-seal-haut" startOffset="50%">MND ACADÉMIE</textPath>
                        </text>
                        <text
                          fontFamily="var(--font-sans)" fontSize="11"
                          letterSpacing="1.8" fill="var(--copper-600)" textAnchor="middle"
                        >
                          <textPath href="#ct-seal-bas" startOffset="50%">COTONOU</textPath>
                        </text>
                        {/* Les deux losanges aux flancs, là où les arcs se
                            rejoignent : c'est ce petit rien qui fait qu'un
                            cercle se lit comme un tampon. */}
                        <path d="M 24,76 l 4,4 -4,4 -4,-4 z" fill="var(--copper-500)" />
                        <path d="M 136,76 l 4,4 -4,4 -4,-4 z" fill="var(--copper-500)" />
                      </svg>
                      <img src={asset("/assets/monograms/mono-copper.png")} alt="" />
                    </div>

                    <div className="ct-sign">
                      <div className="ct-sign__nom">Yéman Ahouansou</div>
                      <span className="ct-sign__ligne" aria-hidden="true" />
                      <div className="ct-sign__role">La Direction · Maison MND</div>
                    </div>
                  </div>

                  <div className="ct-devise-culturelle">
                    {DEVISE_COMPLETE}
                  </div>
                </div>
              </section>
            </div>

            <p className="ct-hint">
              Astuce — «&nbsp;Imprimer / PDF&nbsp;» ouvre la boîte d’impression&nbsp;: choisissez
              «&nbsp;Enregistrer au format PDF&nbsp;» comme destination pour le télécharger.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
