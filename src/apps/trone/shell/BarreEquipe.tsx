import { NavLink, useNavigate } from 'react-router-dom';
import { BadgeCheck, CalendarDays, Fingerprint, Wallet } from 'lucide-react';
import { gestesRapides } from '../routes/index';
import { staffAccessStore } from '../routes/equipe/data';
import { useStore } from '../../../shared/store';
import { useStaff } from '../../../shared/auth';

/* LA POSTURE MOBILE DE L'ÉQUIPE (chantier ③ de la refonte validée).

   Le Trône au téléphone n'est pas un menu rétréci : un maître entre deux
   têtes fait trois gestes — pointer, lire sa journée, encaisser si le
   comptoir lui est ouvert. Cette barre les lui tend, grandes cibles, au bas
   de l'écran. Elle ne paraît QUE pour le rôle `maitre` et QU'AU téléphone
   (CSS) : le gérant garde sa barre latérale, même en mobilité.

   « Pointer » mène à la carte Aujourd'hui de Mon mois (`?pointer=1` la fait
   défiler en vue) — le pointage vit là, avec sa preuve. Les prix restent
   sous le juge commun `voitLesPrix`, écran par écran. */

export default function BarreEquipe() {
  const navigate = useNavigate();
  const staff = useStaff();
  const acces = useStore(staffAccessStore)[0];
  const mesDomaines = acces[staff?.user_id ?? ''] ?? {};
  if (staff?.role !== 'maitre') return null;

  /* ── ELLE NE TEND QUE DES PORTES OUVERTES — 31 août 2026 ──────────
     « Je ne veux pas mon mois, calendrier et pointer en bas de page si
     l'employé n'est pas concerné » (Yéman).

     Ces trois gestes étaient écrits en dur : depuis que Mon mois et le
     Calendrier se referment un par un (30 août), la barre continuait de les
     proposer à qui n'y avait plus droit. Le clic aboutissait à une garde qui
     renvoyait ailleurs — un bouton qui ne fait rien vaut moins qu'un bouton
     absent, car on le reclique.

     POINTER MÈNE À MON MOIS (`?pointer=1` fait défiler la carte Aujourd'hui
     en vue) : il suit donc exactement le sort de Mon mois, jamais le sien. */
  const { monMois: monMoisOuvert, calendrier: calendrierOuvert, caisse: caisseOuverte, aucun } = gestesRapides(staff?.role, mesDomaines);

  /* PLUS RIEN À TENDRE, PLUS DE BARRE : une bande vide au bas de l'écran
     mange la dernière ligne de la page pour ne rien offrir. */
  if (aucun) return null;

  return (
    <nav className="tr-barre" aria-label="Gestes rapides">
      {monMoisOuvert && (
        <NavLink to="/mon-mois" end className="tr-barre__it">
          <BadgeCheck size={17} />
          Mon mois
        </NavLink>
      )}
      {calendrierOuvert && (
        <NavLink to="/calendrier" className="tr-barre__it">
          <CalendarDays size={17} />
          Calendrier
        </NavLink>
      )}
      {monMoisOuvert && (
        <button className="tr-barre__it" onClick={() => navigate('/mon-mois?pointer=1')}>
          <Fingerprint size={17} />
          Pointer
        </button>
      )}
      {caisseOuverte && (
        <NavLink to="/caisse" className="tr-barre__it">
          <Wallet size={17} />
          Caisse
        </NavLink>
      )}
    </nav>
  );
}
