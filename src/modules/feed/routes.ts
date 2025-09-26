import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../shared/errors';
import {
  createFeedComment,
  createFeedReaction,
  createFeedPost,
  deleteFeedComment,
  deleteFeedReaction,
  deleteFeedPost,
  getFeedPost,
  listFeedPostReactions,
  hideFeedPost,
  listFeedPosts,
  updateFeedPost,
} from './service';
import {
  commentIdParamSchema,
  createCommentBodySchema,
  createReactionBodySchema,
  createPostBodySchema,
  listPostsQuerySchema,
  postIdParamSchema,
  postReactionParamsSchema,
  updatePostBodySchema,
} from './schemas';
import { ensureProjectScope, hasPermission, shouldIncludeHidden } from './utils';

const READ_REQUIREMENTS = { permissions: ['activities:read'] } as const;
const CREATE_REQUIREMENTS = { permissions: ['activities:create', 'activities:moderate'], strategy: 'any' as const };
const MODERATE_REQUIREMENTS = { permissions: ['activities:moderate'] } as const;

export const feedRoutes: FastifyPluginAsync = async (app) => {
  app.get('/feed/posts', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const parsed = listPostsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError('Consulta inválida', 400, parsed.error.flatten());
    }

    if (parsed.data.projectId) {
      ensureProjectScope(request, parsed.data.projectId);
    }

    const includeHidden = shouldIncludeHidden(request, parsed.data.includeHidden);
    const { posts, onlyInstitutional } = await listFeedPosts({
      projectId: parsed.data.projectId ?? null,
      allowedProjectIds: request.user.projectScopes?.length ? request.user.projectScopes : null,
      includeHidden,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      beneficiaryId: parsed.data.beneficiaryId ?? null,
    });

    return { data: posts, onlyInstitutional };
  });

  app.get('/feed/posts/:id', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const params = postIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Parâmetros inválidos', 400, params.error.flatten());
    }

    const { post, comments } = await getFeedPost(params.data.id);

    if (post.project?.id) {
      ensureProjectScope(request, post.project.id);
    }

    if (post.visibility === 'hidden' && !hasPermission(request, 'activities:moderate') && post.author.id !== request.user.sub) {
      throw new AppError('Post não disponível', 404);
    }

    return { post, comments };
  });

  app.get('/feed/posts/:id/reactions', {
    preHandler: [app.authenticate, app.authorize(READ_REQUIREMENTS)],
  }, async (request) => {
    const params = postIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Parâmetros inválidos', 400, params.error.flatten());
    }

    const { post, reactions } = await listFeedPostReactions(params.data.id);

    if (post.project?.id) {
      ensureProjectScope(request, post.project.id);
    }

    if (post.visibility === 'hidden' && !hasPermission(request, 'activities:moderate') && post.author.id !== request.user.sub) {
      throw new AppError('Post não disponível', 404);
    }

    return { reactions };
  });

  app.post('/feed/posts', {
    preHandler: [app.authenticate, app.authorize(CREATE_REQUIREMENTS)],
  }, async (request, reply) => {
    const body = createPostBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError('Dados inválidos', 400, body.error.flatten());
    }

    if (body.data.projectId) {
      ensureProjectScope(request, body.data.projectId);
    }

    const post = await createFeedPost({
      authorId: request.user.sub,
      projectId: body.data.projectId ?? null,
      title: body.data.title ?? null,
      body: body.data.body,
      tags: body.data.tags ?? [],
      visibility: body.data.visibility ?? (body.data.projectId ? 'project' : 'internal'),
      publishedAt: body.data.publishedAt ?? null,
    });

    return reply.code(201).send({ post });
  });

  app.patch('/feed/posts/:id', {
    preHandler: [app.authenticate, app.authorize(CREATE_REQUIREMENTS)],
  }, async (request) => {
    const params = postIdParamSchema.safeParse(request.params);
    const body = updatePostBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      throw new AppError('Requisição inválida', 400, {
        params: params.success ? undefined : params.error.flatten(),
        body: body.success ? undefined : body.error.flatten(),
      });
    }

    if (body.data.projectId !== undefined && body.data.projectId !== null) {
      ensureProjectScope(request, body.data.projectId);
    }

    const canModerate = hasPermission(request, 'activities:moderate');

    const post = await updateFeedPost(params.data.id, {
      ...body.data,
      requestorId: request.user.sub,
      canModerate,
    });

    return { post };
  });

  app.delete('/feed/posts/:id', {
    preHandler: [app.authenticate, app.authorize(MODERATE_REQUIREMENTS)],
  }, async (request) => {
    const params = postIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Parâmetros inválidos', 400, params.error.flatten());
    }

    const post = await hideFeedPost(params.data.id, { requestorId: request.user.sub });
    return { post };
  });

  app.delete('/feed/posts/:id/permanent', {
    preHandler: [app.authenticate, app.authorize(MODERATE_REQUIREMENTS)],
  }, async (request) => {
    const params = postIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Parâmetros inválidos', 400, params.error.flatten());
    }

    const post = await deleteFeedPost(params.data.id, { requestorId: request.user.sub });
    return { post };
  });

  app.post('/feed/posts/:id/reactions', {
    preHandler: [app.authenticate, app.authorize(CREATE_REQUIREMENTS)],
  }, async (request, reply) => {
    const params = postIdParamSchema.safeParse(request.params);
    const body = createReactionBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      throw new AppError('Requisição inválida', 400, {
        params: params.success ? undefined : params.error.flatten(),
        body: body.success ? undefined : body.error.flatten(),
      });
    }

    const { post } = await getFeedPost(params.data.id);

    if (post.project?.id) {
      ensureProjectScope(request, post.project.id);
    }

    if (post.visibility === 'hidden' && !hasPermission(request, 'activities:moderate') && post.author.id !== request.user.sub) {
      throw new AppError('Post não disponível', 404);
    }

    const reaction = await createFeedReaction({
      postId: params.data.id,
      authorId: request.user.sub,
      type: body.data.type,
    });

    return reply.code(201).send({ reaction });
  });

  app.delete('/feed/posts/:id/reactions/:reactionId', {
    preHandler: [app.authenticate, app.authorize(CREATE_REQUIREMENTS)],
  }, async (request) => {
    const params = postReactionParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Parâmetros inválidos', 400, params.error.flatten());
    }

    const { post } = await getFeedPost(params.data.id);

    if (post.project?.id) {
      ensureProjectScope(request, post.project.id);
    }

    if (post.visibility === 'hidden' && !hasPermission(request, 'activities:moderate') && post.author.id !== request.user.sub) {
      throw new AppError('Post não disponível', 404);
    }

    const reaction = await deleteFeedReaction(params.data.id, params.data.reactionId, {
      requestorId: request.user.sub,
      canModerate: hasPermission(request, 'activities:moderate'),
    });

    return { reaction };
  });

  app.post('/feed/posts/:id/comments', {
    preHandler: [app.authenticate, app.authorize(CREATE_REQUIREMENTS)],
  }, async (request, reply) => {
    const params = postIdParamSchema.safeParse(request.params);
    const body = createCommentBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      throw new AppError('Requisição inválida', 400, {
        params: params.success ? undefined : params.error.flatten(),
        body: body.success ? undefined : body.error.flatten(),
      });
    }

    const comment = await createFeedComment({
      postId: params.data.id,
      authorId: request.user.sub,
      body: body.data.body,
    });

    return reply.code(201).send({ comment });
  });

  app.delete('/feed/comments/:id', {
    preHandler: [app.authenticate, app.authorize(CREATE_REQUIREMENTS)],
  }, async (request) => {
    const params = commentIdParamSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError('Parâmetros inválidos', 400, params.error.flatten());
    }

    const comment = await deleteFeedComment(params.data.id, {
      requestorId: request.user.sub,
      canModerate: hasPermission(request, 'activities:moderate'),
    });

    return { comment };
  });
};
