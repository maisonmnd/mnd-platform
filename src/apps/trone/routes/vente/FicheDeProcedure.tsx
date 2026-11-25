import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Modal, toast, demande } from '../../../../ds/components';
import type { Service } from '../../../../shared/catalog';
import { useStaff as useMaTete } from '../../../../shared/auth';
import { jourAn, momentDuSalon } from '../../../../shared/calendrier';
import { useFichesDeProcedure, valideLaFicheEnregistree } from '../../../../shared/fiches-de-procedure';
import {
  RUBRIQUES, ceQueDitLeBouton, fichesDuRendezVous, nomSansLongueur, pointsAValider, signatureDeLaVersion,
  type ContenuDeFiche, type FicheDuRendezVous, type VersionValidee,
} from '../../../../shared/fiches-de-procedure-pur';
import { useEstDirection } from '../_vie';
import './fiches-de-procedure.css';

/* ══ LA FICHE DE PROCÉDURE, À LIRE — 25 novembre 2026 ════════════════════
   « L'équipe doit pouvoir consulter la version validée sans quitter le
   rendez-vous » (Yéman). Trois pièces :

   · `FicheLue` : les sept rubriques, dans l'ordre, les lignes « à valider »
     signalées. La même au rendez-vous et au Catalogue.
   · `ProtocoleDuRendezVous` : la fenêtre posée PAR-DESSUS le rendez-vous
     (portail), une fiche par prestation. La fermer ramène au rendez-vous, la
     saisie intacte : rien n'est enregistré, rien n'est quitté.
   · `VoirLeProtocole` : le bouton. Il ne paraît que s'il y a quelque chose à
     lire : pour l'équipe, une version validée ; pour la direction, aussi un
     brouillon, qu'elle peut valider d'ici. */

/** Le jour d'un instant, à l'heure du salon : « 25 nov. 2026 ». */
export const jourDeLInstant = (iso: string): string => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? jourAn(momentDuSalon(ms).jour) : '—';
};

export const signatureDite = (v: VersionValidee): string => signatureDeLaVersion(v, jourDeLInstant);

const dureeDite = (min: number | undefined): string => {
  const m = Math.round(min ?? 0);
  if (m <= 0) return '';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h === 0 ? `${m} min` : r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`;
};

/** LES SEPT RUBRIQUES. Une rubrique vide se dit : l'équipe ne doit pas croire
    qu'il n'y a « rien à vérifier » là où rien n'a encore été écrit. */
export function FicheLue({ contenu }: { contenu: ContenuDeFiche }) {
  return (
    <div className="tfp-fiche">
      {RUBRIQUES.map((r) => {
        const lignes = (contenu[r.id] ?? []).filter((l) => l.texte.trim() || l.aValider || l.detail);
        const Liste = r.id === 'etapes' ? 'ol' : 'ul';
        return (
          <section key={r.id} className="tfp-rubrique" aria-label={r.titre}>
            <h4 className="tfp-rubrique__titre">{r.titre}</h4>
            {lignes.length === 0 ? (
              <p className="tfp-rubrique__vide">Rien n’est encore écrit pour cette rubrique.</p>
            ) : (
              <Liste className={`tfp-lignes ${r.id === 'etapes' ? 'tfp-lignes--etapes' : ''}`}>
                {lignes.map((l) => (
                  <li key={l.id} className={`tfp-ligne ${l.aValider ? 'est-a-valider' : ''}`}>
                    <div className="tfp-ligne__tete">
                      <span className="tfp-ligne__texte">{l.texte}</span>
                      {l.detail && r.detail && (
                        <span className="tfp-ligne__detail"><small>{r.detail}</small>{l.detail}</span>
                      )}
                    </div>
                    {l.aValider && (
                      <p className="tfp-avalider"><b>À valider</b>{l.aValider}</p>
                    )}
                  </li>
                ))}
              </Liste>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** L'en-tête d'une fiche lue : son titre, sa version, ce que dit le catalogue
    de la prestation, et combien de points restent à valider. */
function EnTeteDeLaFiche({ lue, direction, onValider }: {
  lue: FicheDuRendezVous;
  direction: boolean;
  onValider: () => void;
}) {
  const points = pointsAValider(lue.contenu).length;
  const auCatalogue = [dureeDite(lue.service.durationMin), (lue.service as Service).palier].filter(Boolean).join(' · ');
  return (
    <header className="tfp-entete">
      <h3 className="tfp-entete__titre">{lue.fiche.titre || nomSansLongueur(lue.service.name)}</h3>
      <p className="tfp-entete__lien">
        {`Prestation : ${lue.service.name}`}
        {auCatalogue ? ` · au catalogue : ${auCatalogue}` : ''}
        {lue.viaLeForfait ? ` · comprise dans ${lue.viaLeForfait}` : ''}
      </p>
      {lue.version === 'validee' && lue.fiche.validee ? (
        <p className="tfp-entete__version">{signatureDite(lue.fiche.validee)}</p>
      ) : (
        <div className="tfp-bandeau tfp-bandeau--brouillon" role="note">
          <span>
            <b>Brouillon : l’équipe ne le voit pas encore.</b>
            {' '}Seule la direction le lit. Il se corrige au Catalogue, « Les fiches de procédure ».
          </span>
          {direction && <Button variant="copper" size="sm" style={{ flex: 'none' }} onClick={onValider}>Valider cette version</Button>}
        </div>
      )}
      {points > 0 && (
        <div className="tfp-bandeau" role="note">
          <span>
            <b>{points} point{points > 1 ? 's' : ''} à valider.</b>
            {' '}Chacun est signalé dans la fiche. Ce qui n’est pas validé ne se devine pas : suivre ce que la ligne indique.
          </span>
        </div>
      )}
    </header>
  );
}

/** VALIDER, après avoir dit ce que cela change. */
export async function demandeEtValide(o: { serviceId: string; titre: string; points: number; par: string; numero: number }): Promise<boolean> {
  if (!await demande({
    quoi: 'Fiche de procédure',
    titre: `Valider la fiche « ${o.titre} » ?`,
    dit: `Elle devient la version ${o.numero} : c’est elle que l’équipe lira dans ses rendez-vous, sous votre nom.`,
    suite: o.points > 0
      ? `${o.points} point${o.points > 1 ? 's' : ''} rest${o.points > 1 ? 'ent' : 'e'} « à valider » : ${o.points > 1 ? 'ils resteront signalés' : 'il restera signalé'} dans la fiche.`
      : undefined,
    accepter: 'Valider cette version',
    refuser: 'Pas encore',
  })) return false;
  const refus = valideLaFicheEnregistree(o.serviceId, o.par);
  if (refus) { toast(refus); return false; }
  toast(`Fiche validée, version ${o.numero}. L’équipe la lit dès maintenant dans ses rendez-vous.`);
  return true;
}

export function ProtocoleDuRendezVous({ lues, onClose }: { lues: FicheDuRendezVous[]; onClose: () => void }) {
  const direction = useEstDirection();
  const moi = useMaTete();
  const [ouverte, setOuverte] = useState(lues[0]?.fiche.serviceId ?? '');
  const lue = lues.find((l) => l.fiche.serviceId === ouverte) ?? lues[0];
  if (!lue) return null;
  return (
    <Modal title="Le protocole." onClose={onClose} width={860}>
      {lues.length > 1 && (
        <div className="tfp-onglets" role="tablist">
          {lues.map((l) => (
            <button
              key={l.fiche.serviceId}
              type="button" role="tab" aria-selected={l.fiche.serviceId === lue.fiche.serviceId}
              className={`tfp-onglet ${l.fiche.serviceId === lue.fiche.serviceId ? 'actif' : ''}`}
              onClick={() => setOuverte(l.fiche.serviceId)}
            >
              {nomSansLongueur(l.service.name).split(' · ')[0]}
              {l.version === 'brouillon' ? ' · brouillon' : ''}
            </button>
          ))}
        </div>
      )}
      <EnTeteDeLaFiche
        lue={lue}
        direction={direction}
        onValider={() => {
          void demandeEtValide({
            serviceId: lue.fiche.serviceId,
            titre: lue.fiche.titre || lue.service.name,
            points: pointsAValider(lue.contenu).length,
            par: moi?.name ?? '',
            numero: (lue.fiche.validee?.numero ?? 0) + 1,
          });
        }}
      />
      <FicheLue contenu={lue.contenu} />
      <div className="tfp-pied">
        <Button variant="ghost" style={{ flex: 'none' }} onClick={onClose}>Revenir au rendez-vous</Button>
      </div>
    </Modal>
  );
}

/** LE BOUTON DU RENDEZ-VOUS. Il porte sa fenêtre : l'écran qui le pose n'a
    rien d'autre à câbler que les prestations du rendez-vous. */
export function VoirLeProtocole({ serviceIds, byId }: {
  serviceIds: readonly string[];
  byId: Map<string, Service>;
}) {
  const fiches = useFichesDeProcedure();
  const direction = useEstDirection();
  const [ouvert, setOuvert] = useState(false);
  const cle = serviceIds.join('|');
  const lues = useMemo(
    () => fichesDuRendezVous(serviceIds, byId, fiches, direction),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cle, byId, fiches, direction],
  );
  if (lues.length === 0) return null;
  return (
    <>
      <button type="button" className="tfp-voir" onClick={() => setOuvert(true)}>
        <b>Voir le protocole</b>
        <small>{ceQueDitLeBouton(lues)}</small>
      </button>
      {/* PAR-DESSUS LE RENDEZ-VOUS, hors de sa fenêtre (portail) : il s'étend
          sur tout l'écran, et le fermer ramène au rendez-vous tel qu'il était. */}
      {ouvert && typeof document !== 'undefined' && createPortal(
        <ProtocoleDuRendezVous lues={lues} onClose={() => setOuvert(false)} />,
        document.body,
      )}
    </>
  );
}
