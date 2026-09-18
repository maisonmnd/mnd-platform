/* LA SAUVEGARDE ET « REMPLACER LA MAISON », ÉPROUVÉES — `node scripts/verifie-sauvegarde-maison.mjs`.

   Constaté le 18 septembre 2026 : depuis le cloisonnement des surfaces
   (6 août), le fichier de sauvegarde ne portait plus aucun magasin, et
   « Remplacer la Maison » vidait le serveur puis perdait le fichier au
   rechargement. Ce harnais rejoue le geste entier : photographier, vider,
   recharger, réappliquer. */
import { collectBackup, restoreBackup, applyPendingReplace } from '../src/apps/trone/backup';
import { videLeCacheSaufLesDrapeaux, PENDING_REPLACE_KEY } from '../src/apps/trone/houseReset';
import { purgeDeReprise, RESET_FLAG } from '../src/shared/store';
import { clientsStore } from '../src/shared/clients';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const ls = globalThis.localStorage;
const ids = () => (clientsStore.get() as { id: string }[]).map((c) => c.id).sort();

/* ── Un poste du Trône, tel qu'il est depuis le 6 août ─────────────── */
ls.setItem('trone::mnd_clients', JSON.stringify([{ id: 'c1', name: 'A. B.' }]));
ls.setItem('trone::mnd_settings', JSON.stringify({ devise: 'XOF' }));
ls.setItem('couronne::mnd_mc_notif_dismissed', JSON.stringify(['x']));
ls.setItem('mnd_certificat_signataires', JSON.stringify(['S1', 'S2']));
ls.setItem('mnd_last_backup_at', '2026-09-01T00:00:00Z');

const fichier = collectBackup();
dit('① les clientes partent dans le fichier, sous leur nom logique', [{ id: 'c1', name: 'A. B.' }], fichier.keys.mnd_clients);
dit('② les réglages aussi', { devise: 'XOF' }, fichier.keys.mnd_settings);
dit('③ rien d’une autre surface (Ma Couronne) ne part avec le Trône',
  [], Object.keys(fichier.keys).filter((k) => k.includes('::')));
dit('④ les clés directes restent (signataires des certificats)', ['S1', 'S2'], fichier.keys.mnd_certificat_signataires);

/* ── « Remplacer la Maison » : vider, puis recharger ────────────── */
ls.setItem(PENDING_REPLACE_KEY, JSON.stringify(fichier));
videLeCacheSaufLesDrapeaux();
ls.setItem('mnd_house_blank', '1');
dit('⑤ le fichier en attente survit au vidage', true, ls.getItem(PENDING_REPLACE_KEY) !== null);
dit('⑥ le drapeau de reprise aussi', true, ls.getItem(RESET_FLAG) !== null);
dit('⑦ les magasins, eux, sont bien vidés', [null, null],
  [ls.getItem('trone::mnd_clients'), ls.getItem('couronne::mnd_mc_notif_dismissed')]);

purgeDeReprise(); // ce que fait le rechargement, avant tout le reste
dit('⑧ LE RECHARGEMENT N’EMPORTE PLUS LE FICHIER', true, ls.getItem(PENDING_REPLACE_KEY) !== null);
dit('⑨ ni le mode « Maison à blanc »', '1', ls.getItem('mnd_house_blank'));
dit('⑩ au redémarrage, la Maison est vide', [], ids());

dit('⑪ le fichier s’applique', true, applyPendingReplace());
dit('⑫ les clientes reviennent', ['c1'], ids());
dit('⑬ les réglages reviennent DANS LA CASE DU MAGASIN', { devise: 'XOF' }, JSON.parse(ls.getItem('trone::mnd_settings') ?? 'null'));
dit('⑭ l’état d’un poste ne se réécrit pas depuis un fichier', [null, null],
  [ls.getItem('trone::mnd_last_backup_at'), ls.getItem('trone::mnd_house_blank')]);

/* ── Un fichier d’avant le 6 août se relit encore ────────────────── */
restoreBackup({ format: 'mnd-maison', version: 1, exportedAt: '2026-07-30', keys: { mnd_clients: [{ id: 'c2' }] } });
dit('⑮ un vieux fichier (clés nues) se restaure toujours', ['c1', 'c2'], ids());

/* ── Et le défaut d’avant est bien celui qu’on croit ────────────── */
ls.removeItem(RESET_FLAG); // ce que faisait l'ancienne remise à blanc (elle gardait `mnd_reset_v4`)
purgeDeReprise();
dit('⑯ sans le drapeau, le rechargement emportait le fichier : le défaut d’avant, reproduit',
  null, ls.getItem(PENDING_REPLACE_KEY));

console.log(ko === 0 ? '\nTOUT EST JUSTE.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
