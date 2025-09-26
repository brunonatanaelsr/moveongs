import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import React from 'react';
import { SWRConfig } from 'swr';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageCenter } from '../components/MessageCenter';
import type { MessageThread, ThreadMessage } from '../types/messages';

const API_BASE = 'http://localhost:3333';

const mockSession = {
  token: 'test-token',
  refreshToken: null,
  refreshTokenExpiresAt: null,
  permissions: ['messages:read', 'messages:send'],
  roles: ['admin'],
  projectScopes: [],
  user: { id: 'user-1', name: 'Ana Costa', email: 'ana@example.com' },
};

vi.mock('../hooks/useSession', () => ({
  useSession: vi.fn(() => mockSession),
}));

const threads: MessageThread[] = [
  {
    id: 'thread-1',
    scope: 'beneficiaria',
    subject: 'Acompanhamento — Maria',
    visibility: 'internal',
    createdAt: '2024-07-20T12:00:00.000Z',
    createdBy: { id: 'user-2', name: 'Clara Lima' },
    members: [
      { id: 'user-1', name: 'Ana Costa' },
      { id: 'user-3', name: 'Juliana Figueiredo' },
    ],
  },
  {
    id: 'thread-2',
    scope: 'projeto',
    subject: 'Projeto Aurora',
    visibility: 'project',
    createdAt: '2024-07-18T09:00:00.000Z',
    createdBy: { id: 'user-4', name: 'Coordenação' },
    members: [{ id: 'user-5', name: 'Equipe Pedagógica' }],
  },
];

const initialMessages: Record<string, ThreadMessage[]> = {
  'thread-1': [
    {
      id: 'msg-1',
      threadId: 'thread-1',
      author: { id: 'user-2', name: 'Clara Lima' },
      body: 'Consulta médica confirmada para terça-feira.',
      visibility: 'internal',
      isConfidential: false,
      createdAt: '2024-07-20T13:00:00.000Z',
      updatedAt: '2024-07-20T13:00:00.000Z',
    },
  ],
  'thread-2': [
    {
      id: 'msg-2',
      threadId: 'thread-2',
      author: { id: 'user-5', name: 'Equipe Pedagógica' },
      body: 'Materiais entregues para a próxima turma.',
      visibility: 'project',
      isConfidential: false,
      createdAt: '2024-07-18T10:00:00.000Z',
      updatedAt: '2024-07-18T10:00:00.000Z',
    },
  ],
};

let messagesByThread: Record<string, ThreadMessage[]> = {};

const server = setupServer(
  http.get(`${API_BASE}/messages/threads`, () => HttpResponse.json({ data: threads })),
  http.get(`${API_BASE}/messages/threads/:id/messages`, ({ params }) => {
    const id = params.id as string;
    return HttpResponse.json({ thread: threads.find((thread) => thread.id === id) ?? null, messages: messagesByThread[id] ?? [] });
  }),
  http.post(`${API_BASE}/messages/threads/:id/messages`, async ({ params, request }) => {
    const id = params.id as string;
    const body = (await request.json()) as { body: string; isConfidential?: boolean };
    const now = new Date().toISOString();
    const message: ThreadMessage = {
      id: `server-${Date.now()}`,
      threadId: id,
      author: { ...mockSession.user },
      body: body.body,
      visibility: 'internal',
      isConfidential: Boolean(body.isConfidential),
      createdAt: now,
      updatedAt: now,
    };
    messagesByThread[id] = [...(messagesByThread[id] ?? []), message];
    return HttpResponse.json({ data: message });
  }),
);

function renderMessageCenter() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MessageCenter />
    </SWRConfig>,
  );
}

describe('MessageCenter', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  beforeEach(() => {
    messagesByThread = JSON.parse(JSON.stringify(initialMessages));
  });

  afterEach(() => {
    server.resetHandlers();
    cleanup();
  });

  afterAll(() => {
    server.close();
  });

  it('lista as conversas carregadas pela API', async () => {
    renderMessageCenter();

    expect(await screen.findByText('Acompanhamento — Maria')).toBeInTheDocument();
    expect(await screen.findByText('Projeto Aurora')).toBeInTheDocument();
  });

  it('permite abrir uma conversa e visualizar as mensagens', async () => {
    renderMessageCenter();

    const user = userEvent.setup();
    const secondThreadButton = await screen.findByRole('button', { name: /Projeto Aurora/i });
    await user.click(secondThreadButton);

    await waitFor(() => {
      expect(screen.getByText('Materiais entregues para a próxima turma.')).toBeInTheDocument();
    });
  });

  it('envia uma nova mensagem com atualização otimista e feedback de sucesso', async () => {
    renderMessageCenter();
    const user = userEvent.setup();

    const textarea = await screen.findByRole('textbox', { name: /Nova mensagem/i });
    await user.type(textarea, 'Atualização enviada pela equipe.');

    const sendButton = screen.getByRole('button', { name: /Enviar mensagem/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Atualização enviada pela equipe.')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Mensagem enviada com sucesso.')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });
});
