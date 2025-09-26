'use client';

import { MessageCenter } from '../../components/MessageCenter';
import { PrimarySidebar } from '../../components/PrimarySidebar';
import { Shell } from '../../components/Shell';
import { LoadingState } from '../../components/LoadingState';
import { useRequirePermission } from '../../hooks/useRequirePermission';

export default function MessagesPage() {
  const session = useRequirePermission(['messages:read', 'messages:send']);

  if (session === undefined) {
    return <LoadingState message="Verificando sessão..." />;
  }

  if (!session) {
    return <LoadingState message="Carregando..." />;
  }

  return (
    <Shell
      title="Centro de mensagens internas"
      description="Troque informações operacionais com a equipe, registre orientações por beneficiária e acompanhe avisos institucionais."
      sidebar={<PrimarySidebar session={session} />}
    >
      <MessageCenter />
    </Shell>
  );
}
