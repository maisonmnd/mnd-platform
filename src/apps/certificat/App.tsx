import { asset } from '../../shared/asset';
import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Select, demande } from '../../ds/components';
import { PARCOURS_MND, texteDuCertificat } from '../../shared/parcours';
import { enVignette } from '../../shared/photo';
import { ChampDeDate } from '../../ds/dates';

/* Certificat Académie — template A4 paysage prêt à imprimer.
   Panneau de réglage à gauche (masqué à l'impression), le papier à droite.
   L'ERP Académie pré-remplit via l'URL : ?apprenant=…&parcours=…

   AUX COULEURS DE L'ACADÉMIE MND — 7 octobre 2026. « Avec la charte de
   l'Académie, retirer Maison MND du certificat et redessiner » (Yéman).
   Maquette DagAWw1Wfb2S1rt2pYc4pW validée : le verrou couché de l'Académie en
   tête, le Vert Savoir pour la vocation, MND en indigo, le filet cuivre, le
   sceau dentelé de l'Académie, sa signature au pied. Plus rien de la Maison :
   ni son nom, ni son monogramme, ni sa devise. Le nom s'écrit « Académie
   MND », jamais l'inverse (charte). */
export const SIGNATURE_ACADEMIE = 'Former. Transmettre. Affirmer.';

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

/* ══ LES SIGNATAIRES SE CHANGENT — 16 septembre 2026 ═══════════════════
   « Je veux pouvoir changer les noms des signataires du certificat »
   (Yéman). Deux signataires, chacun son nom et sa qualité, réglés dans le
   panneau. ILS RESTENT SUR CE POSTE (localStorage), d'un certificat à
   l'autre : on ne retape pas la direction à chaque papier. Sans réglage,
   ceux de la Maison. */
type Signataire = { nom: string; role: string };
const SIGNATAIRES_PAR_DEFAUT: Signataire[] = [
  { nom: 'Brice Ahouansou', role: 'Le Maître Locticien' },
  { nom: 'Yéman Ahouansou', role: 'La Direction · Académie MND' },
];
const CLE_SIGNATAIRES = 'mnd_certificat_signataires';
function litLesSignataires(): Signataire[] {
  try {
    const brut = localStorage.getItem(CLE_SIGNATAIRES);
    if (!brut) return SIGNATAIRES_PAR_DEFAUT;
    const l: unknown = JSON.parse(brut);
    if (!Array.isArray(l) || l.length !== 2) return SIGNATAIRES_PAR_DEFAUT;
    return SIGNATAIRES_PAR_DEFAUT.map((d, i) => {
      const s = l[i] as Partial<Signataire> | null;
      return {
        nom: typeof s?.nom === 'string' ? s.nom : d.nom,
        /* Un poste réglé avant le 7 octobre disait « Maison MND » : le
           certificat est celui de l'Académie. */
        role: typeof s?.role === 'string' ? s.role.replace(/Maison MND/g, 'Académie MND') : d.role,
      };
    });
  } catch { return SIGNATAIRES_PAR_DEFAUT; }
}

/** Le fichier part sur le poste, comme un calendrier ou un reçu. */
function telecharge(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

type EtatDuDepot = '' | 'en-cours' | 'depose' | 'sans-dossier' | 'refuse' | 'pdf-impossible';
const DIT_LE_DEPOT: Record<Exclude<EtatDuDepot, ''>, string> = {
  'en-cours': 'Le certificat se dessine…',
  depose: 'PDF enregistré sur ce poste, et sa copie déposée au dossier de l’apprenant, au Suivi de l’Académie.',
  'sans-dossier': 'PDF enregistré sur ce poste. Ouvert sans lien du Suivi, ce certificat n’a pas de dossier où déposer sa copie.',
  refuse: 'PDF enregistré sur ce poste, mais la copie au dossier n’a pas pu être déposée : connectez-vous au Trône sur ce poste, puis recommencez.',
  'pdf-impossible': 'Le PDF n’a pas pu se dessiner. Réessayez, ou passez par « Imprimer ».',
};

function SignatureDuCertificat({ s }: { s: Signataire }) {
  return (
    <div className="ct-sign">
      <div className="ct-sign__nom">{s.nom.trim() || ' '}</div>
      <span className="ct-sign__ligne" aria-hidden="true" />
      <div className="ct-sign__role">{s.role.trim()}</div>
    </div>
  );
}

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
  /* ══ L'ACADÉMIE FAIT FOI — 16 septembre 2026 ══════════════════════════
     « Remets le texte du certificat à jour selon les nouvelles mises à jour
     de l'Œuvre » (Yéman). Le certificat retrouvait le parcours par son nom
     et imprimait la durée et les compétences de la SEMENCE, quand la
     formation vivante, retouchée dans l'Académie, disait autre chose. Ce que
     le lien apporte (niveau, durée, compétences lues sur les modules) PRIME
     désormais, même quand le nom est connu ; la semence reste le repli d'un
     certificat ouvert sans lien. Un parcours inconnu forge une formation
     sur-mesure, comme avant. */
  const niveauDuLien = params.get('niveau')?.trim() || '';
  const dureeDuLien = params.get('duree')?.trim() || '';
  const competencesDuLien = params.get('competences')?.trim() || '';
  const leLienDitPlus = !!(niveauDuLien || dureeDuLien || competencesDuLien);
  const custom: Formation | null =
    parcours && (!match || leLienDitPlus)
      ? {
          id: match?.id ?? 'sur-mesure',
          titre: match?.titre ?? parcours,
          niveau: niveauDuLien || match?.niveau || 'Parcours de l’Académie',
          duree: dureeDuLien || match?.duree || 'sur dossier',
          competences: competencesDuLien || match?.competences || 'les gestes et le protocole de l’Académie MND',
        }
      : null;
  /* Numéro, date et mention transmis par l'ERP à la délivrance (F6 → certificat). */
  const numero = params.get('numero')?.trim();
  const dateParam = params.get('date')?.trim();
  const validDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : '';
  const mentionParam = params.get('mention')?.trim();
  const mention = mentionParam && MENTIONS.includes(mentionParam) ? mentionParam : 'Excellence';
  return {
    /* AUCUN NOM EN DUR — 13 septembre 2026, « enlever Rachelle A. qui est
       écrit en dur, laisser la case vide » (Yéman). Un exemple pré-rempli
       finit un jour imprimé au nom d'une autre. Sans lien, la case est vide
       et le papier dit « Nom de l'apprenant » tant qu'elle n'est pas remplie. */
    apprenant: params.get('apprenant')?.trim() || '',
    formationId: match?.id ?? custom?.id ?? FORMATIONS[1].id,
    dateIso: validDate || new Date().toISOString().slice(0, 10),
    /* AUCUN NUMÉRO EN DUR — 13 septembre 2026, « le numéro de certificat écrit
       en dur, corrige » (Yéman). « MND-AC-2026-0042 » s'imprimait sur tout
       certificat ouvert sans lien : deux apprenantes pouvaient porter le même
       numéro, et un numéro sert justement à distinguer et à vérifier. Le vrai
       numéro s'attribue à la délivrance, dans le Suivi de l'Académie
       (`nextCertNumber`, séquentiel par année), qui l'envoie par le lien. */
    certNo: numero || '',
    mention,
    custom,
    /* L'INSCRIPTION D'OÙ VIENT LE LIEN (16 septembre 2026) : c'est là que la
       copie du PDF se dépose. Sans lien du Suivi, pas de dossier. */
    dossier: (params.get('dossier') ?? '').trim().replace(/[^A-Za-z0-9_-]/g, ''),
  };
}

export default function App() {
  const [init] = useState(initFromUrl);
  /* Le catalogue affiché inclut, le cas échéant, la formation reçue par URL,
     à la place de sa jumelle de la semence quand elle en a une. */
  const [formations] = useState<Formation[]>(() => (init.custom
    ? [init.custom, ...FORMATIONS.filter((f) => f.id !== init.custom!.id)]
    : FORMATIONS));
  const [apprenant, setApprenant] = useState(init.apprenant);
  const [formationId, setFormationId] = useState(init.formationId);
  const [dateIso, setDateIso] = useState(init.dateIso);
  const [certNo, setCertNo] = useState(init.certNo);
  const [mention, setMention] = useState(init.mention);
  const [signataires, setSignataires] = useState<Signataire[]>(litLesSignataires);
  useEffect(() => {
    try { localStorage.setItem(CLE_SIGNATAIRES, JSON.stringify(signataires)); } catch { /* poste sans mémoire */ }
  }, [signataires]);
  const poseSignataire = (i: number, champ: keyof Signataire, valeur: string) =>
    setSignataires((prev) => prev.map((s, j) => (j === i ? { ...s, [champ]: valeur } : s)));
  const [depot, setDepot] = useState<EtatDuDepot>('');

  /* ══ LA PHOTO D'IDENTITÉ — 13 septembre 2026 ══════════════════════════
     « Créer un espace pour télécharger la photo d'identité de l'apprenant sur
     le certificat » (Yéman).

     ELLE NE VOYAGE PAS DANS LE LIEN. Le certificat se prépare par un lien
     (?apprenant=…) : une photo ne tient pas dans un lien. Elle vit le temps
     de la page, s'imprime, et depuis le 16 septembre elle figure sur le PDF
     enregistré, et donc sur la copie déposée au dossier de l'apprenant
     (décision de Yéman : « me permettre de sauvegarder le certificat »).

     ELLE EST RÉDUITE AVANT D'ÊTRE POSÉE (720 px de grand côté, `enVignette`) :
     une photo de téléphone de huit mégapixels alourdirait l'aperçu pour un
     cadre de trois centimètres, où 720 px restent nets à l'impression. */
  const [photo, setPhoto] = useState('');
  const [erreurPhoto, setErreurPhoto] = useState('');
  const fichierPhoto = useRef<HTMLInputElement>(null);
  const choisirPhoto = async (f: File) => {
    if (!f.type.startsWith('image/')) {
      setErreurPhoto('Ce fichier n’est pas une image. Choisissez une photo JPEG ou PNG.');
      return;
    }
    setErreurPhoto('');
    try {
      setPhoto(await enVignette(f, 720, 0.88));
    } catch {
      setErreurPhoto('Cette image ne se lit pas. Choisissez une photo JPEG ou PNG.');
    }
  };

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
    `Académie MND · votre certificat « ${formation.titre} » est prêt, ${nom}. ` +
    `Toutes nos félicitations. ${SIGNATURE_ACADEMIE}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  const mailSubject = 'Votre certificat de l’Académie MND';
  const mailBody =
    `Chère ${nom},\n\n` +
    `Votre certificat « ${formation.titre} »${certNo.trim() ? ` (n° ${certNo.trim()})` : ''} est délivré par l’Académie MND, ` +
    `fait à Cotonou le ${dateAffichee}.\n\n` +
    `Avec fierté,\nAcadémie MND · ${SIGNATURE_ACADEMIE}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;

  const texte = texteDuCertificat({
    apprenant: nom, titre: formation.titre, niveau: formation.niveau,
    duree: formation.duree, competences: formation.competences,
  });

  const ilNeManqueRien = async (question: string, acte: string): Promise<boolean> => {
    const manques = [
      !apprenant.trim() ? 'le nom de l’apprenant' : '',
      !certNo.trim() ? 'le numéro de certificat, sans lequel il ne se vérifie pas' : '',
    ].filter(Boolean);
    if (manques.length === 0) return true;
    return demande({
      quoi: 'Certificat incomplet',
      titre: question,
      dit: `Il manque ${manques.join(' et ')}.`,
      accepter: acte,
      refuser: 'Compléter d’abord',
      dur: true,
    });
  };

  /* ══ ENREGISTRER LE CERTIFICAT — 16 septembre 2026 ═════════════════════
     « Me permettre de sauvegarder le certificat » (Yéman) : un fichier PDF,
     et une copie au dossier. Le PDF se dessine ici (`certificatEnPiece`, le
     même papier que l'aperçu), part sur le poste, puis la MÊME copie se
     dépose au coffre des certificats, au dossier de l'inscription d'où vient
     le lien. Le dessin et le coffre se chargent à la demande : la page
     reste légère tant qu'on ne fait qu'imprimer. */
  const enregistreLePdf = async () => {
    if (!await ilNeManqueRien('Enregistrer ce certificat quand même ?', 'Enregistrer quand même')) return;
    setDepot('en-cours');
    let piece: { nom: string; blob: Blob };
    try {
      const [{ certificatEnPiece }, coffre] = await Promise.all([
        import('../../shared/pdf'),
        import('../../shared/certificats-coffre'),
      ]);
      piece = await certificatEnPiece({
        apprenant: nom,
        texte,
        numero: certNo.trim(),
        mention,
        jourLisible: dateAffichee,
        photo: photo || undefined,
        signataires,
        filename: coffre.nomDuFichierCertificat(apprenant, certNo),
      });
      telecharge(piece.blob, piece.nom);
      if (!init.dossier) { setDepot('sans-dossier'); return; }
      const chemin = await coffre.deposeLeCertificat(init.dossier, certNo, piece.blob);
      setDepot(chemin ? 'depose' : 'refuse');
    } catch (e) {
      console.warn('[mnd-certificat] PDF impossible :', e);
      setDepot('pdf-impossible');
    }
  };

  return (
    <div className="ct-page">
      <div className="ct-inner">
        <header className="ct-toolbar mnd-rise">
          <div>
            <div className="mnd-eyebrow">Académie · Certification</div>
            <div className="ct-toolbar__title">Prêt à imprimer, envoyer, sceller.</div>
          </div>
          <div className="ct-actions">
            {/* CE QUI MANQUE SE DIT AVANT LE PAPIER : un papier sans numéro
                n'est pas vérifiable, un papier sans nom n'est à personne. On peut
                continuer quand même (un modèle, une épreuve), mais en le sachant. */}
            <Button variant="copper" disabled={depot === 'en-cours'} onClick={() => void enregistreLePdf()}>
              Enregistrer le PDF
            </Button>
            <Button
              onClick={async () => {
                if (!await ilNeManqueRien('Imprimer ce certificat quand même ?', 'Imprimer quand même')) return;
                window.print();
              }}
            >
              Imprimer
            </Button>
            <a className="ct-action ct-action--wa" href={waHref} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            <a className="ct-action ct-action--mail" href={mailHref}>
              E-mail
            </a>
          </div>
        </header>
        {depot && (
          <div className={`ct-depot ct-depot--${depot}`} role="status">
            {DIT_LE_DEPOT[depot]}
          </div>
        )}

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

            <div className="mnd-field">
              <span className="mnd-field__label">Photo d’identité</span>
              <input
                ref={fichierPhoto}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void choisirPhoto(f);
                }}
              />
              {photo ? (
                <div className="ct-photo">
                  <img className="ct-photo__vue" src={photo} alt={`Photo d’identité de ${nom}`} />
                  <div className="ct-photo__gestes">
                    <button type="button" className="ct-photo__lien" onClick={() => fichierPhoto.current?.click()}>
                      Remplacer
                    </button>
                    <button type="button" className="ct-photo__lien is-retrait" onClick={() => setPhoto('')}>
                      Retirer
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="ct-photo__vide"
                  onClick={() => fichierPhoto.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) void choisirPhoto(f);
                  }}
                >
                  <span>Choisir une photo</span>
                  <small>ou la glisser ici · de face, sur fond clair</small>
                </button>
              )}
              {erreurPhoto && <div className="ct-photo__erreur">{erreurPhoto}</div>}
              <div className="ct-controls__meta">
                Elle ne voyage pas dans le lien. Elle figure sur le PDF enregistré, et sur la copie déposée au dossier.
              </div>
            </div>

            <Field label="Date de délivrance">
              <ChampDeDate sens="arriere" value={dateIso} onChange={setDateIso} ariaLabel="Date de délivrance" />
            </Field>

            <Field label="Numéro de certificat">
              <Input value={certNo} onChange={(e) => setCertNo(e.target.value)} />
            </Field>
            {!certNo.trim() && (
              <div className="ct-controls__meta" style={{ marginTop: -8 }}>
                Le numéro s’attribue à la délivrance, dans le Suivi de l’Académie : c’est lui qui rend ce certificat vérifiable.
              </div>
            )}

            <Field label="Mention">
              <Select value={mention} onChange={(e) => setMention(e.target.value)}>
                {MENTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="mnd-field ct-signataires">
              <span className="mnd-field__label">Signataires</span>
              {signataires.map((s, i) => (
                <div key={i} className="ct-signataire">
                  <Input
                    value={s.nom}
                    onChange={(e) => poseSignataire(i, 'nom', e.target.value)}
                    placeholder={i === 0 ? 'Nom du maître locticien' : 'Nom de la direction'}
                    aria-label={`Nom du signataire ${i + 1}`}
                  />
                  <Input
                    value={s.role}
                    onChange={(e) => poseSignataire(i, 'role', e.target.value)}
                    placeholder="Sa qualité"
                    aria-label={`Qualité du signataire ${i + 1}`}
                  />
                </div>
              ))}
              <div className="ct-controls__meta">
                Ils restent sur ce poste, d’un certificat à l’autre.
              </div>
            </div>

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
                <div className="ct-frame ct-frame--vert" aria-hidden="true" />
                <div className="ct-frame ct-frame--cuivre" aria-hidden="true" />
                <img className="ct-watermark" src={asset('/assets/academie/pictogramme.png')} alt="" aria-hidden="true" />
                {/* LE PORTRAIT, EN HAUT À GAUCHE, DANS LE DOUBLE FILET DU CADRE :
                    cuivre dehors, indigo dedans, comme la feuille elle-même.
                    C'est le coin vide de la page : le monogramme tient le
                    centre, et le texte ne monte pas si haut sur les flancs.
                    Sans photo, rien ne se dessine, pas même un cadre vide. */}
                {photo && (
                  <div className="ct-portrait">
                    <img src={photo} alt={`Photo d’identité de ${nom}`} />
                  </div>
                )}

                <div className="ct-body">
                  {/* Le verrou couché de l'Académie, pris tel quel dans la
                      charte (docs/marque/sous-marques/logos) : ACADÉMIE en
                      Vert Savoir au-dessus de MND en indigo. */}
                  <img className="ct-verrou" src={asset('/assets/academie/verrou-couche.png')} alt="Académie MND" />

                  <h1 className="ct-title">Certificat</h1>
                  <span className="ct-filet" aria-hidden="true" />

                  <div className="ct-decerne">est décerné à</div>
                  <div className="ct-nom">{nom}</div>

                  {/* LA PHRASE VIT DANS `texteDuCertificat` (shared/parcours), la
                      même pour l'écran et le PDF : version corrigée par Yéman le
                      16 septembre, « Maître Locticien » en gras. */}
                  <p className="ct-texte">
                    {texte.avant}<b>{texte.gras}</b>{texte.apres}
                  </p>

                  <div className="ct-meta">
                    {/* Sans numéro, une ligne à remplir plutôt qu'un numéro inventé. */}
                    <span>
                      Certificat n°{' '}
                      {certNo.trim() || <span style={{ display: 'inline-block', width: 120, borderBottom: '1px solid var(--hairline)', verticalAlign: 'baseline' }} aria-label="numéro à attribuer" />}
                    </span>
                    <span>Mention {mention}</span>
                    <span>Fait à Cotonou, le {dateAffichee}</span>
                  </div>

                  <div className="ct-signatures">
                    <SignatureDuCertificat s={signataires[0]} />

                    {/* LE SCEAU DENTELÉ DE L'ACADÉMIE MND — 7 octobre 2026. Le
                        contour dentelé du sceau de la Maison, en Vert Savoir,
                        aux mots de l'Académie, son pictogramme au centre.
                        Fabriqué une fois (scripts/fabrique-le-sceau-de-l-academie.py) :
                        l'écran, le PDF et le Secrétariat posent la même image. */}
                    <img className="ct-sceau" src={asset('/assets/tampons/academie-dentele.png')} alt="" aria-hidden="true" />

                    <SignatureDuCertificat s={signataires[1]} />
                  </div>

                  <div className="ct-signature-academie">{SIGNATURE_ACADEMIE}</div>
                </div>
              </section>
            </div>

            <p className="ct-hint">
              «&nbsp;Enregistrer le PDF&nbsp;» télécharge le certificat et, quand il vient du Suivi de
              l’Académie, en dépose une copie au dossier de l’apprenant. «&nbsp;Imprimer&nbsp;» ouvre
              la boîte d’impression.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
