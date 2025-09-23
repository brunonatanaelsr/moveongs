import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { recordAuditLog } from '../../shared/audit';
import {
  CommentRecord,
  PostRecord,
  PostVisibility,
  countPendingLgpdConsents,
  createComment as insertComment,
  createPost as insertPost,
  deleteComment as removeCommentRow,
  deletePost as removePostRow,
  getCommentById,
  getPostById,
  listBeneficiaryProjects,
  listComments,
  listPosts,
  updatePost as persistPost,
} from './repository';

function ensureValidPublishedAt(publishedAt?: string | null): Date {
  if (!publishedAt) {
    return new Date();
  }

  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Data de publicação inválida', 400);
  }

  return date;
}

async function ensureProjectConsents(projectId: string) {
  const pending = await countPendingLgpdConsents(projectId);
  if (pending > 0) {
    throw new AppError('Existem beneficiárias sem consentimento LGPD ativo para este projeto', 422, {
      pendingConsents: pending,
    });
  }
}

export async function listFeedPosts(params: {
  projectId: string | null;
  allowedProjectIds: string[] | null;
  includeHidden: boolean;
  limit: number;
  offset: number;
  beneficiaryId?: string | null;
}): Promise<PostRecord[]> {
  let allowedProjects = params.allowedProjectIds;

  if (params.beneficiaryId) {
    const beneficiaryProjects = await listBeneficiaryProjects(params.beneficiaryId);

    if (beneficiaryProjects.length === 0) {
      // beneficiary without enrollments sees only institutional posts
      allowedProjects = [];
    } else if (allowedProjects && allowedProjects.length > 0) {
      allowedProjects = allowedProjects.filter((projectId) => beneficiaryProjects.includes(projectId));
    } else {
      allowedProjects = beneficiaryProjects;
    }
  }

  const posts = await listPosts({
    projectId: params.projectId,
    allowedProjectIds: allowedProjects ?? null,
    includeHidden: params.includeHidden,
    limit: params.limit,
    offset: params.offset,
  });

  return posts;
}

export async function getFeedPost(id: string): Promise<{ post: PostRecord; comments: CommentRecord[] }> {
  const post = await getPostById(id);
  if (!post) {
    throw new NotFoundError('Post não encontrado');
  }

  const comments = await listComments(id);
  return { post, comments };
}

export async function createFeedPost(params: {
  authorId: string;
  projectId: string | null;
  title: string | null;
  body: string;
  tags: string[];
  visibility: PostVisibility;
  publishedAt?: string | null;
}): Promise<PostRecord> {
  if (params.projectId) {
    await ensureProjectConsents(params.projectId);
  }

  const publishedAt = ensureValidPublishedAt(params.publishedAt);

  const post = await insertPost({
    authorId: params.authorId,
    projectId: params.projectId,
    title: params.title,
    body: params.body,
    tags: params.tags,
    visibility: params.visibility,
    publishedAt,
  });

  await recordAuditLog({
    userId: params.authorId,
    entity: 'feed_post',
    entityId: post.id,
    action: 'create',
    beforeData: null,
    afterData: post,
  });

  return post;
}

export async function updateFeedPost(id: string, params: {
  projectId?: string | null;
  title?: string | null;
  body?: string | null;
  tags?: string[];
  visibility?: PostVisibility;
  publishedAt?: string | null;
  requestorId: string;
  canModerate: boolean;
}): Promise<PostRecord> {
  const current = await getPostById(id);
  if (!current) {
    throw new NotFoundError('Post não encontrado');
  }

  if (!params.canModerate && current.author.id !== params.requestorId) {
    throw new ForbiddenError('Você não pode editar este post');
  }

  const nextProjectId = params.projectId !== undefined ? params.projectId : current.project?.id ?? null;
  if (nextProjectId) {
    await ensureProjectConsents(nextProjectId);
  }

  const publishedAt = params.publishedAt !== undefined ? ensureValidPublishedAt(params.publishedAt) : undefined;

  const updated = await persistPost(id, {
    projectId: params.projectId,
    title: params.title,
    body: params.body,
    tags: params.tags,
    visibility: params.visibility,
    publishedAt,
  });

  await recordAuditLog({
    userId: params.requestorId,
    entity: 'feed_post',
    entityId: id,
    action: 'update',
    beforeData: current,
    afterData: updated,
  });

  return updated;
}

export async function hideFeedPost(id: string, params: {
  requestorId: string;
}): Promise<PostRecord> {
  const current = await getPostById(id);
  if (!current) {
    throw new NotFoundError('Post não encontrado');
  }

  if (current.visibility === 'hidden') {
    return current;
  }

  const updated = await persistPost(id, {
    visibility: 'hidden',
  });

  await recordAuditLog({
    userId: params.requestorId,
    entity: 'feed_post',
    entityId: id,
    action: 'moderate',
    beforeData: current,
    afterData: updated,
  });

  return updated;
}

export async function deleteFeedPost(id: string, params: {
  requestorId: string;
}): Promise<PostRecord> {
  const current = await getPostById(id);
  if (!current) {
    throw new NotFoundError('Post não encontrado');
  }

  await removePostRow(id);

  await recordAuditLog({
    userId: params.requestorId,
    entity: 'feed_post',
    entityId: id,
    action: 'delete',
    beforeData: current,
    afterData: null,
  });

  return current;
}

export async function createFeedComment(params: {
  postId: string;
  authorId: string;
  body: string;
}): Promise<CommentRecord> {
  const post = await getPostById(params.postId);
  if (!post) {
    throw new NotFoundError('Post não encontrado');
  }

  if (post.visibility === 'hidden') {
    throw new ForbiddenError('Comentários não são permitidos em posts ocultos');
  }

  const comment = await insertComment({
    postId: params.postId,
    authorId: params.authorId,
    body: params.body,
  });

  await recordAuditLog({
    userId: params.authorId,
    entity: 'feed_comment',
    entityId: comment.id,
    action: 'create',
    beforeData: null,
    afterData: comment,
  });

  return comment;
}

export async function deleteFeedComment(id: string, params: {
  requestorId: string;
  canModerate: boolean;
}): Promise<CommentRecord> {
  const comment = await getCommentById(id);
  if (!comment) {
    throw new NotFoundError('Comentário não encontrado');
  }

  if (!params.canModerate && comment.author.id !== params.requestorId) {
    throw new ForbiddenError('Você não pode remover este comentário');
  }

  await removeCommentRow(id);

  await recordAuditLog({
    userId: params.requestorId,
    entity: 'feed_comment',
    entityId: id,
    action: 'delete',
    beforeData: comment,
    afterData: null,
  });

  return comment;
}
