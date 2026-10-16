import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Fingerprint } from 'lucide-react';
import { Button, Modal, Seal, toast } from '../../../ds/components';
import { maisonNom } from '../../../shared/identite';
import { signInEmail, signOut, useAuth, useMaTete } from '../../../shared/auth';
import {
  activeLEmpreinte, clesDeLEquipe, compteMemorise, dejaProposee, entreParLEmpreinte, marqueProposee, memoriseLeCompte, mesCles,
  noteUneEntree, oublieLEmpreinte, retireLaCleDe, retireMaCle, useAppareilCapable, useClesAllumees, useEmpreinteDeLAppareil, useVerrou,
  type CleDAcces, type ClesDUnMembre,
} from '../../../shared/empreinte';
import { dateDeLaCle, doitProposer, masqueLEmail, prenomDuCompte, type CompteMemorise } from '../../../shared/empreinte-pur';

/* ══ ENTRER PAR L'EMPREINTE, LES ÉCRANS — 16 octobre 2026 ══════════════
   Maquette 16whsWP5… : le compte dont le téléphone se souvient, le bouton
   rond de l'empreinte, le verrou (à l'ouverture et après cinq minutes hors
   du Trône), la proposition après le mot de passe, « Mes clés d'accès »
   (chacun), « Les clés de l'équipe » (la direction). Le mot de passe reste
   toujours la porte de secours. */

/** Le bouton rond de l'empreinte (cuivre). */
export function BoutonEmpreinte({ onClick, occupe, libelle = 'Entrer avec l’empreinte' }: { onClick: () => void; occupe?: boolean; libelle?: string }) {
  return (
    <button type="button" className="tra-empreinte" onClick={onClick} disabled={occupe} aria-busy={occupe || undefined}>
      <span className="tra-empreinte__rond"><Fingerprint size={30} strokeWidth={1.6} aria-hidden /></span>
      <span className="tra-empreinte__dit">{occupe ? 'Un instant…' : libelle}</span>
    </button>
  );
}

/** Le compte dont le téléphone se souvient : le prénom, l'e-mail masqué (comme BIIC). */
export function CompteReconnu({ compte, action }: { compte: CompteMemorise; action?: ReactNode }) {
  return (
    <div className="tra-compte">
      <span className="tra-compte__initiale" aria-hidden>{(compte.prenom || compte.email)[0]?.toUpperCase()}</span>
      <span className="tra-compte__qui">
        <b>{compte.prenom || 'Votre compte'}</b>
        <span>{masqueLEmail(compte.email)}</span>
      </span>
      {action}
    </div>
  );
}

/* ── LE VERROU : par-dessus le Trône, qui reste chargé derrière (rien ne se perd) ── */
function VerrouDuTrone({ uid, compte, surDeverrouille }: { uid: string; compte: CompteMemorise | null; surDeverrouille: () => void }) {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [motDePasse, setMotDePasse] = useState<string | null>(null);
  const empreinte = async () => {
    setOccupe(true); setErreur('');
    const r = await entreParLEmpreinte({ sessionGardee: true });
    setOccupe(false);
    if (r.ok) { surDeverrouille(); return; }
    /* Une clé retirée (téléphone perdu, départ) n'ouvre surtout pas : on se déconnecte, le mot de passe est redemandé. */
    if (r.retiree) { oublieLEmpreinte(uid); toast(r.erreur, 7000); void signOut(); return; }
    setErreur(r.erreur);
  };
  const parMotDePasse = async () => {
    if (!compte || !motDePasse) return;
    setOccupe(true); setErreur('');
    try { noteUneEntree(); await signInEmail(compte.email, motDePasse); surDeverrouille(); }
    catch (e) { setErreur(/invalid login/i.test(String((e as Error)?.message)) ? 'Mot de passe incorrect.' : 'Le mot de passe demande le réseau. Utilisez l’empreinte, ou le code du téléphone qu’elle propose.'); }
    finally { setOccupe(false); }
  };
  return createPortal(
    <div className="tra-verrou" role="dialog" aria-modal="true" aria-labelledby="tra-verrou-titre">
      <div className="tra-card">
        <div className="tra-head">
          <Seal color="copper" size={40} />
          <div>
            <div className="mnd-eyebrow">Le Trône</div>
            <h1 className="mnd-serif tra-title" id="tra-verrou-titre">{maisonNom()}</h1>
          </div>
        </div>
        <p className="tra-lede mnd-muted">Le Trône est verrouillé{compte?.prenom ? `. Bon retour, ${compte.prenom}.` : '.'}</p>
        {compte && <CompteReconnu compte={compte} />}
        <BoutonEmpreinte onClick={() => void empreinte()} occupe={occupe} />
        {erreur && <div className="tra-error" role="alert">{erreur}</div>}
        {motDePasse === null
          ? compte && <button type="button" className="tra-switch" onClick={() => setMotDePasse('')}>Utiliser le mot de passe</button>
          : (
            <form className="tra-mdp" onSubmit={(e) => { e.preventDefault(); void parMotDePasse(); }}>
              <input className="mnd-input" type="password" autoComplete="current-password" aria-label="Mot de passe" placeholder="Mot de passe"
                value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoFocus />
              <Button type="submit" disabled={occupe || !motDePasse}>Entrer</Button>
            </form>
          )}
        <button type="button" className="tra-switch" onClick={() => void signOut()}>Ce n’est pas vous ? Se déconnecter</button>
      </div>
    </div>,
    document.body,
  );
}

/* ── LA PROPOSITION, une fois par appareil, après le mot de passe ── */
function PropositionDEmpreinte({ uid, surFin }: { uid: string; surFin: () => void }) {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const plusTard = () => { marqueProposee(uid); surFin(); };
  const active = async () => {
    setOccupe(true); setErreur('');
    const r = await activeLEmpreinte(uid);
    setOccupe(false);
    if (r.ok) { toast('C’est fait : la prochaine fois, un doigt suffit sur cet appareil.', 6000); surFin(); }
    else setErreur(r.erreur);
  };
  return createPortal(
    <div className="tra-feuille-voile" role="dialog" aria-modal="true" aria-labelledby="tra-proposition-titre">
      <div className="tra-feuille">
        <span className="tra-empreinte__rond tra-feuille__rond"><Fingerprint size={28} strokeWidth={1.6} aria-hidden /></span>
        <h2 className="mnd-serif" id="tra-proposition-titre">Entrer d’un doigt la prochaine fois ?</h2>
        <p className="mnd-muted">Sur cet appareil, votre empreinte ou votre visage remplacera le mot de passe. Ils ne quittent jamais l’appareil ; la Maison ne les voit pas.</p>
        {erreur && <div className="tra-error" role="alert">{erreur}</div>}
        <div className="tra-feuille__duo">
          <Button variant="ghost" onClick={plusTard} disabled={occupe}>Plus tard</Button>
          <Button variant="copper" onClick={() => void active()} disabled={occupe}>{occupe ? 'Un instant…' : 'Activer'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** LA GARDE, entre la porte et le Trône : se souvient du compte, verrouille, propose. */
export function GardeDeLEmpreinte({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { tete } = useMaTete();
  const uid = session?.user?.id ?? '';
  const email = session?.user?.email ?? '';
  const prenom = prenomDuCompte(tete?.name, email);
  useEffect(() => { if (uid && email) memoriseLeCompte(uid, prenom, email); }, [uid, email, prenom]);
  const { verrouille, deverrouille, verrouilleMaintenant } = useVerrou(uid);
  useEcouteLeVerrou(verrouilleMaintenant);
  const activee = !!useEmpreinteDeLAppareil(uid);
  const capable = useAppareilCapable();
  const allumees = useClesAllumees();
  const [proposer, setProposer] = useState(false);
  useEffect(() => {
    if (capable === null || allumees === null || !uid) return;
    /* Rien n'est proposé tant que la Maison n'a pas allumé les clés d'accès (Supabase). */
    setProposer(allumees && doitProposer({ capable, activee, dejaProposee: dejaProposee(uid), enLigne: navigator.onLine !== false }));
  }, [capable, allumees, activee, uid]);
  return (
    <>
      <div className="tra-sous-le-verrou" inert={verrouille || undefined} aria-hidden={verrouille || undefined}>{children}</div>
      {verrouille && <VerrouDuTrone uid={uid} compte={compteMemorise()} surDeverrouille={deverrouille} />}
      {!verrouille && proposer && <PropositionDEmpreinte uid={uid} surFin={() => setProposer(false)} />}
    </>
  );
}

/* ── MES CLÉS D'ACCÈS (chacun), depuis l'en-tête ── */
function MesClesDAcces({ onClose, surVerrouille }: { onClose: () => void; surVerrouille: () => void }) {
  const { session } = useAuth();
  const uid = session?.user?.id ?? '';
  const ici = useEmpreinteDeLAppareil(uid);
  const capable = useAppareilCapable();
  const allumees = useClesAllumees();
  const [cles, setCles] = useState<CleDAcces[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const relis = async () => { const r = await mesCles(); setCles(r.cles); setErreur(r.erreur ?? ''); };
  useEffect(() => { void relis(); }, [ici?.passkeyId]);
  const active = async () => { setOccupe(true); const r = await activeLEmpreinte(uid); setOccupe(false); if (r.ok) toast('Empreinte activée sur cet appareil.'); else setErreur(r.erreur); };
  const retire = async (c: CleDAcces) => {
    setOccupe(true);
    const r = await retireMaCle(uid, c.id);
    setOccupe(false);
    if (r.ok) { toast(`Clé retirée : « ${c.nom} » n’entre plus par l’empreinte.`); void relis(); } else setErreur(r.erreur);
  };
  return createPortal(
    <Modal title="Entrer par l’empreinte" onClose={onClose} width={520}>
      <div className="tra-cles">
        <section className="tra-cles__ici">
          <b>Sur cet appareil</b>
          {allumees === false && !ici
            ? <p className="mnd-muted">L’entrée par l’empreinte n’est pas encore allumée côté Maison (Supabase). Elle se proposera d’elle-même dès qu’elle le sera.</p>
            : capable === false
            ? <p className="mnd-muted">Cet appareil ou ce navigateur ne lit pas l’empreinte : le mot de passe reste votre entrée.</p>
            : ici
              ? (
                <>
                  <p className="mnd-muted">Activée (« {ici.nom} »). Le Trône redemande l’empreinte à l’ouverture et après 5 minutes hors du Trône.</p>
                  <div className="tra-cles__gestes">
                    <Button variant="copper" onClick={() => { onClose(); surVerrouille(); }}>Verrouiller maintenant</Button>
                    <Button variant="ghost" disabled={occupe} onClick={() => void retire({ id: ici.passkeyId, nom: ici.nom, creeeLe: ici.le })}>Désactiver sur cet appareil</Button>
                  </div>
                </>
              )
              : (
                <>
                  <p className="mnd-muted">Pas encore activée. Votre empreinte ou votre visage remplacera le mot de passe ; ils ne quittent jamais l’appareil.</p>
                  <div className="tra-cles__gestes"><Button variant="copper" disabled={occupe || capable === null} onClick={() => void active()}>{occupe ? 'Un instant…' : 'Activer sur cet appareil'}</Button></div>
                </>
              )}
        </section>
        <section>
          <b>Vos clés d’accès</b>
          <p className="mnd-muted petit">Une par appareil. Un appareil perdu : retirez sa clé, elle ne marche plus nulle part.</p>
          {cles === null && <p className="mnd-muted">Lecture…</p>}
          {cles && cles.length === 0 && !erreur && <p className="mnd-muted">Aucune clé pour l’instant.</p>}
          <ul className="tra-cles__liste">
            {(cles ?? []).map((c) => (
              <li key={c.id}>
                <span><b>{c.nom}</b>{ici?.passkeyId === c.id && <em> · cet appareil</em>}
                  <small>créée le {dateDeLaCle(c.creeeLe)}{c.utiliseeLe ? ` · utilisée le ${dateDeLaCle(c.utiliseeLe)}` : ''}</small></span>
                <button type="button" className="tra-retirer" disabled={occupe} onClick={() => void retire(c)}>Retirer</button>
              </li>
            ))}
          </ul>
          {erreur && <div className="tra-error" role="alert">{erreur}</div>}
        </section>
      </div>
    </Modal>,
    document.body,
  );
}

/** Le bouton de l'en-tête (à côté de « Se déconnecter »). */
export function BoutonDesCles({ className }: { className?: string }) {
  const { session } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  if (!session) return null;
  return (
    <>
      <button type="button" className={className} aria-label="Entrer par l’empreinte" title="Entrer par l’empreinte" onClick={() => setOuvert(true)}>
        <Fingerprint size={15} aria-hidden />
      </button>
      {ouvert && <MesClesDAcces onClose={() => setOuvert(false)} surVerrouille={verrouilleMaintenantPartout} />}
    </>
  );
}

/* « Verrouiller maintenant » parle à la garde : un signal simple sur la fenêtre. */
const SIGNAL = 'mnd-verrouille-maintenant';
const verrouilleMaintenantPartout = (): void => { window.dispatchEvent(new Event(SIGNAL)); };
export function useEcouteLeVerrou(verrouilleMaintenant: () => void): void {
  useEffect(() => { window.addEventListener(SIGNAL, verrouilleMaintenant); return () => window.removeEventListener(SIGNAL, verrouilleMaintenant); }, [verrouilleMaintenant]);
}

/* ── LES CLÉS DE L'ÉQUIPE (la direction), dans « Accès & rôles » ── */
export function LesClesDeLEquipe() {
  const [membres, setMembres] = useState<ClesDUnMembre[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState('');
  const relis = async () => { const r = await clesDeLEquipe(); setMembres(r.membres); setErreur(r.erreur ?? ''); };
  useEffect(() => { void relis(); }, []);
  const retire = async (m: ClesDUnMembre, c: CleDAcces) => {
    setOccupe(c.id);
    const r = await retireLaCleDe(m.userId, c.id);
    setOccupe('');
    if (r.ok) { toast(`La clé « ${c.nom} » de ${m.nom} est retirée. Si l’appareil est perdu, changez aussi son mot de passe.`, 7000); void relis(); }
    else setErreur(r.erreur);
  };
  const avecCles = (membres ?? []).filter((m) => m.cles.length > 0);
  return (
    <div className="tra-cles tra-cles--equipe">
      <p className="mnd-muted">Un appareil perdu, volé, ou un départ : retirez sa clé, elle ne marche plus nulle part. Changez ensuite le mot de passe du compte.</p>
      {membres === null && !erreur && <p className="mnd-muted">Lecture…</p>}
      {membres && avecCles.length === 0 && !erreur && <p className="mnd-muted">Personne n’a encore activé l’empreinte.</p>}
      <ul className="tra-cles__liste">
        {avecCles.flatMap((m) => m.cles.map((c) => (
          <li key={c.id}>
            <span><b>{m.nom}</b> · {c.nom}
              <small>créée le {dateDeLaCle(c.creeeLe)}{c.utiliseeLe ? ` · utilisée le ${dateDeLaCle(c.utiliseeLe)}` : ''}</small></span>
            <button type="button" className="tra-retirer" disabled={!!occupe} onClick={() => void retire(m, c)}>{occupe === c.id ? '…' : 'Retirer'}</button>
          </li>
        )))}
      </ul>
      {erreur && <div className="tra-error" role="alert">{erreur}</div>}
    </div>
  );
}
