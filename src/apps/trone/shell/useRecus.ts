import { useMemo } from 'react';
import { useBranch } from '../../../shared/branches';
import {
  automatesDesFils, estArchive, filsDeLaMaison, tetesDeLaMaison, useFilsArchives, useFilsAutomate, useFilsPrives, useMessagesWa,
} from '../../../shared/conversations';
import { reglageDeLAutomate } from '../../../shared/automate-wa';
import { useDiscussions } from '../../../shared/discussions';
import { useDemandes } from '../../../shared/demandes';
import { useAppelsWa } from '../../../shared/appels-wa';
import { useAppels } from '../../../shared/appels';
import { useSignalements } from '../../../shared/entre-deux';
import { useFamilies } from '../../../shared/clients';
import { boitesDeLaMaison, type EnvoiDeLaBoite } from '../../../shared/boite-unique-pur';
import { useRiensARepondre } from '../../../shared/rien-a-repondre';
import { useTriDesMessages } from '../../../shared/tri-des-messages';
import { useConversationsLues } from '../../../shared/conversations-lues';
import { recusDesBoites, type Recu } from '../../../shared/recus-pur';
import { useAutoConfig, useEnvois } from '../routes/equipe/data';
import { useBranchClients } from '../routes/clients/_shared';

/* ══ LES REÇUS, DEPUIS TOUS LES ÉCRANS · 6 novembre 2026 ═══════════════════
   « Je ne remarque jamais quand j'ai de nouveaux messages qui arrivent dans
   la conversation » (Yéman). Le compte des conversations reçues doit se voir
   SANS être sur l'écran des Conversations : sur l'entrée « Conversations »
   de la barre, dans le titre de l'onglet du navigateur, dans la pastille de
   la barre du haut. Ce crochet assemble les MÊMES boîtes que l'écran
   (`boitesDeLaMaison`, mêmes entrées, mêmes clés : c'est par la clé que la
   marque « lu » se partage) et laisse `recus-pur` juger. Il ne sonne pas :
   la seule sonnerie est celle des Conversations. */

export function useRecus(): Recu[] {
  const { branch } = useBranch();
  const clients = useBranchClients();
  const [messages] = useMessagesWa();
  const [prives] = useFilsPrives();
  const [archives] = useFilsArchives();
  const [lignesDeLAutomate] = useFilsAutomate();
  const [cfg] = useAutoConfig();
  const { discussions } = useDiscussions();
  const [demandes] = useDemandes();
  const [appelsWa] = useAppelsWa();
  const [appels] = useAppels();
  const signalementsTous = useSignalements();
  const [envois] = useEnvois();
  const [familles] = useFamilies();
  const [riens] = useRiensARepondre();
  const { tri } = useTriDesMessages();
  const [lues] = useConversationsLues();

  const signalements = useMemo(() => signalementsTous.filter((s) => !s.branchId || s.branchId === branch.id), [signalementsTous, branch.id]);
  const tetes = useMemo(() => tetesDeLaMaison({ clientes: clients, familles }), [clients, familles]);
  const automates = useMemo(() => automatesDesFils(lignesDeLAutomate, reglageDeLAutomate(cfg.automateWa).pauseHeures), [lignesDeLAutomate, cfg.automateWa]);
  /* L'heure ne change pas ce qui est reçu : on la lit au moment du calcul, elle n'est pas une dépendance. */
  const fils = useMemo(() => {
    const tous = filsDeLaMaison(messages, tetes, prives, Date.now(), branch.id, automates);
    return tous.filter((f) => f.tiroir === 'clientes' && !estArchive(f, archives) && !f.prive);
  }, [messages, tetes, prives, branch.id, automates, archives]);
  const boites = useMemo(() => boitesDeLaMaison({
    fils, discussions, demandes, appelsWa, appels, signalements, envois: envois as unknown as EnvoiDeLaBoite[], clientes: clients, familles,
    maintenant: Date.now(), branchId: branch.id, tiroirs: ['clientes'], riensARepondre: riens, tri,
  }), [fils, discussions, demandes, appelsWa, appels, signalements, envois, clients, familles, branch.id, riens, tri]);
  return useMemo(() => recusDesBoites(boites, lues), [boites, lues]);
}
