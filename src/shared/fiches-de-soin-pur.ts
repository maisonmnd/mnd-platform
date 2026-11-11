/* LES FICHES DE SOIN D'UNE CLIENTE, 11 novembre 2026. « Ranger les fiches de
   M. G. » (Y.) : un programme à lui remettre, une fiche de l'équipe,
   une fiche des huiles. Des PDF, rangés dans le coffre des pièces des
   clientes (0147, privé), sous `<clientId>/fiches/<nom>.pdf`. Rien n'est
   écrit sur la fiche elle-même : la liste est celle du dossier, une
   synchronisation de la fiche ne peut donc jamais la perdre. Pur. */

/** Le dossier des fiches d'une cliente, dans le coffre. */
export const dossierDesFiches = (clientId: string): string =>
  `${String(clientId ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '') || 'x'}/fiches`;

/** Le nom de fichier que le coffre accepte (lettres sans accent, chiffres,
    espaces et ponctuation simple), tiré du nom choisi. Toujours en `.pdf`. */
export function nomDeLaFiche(nom: string): string {
  const sans = String(nom ?? '').trim().replace(/\.pdf$/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[·•–—]/g, '-')
    .replace(/[^A-Za-z0-9 ()_,.'-]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .slice(0, 120).trim();
  return `${sans || 'Fiche'}.pdf`;
}

/** Ce que la liste affiche d'un fichier du dossier : son titre (sans
    l'extension ni un numéro d'ordre « 1 - »), et à qui il est destiné. */
export function ficheLue(nom: string): { titre: string; pourLaCliente: boolean; interne: boolean } {
  const titre = String(nom ?? '').replace(/\.pdf$/i, '').replace(/^\d+\s*-\s*/, '').trim() || 'Fiche';
  const t = titre.toLowerCase();
  return { titre, pourLaCliente: /a remettre|pour la cliente/.test(t), interne: /\binterne\b/.test(t) };
}

/** Un fichier est une fiche s'il finit en .pdf (le coffre garde aussi un
    marqueur de dossier vide, qu'on ne montre pas). */
export const estUneFiche = (nom: string): boolean => /\.pdf$/i.test(String(nom ?? ''));
