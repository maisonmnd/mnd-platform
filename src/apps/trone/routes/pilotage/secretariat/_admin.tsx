import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../../../../shared/auth';
import { useEstDirection } from '../../_vie';
import { toast } from '../../../../../ds/components';
import {
  chargeLEquipe, chargeLesTitulaires, deposeLesFichiers, lienDuFichier, prendsLesFichiers, retouche, useEquipeDuSecretariat, useTitulaires,
} from '../../../../../shared/secretariat-admin';
import { rappelDit, type Fichier, type LigneAdministrative, type Qui } from '../../../../../shared/secretariat-admin-pur';

/* LES PIÈCES COMMUNES DES ONGLETS DU SECRÉTARIAT ADMINISTRATIF — 14 octobre 2026.
   Les lignes se replient (résumé sur la ligne, un seul panneau ouvert), comme
   le veut la Maison pour tout écran en liste. */

let chargeUneFois = false;
/** Qui je suis pour le secrétariat : direction, titulaire du rôle, mon compte. */
export function useQui(): Qui {
  const direction = useEstDirection();
  const { session } = useAuth();
  const moi = session?.user?.id ?? '';
  const [titulaires] = useTitulaires();
  useEffect(() => {
    if (chargeUneFois) return;
    chargeUneFois = true;
    void chargeLesTitulaires();
    void chargeLEquipe();
  }, []);
  return { direction, titulaire: !!moi && titulaires.includes(moi), moi };
}

/** Le nom d'un compte, d'après l'équipe lue au serveur. */
export function useNomDuCompte(): (id?: string) => string {
  const [equipe] = useEquipeDuSecretariat();
  return (id) => (id ? equipe.find((m) => m.id === id)?.nom ?? 'un compte de l’équipe' : '');
}

/** Choisir à qui c'est confié. */
export function ChoixDuCompte({ value, onChange, vide = 'Personne en particulier', quiTient }: { value?: string; onChange: (v: string | undefined) => void; vide?: string; quiTient?: boolean }) {
  const [tous] = useEquipeDuSecretariat();
  /* Une échéance, un contrat, une démarche ne se lisent que du secrétariat :
     on ne les confie qu'à qui le tient (sinon la personne recevrait un rappel
     de ce qu'elle ne peut pas ouvrir). */
  const equipe = quiTient ? tous.filter((m) => m.tient || m.id === value) : tous;
  return (
    <select className="mnd-input" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} aria-label="Confié à">
      <option value="">{vide}</option>
      {equipe.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
    </select>
  );
}

/** Une ligne repliée : le résumé, puis le panneau quand elle est ouverte. */
export function Repliee({ ouverte, surBascule, num, titre, sous, badge, urgent, fait, children }: {
  ouverte: boolean; surBascule: () => void; num: ReactNode; titre: ReactNode; sous?: ReactNode; badge?: ReactNode;
  urgent?: boolean; fait?: boolean; children?: ReactNode;
}) {
  return (
    <div className={`sad-ligne${ouverte ? ' est-ouverte' : ''}`}>
      <button type="button" className="sad-ligne__tete" aria-expanded={ouverte} onClick={surBascule}>
        <span className="sad-ligne__num">{num}</span>
        <span className="sad-ligne__quoi"><b>{titre}</b>{sous ? <small>{sous}</small> : null}</span>
        {badge ? <span className={`sad-badge${urgent ? ' est-urgent' : ''}${fait ? ' est-fait' : ''}`}>{badge}</span> : <span />}
      </button>
      {ouverte && children ? <div className="sad-ligne__corps">{children}</div> : null}
    </div>
  );
}

/** Le badge d'une date à tenir : « dans 7 jours », « demain », « dépassé de 2 jours ». */
export function rappel(date: string | undefined, jour: string): { badge?: string; urgent?: boolean } {
  if (!date) return {};
  const r = rappelDit(date, jour);
  return { badge: r.mot, urgent: r.urgent };
}

/** Les fichiers d'une ligne : les voir (lien d'une minute), en ajouter. */
export function LesFichiers<L extends LigneAdministrative & { fichiers: Fichier[] }>({ ligne, peutAjouter }: { ligne: L; peutAjouter: boolean }) {
  const [envoi, setEnvoi] = useState(false);
  const ouvre = async (f: Fichier) => {
    const url = await lienDuFichier(f.chemin);
    if (url) window.open(url, '_blank', 'noopener');
    else toast('Ce fichier ne s’ouvre qu’en ligne.');
  };
  const ajoute = async (liste: FileList | null) => {
    if (!liste?.length) return;
    setEnvoi(true);
    const pris = await prendsLesFichiers(liste);
    if (pris.erreur) { toast(pris.erreur, 7000); setEnvoi(false); return; }
    const r = await deposeLesFichiers(ligne.id, pris.fichiers, ligne.fichiers.length);
    if (r.fichiers.length) retouche(ligne, { fichiers: [...ligne.fichiers, ...r.fichiers] } as Partial<L>);
    if (r.erreur) toast(r.erreur, 7000); else toast(r.fichiers.length > 1 ? 'Fichiers gardés.' : 'Fichier gardé.');
    setEnvoi(false);
  };
  return (
    <div className="sad-fichiers">
      {ligne.fichiers.map((f) => (
        <button key={f.chemin} type="button" className="sec-puce" onClick={() => void ouvre(f)}>{f.type === 'application/pdf' ? 'PDF' : 'Photo'} · {f.nom}</button>
      ))}
      {ligne.fichiers.length === 0 && <span className="sad-doux">Aucun fichier.</span>}
      {peutAjouter && (
        <label className="sec-puce sad-ajout">
          {envoi ? 'Envoi…' : '+ Photo ou PDF'}
          <input type="file" accept="image/*,application/pdf" multiple hidden disabled={envoi} onChange={(e) => { void ajoute(e.target.files); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}

/** Une case « privé » : la direction seule la voit et la coche. */
export function CasePrivee({ qui, value, onChange }: { qui: Qui; value: boolean; onChange: (v: boolean) => void }) {
  if (!qui.direction) return null;
  return (
    <label className="sad-case"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> Privé : visible de la direction seule</label>
  );
}
