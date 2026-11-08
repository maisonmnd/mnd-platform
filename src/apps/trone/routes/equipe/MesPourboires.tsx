import { useEffect, useMemo, useRef, useState } from 'react';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAuth, useStaff as useMaTete } from '../../../../shared/auth';
import { sameName } from '../../../../shared/text';
import { supabase } from '../../../../shared/supabase';
import { tablePrete } from '../../../../shared/sync';
import { useTips } from '../../../../shared/tips';
import { useEstDirection } from '../_vie';
import { useStaff, adresseDe, type StaffMember } from './data';
import {
  mesPourboires, payesLeDit, periodeDite, pourboireArriveDit, pourboiresDuDit, quandDit, taPartDite, vientDArriver,
} from '../../../../shared/pourboires-de-l-equipe-pur';
import './pourboires.css';

/* ══ MES POURBOIRES, EN DIRECT — 5 novembre 2026 ════════════════════════════
   « Ils ont besoin de savoir combien ils gagnent au fur et à mesure »
   (Yéman, 4 novembre 2026). Maquette 2e4ZNFxyREv6mxG4vakuh5, écran 4 : en
   tête de son accueil au Trône et de Mon mois, son pourboire à lui, qui monte
   au moment même où il est encaissé. La règle vit dans
   shared/pourboires-de-l-equipe-pur.ts.

   EN DIRECT, SANS RECHARGER. Les parts arrivent par le canal de la Maison
   (`tips` est dans la publication temps réel depuis 0008, et le magasin
   s'abonne par `bindCollection`) : le bloc se recalcule à chaque part. Une
   part qui porte son instant (`inscritLe`) dit « à l'instant » d'elle-même ;
   une part sans instant (écrite par un Trône d'avant ce jour) prend l'instant
   où ce bloc l'a vue arriver, seulement après la première lecture de la
   table : la lecture du matin n'est pas quarante pourboires qui arrivent. */

/* LE TRÔNE D'ESSAI, SANS SERVEUR (les bancs à l'écran). Sans serveur, il n'y
   a ni compte ni rôle : tout vit sur l'appareil. La page de la direction
   s'ouvre (rien n'y est protégé qui ne soit déjà sur l'appareil) et « qui je
   suis » se lit sur `mnd_essai::moi`. Avec un serveur, c'est-à-dire toujours
   en ligne, ces deux portes n'existent pas. */
const CLE_D_ESSAI = 'mnd_essai::moi';
export function ficheDEssai<T extends { id: string }>(equipe: readonly T[]): T | null {
  if (supabase) return null;
  try {
    const id = localStorage.getItem(CLE_D_ESSAI);
    return id ? equipe.find((m) => m.id === id) ?? null : null;
  } catch { return null; }
}

/** LA DIRECTION LIT LE TABLEAU DE L'ÉQUIPE (choix du 4 novembre 2026). */
export function useVoitLesPourboiresDeLEquipe(): boolean {
  const direction = useEstDirection();
  return direction || !supabase;
}

/** MA FICHE DANS L'ÉQUIPE, comme Mon mois la trouve : l'adresse du compte
    d'abord (`adresseDe`), le nom ensuite. Les fiches parties ne comptent pas. */
export function useMaFicheDansLEquipe(): StaffMember | null {
  const [team] = useStaff();
  const { branch } = useBranch();
  const { session } = useAuth();
  const me = useMaTete();
  const monMail = (session?.user?.email ?? '').trim().toLowerCase();
  return useMemo(() => {
    const auj = new Date().toISOString().slice(0, 10);
    const equipe = team.filter((m) => m.branchId === branch.id && (!m.archiveeLe || m.archiveeLe > auj));
    return equipe.find((m) => monMail && adresseDe(m) === monMail)
      ?? equipe.find((m) => sameName(m.name, me?.name ?? ''))
      ?? ficheDEssai(equipe);
  }, [team, branch.id, monMail, me?.name]);
}

const aujourdhuiIci = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const LISTE_COURTE = 8;

/* Les parts vues arriver pendant la séance (identifiant → instant), gardées
   au-delà d'un écran : revenir sur Mon mois ne fait pas oublier qu'une part
   vient d'arriver. La mémoire de l'onglet, jamais l'appareil. */
const VUES_ARRIVER = new Map<string, number>();

/** LE BLOC DE CHACUN : « +1 000 F de pourboire · Ranti, à l'instant », son
    total du mois en grand, aujourd'hui, cette semaine, le mois d'avant, et la
    liste du mois (la cliente par son prénom). Rien quand la personne n'a ni
    part ni pourboire : un zéro qui ne bougera jamais n'apprend rien. */
export function MesPourboiresEnDirect({ moi }: { moi: StaffMember | null }) {
  const { currency } = useBranch();
  const [tips] = useTips();
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [tout, setTout] = useState(false);
  const connues = useRef<Set<string> | null>(null);
  const moiId = moi?.id ?? '';

  /* Une autre fiche, un autre compte : on repart de zéro (AVANT de regarder
     ce qui arrive, sinon ses parts passeraient toutes pour des arrivées). */
  useEffect(() => { connues.current = null; }, [moiId]);

  /* CE QUI ARRIVE PENDANT QUE L'ÉCRAN EST OUVERT. */
  useEffect(() => {
    if (!moiId) return;
    const miennes = tips.filter((t) => t.staffId === moiId);
    if (connues.current === null) {
      if (!tablePrete('tips')) return;
      connues.current = new Set(miennes.map((t) => t.id));
      return;
    }
    let neuve = false;
    for (const t of miennes) {
      if (connues.current.has(t.id)) continue;
      connues.current.add(t.id);
      if (!VUES_ARRIVER.has(t.id)) VUES_ARRIVER.set(t.id, Date.now());
      neuve = true;
    }
    if (neuve) setMaintenant(Date.now());
  }, [tips, moiId]);

  /* « il y a 3 min » avance tout seul. */
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const aujourdhui = aujourdhuiIci();
  const mes = useMemo(() => (moiId ? mesPourboires(tips, moiId, aujourdhui) : null), [tips, moiId, aujourdhui]);
  const arrive = moiId ? vientDArriver(tips, moiId, aujourdhui, maintenant, VUES_ARRIVER) : null;

  if (!moi || !mes) return null;
  const part = moi.partPourboire ?? 1;
  if (part <= 0 && mes.totaux.mois === 0 && mes.totaux.moisPrecedent === 0) return null;
  const argent = (n: number) => fmtMoney(n, currency);
  const liste = tout ? mes.duMois : mes.duMois.slice(0, LISTE_COURTE);

  return (
    <section className="tpb" aria-labelledby="tpb-titre" data-pourboires="moi">
      {arrive && (
        <p className="tpb__arrive" role="status" data-pourboires="arrive" key={arrive.id}>
          {pourboireArriveDit(arrive.amountXof, arrive.prenom)}, {quandDit(arrive.depuisMs, arrive.aMs)}
        </p>
      )}
      <div className="tpb__tete">
        <p className="tpb__sur" id="tpb-titre">Mes pourboires · {periodeDite(mes.mois)}, {payesLeDit(mes.mois)}</p>
        <p className="tpb__chiffre" data-pourboires="mois">{argent(mes.totaux.mois)}</p>
      </div>
      <div className="tpb__trois">
        <p className="tpb__case" data-pourboires="aujourdhui"><b>{argent(mes.totaux.aujourdhui)}</b><span>Aujourd’hui</span></p>
        <p className="tpb__case" data-pourboires="semaine"><b>{argent(mes.totaux.semaine)}</b><span>Cette semaine</span></p>
        <p className="tpb__case" data-pourboires="mois-precedent"><b>{argent(mes.totaux.moisPrecedent)}</b><span>{pourboiresDuDit(mes.moisPrecedent)}</span></p>
      </div>
      {mes.duMois.length === 0 ? (
        <p className="tpb__doux">Aucun pourboire inscrit {periodeDite(mes.mois)} pour l’instant.</p>
      ) : (
        <ul className="tpb__liste" data-pourboires="liste">
          {liste.map((l) => (
            <li key={l.id}>
              <span>{l.jourDit}{l.prenom ? ` · ${l.prenom}` : ''}</span>
              <b>{argent(l.amountXof)}</b>
            </li>
          ))}
        </ul>
      )}
      {mes.duMois.length > LISTE_COURTE && (
        <button type="button" className="tre-link-btn tpb__plus" onClick={() => setTout((v) => !v)}>
          {tout ? 'Voir les plus récents seulement' : `Voir les ${mes.duMois.length} pourboires de la période`}
        </button>
      )}
      <p className="tpb__doux">
        Ta part : {taPartDite(part)}. Le pourboire se partage entre toute l’équipe, qu’on ait touché la tête ou non.
      </p>
    </section>
  );
}
