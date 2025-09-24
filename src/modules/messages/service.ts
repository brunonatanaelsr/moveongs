import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors';
import {
  createMessage as insertMessage,
  createThread as insertThread,
  ensureUsersExist,
  getThreadById,
  isThreadMember,
  listMessages as fetchMessages,
  listThreadsForUser as fetchThreads,
  type MessageRecord,
  type MessageVisibility,
  type ThreadRecord,
  type ThreadVisibility,
} from './repository';

const DEFAULT_THREAD_VISIBILITY: ThreadVisibility = 'internal';
const DEFAULT_MESSAGE_VISIBILITY: MessageVisibility = 'internal';
const CONFIDENTIAL_ROLES = new Set(['admin', 'coordenacao', 'tecnica']);

function canHandleConfidential(params: { roles: string[]; permissions: string[] }): boolean {
  if (params.permissions.includes('activities:moderate')) {
    return true;
  }

  return params.roles.some((role) => CONFIDENTIAL_ROLES.has(role));
}

export async function listThreads(params: {
  userId: string;
  scope?: string;
}): Promise<ThreadRecord[]> {
  return fetchThreads(params.userId, params.scope);
}

export async function getThreadWithMessages(params: {
  threadId: string;
  userId: string;
  canViewConfidential: boolean;
}): Promise<{ thread: ThreadRecord; messages: MessageRecord[] }> {
  const thread = await getThreadById(params.threadId);
  if (!thread) {
    throw new NotFoundError('Thread não encontrada');
  }

  const isMember = await isThreadMember(params.threadId, params.userId);
  if (!isMember) {
    throw new ForbiddenError('Você não participa desta conversa');
  }

  const messages = await fetchMessages(params.threadId);
  const filtered = params.canViewConfidential
    ? messages
    : messages.filter((message) => !message.isConfidential || message.author.id === params.userId);

  return { thread, messages: filtered };
}

export async function createThread(params: {
  userId: string;
  scope: string;
  subject: string | null;
  visibility?: ThreadVisibility;
  memberIds: string[];
  initialMessage?: {
    body: string;
    visibility?: MessageVisibility;
    isConfidential?: boolean;
  };
  roles: string[];
  permissions: string[];
}): Promise<{ thread: ThreadRecord; messages: MessageRecord[] }> {
  await ensureUsersExist([...params.memberIds, params.userId]);

  const visibility = params.visibility ?? DEFAULT_THREAD_VISIBILITY;
  const canConfidential = params.initialMessage
    ? canHandleConfidential({ roles: params.roles, permissions: params.permissions })
    : false;

  if (params.initialMessage?.isConfidential && !canConfidential) {
    throw new ForbiddenError('Você não pode criar mensagens confidenciais');
  }

  const threadId = await insertThread({
    scope: params.scope,
    subject: params.subject,
    visibility,
    createdBy: params.userId,
    memberIds: params.memberIds.filter((id) => id !== params.userId),
  });

  let messages: MessageRecord[] = [];

  if (params.initialMessage) {
    const message = await insertMessage({
      threadId,
      authorId: params.userId,
      body: params.initialMessage.body,
      visibility: params.initialMessage.visibility ?? DEFAULT_MESSAGE_VISIBILITY,
      isConfidential: Boolean(params.initialMessage.isConfidential),
    });

    messages = [message];
  }

  const thread = await getThreadById(threadId);
  if (!thread) {
    throw new AppError('Falha ao carregar thread recém-criada', 500);
  }

  return { thread, messages };
}

export async function postMessage(params: {
  threadId: string;
  authorId: string;
  body: string;
  visibility?: MessageVisibility;
  isConfidential?: boolean;
  roles: string[];
  permissions: string[];
}): Promise<MessageRecord> {
  const thread = await getThreadById(params.threadId);
  if (!thread) {
    throw new NotFoundError('Thread não encontrada');
  }

  const isMember = await isThreadMember(params.threadId, params.authorId);
  if (!isMember) {
    throw new ForbiddenError('Você não participa desta conversa');
  }

  const canConfidential = canHandleConfidential({ roles: params.roles, permissions: params.permissions });
  const isConfidential = Boolean(params.isConfidential);
  if (isConfidential && !canConfidential) {
    throw new ForbiddenError('Você não pode criar mensagens confidenciais');
  }

  const message = await insertMessage({
    threadId: params.threadId,
    authorId: params.authorId,
    body: params.body,
    visibility: params.visibility ?? thread.visibility ?? DEFAULT_MESSAGE_VISIBILITY,
    isConfidential,
  });

  return message;
}

export function userCanViewConfidential(roles: string[], permissions: string[]): boolean {
  return canHandleConfidential({ roles, permissions });
}
