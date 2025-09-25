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
  type RetentionClassification,
  type ThreadRecord,
  type ThreadVisibility,
} from './repository';

const DEFAULT_THREAD_VISIBILITY: ThreadVisibility = 'internal';
const DEFAULT_MESSAGE_VISIBILITY: MessageVisibility = 'internal';
const DEFAULT_CLASSIFICATION: RetentionClassification = 'publico_interno';
const CONFIDENTIAL_ROLES = new Set(['admin', 'coordenacao', 'tecnica']);

function normalizeSearchTerms(terms?: string[] | null): string[] {
  if (!terms) {
    return [];
  }

  return Array.from(
    new Set(
      terms
        .map((term) => term.trim())
        .filter((term) => term.length > 0 && term.length <= 200),
    ),
  ).slice(0, 25);
}

function normalizeIds(ids?: string[] | null): string[] {
  if (!ids) {
    return [];
  }

  return Array.from(new Set(ids));
}

function canHandleConfidential(params: { roles: string[]; permissions: string[] }): boolean {
  if (params.permissions.includes('activities:moderate')) {
    return true;
  }

  return params.roles.some((role) => CONFIDENTIAL_ROLES.has(role));
}

export async function listThreads(params: {
  userId: string;
  scope?: string;
  search?: string;
  classifications?: RetentionClassification[];
}): Promise<ThreadRecord[]> {
  return fetchThreads({
    userId: params.userId,
    scope: params.scope,
    search: params.search,
    classifications: params.classifications,
  });
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
  classification?: RetentionClassification;
  retentionExpiresAt?: string | null;
  searchTerms?: string[];
  memberIds: string[];
  initialMessage?: {
    body: string;
    visibility?: MessageVisibility;
    isConfidential?: boolean;
    classification?: RetentionClassification;
    retentionExpiresAt?: string | null;
    mentions?: string[];
    attachments?: string[];
    searchTerms?: string[];
  };
  roles: string[];
  permissions: string[];
}): Promise<{ thread: ThreadRecord; messages: MessageRecord[] }> {
  const threadClassification = params.classification ?? DEFAULT_CLASSIFICATION;
  const threadRetention = params.retentionExpiresAt ?? null;
  const threadSearchTerms = normalizeSearchTerms(params.searchTerms);

  const initialMentions = normalizeIds(params.initialMessage?.mentions);

  await ensureUsersExist([...params.memberIds, params.userId, ...initialMentions]);

  const visibility = params.visibility ?? DEFAULT_THREAD_VISIBILITY;
  const canConfidential = params.initialMessage
    ? canHandleConfidential({ roles: params.roles, permissions: params.permissions })
    : false;

  const initialClassification = params.initialMessage?.classification ?? threadClassification;
  const initialRetention = params.initialMessage?.retentionExpiresAt ?? threadRetention;
  const initialSearchTerms = normalizeSearchTerms(params.initialMessage?.searchTerms);
  const initialAttachments = normalizeIds(params.initialMessage?.attachments);

  const initialIsConfidential =
    params.initialMessage?.isConfidential ?? initialClassification === 'confidencial';

  if (initialIsConfidential && !canConfidential) {
    throw new ForbiddenError('Você não pode criar mensagens confidenciais');
  }

  const threadId = await insertThread({
    scope: params.scope,
    subject: params.subject,
    visibility,
    classification: threadClassification,
    retentionExpiresAt: threadRetention,
    searchTerms: threadSearchTerms,
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
      isConfidential: Boolean(initialIsConfidential),
      classification: initialClassification,
      retentionExpiresAt: initialRetention,
      mentions: initialMentions,
      attachments: initialAttachments,
      searchTerms: initialSearchTerms,
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
  classification?: RetentionClassification;
  retentionExpiresAt?: string | null;
  mentions?: string[];
  attachments?: string[];
  searchTerms?: string[];
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

  const mentions = normalizeIds(params.mentions);
  if (mentions.length > 0) {
    await ensureUsersExist(mentions);
  }

  const canConfidential = canHandleConfidential({ roles: params.roles, permissions: params.permissions });
  const classification = params.classification ?? thread.classification ?? DEFAULT_CLASSIFICATION;
  const isConfidential = Boolean(params.isConfidential ?? classification === 'confidencial');
  if (isConfidential && !canConfidential) {
    throw new ForbiddenError('Você não pode criar mensagens confidenciais');
  }

  const message = await insertMessage({
    threadId: params.threadId,
    authorId: params.authorId,
    body: params.body,
    visibility: params.visibility ?? thread.visibility ?? DEFAULT_MESSAGE_VISIBILITY,
    isConfidential,
    classification,
    retentionExpiresAt: params.retentionExpiresAt ?? thread.retentionExpiresAt ?? null,
    mentions,
    attachments: normalizeIds(params.attachments),
    searchTerms: normalizeSearchTerms(params.searchTerms),
  });

  return message;
}

export function userCanViewConfidential(roles: string[], permissions: string[]): boolean {
  return canHandleConfidential({ roles, permissions });
}
