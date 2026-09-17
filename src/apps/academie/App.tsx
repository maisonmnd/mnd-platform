import { useMemo, useState } from 'react';
import { asset } from '../../shared/asset';
import { uid, useStore } from '../../shared/store';
import { vitrineConfigStore } from '../../shared/bridges';
import { kkiapayEnabled, payWithKkiapay, verifyDeposit } from '../../shared/kkiapay';
import {
  acompteDe, deposeUneDemande, nouvelleDemande, pourquoiLaDemandeNeVaPas,
  type DemandeAcademie,
} from '../../shared/academie-demandes';
import { DEVISE_COMPLETE } from '../../shared/identite';
import { nombreEnChiffres } from '../../shared/lettres';
import { PARCOURS_MND, PUBLIC_LABEL, type ParcoursMND, type PublicDeFormation } from '../../shared/parcours';

/* ══ MND ACADÉMIE — LA VITRINE ════════════════════════════════════════
   « Il nous faut absolument un système marketing comme notre catalogue, ou
   un site, pour informer le monde entier que nous faisons des formations à
   MND Académie, et il faut réserver massivement » (Yéman, 17 septembre
   2026). Maquette `public/maquette-lacademie-au-monde.html`, validée avec
   ses quatre arbitrages : un site à part, une demande sans compte, les neuf
   parcours, WhatsApp et Google ensemble.

   PREMIÈRE ÉTAPE : LA VITRINE. Elle se publie seule et sert le soir même —
   on envoie le lien. L'entonnoir (la demande qui tombe dans le Suivi) vient
   ensuite, et remplacera le bouton d'ici-bas.

   ELLE NE RECOPIE RIEN. Les neuf parcours viennent de `shared/parcours`,
   la même semence que l'Académie du Trône : un prix corrigé là-bas se
   corrige ici. Une vitrine qui recopie finit par mentir sur un prix, et
   c'est le genre de mensonge qu'on découvre devant la cliente.

   AUCUNE DONNÉE PERSONNELLE, AUCUNE CLÉ, AUCUN DOMAINE. La page ne lit rien
   de la base : elle est faite d'une semence et de photos que la Maison
   possède déjà. Tant qu'il n'y a pas de formulaire, il n'y a rien à
   protéger. */

const PHOTOS = {
  ouverture: '/assets/photos/hero-poster.jpg',
  atelier: '/assets/photos/uniform-beige.jpg',
  fondateurs: '/assets/photos/founders-couple.jpg',
  debutante: '/assets/photos/model-microlocks.jpg',
  professionnelle: '/assets/photos/portrait-1.jpg',
} as const;

/** LES QUATRE TEMPS, la méthode de la Maison. Ils ne sont pas dans la
    semence des parcours : ils sont la colonne de tout ce qui s'y enseigne. */
const LES_QUATRE_TEMPS = [
  { nom: 'Purifier', dit: 'Laver sans agresser, ouvrir la mèche à ce qui vient après.' },
  { nom: 'Nourrir', dit: 'Rendre à la fibre ce que le temps lui prend, sans l’alourdir.' },
  { nom: 'Sceller', dit: 'Fermer l’écaille, tenir l’hydratation, protéger la racine.' },
  { nom: 'Couronner', dit: 'Poser la forme, et la tenir jusqu’à la prochaine séance.' },
];

const prixDit = (xof: number): string => `${nombreEnChiffres(xof)} F`;

/** LA DURÉE, COURTE, telle qu'on la lit sur une carte : les heures quand le
    parcours les compte, les semaines sinon. */
const dureeCourte = (p: ParcoursMND): string => {
  if (p.heures) return `${p.heures} heures`;
  if (p.semaines && p.seances) return `${p.semaines} semaines · ${p.seances} séances`;
  if (p.semaines) return `${p.semaines} semaines`;
  return p.duree;
};

/** Le rang, pour la couleur du filet : Fondation, Élévation, Souveraineté se
    lisent dans le niveau du parcours (I, II, III), comme partout ailleurs. */
const rangDuParcours = (p: ParcoursMND): 0 | 1 | 2 => {
  const m = p.niveau.toUpperCase().match(/\b(III|II|I)\b/);
  if (m) return m[1] === 'III' ? 2 : m[1] === 'II' ? 1 : 0;
  return 2;
};

type EtatDeLaDemande = '' | 'envoi' | 'recue' | 'paiement' | 'payee' | 'refus';

export default function App() {
  const [porte, setPorte] = useState<PublicDeFormation | 'tous'>('debutante');
  const [ouvert, setOuvert] = useState<string | null>(null);

  /* ══ RÉSERVER SA PLACE — 17 septembre 2026 ══════════════════
     « Brancher un paiement avec KkiaPay quand le client choisit de réserver
     un parcours » (Yéman).

     DEUX TEMPS, ET LE PREMIER SUFFIT. La demande part d'abord, sans compte
     et sans payer : elle tombe dans le Suivi de l'Académie, et la Maison
     rappelle. Le paiement de l'acompte vient ensuite, et c'est LUI qui tient
     la place. Une visiteuse qui renonce à payer reste une demande, pas une
     visite perdue.

     LA LIGNE EST ÉCRITE AVANT LE WIDGET : son acompte attendu est déjà en
     base, et c'est celui-là que le serveur relit pour contrôler ce qui a
     été payé. Le navigateur n'annonce jamais le prix qu'il veut. */
  const [cfg] = useStore(vitrineConfigStore);
  const branchId = (cfg.branchId ?? '').trim();
  const [nom, setNom] = useState('');
  const [tel, setTel] = useState('');
  const [ville, setVille] = useState('');
  const [mot, setMot] = useState('');
  const [choisi, setChoisi] = useState<string>(PARCOURS_MND[0].id);
  const [etat, setEtat] = useState<EtatDeLaDemande>('');
  const [dit, setDit] = useState('');
  const [deposee, setDeposee] = useState<DemandeAcademie | null>(null);

  const parcoursChoisi = PARCOURS_MND.find((p) => p.id === choisi) ?? PARCOURS_MND[0];
  const acompte = acompteDe(parcoursChoisi.prixXof);
  const peutPayer = kkiapayEnabled() && !!branchId;

  const reglerLAcompte = async (d: DemandeAcademie) => {
    setEtat('paiement');
    setDit('');
    try {
      const { transactionId } = await payWithKkiapay({
        amountXof: d.acompteXof,
        partnerId: d.id,
        branchId: d.branchId,
        phone: d.telephone,
        name: d.nom,
      });
      try {
        const v = await verifyDeposit({
          transactionId, apptId: '', inscriptionId: d.id,
          expectedXof: d.acompteXof, branchId: d.branchId,
        });
        setEtat(v.ok ? 'payee' : 'recue');
        if (!v.ok) setDit('Paiement reçu, vérification en cours. La Maison vous confirme.');
      } catch (e) {
        /* Le paiement a eu lieu ; seule la vérification a échoué. La demande
           reste, avec sa référence : on ne perd ni la place ni l'argent. */
        setEtat('recue');
        setDit(e instanceof Error ? e.message : 'Vérification impossible, la Maison vérifiera.');
      }
    } catch (e) {
      setEtat('recue');
      setDit(e instanceof Error ? e.message : 'Le paiement n’a pas abouti. Votre demande est enregistrée.');
    }
  };

  const envoyer = async (etPayer: boolean) => {
    if (etat === 'envoi' || etat === 'paiement') return;
    const refus = pourquoiLaDemandeNeVaPas({ nom, telephone: tel, parcoursId: choisi });
    if (refus) { setDit(refus); return; }
    setDit('');
    setEtat('envoi');
    const d = nouvelleDemande({
      id: `dem-${uid()}`,
      branchId,
      parcoursId: parcoursChoisi.id,
      parcoursTitre: parcoursChoisi.titre,
      nom, telephone: tel, ville,
      public: parcoursChoisi.public,
      mot,
      prixXof: parcoursChoisi.prixXof,
      quand: new Date().toISOString(),
    });
    const ok = await deposeUneDemande(d);
    if (!ok) {
      setEtat('refus');
      setDit('Votre demande n’a pas pu partir. Réessayez dans un moment.');
      return;
    }
    setDeposee(d);
    setEtat('recue');
    if (etPayer && peutPayer) await reglerLAcompte(d);
  };

  const parcours = useMemo(
    () => PARCOURS_MND.filter((p) => porte === 'tous' || p.public === porte),
    [porte],
  );
  const fiche = ouvert ? PARCOURS_MND.find((p) => p.id === ouvert) : undefined;

  const versLesParcours = () => document.getElementById('les-parcours')?.scrollIntoView({ behavior: 'smooth' });
  const versEcrire = () => document.getElementById('nous-ecrire')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="ac">
      <header className="ac-barre">
        <a className="ac-marque" href="#haut">
          <img src={asset('/assets/monograms/mono-indigo.png')} alt="" />
          <span>MND Académie<small>Académie du Lock · Cotonou</small></span>
        </a>
        <nav className="ac-nav">
          <button type="button" onClick={versLesParcours}>Les parcours</button>
          <button type="button" onClick={() => document.getElementById('la-methode')?.scrollIntoView({ behavior: 'smooth' })}>La méthode</button>
          <button type="button" onClick={() => document.getElementById('qui-enseigne')?.scrollIntoView({ behavior: 'smooth' })}>Qui enseigne</button>
        </nav>
        <button type="button" className="ac-btn ac-btn--plein" onClick={versEcrire}>Réserver ma place</button>
      </header>

      <main id="haut">
        {/* ── L'OUVERTURE ────────────────────────────────────────────── */}
        <section className="ac-ouverture">
          <div className="ac-ouverture__mot">
            <p className="ac-eyebrow">Maison MND · depuis Cotonou</p>
            <h1>Apprendre le lock selon la méthode des quatre temps.</h1>
            <p className="ac-chapeau">
              Purifier, Nourrir, Sceller, Couronner. Neuf parcours, du premier geste à la maîtrise,
              sur des têtes réelles, à l’atelier de Cotonou.
            </p>
            <div className="ac-gestes">
              <button type="button" className="ac-btn ac-btn--plein" onClick={versLesParcours}>Voir les neuf parcours</button>
              <button type="button" className="ac-btn" onClick={versEcrire}>Nous écrire</button>
            </div>
            <div className="ac-preuve">
              <div><b>9</b><span>parcours</span></div>
              <div><b>4</b><span>temps</span></div>
              <div><b>Certificat</b><span>au sceau MND</span></div>
            </div>
          </div>
          <figure className="ac-ouverture__image">
            <img src={asset(PHOTOS.ouverture)} alt="Une couronne de locks, de profil, sous le monogramme de la Maison MND." />
          </figure>
        </section>

        {/* ── DEUX PORTES ────────────────────────────────────────────── */}
        <section className="ac-portes">
          <h2>Deux portes, pas une.</h2>
          <p className="ac-intro">
            La débutante entre dans le métier. La professionnelle y est déjà, et ne refait pas le cursus.
          </p>
          <div className="ac-portes__grille">
            {(['debutante', 'professionnelle'] as PublicDeFormation[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`ac-porte ${porte === k ? 'is-choisie' : ''}`}
                onClick={() => { setPorte(k); versLesParcours(); }}
              >
                <img src={asset(k === 'debutante' ? PHOTOS.debutante : PHOTOS.professionnelle)} alt="" />
                <span className="ac-porte__mot">
                  <b>{PUBLIC_LABEL[k]}</b>
                  {k === 'debutante'
                    ? 'Vous entrez dans le métier. Trois paliers, de la Fondation à L’Œuvre.'
                    : 'Vous exercez déjà. Six parcours courts, dont la certification du Référentiel.'}
                  <i>{PARCOURS_MND.filter((p) => p.public === k).length} parcours</i>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── LES NEUF PARCOURS ──────────────────────────────────────── */}
        <section id="les-parcours" className="ac-parcours">
          <div className="ac-parcours__tete">
            <h2>Les parcours.</h2>
            <div className="ac-segs">
              {(['debutante', 'professionnelle', 'tous'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={porte === k ? 'is-on' : ''}
                  onClick={() => setPorte(k)}
                >
                  {k === 'tous' ? 'Tous' : PUBLIC_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="ac-grille">
            {parcours.map((p) => (
              <article key={p.id} className={`ac-carte ac-carte--${rangDuParcours(p)}`}>
                <span className="ac-carte__rang">{p.niveau}</span>
                <h3>{p.titre}</h3>
                <p>{p.accroche}</p>
                <div className="ac-carte__pied">
                  <span className="ac-carte__prix">{prixDit(p.prixXof)}</span>
                  <span className="ac-carte__duree">{dureeCourte(p)}</span>
                </div>
                <button type="button" className="ac-carte__lien" onClick={() => setOuvert(p.id)}>
                  Le programme
                </button>
              </article>
            ))}
          </div>
          <p className="ac-legende">
            Les prix s’entendent en francs CFA, acompte de 40 % à l’inscription. Une session s’ouvre quand
            le groupe est constitué.
          </p>
        </section>

        {/* ── LA MÉTHODE ─────────────────────────────────────────────── */}
        <section id="la-methode" className="ac-methode">
          <figure className="ac-methode__image">
            <img src={asset(PHOTOS.atelier)} alt="Une main de la Maison, en tenue de l’atelier, devant les flacons du laboratoire." />
          </figure>
          <div className="ac-methode__mot">
            <h2>La méthode des quatre temps.</h2>
            <p className="ac-intro">
              Elle tient tout ce qui s’enseigne ici. Chaque geste appris se range dans l’un des quatre,
              et rien ne se fait dans le désordre.
            </p>
            <ol className="ac-temps">
              {LES_QUATRE_TEMPS.map((t, i) => (
                <li key={t.nom}>
                  <span className="ac-temps__n">{String(i + 1).padStart(2, '0')}</span>
                  <span><b>{t.nom}</b>{t.dit}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── QUI ENSEIGNE ───────────────────────────────────────────── */}
        <section id="qui-enseigne" className="ac-fondateurs">
          <figure>
            <img src={asset(PHOTOS.fondateurs)} alt="Yéman et Brice Ahouansou, qui tiennent la Maison MND." />
          </figure>
          <div>
            <h2>Qui enseigne.</h2>
            <p className="ac-intro">
              Brice Ahouansou, maître loctician, et Yéman Ahouansou, qui tient la Maison. Ce qu’ils
              transmettent, ils le pratiquent tous les jours au fauteuil, à Cotonou.
            </p>
            <p className="ac-intro">
              À la sortie, un certificat au sceau MND, portant son numéro, vérifiable par la Maison.
            </p>
          </div>
        </section>

        {/* ── RÉSERVER SA PLACE ─────────────────────────────── */}
        <section id="nous-ecrire" className="ac-ecrire">
          <h2>Réserver sa place.</h2>
          {etat === 'payee' ? (
            <div className="ac-recu">
              <b>Votre place est tenue.</b>
              Nous avons reçu votre acompte pour {deposee?.parcoursTitre}. La Maison vous appelle pour
              la date de début et la suite du règlement.
            </div>
          ) : etat === 'recue' ? (
            <div className="ac-recu">
              <b>C’est noté, {deposee?.nom}.</b>
              La Maison vous rappelle au numéro donné. Votre place n’est pas encore tenue : elle le sera
              à l’acompte.
              {dit && <span className="ac-dit">{dit}</span>}
              {peutPayer && deposee && (
                <button type="button" className="ac-btn ac-btn--plein" style={{ marginTop: 14 }} onClick={() => void reglerLAcompte(deposee)}>
                  Payer l’acompte · {nombreEnChiffres(deposee.acompteXof)} F
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="ac-intro">
                Cinq lignes, et la Maison vous rappelle. Le nom et le téléphone suffisent.
              </p>
              <div className="ac-form">
                <label className="ac-champ">
                  <span>Votre nom</span>
                  <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" />
                </label>
                <div className="ac-form__deux">
                  <label className="ac-champ">
                    <span>Votre téléphone</span>
                    <input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" autoComplete="tel" />
                  </label>
                  <label className="ac-champ">
                    <span>Votre ville</span>
                    <input value={ville} onChange={(e) => setVille(e.target.value)} autoComplete="address-level2" />
                  </label>
                </div>
                <label className="ac-champ">
                  <span>Le parcours qui vous intéresse</span>
                  <select value={choisi} onChange={(e) => setChoisi(e.target.value)}>
                    {PARCOURS_MND.map((p) => (
                      <option key={p.id} value={p.id}>{p.titre} · {nombreEnChiffres(p.prixXof)} F</option>
                    ))}
                  </select>
                </label>
                <label className="ac-champ">
                  <span>Un mot, si vous voulez</span>
                  <textarea rows={3} value={mot} onChange={(e) => setMot(e.target.value)} />
                </label>

                <div className="ac-form__somme">
                  <span>Acompte pour tenir la place</span>
                  <b>{nombreEnChiffres(acompte)} F</b>
                </div>

                {dit && <div className="ac-dit">{dit}</div>}

                <div className="ac-form__gestes">
                  {peutPayer && (
                    <button type="button" className="ac-btn ac-btn--plein" disabled={etat === 'envoi' || etat === 'paiement'} onClick={() => void envoyer(true)}>
                      {etat === 'paiement' ? 'Paiement en cours…' : 'Réserver et payer l’acompte'}
                    </button>
                  )}
                  <button type="button" className="ac-btn" disabled={etat === 'envoi' || etat === 'paiement'} onClick={() => void envoyer(false)}>
                    {etat === 'envoi' ? 'Envoi…' : 'Envoyer ma demande'}
                  </button>
                </div>
              </div>
            </>
          )}
          <p className="ac-legende">
            Une place n’est tenue qu’à l’acompte, qui se déduit du prix. La Maison rappelle chaque demande.
          </p>
        </section>
      </main>

      <footer className="ac-pied">
        <span>Maison MND · Académie du Lock · Cotonou, Bénin</span>
        <span className="ac-devise">{DEVISE_COMPLETE}</span>
      </footer>

      {/* ── LA FICHE D'UN PARCOURS ───────────────────────────────────── */}
      {fiche && (
        <div className="ac-voile" role="dialog" aria-label={`Le parcours ${fiche.titre}`} onClick={() => setOuvert(null)}>
          <div className="ac-fiche" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ac-fiche__fermer" onClick={() => setOuvert(null)} aria-label="Fermer">×</button>
            <span className="ac-carte__rang">{fiche.niveau}</span>
            <h3>{fiche.titre}</h3>
            <p className="ac-fiche__accroche">{fiche.accroche}</p>

            <div className="ac-fiche__chiffres">
              <span><i>Prix</i><b>{prixDit(fiche.prixXof)}</b></span>
              <span><i>Durée</i><b>{dureeCourte(fiche)}</b></span>
              <span><i>Public</i><b>{PUBLIC_LABEL[fiche.public]}</b></span>
            </div>

            <div className="ac-lab">Pour qui</div>
            <p>{fiche.pourQui}</p>
            <div className="ac-lab">Pour entrer</div>
            <p>{fiche.pourEntrer}</p>

            <div className="ac-lab">Le programme</div>
            <div className="ac-modules">
              {fiche.programme.map((m) => (
                <div key={m.nom} className="ac-module">
                  <span className="ac-module__nom">{m.nom}</span>
                  <span className="ac-module__s">{m.seances} séance{m.seances > 1 ? 's' : ''}</span>
                  <span className="ac-module__quoi">{m.contenu}</span>
                </div>
              ))}
            </div>

            <div className="ac-lab">À la sortie</div>
            <ul className="ac-sait">
              {fiche.sait.map((s) => <li key={s}>{s}</li>)}
            </ul>

            <div className="ac-lab">Sur des têtes réelles</div>
            <p>{fiche.tetesReelles}</p>

            <button type="button" className="ac-btn ac-btn--plein ac-fiche__btn" onClick={() => { setOuvert(null); versEcrire(); }}>
              Réserver ma place
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
