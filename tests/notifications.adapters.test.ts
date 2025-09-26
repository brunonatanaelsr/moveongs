import { describe, expect, it, vi } from 'vitest';
import { SendEmailCommand } from '@aws-sdk/client-ses';

import { NotificationMetrics } from '../src/modules/notifications/metrics';
import {
  EmailNotificationAdapter,
  type EmailNotificationPayload,
} from '../src/modules/notifications/adapters/email-adapter';
import {
  WhatsAppNotificationAdapter,
  type WhatsAppNotificationPayload,
} from '../src/modules/notifications/adapters/whatsapp-adapter';

const metrics = () => new NotificationMetrics();

describe('EmailNotificationAdapter', () => {
  it('envia payload formatado via SES e registra histórico', async () => {
    const payload: EmailNotificationPayload = {
      recipients: ['alerts@example.com'],
      subject: 'Teste',
      body: 'Olá mundo',
      eventType: 'consent.recorded',
      eventId: 'evt-1',
    };

    const send = vi.fn(async (command: SendEmailCommand) => {
      expect(command.input.Source).toBe('alerts@imm.local');
      expect(command.input.Destination?.ToAddresses).toEqual(payload.recipients);
      expect(command.input.Message?.Subject?.Data).toBe(payload.subject);
      expect(command.input.Message?.Body?.Text?.Data).toBe(payload.body);
      return { MessageId: 'ses-123', $metadata: { httpStatusCode: 200 } } as any;
    });

    const adapter = new EmailNotificationAdapter(metrics(), 'alerts@imm.local', { send });

    await adapter.send(payload);

    expect(send).toHaveBeenCalledTimes(1);
    const history = adapter.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      messageId: 'ses-123',
      dispatchedAt: expect.any(String),
    });
  });

  it('propaga erros do SES e não registra histórico', async () => {
    const send = vi.fn(async () => {
      throw new Error('ses-down');
    });

    const adapter = new EmailNotificationAdapter(metrics(), 'alerts@imm.local', { send });

    await expect(adapter.send({
      recipients: ['ops@example.com'],
      subject: 'Falhou',
      body: 'Mensagem',
      eventType: 'consent.updated',
      eventId: 'evt-2',
    })).rejects.toThrow('ses-down');

    expect(adapter.getHistory()).toHaveLength(0);
  });
});

describe('WhatsAppNotificationAdapter', () => {
  it('envia mensagem para todos os números via Twilio', async () => {
    const payload: WhatsAppNotificationPayload = {
      numbers: ['+5511999999999', 'whatsapp:+5511888888888'],
      message: 'Alerta',
      eventType: 'attendance.low_attendance',
      eventId: 'evt-wa-1',
    };

    const create = vi.fn(async (params: { to: string }) => ({
      sid: `SM-${params.to}`,
      status: 'queued',
      to: params.to,
    }));

    const adapter = new WhatsAppNotificationAdapter(metrics(), 'whatsapp:+14155238886', {
      messages: { create },
    });

    await adapter.send(payload);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      to: 'whatsapp:+5511999999999',
    }));
    expect(create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      to: 'whatsapp:+5511888888888',
    }));

    const history = adapter.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].deliveries).toHaveLength(2);
    expect(history[0].deliveries[0]).toMatchObject({
      number: 'whatsapp:+5511999999999',
      sid: 'SM-whatsapp:+5511999999999',
    });
  });

  it('propaga erros de envio e mantém histórico limpo', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ sid: 'SM-first', status: 'queued', to: 'whatsapp:+5511000000000' })
      .mockRejectedValueOnce(new Error('twilio-down'));

    const adapter = new WhatsAppNotificationAdapter(metrics(), 'whatsapp:+14155238886', {
      messages: { create },
    });

    await expect(adapter.send({
      numbers: ['+5511000000000', '+5511999999999'],
      message: 'Teste',
      eventType: 'consent.recorded',
      eventId: 'evt-wa-2',
    })).rejects.toThrow('twilio-down');

    expect(adapter.getHistory()).toHaveLength(0);
  });
});
