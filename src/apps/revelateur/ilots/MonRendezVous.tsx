import { useEffect, useState } from 'react';
import { COMMUN } from '../contenu';
import { client, lienWhatsApp, maison } from '../maison';
import { jourDit } from '../agenda';
import { mesure } from '../mesure';
import { ficheAgendaICS, motPourAnnuler, motPourDeplacer, referenceDuRendezVous } from '../../../shared/lien-du-rdv-pur';
import { gesteDitEnFrancaisWa, nomEnFrancaisWa } from '../../../shared/gestes-en-francais';
import {
  DELAI_DU_CHARGEUR_MS, dureeDite, heureDite, jetonDeLAdresse, lectureDuRdv, nomDuFichierAgenda,
  type LectureDuRdv, type RendezVousLu,
} from '../reservation-du-site-pure';
import { Chargeur, RepliDuChargement } from './Chargeur';

/* LA PAGE DU RENDEZ-VOUS — 3 novembre 2026. « Add a "Déplacer/Annuler"
   WhatsApp link to the confirmation message » et « an .ics calendar link »
   (Yéman). Les deux boutons du modèle `confirmation_rdv_liens` mènent ici,
   avec le jeton signé du rendez-vous (`?v=`) :
   · /rdv/?v= : le rendez-vous en clair, puis Déplacer et Annuler (deux mots
     écrits à la Maison sur WhatsApp, la référence dedans ; la réception les
     comprend) et Ajouter à mon agenda ;
   · /rdv/agenda/?v= (`genre="agenda"`) : la même lecture, puis le fichier
     .ics se télécharge tout seul, et un bouton le reprend si le téléphone
     l'a retenu.
   La fonction juge le jeton (`{ rdv: 'lire', v }`) ; la page ne le montre
   jamais. Un rendez-vous passé ou annulé se dit sans les boutons ; un lien
   faux ou passé, par une phrase calme et le WhatsApp de la Maison. Les deux
   pages sont hors des moteurs (contenu.ts). */

const LIEU = `${COMMUN.nom}, ${COMMUN.editeur.adresseComplete}`;
const quandDuRdv = (r: RendezVousLu): string => `${jourDit(r.date)} à ${heureDite(r.heure)}`;
const fichierDuRdv = (r: RendezVousLu, apptId: string): string => ficheAgendaICS({
  apptId, date: r.date, heure: r.heure, dureeMin: r.dureeMin || 60,
  titre: `Maison MND · ${r.gestes.map((n) => nomEnFrancaisWa(n).francais).join(', ') || 'votre venue'}`,
  note: `${r.reference ? `Réf. ${r.reference}. ` : ''}Pour déplacer ou annuler, un mot sur WhatsApp suffit.`,
  lieu: LIEU,
});

/** Télécharger le .ics : un blob, un lien, un clic. `false` si le navigateur
    a refusé ; le bouton reste alors pour le reprendre. */
function telecharge(ics: string, nom: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
  } catch {
    return false;
  }
}

export default function MonRendezVous({ genre }: { genre?: string }) {
  const agendaSeul = genre === 'agenda';
  const [jeton] = useState(() => jetonDeLAdresse(typeof location === 'undefined' ? '' : location.search));
  const [lu, setLu] = useState<LectureDuRdv | null>(null);
  const [lent, setLent] = useState(false);
  const [essai, setEssai] = useState(0);
  const [whatsapp, setWhatsapp] = useState(COMMUN.editeur.telephone.replace(/\D/g, ''));
  const [telecharge1, setTelecharge1] = useState(false);

  useEffect(() => {
    let vivant = true;
    void maison().then((m) => { if (vivant && m?.whatsapp) setWhatsapp(m.whatsapp); }).catch(() => { /* le numéro du registre */ });
    return () => { vivant = false; };
  }, []);

  useEffect(() => {
    if (!jeton) { setLu({ etat: 'lien' }); return; }
    let vivant = true;
    setLu(null);
    setLent(false);
    const minuterie = setTimeout(() => { if (vivant) setLent(true); }, DELAI_DU_CHARGEUR_MS);
    void (async () => {
      try {
        const supabase = await client();
        if (!supabase) { if (vivant) setLu({ etat: 'panne' }); return; }
        const { data, error } = await supabase.functions.invoke('demande-submit', { body: { rdv: 'lire', v: jeton } });
        if (!vivant) return;
        const statut = (error as { context?: { status?: number } } | null)?.context?.status;
        setLu(error ? lectureDuRdv({ error: statut === 429 ? 'rate_limited' : 'panne' }, statut) : lectureDuRdv(data));
      } catch {
        if (vivant) setLu({ etat: 'panne' });
      } finally {
        clearTimeout(minuterie);
      }
    })();
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [jeton, essai]);

  /* /rdv/agenda/ : le fichier part de lui-même, une fois, pour un rendez-vous à venir. */
  const apptId = jeton.split('.')[0] ?? '';
  useEffect(() => {
    if (!agendaSeul || telecharge1 || !lu || lu.etat !== 'pret' || lu.rdv.statut !== 'a-venir') return;
    setTelecharge1(true);
    telecharge(fichierDuRdv(lu.rdv, apptId), nomDuFichierAgenda(lu.rdv.date));
  }, [agendaSeul, telecharge1, lu, apptId]);

  const waMaison = lienWhatsApp(whatsapp, 'Bonjour MND, je voudrais parler de mon rendez-vous.');
  const reessayer = () => setEssai((n) => n + 1);

  if (!lu) {
    return (
      <div className="rdv-page">
        {lent ? <RepliDuChargement phrase="Votre rendez-vous ne se charge pas." wa={waMaison} surReessayer={reessayer} /> : <Chargeur texte="Votre rendez-vous se charge." />}
      </div>
    );
  }
  if (lu.etat === 'panne' || lu.etat === 'trop') {
    return (
      <div className="rdv-page">
        <RepliDuChargement phrase={lu.etat === 'trop' ? 'Beaucoup de demandes d’un coup.' : 'Votre rendez-vous ne se charge pas.'} wa={waMaison} surReessayer={reessayer} />
      </div>
    );
  }
  if (lu.etat === 'lien') {
    return (
      <div className="rdv-page">
        <p className="sur">Votre rendez-vous</p>
        <h2>Ce lien ne vaut plus.</h2>
        <p className="corps">Il a peut-être servi pour un rendez-vous passé, ou il a été coupé en chemin. Écrivez à la Maison : elle retrouve votre rendez-vous avec votre prénom.</p>
        <p className="rangee"><a className="btn btn--plein" href={waMaison} target="_blank" rel="noopener">Écrire à la Maison sur WhatsApp</a></p>
      </div>
    );
  }

  /* La référence manque d'une ancienne fonction : la même règle la calcule
     d'après l'identifiant que porte le jeton. */
  const r = { ...lu.rdv, reference: lu.rdv.reference || (apptId ? referenceDuRendezVous(apptId) : '') };
  const quand = quandDuRdv(r);
  const aVenir = r.statut === 'a-venir';
  const ics = fichierDuRdv(r, apptId);
  return (
    <div className="rdv-page">
      <p className="sur">{aVenir ? 'Votre rendez-vous' : r.statut === 'annule' ? 'Rendez-vous annulé' : 'Rendez-vous passé'}</p>
      <h2>{aVenir
        ? (r.appel ? `${r.appel}, la Maison vous attend.` : 'La Maison vous attend.')
        : r.statut === 'annule' ? 'Ce rendez-vous est annulé.' : 'Ce rendez-vous a eu lieu.'}</h2>
      <p className="merci__place">{jourDit(r.date)}, à {heureDite(r.heure)}.</p>
      {(r.gestes.length > 0 || r.dureeMin > 0) && (
        <p className="merci__resume">{[r.gestes.map(gesteDitEnFrancaisWa).join(', '), dureeDite(r.dureeMin)].filter(Boolean).join(' · ')}</p>
      )}
      {r.reference && (
        <p className="merci__reference">
          <span>Votre référence</span>
          <b>{r.reference}</b>
          <small>À garder pour tout échange avec la Maison.</small>
        </p>
      )}
      {aVenir ? (
        <>
          {agendaSeul && <p className="legende">Le fichier de votre agenda se télécharge. S’il ne s’ouvre pas, touchez « Ajouter à mon agenda ».</p>}
          <div className="rangee">
            <a className="btn btn--fort" href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`} download={nomDuFichierAgenda(r.date)}>Ajouter à mon agenda</a>
          </div>
          <div className="rdv-page__changer">
            <p className="legende">Un empêchement ? Un mot à la Maison suffit, votre référence est déjà dedans.</p>
            <p className="rangee">
              <a className="btn" href={lienWhatsApp(whatsapp, motPourDeplacer(quand, r.reference))} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { chemin: 'deplacer', page: '/rdv/' })}>Déplacer</a>
              <a className="btn btn--lien" href={lienWhatsApp(whatsapp, motPourAnnuler(quand, r.reference))} target="_blank" rel="noopener" onClick={() => mesure('whatsapp_clique', { chemin: 'annuler', page: '/rdv/' })}>Annuler</a>
            </p>
          </div>
        </>
      ) : (
        <p className="rangee">
          <a className="btn btn--plein" href={`${import.meta.env.BASE_URL}reserver/`}>Réserver une autre venue</a>
          <a className="btn btn--lien" href={waMaison} target="_blank" rel="noopener">Écrire à la Maison</a>
        </p>
      )}
    </div>
  );
}
