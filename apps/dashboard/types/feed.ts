export type FeedAuthor = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
};

export type FeedProject = {
  id: string;
  name: string | null;
};

export type FeedPost = {
  id: string;
  project: FeedProject | null;
  author: FeedAuthor;
  title: string | null;
  body: string | null;
  tags: string[];
  visibility: 'internal' | 'project' | 'public' | 'hidden';
  publishedAt: string | null;
  commentCount: number;
};
