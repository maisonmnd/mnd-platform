import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, useFamilies } from '../../../../shared/clients';
import { useSettings } from '../../../../shared/settings';
import { maisonNom } from '../../../../shared/identite';
import { invoiceResteXof, invoicesStore, quiEncaisse } from '../../../../shared/finance';
import { demandeLePaiement, mndPayOuvert, versionDeMndPay } from '../../../../shared/mnd-pay';
import { jourLocal, paiementTapGoDeLaPiece, parametreTapGo, saitLesFactures } from '../../../../shared/mnd-pay-pur';
import { envoieLeRecu, recuAEnvoyer } from '../../../../shared/recu-whatsapp';
import { envoieLaFactureARegler, envoieLaFactureDuFoyer, envoieLePointDuCompte, MODELE_FACTURE, type ResultatDeLaFacture } from '../../../../shared/facture-whatsapp';
import { cleDuFoyer } from '../../../../shared/facture-du-foyer-pur';
import { cleDuPoint, MODELE_DU_POINT, phraseDuPoint, prenomsDuPoint } from '../../../../shared/point-du-compte-pur';
import { toast } from '../../../../ds/components';
import { pdfDuFoyer, useLaPieceEnPdf } from './pdf-de-la-piece';
import { adresseDuLien, noteLEnvoiDuFoyer, noteLEnvoiDuLien, poseLeLienDeReglement, poseLeLienDuFoyer } from '../../../../shared/regler-la-seance';
import { saitRegler, saitReglerLeFoyer, saitReglerLePoint, versionDuReglement } from '../../../../shared/regler-la-seance-serveur';
import { parametreDuLien } from '../../../../shared/regler-la-seance-pur';

/* ══ LA PIÈCE PART SEULE CHEZ ELLE — 17 octobre 2026 ═════════════════════
   « Cette facture doit aller instantanément chez le client » (Yéman). Deux
   moments, un seul chemin :
     · APRÈS UN RÈGLEMENT (encaisser le rituel) : le reçu, modèle
       `recu_de_paiement`, la facture en pièce jointe ;
     · UNE FACTURE À RÉGLER (honorer sans encaisser, au Carnet, au tableau de
       bord, à l'écran d'encaissement) : modèle `facture_du_rituel` réécrit (le PDF et
       un bouton « Régler »), et tant que Meta ne l'a pas approuvé, le lien de
       paiement `paiement_en_attente` (18 octobre 2026, sa décision).
   Dans les deux cas, LA DATE MÉTIER DÉCIDE : seulement pour l'argent reçu
   aujourd'hui, ou le rituel d'aujourd'hui. Un rattrapage (une année passée,
   un rituel d'hier honoré ce matin) ne réveille pas une cliente avec un
   vieux papier. Et avant le PDF, l'attente Tap & Go du reste (une par
   pièce, quarante-cinq jours, serveur 17-b), pour que le paiement par le QR
   revienne seul sur cette facture et sur son rendez-vous. */
export function useEnvoiDeLaPiece() {
  const { branch, currency } = useBranch();
  const [clients] = useClients();
  const [families] = useFamilies();
  const [settings] = useSettings();
  const { buildPdfData, sousLeVerrou, contenuDeLaLigne } = useLaPieceEnPdf();
  /* Le jour LOCAL (celui du comptoir), jamais celui de Greenwich. */
  const aujourdhui = () => jourLocal(new Date().toISOString());

  const preparer = async (pieceId: string) => {
    const piece = invoicesStore.get().find((i) => i.id === pieceId);
    if (!piece) return null;
    const payeuse = clients.find((c) => c.id === piece.clientId);
    const soignee = clients.find((c) => c.id === (piece.forClientId ?? piece.clientId));
    const destinataire = payeuse?.phone?.trim() ? payeuse : soignee;
    if (!destinataire?.phone?.trim()) { toast(`Facture ${piece.number} non envoyée : pas de numéro sur la fiche.`); return null; }
    const reste = invoiceResteXof(piece);
    if (reste > 0 && mndPayOuvert(settings.mndPay) && paiementTapGoDeLaPiece(reste, settings.mndPay) && saitLesFactures(await versionDeMndPay())) {
      const attente = await demandeLePaiement({
        branchId: branch.id, genre: 'lien', moyen: 'tapgo', montantXof: reste, pieceId: piece.id, pieceNumero: piece.number,
        clientId: destinataire.id, libelle: `${maisonNom()} · ${piece.number}`, reglages: settings.mndPay,
      });
      if (!attente.ok) console.warn('[envoi de la pièce] attente Tap & Go :', attente.erreur);
    }
    return { piece, destinataire };
  };

  const dit = (numero: string, r: ResultatDeLaFacture) => toast(r.ok
    ? (r.enAttente ? `Facture ${numero} gardée : elle partira sur son WhatsApp au retour du réseau.`
      : r.repli === 'lien' ? `Facture ${numero} : le lien de paiement est parti sur son WhatsApp, sans le PDF tant que Meta n’a pas approuvé « ${MODELE_FACTURE} ».`
        : `Facture ${numero} envoyée sur son WhatsApp.`)
    : `Facture ${numero} non envoyée : ${r.erreur}`);

  /** Après un règlement reçu `jourDuPaiement` pour le rituel de `jourDuRituel` :
      seulement l'argent d'aujourd'hui, pour un rituel d'aujourd'hui ou à venir.
      Jamais pour la régularisation d'un rituel passé (18 octobre 2026). */
  const apresReglement = async (pieceId: string, montantXof: number, jourDuPaiement: string, jourDuRituel: string) => {
    if (!recuAEnvoyer({ jourDuPaiement, jourDuRituel, aujourdhui: aujourdhui() }) || !(montantXof > 0)) return;
    const p = await preparer(pieceId);
    if (!p) return;
    const r = await envoieLeRecu({
      client: { ...p.destinataire, branchId: p.destinataire.branchId }, pdf: buildPdfData(p.piece),
      montant: fmtMoney(montantXof, currency), jourIso: jourDuPaiement, parQui: quiEncaisse(),
    });
    dit(p.piece.number, r);
  };

  /** Une facture à régler, pour le rituel de `jourDuRituel` : seulement s'il est d'aujourd'hui,
      sauf le geste exprès « Terminer la séance · envoyer la facture » d'un rendez-vous passé
      (`memePasse`, 26 octobre 2026, sa décision : deux gestes séparés, « Honorer sans
      prévenir » garde le rattrapage silencieux). `renvoi` : le bouton « Envoyer la facture
      sur son WhatsApp » d'un rituel déjà honoré la renvoie, même déjà partie (une clé
      d'unicité à la minute : un double toucher n'envoie qu'une fois). */
  const aRegler = async (pieceId: string, jourDuRituel: string, o?: { memePasse?: boolean; renvoi?: boolean }) => {
    if (!o?.memePasse && jourDuRituel !== aujourdhui()) return;
    const p = await preparer(pieceId);
    if (!p) return;
    /* Le même Tap & Go que le pied du PDF : le reste, frais ajoutés. */
    const reste = invoiceResteXof(p.piece);
    const tg = paiementTapGoDeLaPiece(reste, settings.mndPay);
    const tapgo = tg ? { parametre: parametreTapGo(tg.totalXof, settings.mndPay), lien: tg.qr, totalDit: fmtMoney(tg.totalXof, currency) } : undefined;
    /* RÉGLER SA SÉANCE (25 octobre 2026, « Terminer la séance ») : quand la
       fonction répond, le bouton « Régler » mène à la page de sa séance
       (KkiaPay, et Tap & Go à côté) au lieu du seul numéro à composer. Le
       modèle reste `facture_du_rituel`, déjà approuvé : seul son paramètre
       change. Sans la fonction, rien ne change. */
    const jeton = p.piece.apptId && saitRegler(await versionDuReglement())
      ? poseLeLienDeReglement(p.piece.apptId, tapgo ? { resteXof: reste, parametre: tapgo.parametre, totalXof: tg!.totalXof } : undefined)
      : null;
    const lien = jeton ? { parametre: parametreDuLien(jeton), lien: adresseDuLien(jeton), totalDit: fmtMoney(reste, currency) } : undefined;
    const r = await envoieLaFactureARegler({
      client: { ...p.destinataire, branchId: p.destinataire.branchId }, pdf: buildPdfData(p.piece),
      resteDit: fmtMoney(reste, currency), jourIso: jourDuRituel, parQui: quiEncaisse(),
      cle: o?.renvoi ? `${p.piece.id}-${new Date().toISOString().slice(0, 16)}` : p.piece.id,
      tapgo: lien ?? tapgo, enLigne: !!lien,
    });
    if (r.ok && jeton && p.piece.apptId) noteLEnvoiDuLien(p.piece.apptId);
    dit(p.piece.number, r);
  };

  /** LA FACTURE DU FOYER — 27 octobre 2026 (« la facture de N. et de son
      frère A. en un message, avec le total »). Les pièces de la journée qui
      doivent encore, en un PDF et un message ; chaque enfant garde sa
      facture. Une seule pièce à régler : elle part seule, comme avant. Le
      geste est exprès (un bouton), donc il part même pour une journée
      passée ; la clé (un jour, un numéro) en empêche un second envoi.
      `renvoi` : le bouton d'après coup la renvoie, même déjà partie (clé à
      la minute, comme la facture seule). */
  const foyer = async (pieceIds: readonly string[], jourDuRituel: string, o?: { renvoi?: boolean }) => {
    const toutes = invoicesStore.get();
    const ouvertes = pieceIds
      .map((id) => toutes.find((i) => i.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p && p.kind === 'facture' && invoiceResteXof(p) > 0);
    if (ouvertes.length === 0) { toast('Rien à régler pour ce foyer : aucune facture n’est partie.'); return; }
    if (ouvertes.length === 1) { await aRegler(ouvertes[0].id, jourDuRituel, { memePasse: true, renvoi: o?.renvoi }); return; }
    /* À qui : le parent qui paie la première pièce, sinon la tête soignée (la règle de la facture). */
    const p0 = ouvertes[0];
    const payeuse = clients.find((c) => c.id === p0.clientId);
    const soignee = clients.find((c) => c.id === (p0.forClientId ?? p0.clientId));
    const destinataire = payeuse?.phone?.trim() ? payeuse : soignee;
    if (!destinataire?.phone?.trim()) { toast('Facture du foyer non envoyée : pas de numéro sur la fiche.'); return; }
    const prenomDe = (p: typeof p0) => {
      const tete = clients.find((c) => c.id === (p.forClientId ?? p.clientId));
      return (tete?.name ?? 'Une tête').split(' ')[0];
    };
    const totalXof = ouvertes.reduce((n, p) => n + invoiceResteXof(p), 0);
    const tg = paiementTapGoDeLaPiece(totalXof, settings.mndPay);
    const tapgo = tg ? { parametre: parametreTapGo(tg.totalXof, settings.mndPay), lien: tg.qr, totalDit: fmtMoney(tg.totalXof, currency) } : undefined;
    /* LE BOUTON MÈNE À « RÉGLER » (28 octobre 2026, « le bouton lien de
       paiement doit mener au bouton Régler pour passer par KkiaPay ») : quand
       la fonction sait le foyer et que chaque pièce a son rendez-vous, un seul
       lien règle tout, pièce par pièce. Sinon, le Tap & Go comme avant. */
    const rdvs = ouvertes.map((p) => p.apptId ?? '');
    const jetonDuFoyer = rdvs.every(Boolean) && saitReglerLeFoyer(await versionDuReglement()) ? poseLeLienDuFoyer(rdvs) : null;
    const parRegler = jetonDuFoyer ? { parametre: parametreDuLien(jetonDuFoyer), lien: adresseDuLien(jetonDuFoyer), totalDit: fmtMoney(totalXof, currency) } : undefined;
    const lignes = ouvertes.map((p) => ({ prenom: prenomDe(p), resteDit: fmtMoney(invoiceResteXof(p), currency) }));
    /* LE PAPIER : un relevé titré « FACTURE DU FOYER » sur le papier des
       factures (`pdfDuFoyer`, le même que le récapitulatif) : une ligne par
       facture (le PDF, lui, peut porter les numéros), le total, et de quoi payer. */
    const pdf = pdfDuFoyer({
      titre: 'FACTURE DU FOYER',
      nomDuFichier: 'Facture-du-foyer',
      pieces: ouvertes,
      jourIso: jourDuRituel,
      client: destinataire,
      houseSub: sousLeVerrou,
      nomDe: (p) => clients.find((c) => c.id === (p.forClientId ?? p.clientId))?.name ?? p.clientName ?? prenomDe(p),
      fmt: (n) => fmtMoney(n, currency),
      reglages: settings.mndPay,
      note: `${ouvertes.length} factures de la journée, réunies en une. Chacune reste au nom de celle ou celui qu'elle concerne.`,
    });
    const r = await envoieLaFactureDuFoyer({
      client: { ...destinataire, branchId: destinataire.branchId }, pdf, lignes,
      totalDit: fmtMoney(totalXof, currency), jourIso: jourDuRituel, tapgo: parRegler ?? tapgo, enLigne: !!parRegler,
      cle: `${cleDuFoyer(jourDuRituel, destinataire.phone)}${o?.renvoi ? `-${new Date().toISOString().slice(0, 16)}` : ''}`,
      parQui: quiEncaisse(),
    });
    if (r.ok && jetonDuFoyer) noteLEnvoiDuFoyer(rdvs);
    toast(r.ok
      ? (r.enAttente ? 'Facture du foyer gardée : elle partira sur son WhatsApp au retour du réseau.'
        : r.repli === 'lien' ? `Facture du foyer : le lien de paiement est parti sur son WhatsApp, sans le PDF tant que Meta n’a pas approuvé « ${MODELE_FACTURE} ».`
          : `Facture du foyer envoyée sur son WhatsApp : ${ouvertes.length} factures, ${fmtMoney(totalXof, currency)}.`)
      : `Facture du foyer non envoyée : ${r.erreur}`);
  };

  /** LE POINT DU COMPTE — 28 octobre 2026 (point-du-compte-pur.ts) : toutes
      les factures qu'un payeur laisse courir, en un PDF et un message, au
      payeur d'aujourd'hui du compte. Une seule facture : elle part seule,
      comme avant. Le lien mène à « Régler » quand chaque facture a son
      rendez-vous et que la fonction sait les montrer (un seul jour : celle du
      foyer ; plusieurs jours : 2026-10-28-b, chaque ligne avec son jour) ;
      sinon le Tap & Go du total, qui se pointe à la main. `renvoi` : la clé
      à la minute, pour renvoyer un point déjà parti aujourd'hui. */
  const point = async (payeurId: string, pieceIds: readonly string[], o?: { renvoi?: boolean }): Promise<ResultatDeLaFacture | null> => {
    const toutes = invoicesStore.get();
    const ouvertes = pieceIds
      .map((id) => toutes.find((i) => i.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p && p.kind === 'facture' && invoiceResteXof(p) > 0)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    if (ouvertes.length === 0) { toast('Rien à régler : le point n’est pas parti.'); return null; }
    if (ouvertes.length === 1) { await aRegler(ouvertes[0].id, ouvertes[0].date, { memePasse: true, renvoi: o?.renvoi }); return null; }
    const payeur = clients.find((c) => c.id === payeurId);
    if (!payeur?.phone?.trim()) { toast('Point non envoyé : le payeur du compte n’a pas de numéro sur sa fiche.'); return null; }
    const jour = aujourdhui();
    const totalXof = ouvertes.reduce((n, p) => n + invoiceResteXof(p), 0);
    const tg = paiementTapGoDeLaPiece(totalXof, settings.mndPay);
    const tapgo = tg ? { parametre: parametreTapGo(tg.totalXof, settings.mndPay), lien: tg.qr, totalDit: fmtMoney(tg.totalXof, currency) } : undefined;
    const rdvs = ouvertes.map((p) => p.apptId ?? '');
    const unSeulJour = new Set(ouvertes.map((p) => p.date)).size === 1;
    const version = rdvs.every(Boolean) ? await versionDuReglement() : '';
    const jeton = rdvs.every(Boolean) && (unSeulJour ? saitReglerLeFoyer(version) : saitReglerLePoint(version)) ? poseLeLienDuFoyer(rdvs) : null;
    const parRegler = jeton ? { parametre: parametreDuLien(jeton), lien: adresseDuLien(jeton), totalDit: fmtMoney(totalXof, currency) } : undefined;
    const famille = families.find((f) => f.payerClientId === payeur.id) ?? families.find((f) => f.id === payeur.familyId);
    const phrase = phraseDuPoint(ouvertes);
    const pdf = pdfDuFoyer({
      titre: 'POINT DU COMPTE',
      nomDuFichier: 'Point-du-compte',
      pieces: ouvertes,
      jourIso: jour,
      client: { name: famille?.name ?? payeur.name, phone: payeur.phone },
      houseSub: sousLeVerrou,
      nomDe: (p) => clients.find((c) => c.id === (p.forClientId ?? p.clientId))?.name ?? p.clientName ?? 'Une tête',
      contenuDe: contenuDeLaLigne,
      fmt: (n) => fmtMoney(n, currency),
      reglages: settings.mndPay,
      note: `${phrase}. Ce point ne réclame rien de plus que les factures qu’il résume.`,
    });
    const r = await envoieLePointDuCompte({
      client: { ...payeur, branchId: payeur.branchId }, pdf,
      prenoms: prenomsDuPoint(ouvertes, clients),
      payeurParmiLesTetes: ouvertes.some((p) => (p.forClientId ?? p.clientId) === payeur.id),
      phrase, totalDit: fmtMoney(totalXof, currency), jourIso: jour, tapgo: parRegler ?? tapgo, enLigne: !!parRegler,
      cle: `${cleDuPoint(jour, payeur.phone)}${o?.renvoi ? `-${new Date().toISOString().slice(0, 16)}` : ''}`,
      parQui: quiEncaisse(),
    });
    if (r.ok && jeton) noteLEnvoiDuFoyer(rdvs);
    toast(r.ok
      ? (r.enAttente ? 'Point du compte gardé : il partira sur son WhatsApp au retour du réseau.'
        : r.repli === 'lien' ? `Point du compte : le lien de paiement est parti sur son WhatsApp, sans le PDF tant que Meta n’a pas approuvé « ${MODELE_DU_POINT} ».`
          : `Point du compte envoyé sur son WhatsApp : ${ouvertes.length} factures, ${fmtMoney(totalXof, currency)}.`)
      : `Point du compte non envoyé : ${r.erreur}`);
    return r;
  };

  return { apresReglement, aRegler, foyer, point };
}
