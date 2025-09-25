'use client';

import { useMemo, useState } from 'react';
import Form from '@rjsf/core';
import type { IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Alert } from '../ui/alert';

export interface JsonSchemaFormProps<T = unknown> {
  schema: RJSFSchema;
  uiSchema?: UiSchema;
  formData?: T;
  title?: string;
  description?: string;
  onSubmit?: (data: T) => Promise<void> | void;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function JsonSchemaForm<T = unknown>({
  schema,
  uiSchema,
  formData,
  title,
  description,
  onSubmit,
  primaryActionLabel = 'Salvar',
  secondaryActionLabel,
  onSecondaryAction,
}: JsonSchemaFormProps<T>) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmit, setLastSubmit] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formKey = useMemo(() => JSON.stringify(schema), [schema]);

  async function handleSubmit(event: IChangeEvent<T>, nativeEvent?: React.FormEvent<HTMLFormElement>) {
    nativeEvent?.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit?.(event.formData);
      setLastSubmit(event.formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar formulário.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="space-y-6">
      {(title || description) && (
        <header className="space-y-2">
          {title && <h2 className="text-xl font-semibold text-white">{title}</h2>}
          {description && <p className="text-sm text-white/70">{description}</p>}
        </header>
      )}

      {error && <Alert variant="error">{error}</Alert>}
      {lastSubmit && !error && (
        <Alert variant="success" title="Dados registrados">
          As informações foram armazenadas localmente. Finalize para enviar ao backend.
        </Alert>
      )}

      <Form
        key={formKey}
        schema={schema}
        uiSchema={uiSchema}
        formData={formData}
        validator={validator}
        onSubmit={handleSubmit}
        noHtml5Validate
        showErrorList={false}
        templates={{
          ButtonTemplates: {
            SubmitButton: (props) => (
              <Button type="submit" disabled={isSubmitting} {...props.props}>
                {isSubmitting ? 'Enviando...' : primaryActionLabel}
              </Button>
            ),
          },
        }}
        className="json-schema-form space-y-6"
      >
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando...' : primaryActionLabel}
          </Button>
          {secondaryActionLabel && onSecondaryAction && (
            <Button type="button" variant="secondary" onClick={onSecondaryAction} disabled={isSubmitting}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      </Form>
    </Card>
  );
}
