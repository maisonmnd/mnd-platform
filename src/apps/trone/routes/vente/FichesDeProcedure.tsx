import { useMemo, useState } from 'react';
import { Button, Input, Modal, Segs, Textarea, toast, demande } from '../../../../ds/components';
import { estArchivee, useCategories, useServices, type CatalogCategory, type Service } from '../../../../shared/catalog';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { uid } from '../../../../shared/store';
import { enregistreLeBrouillon, useFichesDeProcedure } from '../../../../shared/fiches-de-procedure';
import {
  MOT_DE_L_ETAT_DE_LA_FICHE, MOT_DE_L_ORIGINE, RUBRIQUES, contenuSur, copieDuContenu, etatDeLaFiche, ficheDeLaPrestation,
  ficheDepuisLeCatalogue, nomSansLongueur, pointsAValider, rubriquesVides,
  type ContenuDeFiche, type EtatDeLaFiche, type FicheDeProcedure, type LigneDeFiche, type RubriqueId,
} from '../../../../shared/fiches-de-procedure-pur';
import { useEstDirection } from '../_vie';
import { FicheLue, demandeEtValide, signatureDite } from './FicheDeProcedure';
import './fiches-de-procedure.css';

/* ══ LES FICHES DE PROCÉDURE, AU CATALOGUE — 25 novembre 2026 ════════════
   « Crée une fiche de procédure par soin du catalogue… Utilise le même
   format pour chaque fiche » (Yéman).

   À GAUCHE, CHAQUE SOIN DU CATALOGUE, rangé par atelier, avec l'état de sa
   fiche : à écrire, brouillon, validée. À DROITE, la fiche du soin choisi,
   toujours en sept rubriques.

   UN SOIN SANS FICHE EN A QUAND MÊME UNE : celle que le catalogue permet
   d'écrire (sa description, sa fiche technique, ce qu'il comprend), chaque
   ligne reprise signalée « à relire », chaque rubrique muette dite « à
   écrire ». Elle n'existe qu'à l'écran tant qu'on ne l'a pas enregistrée.

   LA DIRECTION ÉCRIT ET VALIDE ; LE RESTE DE L'ÉQUIPE LIT LES VERSIONS
   VALIDÉES, rien d'autre. La base refuse l'écriture aux autres (0244). */

type Filtre = 'toutes' | EtatDeLaFiche;

/** Les soins qui portent une fiche : ce qui se rend au fauteuil. Ni les
    prestations archivées, ni les ateliers fermés, ni les formations de
    l'Académie (un cursus n'est pas un soin). */
const soinsDuCatalogue = (services: readonly Service[], cats: readonly CatalogCategory[]): { cat: CatalogCategory; soins: Service[] }[] =>
  [...cats]
    .filter((c) => c.enabled && !c.produits && !c.id.startsWith('aca-'))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((cat) => ({
      cat,
      soins: services
        .filter((s) => s.categoryId === cat.id && !estArchivee(s))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    }))
    .filter((g) => g.soins.length > 0);

export function FichesDeProcedureModal({ onClose, serviceId }: { onClose: () => void; serviceId?: string }) {
  const direction = useEstDirection();
  const moi = useMaTete();
  const [services] = useServices();
  const [cats] = useCategories();
  const fiches = useFichesDeProcedure();
  const groupes = useMemo(() => soinsDuCatalogue(services, cats), [services, cats]);
  const nomDe = useMemo(() => {
    const m = new Map(services.map((s) => [s.id, s.name]));
    return (id: string) => m.get(id);
  }, [services]);

  const [choisi, setChoisi] = useState<string>(serviceId ?? '');
  const [cherche, setCherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  /* Le brouillon en cours de frappe a-t-il bougé ? L'éditeur le dit, la
     liste demande avant de le quitter. */
  const [sale, setSale] = useState(false);

  const etatDe = (sv: Service): EtatDeLaFiche => etatDeLaFiche(ficheDeLaPrestation(fiches, sv));
  const visibles = groupes
    .map((g) => ({
      ...g,
      soins: g.soins.filter((sv) => {
        const etat = etatDe(sv);
        /* L'ÉQUIPE NE VOIT QUE CE QUI EST VALIDÉ : ni brouillon, ni fiche à écrire. */
        if (!direction && etat !== 'validee' && etat !== 'validee-et-brouillon') return false;
        if (filtre !== 'toutes' && etat !== filtre && !(filtre === 'validee' && etat === 'validee-et-brouillon')) return false;
        const q = cherche.trim().toLowerCase();
        return !q || `${sv.name} ${sv.code ?? ''}`.toLowerCase().includes(q);
      }),
    }))
    .filter((g) => g.soins.length > 0);

  const tous = groupes.flatMap((g) => g.soins);
  const compte = (e: EtatDeLaFiche[]) => tous.filter((sv) => e.includes(etatDe(sv))).length;
  const soin = tous.find((sv) => sv.id === choisi);

  const choisis = async (id: string) => {
    if (id === choisi) return;
    if (sale && !await demande({
      quoi: 'Brouillon non enregistré',
      titre: 'Quitter cette fiche sans l’enregistrer ?',
      dit: 'Ce que vous venez d’écrire sur cette fiche sera perdu.',
      accepter: 'Quitter sans enregistrer',
      refuser: 'Rester sur la fiche',
      dur: true,
    })) return;
    setSale(false);
    setChoisi(id);
  };

  const ferme = async () => {
    if (sale && !await demande({
      quoi: 'Brouillon non enregistré',
      titre: 'Fermer sans enregistrer le brouillon ?',
      dit: 'Ce que vous venez d’écrire sur cette fiche sera perdu.',
      accepter: 'Fermer sans enregistrer',
      refuser: 'Rester sur la fiche',
      dur: true,
    })) return;
    onClose();
  };

  return (
    <Modal title="Les fiches de procédure." onClose={() => { void ferme(); }} width={1180}>
      <div className="tfp-atelier">
        <aside className="tfp-liste" aria-label="Les soins du catalogue">
          <Input
            value={cherche}
            onChange={(e) => setCherche(e.target.value)}
            placeholder="Chercher un soin…"
            aria-label="Chercher un soin"
          />
          {direction && (
            <div className="tfp-filtres">
              {([
                ['toutes', `Toutes · ${tous.length}`],
                ['validee', `Validées · ${compte(['validee', 'validee-et-brouillon'])}`],
                ['brouillon', `Brouillons · ${compte(['brouillon'])}`],
                ['a-ecrire', `À écrire · ${compte(['a-ecrire'])}`],
              ] as [Filtre, string][]).map(([k, mot]) => (
                <button key={k} type="button" className={`tre-chip ${filtre === k ? 'is-on' : ''}`} onClick={() => setFiltre(k)}>{mot}</button>
              ))}
            </div>
          )}
          <div className="tfp-liste__corps">
            {visibles.length === 0 && (
              <p className="tfp-rubrique__vide">
                {direction ? 'Aucun soin ne répond à cette recherche.' : 'Aucune fiche n’est encore validée par la direction.'}
              </p>
            )}
            {visibles.map((g) => (
              <div key={g.cat.id} className="tfp-groupe">
                <span className="tfp-groupe__nom">{g.cat.fon}</span>
                {g.soins.map((sv) => {
                  const etat = etatDe(sv);
                  return (
                    <button
                      key={sv.id}
                      type="button"
                      className={`tfp-soin ${sv.id === choisi ? 'actif' : ''}`}
                      onClick={() => { void choisis(sv.id); }}
                    >
                      <span className="tfp-soin__nom">{nomSansLongueur(sv.name)}</span>
                      <span className={`tfp-etat tfp-etat--${etat}`}>{MOT_DE_L_ETAT_DE_LA_FICHE[etat]}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        <div className="tfp-page">
          {!soin ? (
            <div className="tfp-accueil">
              <h3 className="tfp-entete__titre">Une fiche par soin, le même format pour toutes.</h3>
              <p>
                {RUBRIQUES.map((r) => r.titre).join(' · ')}.
              </p>
              <p>
                {direction
                  ? 'Choisissez un soin à gauche. Sa fiche s’ouvre remplie de ce que le catalogue dit déjà ; le reste est signalé « à écrire ». L’équipe ne lit une fiche qu’une fois validée, depuis le rendez-vous, par « Voir le protocole ».'
                  : 'Choisissez un soin à gauche pour lire sa fiche validée. Dans un rendez-vous, « Voir le protocole » ouvre la même fiche.'}
              </p>
            </div>
          ) : direction ? (
            <EditeurDeLaFiche
              key={soin.id}
              soin={soin}
              enregistree={ficheDeLaPrestation(fiches, soin)}
              depart={ficheDepuisLeCatalogue(soin, nomDe)}
              par={moi?.name ?? ''}
              onSale={setSale}
            />
          ) : (
            <LectureSeule soin={soin} fiche={ficheDeLaPrestation(fiches, soin)} />
          )}
        </div>
      </div>
    </Modal>
  );
}

function LectureSeule({ soin, fiche }: { soin: Service; fiche: FicheDeProcedure | undefined }) {
  if (!fiche?.validee) return <p className="tfp-rubrique__vide">La fiche de ce soin n’est pas encore validée par la direction.</p>;
  return (
    <>
      <header className="tfp-entete">
        <h3 className="tfp-entete__titre">{fiche.titre || nomSansLongueur(soin.name)}</h3>
        <p className="tfp-entete__lien">{`Prestation : ${soin.name}`}</p>
        <p className="tfp-entete__version">{signatureDite(fiche.validee)}</p>
      </header>
      <FicheLue contenu={fiche.validee.contenu} />
    </>
  );
}

type Vue = 'corriger' | 'brouillon' | 'validee';

function EditeurDeLaFiche({ soin, enregistree, depart, par, onSale }: {
  soin: Service;
  /** La fiche du document, si elle existe. */
  enregistree: FicheDeProcedure | undefined;
  /** Celle que le catalogue permet d'écrire, pour un soin qui n'en a pas. */
  depart: FicheDeProcedure;
  par: string;
  onSale: (sale: boolean) => void;
}) {
  const base = enregistree ?? depart;
  const [titre, setTitre] = useState(base.titre);
  const [contenu, setContenu] = useState<ContenuDeFiche>(() => copieDuContenu(base.brouillon));
  const [vue, setVue] = useState<Vue>('corriger');
  const [bouge, setBouge] = useState(false);

  const touche = (suite: ContenuDeFiche) => { setContenu(suite); setBouge(true); onSale(true); };
  const majLigne = (r: RubriqueId, id: string, patch: Partial<LigneDeFiche>) =>
    touche({ ...contenu, [r]: contenu[r].map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const retire = (r: RubriqueId, id: string) => touche({ ...contenu, [r]: contenu[r].filter((l) => l.id !== id) });
  /* Une ligne ajoutée ici est une décision de la Maison : elle le porte. */
  const ajoute = (r: RubriqueId) => touche({ ...contenu, [r]: [...contenu[r], { id: `l-${uid()}`, texte: '', source: 'maison' }] });
  const monte = (r: RubriqueId, i: number) => {
    if (i <= 0) return;
    const l = [...contenu[r]];
    [l[i - 1], l[i]] = [l[i], l[i - 1]];
    touche({ ...contenu, [r]: l });
  };

  const points = pointsAValider(contenu);
  const vides = rubriquesVides(contenu);

  const enregistre = (): boolean => {
    if (!titre.trim()) { toast('Une fiche sans titre ne se retrouve pas.'); return false; }
    enregistreLeBrouillon(base, contenuSur(contenu), titre, par);
    setBouge(false);
    onSale(false);
    return true;
  };

  const valide = async () => {
    /* ON VALIDE CE QU'ON LIT : le brouillon s'enregistre d'abord, la version
       validée est sa copie exacte. */
    if (!enregistre()) return;
    await demandeEtValide({
      serviceId: base.serviceId,
      titre: titre.trim(),
      points: points.length,
      par,
      numero: (enregistree?.validee?.numero ?? 0) + 1,
    });
  };

  const jamaisEnregistree = !enregistree;
  const memeQueValidee = !!enregistree?.validee && !bouge
    && JSON.stringify(contenuSur(contenu)) === JSON.stringify(contenuSur(enregistree.validee.contenu));

  return (
    <div className="tfp-editeur">
      <header className="tfp-entete">
        <Input
          value={titre}
          onChange={(e) => { setTitre(e.target.value); setBouge(true); onSale(true); }}
          aria-label="Titre de la fiche"
          className="mnd-input tfp-entete__champ"
        />
        <p className="tfp-entete__lien">
          {`Reliée à la prestation : ${soin.name}`}
          {soin.code ? ` · ${soin.code}` : ''}
        </p>
        <p className="tfp-entete__version">
          {enregistree?.validee
            ? `${signatureDite(enregistree.validee)}. C’est elle que lit l’équipe.`
            : jamaisEnregistree
              ? 'Fiche à écrire : remplie de ce que le catalogue dit déjà, pas encore enregistrée.'
              : 'Brouillon : l’équipe ne le voit pas encore.'}
        </p>
        <div className="tfp-entete__vues">
          <Segs<Vue>
            value={vue}
            onChange={setVue}
            options={[
              { value: 'corriger', label: 'Corriger' },
              { value: 'brouillon', label: 'Lire le brouillon' },
              ...(enregistree?.validee ? [{ value: 'validee' as Vue, label: `Lire la version ${enregistree.validee.numero}` }] : []),
            ]}
          />
          <span className="tfp-compte">
            {points.length > 0 ? `${points.length} point${points.length > 1 ? 's' : ''} à valider` : 'Aucun point à valider'}
            {vides.length > 0 ? ` · ${vides.length} rubrique${vides.length > 1 ? 's' : ''} vide${vides.length > 1 ? 's' : ''}` : ''}
          </span>
        </div>
      </header>

      {vue === 'validee' && enregistree?.validee ? (
        <FicheLue contenu={enregistree.validee.contenu} />
      ) : vue === 'brouillon' ? (
        <FicheLue contenu={contenuSur(contenu)} />
      ) : (
        <div className="tfp-fiche">
          {RUBRIQUES.map((r) => (
            <section key={r.id} className="tfp-rubrique" aria-label={r.titre}>
              <h4 className="tfp-rubrique__titre">{r.titre}<small>{r.aide}</small></h4>
              {contenu[r.id].map((l, i) => (
                <div key={l.id} className={`tfp-saisie ${l.aValider !== undefined ? 'est-a-valider' : ''}`}>
                  <div className="tfp-saisie__rang">
                    <Textarea
                      value={l.texte}
                      rows={2}
                      onChange={(e) => majLigne(r.id, l.id, { texte: e.target.value })}
                      placeholder={r.id === 'etapes' ? `Étape ${i + 1}` : 'Une idée par ligne'}
                      aria-label={`${r.titre}, ligne ${i + 1}`}
                    />
                    {r.detail && (
                      <Input
                        value={l.detail ?? ''}
                        onChange={(e) => majLigne(r.id, l.id, { detail: e.target.value || undefined })}
                        placeholder={r.detail}
                        aria-label={`${r.detail}, ligne ${i + 1}`}
                        className="mnd-input tfp-saisie__detail"
                      />
                    )}
                  </div>
                  {l.aValider !== undefined && (
                    <Textarea
                      value={l.aValider}
                      rows={2}
                      onChange={(e) => majLigne(r.id, l.id, { aValider: e.target.value })}
                      placeholder="Ce qui reste à valider, en toutes lettres"
                      aria-label={`À valider, ${r.titre}, ligne ${i + 1}`}
                      className="mnd-textarea tfp-saisie__avalider"
                    />
                  )}
                  <div className="tfp-saisie__gestes">
                    <button
                      type="button"
                      className={`tre-chip ${l.aValider !== undefined ? 'is-on' : ''}`}
                      onClick={() => majLigne(r.id, l.id, { aValider: l.aValider !== undefined ? undefined : '' })}
                    >
                      {l.aValider !== undefined ? 'à valider' : 'signaler à valider'}
                    </button>
                    {i > 0 && <button type="button" className="tfp-lien" onClick={() => monte(r.id, i)}>Monter</button>}
                    <button type="button" className="tfp-lien" onClick={() => retire(r.id, l.id)}>Retirer</button>
                    {/* D'OÙ VIENT LA LIGNE : le catalogue, le Laboratoire, la Maison,
                        une notice ou la pratique relevée par une recherche. */}
                    {l.source && <span className="tfp-origine" title={l.ref}>{MOT_DE_L_ORIGINE[l.source]}</span>}
                  </div>
                </div>
              ))}
              <button type="button" className="tfp-ajoute" onClick={() => ajoute(r.id)}>+ Une ligne</button>
            </section>
          ))}
        </div>
      )}

      <div className="tfp-pied tfp-pied--colle">
        <span className="tfp-compte">
          {bouge ? 'Brouillon modifié, pas encore enregistré.'
            : memeQueValidee ? 'Le brouillon est identique à la version validée.'
              : jamaisEnregistree ? 'Pas encore enregistrée.' : 'Brouillon enregistré.'}
        </span>
        <Button variant="ghost" style={{ flex: 'none' }} onClick={() => { if (enregistre()) toast('Brouillon enregistré. L’équipe ne le voit pas tant qu’il n’est pas validé.'); }} disabled={!bouge && !jamaisEnregistree}>
          Enregistrer le brouillon
        </Button>
        <Button variant="copper" style={{ flex: 'none' }} onClick={() => { void valide(); }} disabled={memeQueValidee}>
          Valider cette version
        </Button>
      </div>
    </div>
  );
}
