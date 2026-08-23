import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eyebrow, Modal } from '../../../../ds/components';
import { fmtIn, fmtMoney } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import { CURRENCIES } from '../../../../shared/geo';
import {
  useCashboxes, useInvoices, useTransferts, cashboxCurrency,
  caisseDiscrete, empreinteDuCode,
  type Cashbox,
} from '../../../../shared/finance';
import { useCoffre, useCredits } from '../../../../shared/finance';
import { todayISO, monthKey, monthLabel, MonthNav } from './_shared';
import { RapportDeCaisse } from './Rapport';
import { useCaisses, ReleveCaisse, soldeVisible, ouvreLaCaisse, refermeLaCaisse, leCodeOuvre, useCaissesOuvertes, CLE_ECRAN, EcranVerrouille, ReglerLeVerrou, LeTrousseau, nomEtSolde } from './tiroirs';
import { useSettings, settingsStore } from '../../../../shared/settings';
import './finances.css';

/* ── LES CAISSES · L'ÉCRAN — 22 août 2026 ───────────────────────────
   « Est-ce que je ne devrais pas avoir un bouton revenu tout comme j'ai un
   bouton dépenses ? Et créer mes caisses depuis ces caisses revenus ? »

   L'instinct était juste, mais pas sur le mot. L'écran des revenus existe :
   c'est Encaissements — et il ne faut PAS l'appeler « Revenus », parce qu'il
   mesure la trésorerie (ce qui est entré) quand la Synthèse mesure le chiffre
   d'affaires (ce qui a été gagné). Les deux diffèrent légitimement : un
   pourboire entre au tiroir sans être du revenu, un avoir est du revenu sans
   être des billets. Les nommer pareil ferait croire à une erreur chaque fois
   qu'ils ne coïncident pas.

   CE QUI ÉTAIT VRAIMENT MAL RANGÉ, ce sont les caisses. Elles vivaient sous
   « Dépenses » par accident d'histoire. Or une caisse n'appartient pas aux
   dépenses : c'est le tiroir par lequel TOUT passe — ce qui entre comme ce
   qui sort. Elle a donc son écran, et Dépenses comme Encaissements y
   renvoient. Les calculs, eux, restent à une seule source (`useCaisses`). */

type BoxForm = { name: string; sub: string; glyph: string; opening: string; currency: string; code: string; codeExistant: boolean; horsBilan: boolean };
const GLYPHS = ['◈', '❖', '✦', '❈', '◆', '✧', '⬡', '❉'];

export default function Caisses() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(monthKey(todayISO()));
  const monthName = monthLabel(month);
  const isCurrent = month === monthKey(todayISO());

  const { branch, currency, branchBoxes, boxBalance, boxMonthFlux, tresorerieVisible, discretesFermees, horsBilan, ouvertes } = useCaisses(month);
  const [, setCashboxes] = useCashboxes();
  const [invoices, setInvoices] = useInvoices();
  const [transferts, setTransferts] = useTransferts();
  const [, setCoffre] = useCoffre();
  const [, setCreditMvts] = useCredits();

  const [boxDrill, setBoxDrill] = useState<string | null>(null);
  /* LE RAPPORT — 22 août 2026. Fermé quand rien n'est posé ; une chaîne vide
     demande toutes les caisses ; un nom ne demande que ce tiroir-là. */
  const [rapport, setRapport] = useState<string | null>(null);
  const [trousseau, setTrousseau] = useState(false);

  /* ── LE VERROU DE L'ÉCRAN — 22 août 2026 ──────────────────────────
     « Mettre un code de sécurité avant d'ouvrir tout l'onglet caisse. »
     Sans code posé, l'écran s'ouvre comme avant : une mise à jour ne doit
     enfermer personne dehors. Le verrou vaut pour la séance. */
  const [reglages] = useSettings();
  const toutesOuvertes = useCaissesOuvertes();
  const ecranVerrouille = !!reglages.codeCaissesHash && !toutesOuvertes.has(CLE_ECRAN);

  /* Poser ou retirer le code de l'écran — depuis l'écran lui-même, une fois
     dedans : il n'y a pas d'endroit plus juste pour le régler. */
  const [verrouOuvert, setVerrouOuvert] = useState(false);

  /* ── Créer, renommer, retirer une caisse ── */
  const [boxOpen, setBoxOpen] = useState(false);
  const [boxEditingId, setBoxEditingId] = useState<string | null>(null);
  const [boxForm, setBoxForm] = useState<BoxForm>({ name: '', sub: '', glyph: '◈', opening: '', currency: '', code: '', codeExistant: false, horsBilan: false });

  /* ── OUVRIR UNE CAISSE DISCRÈTE ── */
  /* CE QU'ON FERA UNE FOIS LA CAISSE OUVERTE — 22 août 2026. « Même quand les
     caisses sont fermées j'arrive toujours à les ouvrir pour modifier. »

     La modale de modification montre le SOLDE D'OUVERTURE et le champ du code :
     l'ouvrir sans le code laissait lire ce qu'on masquait, et permettait de
     RETIRER le verrou sans jamais l'avoir connu. Le code est donc demandé
     avant, et le geste voulu reprend son cours juste après. */
  const [aOuvrir, setAOuvrir] = useState<{ c: Cashbox; puis: 'voir' | 'modifier' | 'retirer' } | null>(null);
  const demanderLeCode = (c: Cashbox, puis: 'voir' | 'modifier' | 'retirer') => {
    setAOuvrir({ c, puis }); setCodeSaisi(''); setCodeFaux(false);
  };
  const [codeSaisi, setCodeSaisi] = useState('');
  const [codeFaux, setCodeFaux] = useState(false);
  const essayerLeCode = async () => {
    if (!aOuvrir) return;
    if (!(await leCodeOuvre(aOuvrir.c, codeSaisi))) { setCodeFaux(true); return; }
    const { c, puis } = aOuvrir;
    ouvreLaCaisse(c.id);
    setAOuvrir(null); setCodeSaisi(''); setCodeFaux(false);
    if (puis === 'modifier') openEditBox(c);
    if (puis === 'retirer') openEditBox(c);
  };

  const openNewBox = () => {
    setBoxEditingId(null);
    setBoxForm({ name: '', sub: '', glyph: '◈', opening: '', currency: '', code: '', codeExistant: false, horsBilan: false });
    setBoxOpen(true);
  };
  const openEditBox = (c: Cashbox) => {
    /* LA CEINTURE : quel que soit le chemin qui mène ici, une caisse fermée ne
       s'ouvre pas en modification. Le bouton demande déjà le code — ceci le
       garantit même si un autre appel apparaissait un jour. */
    if (caisseDiscrete(c) && !soldeVisible(c, ouvertes)) { demanderLeCode(c, 'modifier'); return; }
    setBoxEditingId(c.id);
    setBoxForm({ name: c.name, sub: c.sub, glyph: c.glyph, opening: String(c.openingXof || ''), currency: c.currency ?? '', code: '', codeExistant: !!c.codeHash, horsBilan: !!c.horsBilan });
    setBoxOpen(true);
  };

  const saveBox = async () => {
    const name = boxForm.name.trim();
    if (!name) return;
    const sub = boxForm.sub.trim() || 'Caisse';
    const glyph = boxForm.glyph.trim() || '◈';
    const opening = parseInt(boxForm.opening || '0', 10) || 0;
    if (boxEditingId) {
      const prevBox = branchBoxes.find((b) => b.id === boxEditingId);
      const oldName = prevBox?.name;
      /* UN CODE SAISI REMPLACE L'ANCIEN ; un champ laissé vide le garde tel
         quel. Pour retirer la discrétion, on efface le code — le champ le dit. */
      const codeHash = boxForm.code.trim()
        ? await empreinteDuCode(boxEditingId, boxForm.code.trim())
        : (boxForm.codeExistant ? undefined : undefined);
      setCashboxes((prev) => prev.map((b) => (b.id === boxEditingId
        ? {
          ...b, name, sub, glyph, openingXof: opening,
          currency: boxForm.currency || undefined,
          horsBilan: boxForm.horsBilan || undefined,
          codeHash: boxForm.code.trim() ? codeHash : (boxForm.codeExistant ? b.codeHash : undefined),
        }
        : b)));
      if (oldName && oldName !== name) {
        /* RENOMMER N'ORPHELINE PERSONNE — 21 août 2026. Le nom EST la clé : il
           n'y a pas d'identifiant partagé entre une caisse et ses écritures.
           Tout ce qui la nomme doit suivre, le JOURNAL DES VERSEMENTS compris —
           c'est lui, et lui seul, que le solde interroge. */
        setInvoices((prev) => prev.map((i) => {
          const piece = i.cashbox === oldName;
          const journal = (i.payments ?? []).some((p) => p.cashbox === oldName);
          if (!piece && !journal) return i;
          return {
            ...i,
            ...(piece ? { cashbox: name } : {}),
            ...(journal ? { payments: i.payments!.map((p) => (p.cashbox === oldName ? { ...p, cashbox: name } : p)) } : {}),
          };
        }));
        setCoffre((prev) => prev.map((m) => (m.cashbox === oldName ? { ...m, cashbox: name } : m)));
        setCreditMvts((prev) => prev.map((m) => (m.cashbox === oldName ? { ...m, cashbox: name } : m)));
        setTransferts((prev) => prev.map((t) => ({
          ...t,
          de: t.de === oldName ? name : t.de,
          vers: t.vers === oldName ? name : t.vers,
        })));
      }
    } else {
      const id = uid();
      const codeHash = boxForm.code.trim() ? await empreinteDuCode(id, boxForm.code.trim()) : undefined;
      setCashboxes((prev) => [...prev, {
        id, branchId: branch.id, name, sub, glyph,
        openingXof: opening, currency: boxForm.currency || undefined,
        horsBilan: boxForm.horsBilan || undefined,
        codeHash,
      }]);
      /* Elle s'ouvre pour la séance où on vient de la créer : sinon on
         poserait un code et l'écran se refermerait aussitôt sur soi-même. */
      if (codeHash) ouvreLaCaisse(id);
    }
    setBoxOpen(false);
  };

  const deleteBox = (c: Cashbox) => {
    if (caisseDiscrete(c) && !soldeVisible(c, ouvertes)) { demanderLeCode(c, 'retirer'); return; }
    if (!window.confirm(
      `Retirer la caisse « ${c.name} » ? Les écritures qui la nomment ne sont PAS supprimées — `
      + 'elles resteront rattachées à un tiroir qui n’existe plus.',
    )) return;
    setCashboxes((prev) => prev.filter((b) => b.id !== c.id));
  };

  /* ── Le transfert entre caisses ── */
  const [trOuvert, setTrOuvert] = useState(false);
  const [fTr, setFTr] = useState({ de: '', vers: '', montant: '', recu: '', note: '', date: todayISO() });
  /* CORRIGER OU EFFACER UN MOUVEMENT — 23 août 2026. « Il faut mettre les
     dates d’origine pour ces transactions. » Les dates sont enregistrées
     telles que saisies ; ce qui manquait, c’est le chemin pour les reprendre.
     Facture, dépense, avoir et prêt menaient à leur fiche ; un apport ne
     menait nulle part, et une ligne qu’on ne peut pas rouvrir est une faute
     qu’on ne peut pas réparer. Même modale que la saisie. */
  const [trEdite, setTrEdite] = useState<string | null>(null);
  const corrigerLeTransfert = (id: string) => {
    const t = transferts.find((x) => x.id === id);
    if (!t) return;
    const caisseSortie = branchBoxes.find((c) => c.name === t.de);
    const caisseEntree = branchBoxes.find((c) => c.name === t.vers);
    const change = !!caisseSortie && !!caisseEntree
      && cashboxCurrency(caisseSortie) !== cashboxCurrency(caisseEntree);
    setFTr({
      de: t.de ?? '', vers: t.vers ?? '',
      montant: String(t.amountXof),
      recu: change && t.recuXof != null ? String(t.recuXof) : '',
      note: t.note ?? '', date: t.date.slice(0, 10),
    });
    setTrEdite(id);
    setTrOuvert(true);
  };
  const effacerLeTransfert = () => {
    if (!trEdite) return;
    setTransferts((prev) => prev.filter((x) => x.id !== trEdite));
    setTrEdite(null); setTrOuvert(false);
  };
  const caisseDe = branchBoxes.find((c) => c.name === fTr.de);
  const caisseVers = branchBoxes.find((c) => c.name === fTr.vers);
  /* LA MONNAIE SUIT LE TIROIR CONCERNÉ — 23 août 2026. « Quand la caisse USD
     est choisie, le montant doit suivre la devise de la caisse. » Le champ
     annonçait la monnaie du DÉPART, et un APPORT n’en a pas : il retombait sur
     les francs de la Maison, sous un tiroir qui ne compte que des dollars.
     Quand un seul bout existe, c’est LUI qui donne la monnaie. */
  const deviseDe = caisseDe ? cashboxCurrency(caisseDe) : (caisseVers ? cashboxCurrency(caisseVers) : currency);
  const deviseVers = caisseVers ? cashboxCurrency(caisseVers) : (caisseDe ? cashboxCurrency(caisseDe) : currency);
  const changeDeDevise = !!caisseDe && !!caisseVers && deviseDe !== deviseVers;
  /* Ce que le champ principal demande : la monnaie du tiroir de DÉPART quand
     il existe, sinon celle du tiroir d’ARRIVÉE. */
  const deviseSaisie = deviseDe;

  const enregistrerTransfert = () => {
    /* LES CENTIMES EXISTENT EN DEVISE : 27,50 € est un montant, 27 ne l est
       pas toujours. En francs, l’entier reste la règle. */
    const lire = (v: string) => (deviseSaisie === currency
      ? (parseInt(v.replace(/[^0-9]/g, ''), 10) || 0)
      : (parseFloat(v.replace(',', '.').replace(/[^0-9.]/g, '')) || 0));
    const montant = lire(fTr.montant);
    const recu = deviseVers === currency
      ? (parseInt(fTr.recu.replace(/[^0-9]/g, ''), 10) || 0)
      : (parseFloat(fTr.recu.replace(',', '.').replace(/[^0-9.]/g, '')) || 0);
    /* UN BOUT PEUT ÊTRE VIDE (apport ou sortie), MAIS PAS LES DEUX : un
       mouvement qui ne part de nulle part et ne va nulle part n'existe pas. */
    if ((!fTr.de && !fTr.vers) || (fTr.de && fTr.de === fTr.vers) || montant <= 0) return;
    if (changeDeDevise && recu <= 0) return;
    const ligne = {
      id: trEdite ?? `trf-${uid()}`, branchId: branch.id, date: fTr.date || todayISO(),
      de: fTr.de, vers: fTr.vers, amountXof: montant,
      recuXof: changeDeDevise ? recu : undefined,
      note: fTr.note.trim() || undefined,
    };
    /* L’IDENTIFIANT NE BOUGE PAS : une correction reste la MÊME écriture,
       corrigée — pas une nouvelle qui remplacerait l’ancienne. */
    setTransferts((prev) => (trEdite
      ? prev.map((x) => (x.id === trEdite ? ligne : x))
      : [...prev, ligne]));
    setTrEdite(null);
    setTrOuvert(false);
    setFTr((f) => ({ ...f, montant: '', recu: '', note: '' }));
  };

  const transfertsDuMois = transferts
    .filter((t) => t.branchId === branch.id && monthKey(t.date) === month)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  if (ecranVerrouille) {
    return <EcranVerrouille titre="Les caisses sont verrouillées." cle={CLE_ECRAN} hash={reglages.codeCaissesHash} />;
  }

  return (
    <div className="mnd-rise">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Finances · les tiroirs de la Maison</Eyebrow>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0', lineHeight: 1 }}>Les caisses.</h2>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="trf-act" style={{ padding: '12px 16px' }} onClick={() => setVerrouOuvert(true)}>
            {reglages.codeCaissesHash ? 'Code de l’écran' : 'Protéger cet écran'}
          </button>
          <button
            className="trf-act"
            style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)', padding: '12px 18px' }}
            onClick={openNewBox}
          >
            + Nouvelle caisse
          </button>
        </div>
      </div>

      <div className="trf-toolbar">
        <MonthNav month={month} onChange={setMonth} />
      </div>

      <div className="trf-obsidian" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="trf-obsidian__eyebrow">Trésorerie disponible · toutes caisses · {isCurrent ? 'à ce jour' : `fin ${monthName}`}</div>
          <div className="trf-obsidian__value">{fmtMoney(tresorerieVisible, currency)}</div>
          {/* LES DEVISES NE S'ADDITIONNENT PAS, ET UN SECRET NE SE DÉDUIT PAS.
              Si la trésorerie sommait tout, il suffirait de retrancher les
              caisses visibles pour lire celle qu'on masque. Les discrètes
              encore fermées en sortent — et on le DIT, car un total amputé
              sans explication vaudrait pire qu'un total complet. */}
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--indigo-100)', marginTop: 6, lineHeight: 1.5 }}>
            Les caisses en devise ne s’y ajoutent pas — deux monnaies ne font pas un total.
            {horsBilan > 0 && (
              <> {horsBilan} caisse{horsBilan > 1 ? 's' : ''} hors bilan {horsBilan > 1 ? 'en sont écartées' : 'en est écartée'}.</>
            )}
            {discretesFermees > 0 && (
              <> {discretesFermees} caisse{discretesFermees > 1 ? 's' : ''} discrète{discretesFermees > 1 ? 's' : ''} en {discretesFermees > 1 ? 'sont exclues' : 'est exclue'} — sinon la soustraction dirait son solde.</>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flex: 'none', flexWrap: 'wrap' }}>
          {/* UNE SEULE CAISSE SUFFIT : on ne transfère pas, mais on peut y
              apporter. Exiger deux tiroirs cachait le geste à qui n'en a qu'un. */}
          {branchBoxes.length > 0 && (
            <button className="trf-act" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)', padding: '12px 16px' }} onClick={() => setTrOuvert(true)}>⇄ Transférer ou apporter</button>
          )}
          {/* LE TROUSSEAU ne se montre que s’il y a des caisses à ouvrir :
              un bouton pour une serrure inexistante encombre. */}
          {branchBoxes.some(caisseDiscrete) && (
            <button className="trf-act" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)', padding: '12px 16px' }} onClick={() => setTrousseau(true)}>Le trousseau</button>
          )}
          <button className="trf-act" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)', padding: '12px 16px' }} onClick={() => setRapport('')}>Rapport PDF</button>
          <button className="trf-act" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)', padding: '12px 16px' }} onClick={() => navigate('/encaissements')}>Les encaissements →</button>
          <button className="trf-act" style={{ background: 'var(--color-copper)', color: 'var(--color-ivoire)', borderColor: 'var(--color-copper)', padding: '12px 16px' }} onClick={() => navigate('/depenses')}>Les dépenses →</button>
        </div>
      </div>

      {branchBoxes.length === 0 ? (
        <div className="trf-empty" style={{ textAlign: 'left', lineHeight: 1.7, padding: 24 }}>
          <b style={{ color: 'var(--color-indigo)', fontWeight: 500 }}>Aucune caisse déclarée.</b><br />
          Une caisse est un tiroir réel : le comptoir, un compte Mobile Money, une enveloppe en
          devise. Tout ce qui entre et tout ce qui sort passe par l’une d’elles — et c’est ce qui
          permet de dire, à tout moment, ce que la Maison a sous la main.
        </div>
      ) : (
        /* ── RANGÉES PAR DEVISE — 22 août 2026 ─────────────────────
           Six tiroirs en trois monnaies se lisaient à la file, mêlés : le
           regard sautait de francs en euros en dollars sans savoir ce qu'il
           additionnait. Chaque monnaie a désormais sa rangée et SON total —
           un total qui a un sens, puisqu'il ne mêle rien.

           LA MAISON D'ABORD, les devises ensuite par ordre alphabétique :
           l'ordre ne dépend pas de ce qu'on a créé en premier. */
        <>
          {(() => {
            /* ── HORS BILAN : SON PROPRE RANGEMENT — 22 août 2026 ────────
               Une caisse écartée du bilan ne se range plus parmi celles qui
               comptent, même en même monnaie. Mêlées, le total de la rangée
               démentait la somme des cartes qu'on lisait juste dessous, et la
               mention sous le nom était le seul indice. Deux blocs : ce qui
               compte, puis ce qui ne compte pas — et son total ne prétend à
               rien. */
            const rangees = (liste: typeof branchBoxes, hors: boolean) => {
            const parDevise = new Map<string, typeof branchBoxes>();
            for (const c of liste) {
              const d = cashboxCurrency(c);
              parDevise.set(d, [...(parDevise.get(d) ?? []), c]);
            }
            const devises = [...parDevise.keys()].sort((a, b) => (
              a === currency ? -1 : b === currency ? 1 : a.localeCompare(b)
            ));
            return devises.map((devise) => {
              const boxes = parDevise.get(devise)!;
              const lisibles = boxes.filter((c) => soldeVisible(c, ouvertes));
              const total = lisibles.reduce((s, c) => s + boxBalance(c.name), 0);
              const tues = boxes.length - lisibles.length;
              return (
                <section key={devise} style={{ marginBottom: hors ? 18 : 26 }}>
                  <div className={`trf-devise${hors ? ' trf-devise--hors' : ''}`}>
                    <span className="trf-devise__code">{devise}</span>
                    <span className="trf-devise__n">
                      {boxes.length} caisse{boxes.length > 1 ? 's' : ''}
                    </span>
                    <span className="trf-devise__total">{fmtIn(total, devise)}</span>
                    {hors && (
                      <span className="trf-devise__note">
                        n’entre dans aucun total de la Maison
                      </span>
                    )}
                    {tues > 0 && (
                      <span className="trf-devise__note">
                        {tues} {tues > 1 ? 'écartées' : 'écartée'} de ce total
                      </span>
                    )}
                  </div>

                  <div className="trf-caisses-grille">
                    {boxes.map((c) => {
                      const visible = soldeVisible(c, ouvertes);
                      const bal = boxBalance(c.name);
                      const boxCur = cashboxCurrency(c);
                      const low = visible && boxCur === currency && bal < 100000;
                      const { inn, out } = boxMonthFlux(c.name);
                      return (
                        <div className={`trf-caisse ${!visible ? 'is-close' : ''}`} key={c.id}>
                          <div className="trf-caisse__tete">
                            <span className="trf-caisse__glyph">{c.glyph}</span>
                            <div style={{ minWidth: 0 }}>
                              <div className="trf-caisse__name">{c.name}</div>
                              <div className="trf-caisse__sub">{c.sub}</div>
                            </div>
                          </div>

                          <button
                            className="trf-caisse__open"
                            onClick={() => (visible ? setBoxDrill(c.name) : demanderLeCode(c, 'voir'))}
                            title={visible ? 'Voir les mouvements de cette caisse' : 'Ouvrir avec le code'}
                          >
                            <div className="trf-caisse__lab">
                              Solde · {isCurrent ? 'à ce jour' : `fin ${monthName}`}
                            </div>
                            {visible ? (
                              <>
                                <div className="trf-caisse__bal" style={{ color: low ? 'var(--trf-warning)' : 'var(--color-indigo)' }}>{fmtIn(bal, boxCur)}</div>
                                <div className="trf-caisse__flux">
                                  <span style={{ color: 'var(--trf-success)' }}>+ {fmtIn(inn, boxCur)}</span>
                                  <span style={{ color: 'var(--color-copper)' }}>− {fmtIn(out, boxCur)}</span>
                                  <span style={{ color: 'var(--ink-soft)' }}>en {monthName}</span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="trf-caisse__bal" style={{ color: 'var(--ink-soft)', letterSpacing: '.12em' }}>••• •••</div>
                                <div className="trf-caisse__flux"><span style={{ color: 'var(--ink-soft)' }}>caisse discrète — cliquer pour l’ouvrir</span></div>
                              </>
                            )}
                          </button>

                          {/* LES GESTES EN PIED, jamais collés au nom : c'est
                              là qu'ils encombraient la lecture. */}
                          <div className="trf-caisse__pied">
                            {caisseDiscrete(c) && (
                              visible
                                ? <button className="trf-caisse__acte" onClick={() => refermeLaCaisse(c.id)}>Refermer</button>
                                : <button className="trf-caisse__acte" onClick={() => demanderLeCode(c, 'voir')}>Ouvrir</button>
                            )}
                            {/* « RETIRER » A QUITTÉ CE PIED — 22 août 2026 :
                                « je peux appuyer le bouton retirer par
                                mégarde ». Un geste sans retour ne voisine pas
                                avec les gestes courants, à un pixel de
                                « Modifier ». Il vit désormais DANS la fiche,
                                qu'il faut ouvrir — et dont le code est exigé
                                si la caisse est discrète.

                                MODIFIER PASSE PAR LE CODE quand la caisse est
                                fermée : la fiche dit le solde d'ouverture, et
                                laisserait ôter le verrou. */}
                            <button className="trf-caisse__acte" onClick={() => (visible ? openEditBox(c) : demanderLeCode(c, 'modifier'))}>Modifier</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            });
            };

            const auBilan = branchBoxes.filter((c) => !c.horsBilan);
            const ecartees = branchBoxes.filter((c) => !!c.horsBilan);
            return (
              <>
                {rangees(auBilan, false)}
                {ecartees.length > 0 && (
                  <section className="trf-hors-bloc">
                    <div className="trf-hors-bloc__tete">
                      <span className="trf-hors-bloc__titre">Hors bilan</span>
                      <span className="trf-hors-bloc__n">
                        {ecartees.length} caisse{ecartees.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="trf-hors-bloc__mot">
                      Leur argent est réel et leurs mouvements se tiennent comme les autres.
                      Elles n’entrent simplement dans aucun total de la Maison — ni la trésorerie,
                      ni les bilans. Chaque monnaie garde sa rangée ici aussi.
                    </div>
                    {rangees(ecartees, true)}
                  </section>
                )}
              </>
            );
          })()}
        </>
      )}

      {transfertsDuMois.length > 0 && (
        <div className="trf-panel" style={{ marginTop: 18 }}>
          <div className="trf-panel__title">Transferts · {monthName}</div>
          {transfertsDuMois.map((t) => (
            /* LA LIGNE MÈNE À SA CORRECTION — 23 août 2026 : c’est ici qu on
               repère une date fausse, il faut donc pouvoir la reprendre. */
            <button
              type="button"
              className="trf-linerow trf-linerow--split"
              key={t.id}
              onClick={() => corrigerLeTransfert(t.id)}
              title="Corriger ce mouvement — date, montant, motif"
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none',
                borderBottom: '1px solid var(--hairline)', font: 'inherit', cursor: 'pointer' }}
            >
              <span>
                {t.de || <i style={{ color: 'var(--ink-soft)' }}>apport</i>}
                {' '}<span className="mnd-muted">→</span>{' '}
                {t.vers || <i style={{ color: 'var(--ink-soft)' }}>sortie hors Maison</i>}
                {t.note ? <span className="mnd-muted"> · {t.note}</span> : null}
              </span>
              {/* CHAQUE BOUT PARLE SA MONNAIE — 22 août 2026. La ligne
                  affichait tout dans la devise de la Maison : 2 000 $ partis
                  d'une caisse en dollars se lisaient « 2 000 F ». Le montant
                  qui SORT se dit dans la devise du tiroir de départ, celui qui
                  ENTRE dans celle du tiroir d'arrivée. */}
              {(() => {
                const cDe = branchBoxes.find((c) => c.name === t.de);
                const cVers = branchBoxes.find((c) => c.name === t.vers);
                const dDe = cDe ? cashboxCurrency(cDe) : currency;
                const dVers = cVers ? cashboxCurrency(cVers) : currency;
                const recu = t.recuXof ?? t.amountXof;
                /* UN TRANSFERT QUI TOUCHE UN COMPTE FERMÉ NE DIT PAS SON
                   MONTANT — 22 août 2026. La liste trahissait ce que la carte
                   masquait : « Caisse Pilia → Caisse Mamou · 500 000 F »
                   révèle d'un coup ce qu'on avait pris soin de cacher. Il faut
                   ouvrir le compte pour lire le mouvement. */
                const secret = [cDe, cVers].some((c) => c && !soldeVisible(c, ouvertes));
                if (secret) {
                  const aOuvrirIci = [cDe, cVers].find((c) => c && !soldeVisible(c, ouvertes))!;
                  return (
                    <button
                      className="trf-rowbtn"
                      style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--ink-soft)', letterSpacing: '.1em' }}
                      title={`Ouvrir « ${aOuvrirIci.name} » pour voir ce montant`}
                      onClick={() => demanderLeCode(aOuvrirIci, 'voir')}
                    >
                      ••• •••
                    </button>
                  );
                }
                return (
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>
                    {fmtIn(t.amountXof, dDe)}
                    {dDe !== dVers || recu !== t.amountXof ? <span className="mnd-muted"> → {fmtIn(recu, dVers)}</span> : null}
                  </span>
                );
              })()}
            </button>
          ))}
        </div>
      )}

      {trousseau && <LeTrousseau boxes={branchBoxes} onClose={() => setTrousseau(false)} />}

      {rapport !== null && (
        <RapportDeCaisse nom={rapport || undefined} month={month} onClose={() => setRapport(null)} />
      )}

      {boxDrill && (
        <ReleveCaisse
          nom={boxDrill}
          month={month}
          onClose={() => setBoxDrill(null)}
          onRapport={() => { setRapport(boxDrill); setBoxDrill(null); }}
          onTransfert={corrigerLeTransfert}
        />
      )}

      {verrouOuvert && (
        <ReglerLeVerrou
          cle={CLE_ECRAN}
          hash={reglages.codeCaissesHash}
          onClose={() => setVerrouOuvert(false)}
          onPose={(h) => settingsStore.set((prev) => ({ ...prev, codeCaissesHash: h }))}
        />
      )}

      {aOuvrir && (
        <Modal title={`Ouvrir « ${aOuvrir.c.name} »`} onClose={() => setAOuvrir(null)} width={400}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              {aOuvrir.puis === 'modifier'
                ? 'La fiche de cette caisse dit son solde d’ouverture et porte son code — il faut donc l’ouvrir avant de la modifier.'
                : aOuvrir.puis === 'retirer'
                  ? 'Retirer une caisse discrète demande son code : sans lui, on pourrait la faire disparaître sans jamais l’avoir ouverte.'
                  : 'Cette caisse est discrète : son solde et son relevé restent fermés jusqu’à son code.'}
              {' '}Elle se refermera d’elle-même au prochain chargement de la page.
            </div>
            <label className="mnd-field">
              <span className="mnd-field__label">Code</span>
              <input
                className="mnd-input" type="password" autoFocus autoComplete="off"
                value={codeSaisi}
                onChange={(e) => { setCodeSaisi(e.target.value); setCodeFaux(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void essayerLeCode(); }}
              />
              {codeFaux && (
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--copper-700)', marginTop: 6, display: 'block' }}>
                  Ce code n’ouvre pas cette caisse.
                </span>
              )}
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={() => setAOuvrir(null)}>Annuler</button>
              <button className="mnd-btn" onClick={() => void essayerLeCode()}>Ouvrir</button>
            </div>
          </div>
        </Modal>
      )}

      {boxOpen && (
        <Modal title={boxEditingId ? 'Modifier la caisse' : 'Nouvelle caisse'} onClose={() => setBoxOpen(false)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label className="mnd-field">
              <span className="mnd-field__label">Nom de la caisse</span>
              <input className="mnd-input" value={boxForm.name} placeholder="Caisse Principale · Tiroir EUR…" onChange={(e) => setBoxForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="mnd-field">
              <span className="mnd-field__label">Ce qu’elle est · facultatif</span>
              <input className="mnd-input" value={boxForm.sub} placeholder="Caisse manuelle · compte Mobile Money…" onChange={(e) => setBoxForm((f) => ({ ...f, sub: e.target.value }))} />
            </label>
            <div>
              <div className="mnd-field__label" style={{ marginBottom: 9 }}>Son signe</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {GLYPHS.map((g) => (
                  <button key={g} type="button" className={`trf-chip ${boxForm.glyph === g ? 'is-active' : ''}`} onClick={() => setBoxForm((f) => ({ ...f, glyph: g }))}>{g}</button>
                ))}
              </div>
            </div>
            <label className="mnd-field">
              <span className="mnd-field__label">Devise tenue</span>
              <select className="mnd-input" value={boxForm.currency} onChange={(e) => setBoxForm((f) => ({ ...f, currency: e.target.value }))}>
                <option value="">{currency} — la devise de la Maison</option>
                {CURRENCIES.filter((c) => c.code !== currency).map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
              <span className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
                Une caisse en devise compte SES billets et n’entre pas dans la trésorerie en {currency}.
              </span>
            </label>
            <label className="mnd-field">
              <span className="mnd-field__label">Solde d’ouverture · {boxForm.currency || currency}</span>
              <input
                className="mnd-input" inputMode="numeric" value={boxForm.opening} placeholder="0"
                onChange={(e) => setBoxForm((f) => ({ ...f, opening: e.target.value.replace(/[^0-9]/g, '') }))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
              <span className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
                Ce qu’elle contenait avant que Le Trône ne la suive. Tout le reste se calcule.
              </span>
            </label>
            <div className="mnd-field">
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={boxForm.horsBilan}
                  onChange={(e) => setBoxForm((f) => ({ ...f, horsBilan: e.target.checked }))}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <b style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 500 }}>Hors bilan</b>
                  <span className="mnd-muted" style={{ fontSize: 10.5, display: 'block', marginTop: 3, lineHeight: 1.55 }}>
                    Cette caisse n’est pas celle de la Maison — une épargne personnelle, un tiroir
                    tenu pour quelqu’un d’autre. Ce qui y entre ne comptera pas dans les revenus,
                    ce qui en sort ne comptera pas dans les dépenses, et son solde restera hors de
                    la trésorerie. L’exclusion sera <b>dite à l’écran</b> partout où elle s’applique.
                  </span>
                </span>
              </label>
            </div>
            <label className="mnd-field">
              <span className="mnd-field__label">Code de discrétion · facultatif</span>
              <input
                className="mnd-input" type="password" autoComplete="new-password"
                value={boxForm.code}
                placeholder={boxForm.codeExistant ? 'Inchangé — saisir pour le remplacer' : 'Laisser vide : caisse ouverte à tous'}
                onChange={(e) => setBoxForm((f) => ({ ...f, code: e.target.value }))}
              />
              <span className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, display: 'block', lineHeight: 1.55 }}>
                Avec un code, le solde reste masqué et le relevé fermé jusqu’à ce qu’on l’ouvre.
                Seule <b>l’empreinte</b> du code est enregistrée — il n’existe en clair nulle part,
                ni en base, ni dans la sauvegarde.
                <br />
                <b style={{ color: 'var(--copper-700)' }}>Ce que cela protège :</b> un regard au comptoir, un écran resté ouvert.
                {' '}<b style={{ color: 'var(--copper-700)' }}>Ce que cela ne protège pas :</b> qui a accès à la base ou au fichier de sauvegarde.
                {boxForm.codeExistant && <><br />Videz ce champ et enregistrez pour <b>garder</b> le code actuel.</>}
              </span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              {boxEditingId
                ? (
                  <button
                    className="mnd-btn mnd-btn--ghost"
                    style={{ color: 'var(--copper-700, #96412E)' }}
                    onClick={() => {
                      const c = branchBoxes.find((b) => b.id === boxEditingId);
                      if (!c) return;
                      setBoxOpen(false);
                      deleteBox(c);
                    }}
                  >
                    Retirer cette caisse
                  </button>
                )
                : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="mnd-btn mnd-btn--ghost" onClick={() => setBoxOpen(false)}>Annuler</button>
                <button className="mnd-btn" onClick={() => void saveBox()}>{boxEditingId ? 'Enregistrer' : 'Créer la caisse'}</button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {trOuvert && (
        <Modal
          title={trEdite ? "Corriger ce mouvement" : "Transférer, apporter, sortir"}
          onClose={() => { setTrOuvert(false); setTrEdite(null); }}
          width={520}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
              L’argent change de tiroir : la caisse de départ baisse, celle d’arrivée monte.
              <b> Rien n’est dépensé, rien n’est encaissé</b> — cela ne paraîtra ni dans vos
              dépenses ni dans vos encaissements.
              <br />
              Laissez le <b>départ</b> vide pour un <b>apport</b> — une mise personnelle, un
              remboursement, une avance : de l’argent qui entre sans être une vente. Laissez
              l’<b>arrivée</b> vide pour une <b>sortie</b> hors Maison.
            </div>
            <div className="tr-cols" style={{ '--cols': '1fr 1fr', gap: 14 } as CSSProperties}>
              <label className="mnd-field">
                <span className="mnd-field__label">D’où il part</span>
                <select className="mnd-input" value={fTr.de} onChange={(e) => setFTr((f) => ({ ...f, de: e.target.value }))}>
                  <option value="">Apport — de l’argent qui entre, hors revenu</option>
                  {branchBoxes.map((c) => <option key={c.id} value={c.name}>{nomEtSolde(c, boxBalance(c.name), ouvertes)}</option>)}
                </select>
              </label>
              <label className="mnd-field">
                <span className="mnd-field__label">Où il arrive</span>
                <select className="mnd-input" value={fTr.vers} onChange={(e) => setFTr((f) => ({ ...f, vers: e.target.value }))}>
                  <option value="">Sortie — de l’argent qui quitte la Maison</option>
                  {branchBoxes.filter((c) => c.name !== fTr.de).map((c) => <option key={c.id} value={c.name}>{nomEtSolde(c, boxBalance(c.name), ouvertes)}</option>)}
                </select>
              </label>
            </div>
            <label className="mnd-field">
              <span className="mnd-field__label">
                {!fTr.de ? `Montant apporté · ${deviseSaisie}` : `Montant qui sort · ${deviseSaisie}`}
              </span>
              <input
                className="mnd-input" inputMode="decimal" value={fTr.montant} placeholder="0"
                onChange={(e) => setFTr((f) => ({ ...f, montant: e.target.value.replace(/[^0-9.,]/g, '') }))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </label>
            {changeDeDevise && (
              <label className="mnd-field">
                <span className="mnd-field__label">Montant réellement reçu · {deviseVers}</span>
                <input
                  className="mnd-input" inputMode="decimal" value={fTr.recu} placeholder="0"
                  onChange={(e) => setFTr((f) => ({ ...f, recu: e.target.value.replace(/[^0-9.,]/g, '') }))}
                  style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
                />
                <span className="mnd-muted" style={{ fontSize: 11, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
                  Les deux caisses ne tiennent pas la même monnaie. Saisissez ce qui entre vraiment —
                  c’est ce chiffre qui fera foi, pas une conversion d’aujourd’hui.
                </span>
              </label>
            )}
            <label className="mnd-field">
              <span className="mnd-field__label">Date</span>
              <input className="mnd-input" type="date" value={fTr.date} onChange={(e) => setFTr((f) => ({ ...f, date: e.target.value }))} />
              {/* LA DATE DU MOUVEMENT RÉEL, PAS CELLE DE LA SAISIE — 23 août
                  2026. Elle propose aujourd’hui, ce qui est juste au comptoir
                  et faux quand on rattrape un mois de retard : quatre apports
                  de mars et mai s’étaient inscrits au 23 août. Le champ le dit
                  maintenant, et la ligne se rouvre pour se corriger. */}
              <span className="mnd-muted" style={{ fontSize: 10.5, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
                Le jour où l’argent a VRAIMENT bougé — pas celui de la saisie. Une écriture
                rattrapée après coup garde sa date d’origine ; c’est elle qui la range dans le
                bon mois, et dans le bon relevé.
              </span>
            </label>
            <label className="mnd-field">
              <span className="mnd-field__label">Motif · facultatif</span>
              <input className="mnd-input" value={fTr.note} placeholder="Ex. approvisionner le comptoir…" onChange={(e) => setFTr((f) => ({ ...f, note: e.target.value }))} />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap' }}>
              {/* EFFACER VIT À GAUCHE, loin d’Enregistrer : un geste sans retour
                  ne voisine pas avec le geste courant. */}
              {trEdite ? (
                <button className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--copper-700)' }} onClick={effacerLeTransfert}>
                  Effacer ce mouvement
                </button>
              ) : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="mnd-btn mnd-btn--ghost" onClick={() => { setTrOuvert(false); setTrEdite(null); }}>Annuler</button>
                <button className="mnd-btn" onClick={enregistrerTransfert}>{trEdite ? 'Enregistrer' : 'Transférer'}</button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
