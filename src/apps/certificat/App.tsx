import { asset } from '../../shared/asset';
import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Select } from '../../ds/components';

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

const FORMATIONS: Formation[] = [
  {
    id: 'initiation',
    titre: 'Initiation au soin des locks',
    niveau: 'Parcours I · L’Initiation',
    duree: 'trois jours · douze heures · quatre séances',
    competences: 'les gestes fondateurs du soin des locks — lavage doux, hydratation et protection de la fibre',
  },
  {
    id: 'praticien',
    titre: 'Praticien MND',
    niveau: 'Parcours II · L’Affirmation',
    duree: 'une semaine · trente heures · cinq séances',
    competences: 'la maîtrise du diagnostic, de la création, de la reprise de racines et du rituel de soin complet',
  },
  {
    id: 'maitre',
    titre: 'Maître MND',
    niveau: 'Parcours III · L’Œuvre',
    duree: 'trois mois · quatre-vingt-dix heures · douze séances',
    competences: 'la maîtrise d’œuvre du soin des locks, la conduite d’atelier et la transmission de la méthode',
  },
  {
    id: 'resserrage',
    titre: 'Resserrage & soin des racines',
    niveau: 'Parcours technique',
    duree: 'deux semaines · vingt heures · six séances',
    competences: 'le resserrage de précision, la santé du cuir chevelu et la protection de la longueur acquise',
  },
  {
    id: 'laboratoire',
    titre: 'Le Laboratoire · formulation capillaire',
    niveau: 'Parcours spécial',
    duree: 'une semaine · vingt-quatre heures · quatre séances',
    competences: 'la formulation des soins de la gamme — origines des ingrédients, protocoles et substitutions',
  },
  {
    id: 'referentiel',
    titre: 'Certification Référentiel MND',
    niveau: 'Certifiant · Pro',
    duree: 'dix séances · sur dossier',
    competences: 'le référentiel complet de la Maison, appliqué et démontré devant le jury de l’Académie',
  },
];

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
  return {
    apprenant: params.get('apprenant')?.trim() || 'Vioutou Raimath Bonou',
    formationId: findFormation(params.get('parcours'))?.id ?? FORMATIONS[1].id,
    dateIso: new Date().toISOString().slice(0, 10),
    certNo: `MND-AC-${annee}-0042`,
  };
}

export default function App() {
  const [init] = useState(initFromUrl);
  const [apprenant, setApprenant] = useState(init.apprenant);
  const [formationId, setFormationId] = useState(init.formationId);
  const [dateIso, setDateIso] = useState(init.dateIso);
  const [certNo, setCertNo] = useState(init.certNo);
  const [mention, setMention] = useState('Excellence');

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

  const formation = FORMATIONS.find((f) => f.id === formationId) ?? FORMATIONS[0];
  const nom = apprenant.trim() || 'Nom de l’apprenant';
  const dateAffichee = dateLongue(dateIso);

  const waMessage =
    `Maison MND — votre certificat « ${formation.titre} » est prêt, ${nom}. ` +
    `Toutes nos félicitations. mi nyɔ́ ɖɛkpɛ.`;
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
                {FORMATIONS.map((f) => (
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

                    <div className="ct-sceau" aria-hidden="true">
                      <svg viewBox="0 0 160 160">
                        <defs>
                          <path
                            id="ct-seal-circle"
                            d="M 80,80 m -62,0 a 62,62 0 1,1 124,0 a 62,62 0 1,1 -124,0"
                          />
                        </defs>
                        <circle cx="80" cy="80" r="76" fill="none" stroke="var(--copper-400)" strokeWidth="2" />
                        <circle cx="80" cy="80" r="62" fill="none" stroke="var(--copper-400)" strokeWidth="1" />
                        <text fontFamily="var(--font-sans)" fontSize="9.5" letterSpacing="2.4" fill="var(--copper-600)">
                          <textPath href="#ct-seal-circle" startOffset="2%">
                            MND ACADÉMIE · COTONOU · LES QUATRE TEMPS ·
                          </textPath>
                        </text>
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
                    mi nyɔ́ ɖɛkpɛ · nous sommes beaux, et nous le savons.
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
