export type ThreadMember = {
  id: string;
  name: string | null;
};

export type MessageThread = {
  id: string;
  scope: string;
  subject: string | null;
  visibility: 'internal' | 'project' | 'private';
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
  };
  members: ThreadMember[];
};

export type ThreadMessage = {
  id: string;
  threadId: string;
  author: {
    id: string;
    name: string | null;
  };
  body: string;
  visibility: 'internal' | 'project' | 'private';
  isConfidential: boolean;
  createdAt: string;
  updatedAt: string;
};
