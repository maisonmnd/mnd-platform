import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../../../shared/store';
import { PageHead } from '../_ui';
import { toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useAuth, useStaff as useMonProfil } from '../../../../shared/auth';
import { useInvoices } from '../../../../shared/finance';
import {
  filStore, useFil, demandeOuverte, estAPrendre, faiteRecemment, messageVisible, type FilMessage,
} from '../../../../shared/fil';
import { useProjets } from '../../../../shared/projets';
import { SECTIONS_DE_MES_TACHES, dateCourte, memeMain, sectionDeMaTache } from '../../../../shared/projets-pur';
import { useBranchAppointments } from '../clients/_shared';
import { useStaff, staffAccessStore, useAnnuaire, nomDuCompte, adresseDe } from './data';
import { voitLesPrix } from '../index';
import './mes-taches.css';

/* ═══════════════════════════════════════════════════════════════════
   MES TÂCHES — 24 octobre 2026, vue 7 de la maquette VJ5PJEGUPDbYKUgEdMUNbS
   (« Mes tâches, au téléphone (l'équipe) »), « construis » le même soir.

   Le Tableau range le travail en colonnes pour qui le distribue. Qui
   travaille a besoin d'autre chose : SA liste, la plus pressée en tête, un
   rond à toucher quand c'est fait, et ce qui attend d'être pris. Ce n'est
   pas un second registre : chaque ligne est une demande du Fil, la cocher
   ici la coche au Tableau et dans le Fil, et le prendre laisse sa trace sur
   la carte comme un glisser au Tableau. */

const p2 = (n: number) => String(n).padStart(2, '0');
const aujourdhuiLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const maintenant = (): string => {
  const d = new Date();
  return `${aujourdhuiLocal()}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

export default function MesTaches() {
  const navigate = useNavigate();
  const { branch } = useBranch();
  const { session } = useAuth();
  const monProfil = useMonProfil();
  const [tous] = useFil();
  const [invoices] = useInvoices();
  const [equipe] = useStaff();
  const [annuaire] = useAnnuaire();
  const [acces] = useStore(staffAccessStore);
  const [projets] = useProjets();
  const rdvs = useBranchAppointments();
  const [voirFaites, setVoirFaites] = useState(false);

  const monMail = (session?.user?.email ?? '').trim().toLowerCase();
  const maFiche = equipe.find((m) => adresseDe(m) === monMail);
  const monNom = nomDuCompte(annuaire, monMail, maFiche?.name?.trim() || monMail.split('@')[0] || 'La maison');
  /* Le prénom du compte ; sans compte connu, pas de prénom inventé (le repli
     « La maison » de l'annuaire ne se salue pas). */
  const prenom = monMail && (maFiche?.name || nomDuCompte(annuaire, monMail, '')) ? monNom.trim().split(/\s+/)[0] : '';
  const sansPrix = !voitLesPrix(monProfil?.role, acces[monProfil?.user_id ?? ''] ?? {});
  const aujourdhui = useMemo(aujourdhuiLocal, []);
  const nomDuProjet = (id?: string) => (id ? projets.find((p) => p.id === id)?.nom : undefined);

  const demandes = useMemo(
    () => tous.filter((m) => m.branchId === branch.id && !!m.demandePour && messageVisible(m, monMail, sansPrix)),
    [tous, branch.id, monMail, sansPrix],
  );
  const miennes = demandes.filter((m) => (m.demandePour ?? '').toLowerCase() === monMail);
  const ouvertes = miennes.filter((m) => demandeOuverte(m, invoices));
  const faites = miennes.filter((m) => !demandeOuverte(m, invoices) && !!m.faitAt && faiteRecemment(m, aujourdhui));
  const aPrendre = demandes.filter((m) => estAPrendre(m) && demandeOuverte(m, invoices));

  const seancesDuJour = maFiche
    ? rdvs.filter((r) => r.date === aujourdhui && r.status !== 'annulé' && memeMain(r.master ?? '', maFiche.name)).length
    : 0;

  const basculer = (m: FilMessage) => {
    const faite = !!m.faitAt;
    filStore.set((prev) => prev.map((x) => (x.id === m.id
      ? (faite ? { ...x, faitAt: undefined, faitPar: undefined } : { ...x, faitAt: maintenant(), faitPar: monNom })
      : x)));
    toast(faite ? 'Rouverte, elle revient dans votre liste.' : `Bravo. ${m.auteurNom || 'La Maison'} le verra au Fil et au Tableau.`);
  };

  /* PRENDRE, C'EST LA PRENDRE POUR SOI (règle du Tableau, 18 août). */
  const prendre = (m: FilMessage) => {
    filStore.set((prev) => prev.map((x) => (x.id === m.id
      ? {
        ...x, demandePour: monMail, demandePourNom: monNom,
        mouvements: [...(x.mouvements ?? []), { parNom: monNom, deNom: 'À prendre', aNom: monNom, at: maintenant() }],
      }
      : x)));
    toast('Elle est à vous, dans votre liste.');
  };

  const Ligne = ({ m, libre }: { m: FilMessage; libre?: boolean }) => {
    const faite = !!m.faitAt;
    const enRetard = !faite && !!m.echeance && m.echeance < aujourdhui;
    const projet = nomDuProjet(m.projetId);
    return (
      <article className={`mtc-ligne${faite ? ' est-faite' : ''}`}>
        <div className="mtc-ligne__corps">
          <span className="mtc-ligne__projet">{projet ? `Projet · ${projet}` : 'Demande du Fil'}</span>
          <b className="mtc-ligne__titre">{m.texte}</b>
          <span className={enRetard ? 'mtc-retard' : 'mtc-doux'}>
            {faite
              ? `Faite · ${m.auteurNom || 'la Maison'} le voit au Fil`
              : `${libre ? 'À qui la prend' : `Demandée par ${m.auteurNom || 'la Maison'}`}${m.echeance ? ` · ${enRetard ? 'prévue le' : 'pour le'} ${dateCourte(m.echeance)}` : ''}`}
          </span>
          {!faite && !libre && <button type="button" className="mtc-lien" onClick={() => navigate('/fil')}>Besoin d’aide ? Écrire au Fil ›</button>}
        </div>
        {libre
          ? <button type="button" className="mtc-prendre" onClick={() => prendre(m)}>Je prends</button>
          : (
            <button type="button" className={`mtc-rond${faite ? ' is-on' : ''}`} aria-pressed={faite}
              aria-label={`${faite ? 'Rouvrir' : 'Marquer faite'} : ${m.texte}`} onClick={() => basculer(m)}>✓</button>
          )}
      </article>
    );
  };

  return (
    <div className="mtc">
      <PageHead
        eyebrow="Le Fil · Mes tâches"
        title={prenom ? `Bonjour, ${prenom}.` : 'Mes tâches.'}
        sub={`${ouvertes.length === 0 ? 'Rien à faire en plus' : `${ouvertes.length} à faire`}${seancesDuJour ? ` · ${seancesDuJour} séance${seancesDuJour > 1 ? 's' : ''} aujourd’hui` : ''}`}
      />

      {SECTIONS_DE_MES_TACHES.map((s) => {
        const leurs = ouvertes
          .filter((m) => sectionDeMaTache(m.echeance, aujourdhui) === s.cle)
          .sort((a, b) => (a.echeance || '9999').localeCompare(b.echeance || '9999') || a.at.localeCompare(b.at));
        if (leurs.length === 0 && s.cle !== 'maintenant') return null;
        return (
          <section key={s.cle} className="mtc-section" aria-label={s.nom}>
            <div className="mtc-section__tete"><h3>{s.nom}</h3><span className="mtc-doux">{leurs.length === 0 ? 'rien' : `${leurs.length} à faire`}</span></div>
            {leurs.length === 0 && <p className="mtc-doux mtc-vide">Rien pour aujourd’hui.</p>}
            {leurs.map((m) => <Ligne key={m.id} m={m} />)}
          </section>
        );
      })}

      {aPrendre.length > 0 && (
        <section className="mtc-section" aria-label="À prendre">
          <div className="mtc-section__tete"><h3>À prendre</h3><span className="mtc-doux">{aPrendre.length} libre{aPrendre.length > 1 ? 's' : ''}</span></div>
          {aPrendre.map((m) => <Ligne key={m.id} m={m} libre />)}
        </section>
      )}

      {faites.length > 0 && (
        <section className="mtc-section" aria-label="Faites ces 7 jours">
          <button type="button" className="mtc-lien" aria-expanded={voirFaites} onClick={() => setVoirFaites((v) => !v)}>
            {voirFaites ? 'Cacher' : 'Voir'} les {faites.length} faite{faites.length > 1 ? 's' : ''} ces 7 jours
          </button>
          {voirFaites && faites.map((m) => <Ligne key={m.id} m={m} />)}
        </section>
      )}

      <p className="mtc-doux mtc-note">Une tâche finie prévient qui l’a demandée. Les séances restent dans l’Agenda ; ici, seulement ce qui est à faire en plus.</p>
    </div>
  );
}
