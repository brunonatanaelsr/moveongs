'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { FormSchema, FormSection } from '../types/operations';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface FormRendererProps {
  schema: FormSchema;
  initialValues?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void;
  submitLabel?: string;
}

type FormValue = string | number | boolean | string[] | Record<string, unknown> | Record<string, unknown>[];

type FormState = Record<string, FormValue>;

function ensureArray(value: FormValue | undefined): Record<string, unknown>[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value as Record<string, unknown>[];
  }
  return [];
}

function SectionContainer({ section, children }: { section: FormSection; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass shadow-black/10">
      <header className="mb-4 space-y-1">
        <h3 className="text-lg font-semibold text-white">{section.title}</h3>
        {section.description && <p className="text-sm text-white/70">{section.description}</p>}
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function FormRenderer({ schema, initialValues, onSubmit, submitLabel = 'Salvar registro' }: FormRendererProps) {
  const defaultValues = useMemo(() => initialValues ?? {}, [initialValues]);
  const [values, setValues] = useState<FormState>(defaultValues as FormState);
  const [submitting, setSubmitting] = useState(false);

  const handlePrimitiveChange = (fieldId: string, value: FormValue) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleRepeatableChange = (
    sectionId: string,
    index: number,
    fieldId: string,
    value: string | number | boolean | string[],
  ) => {
    setValues((prev) => {
      const collection = ensureArray(prev[sectionId]);
      const nextCollection = collection.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [fieldId]: value } : item,
      );
      return { ...prev, [sectionId]: nextCollection };
    });
  };

  const addRepeatableItem = (sectionId: string, fields: FormSection['fields']) => {
    setValues((prev) => {
      const collection = ensureArray(prev[sectionId]);
      const emptyItem = fields.reduce<Record<string, unknown>>((acc, field) => {
        acc[field.id] = field.type === 'checkbox' ? false : field.type === 'checkbox-group' ? [] : '';
        return acc;
      }, {});
      return { ...prev, [sectionId]: [...collection, emptyItem] };
    });
  };

  const removeRepeatableItem = (sectionId: string, index: number) => {
    setValues((prev) => {
      const collection = ensureArray(prev[sectionId]);
      const nextCollection = collection.filter((_, itemIndex) => itemIndex !== index);
      return { ...prev, [sectionId]: nextCollection };
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onSubmit) return;
    setSubmitting(true);
    try {
      onSubmit(values);
    } finally {
      setTimeout(() => setSubmitting(false), 300);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {schema.sections.map((section) => {
        if (section.repeatable) {
          const items = ensureArray(values[section.id]);
          return (
            <SectionContainer key={section.id} section={section}>
              <div className="space-y-4">
                {items.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-sm text-white/60">
                    Nenhum registro adicionado.
                  </p>
                )}
                {items.map((item, index) => (
                  <div key={`${section.id}-${index}`} className="rounded-2xl border border-white/10 bg-white/10 p-4 space-y-4">
                    <header className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white/80">
                        {section.itemLabel ? `${section.itemLabel} ${index + 1}` : `Item ${index + 1}`}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-rose-200 hover:text-rose-100"
                        onClick={() => removeRepeatableItem(section.id, index)}
                      >
                        Remover
                      </button>
                    </header>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {section.fields.map((field) => {
                        const fieldKey = `${section.id}.${index}.${field.id}`;
                        const value = (item[field.id] as FormValue) ?? '';
                        return (
                          <FieldRenderer
                            key={fieldKey}
                            fieldId={field.id}
                            value={value}
                            onChange={(val) => handleRepeatableChange(section.id, index, field.id, val)}
                            field={field}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => addRepeatableItem(section.id, section.fields)}
                >
                  {section.itemLabel ? `Adicionar ${section.itemLabel.toLowerCase()}` : 'Adicionar registro'}
                </Button>
              </div>
            </SectionContainer>
          );
        }

        return (
          <SectionContainer key={section.id} section={section}>
            <div className="grid gap-4 sm:grid-cols-2">
              {section.fields.map((field) => (
                <FieldRenderer
                  key={`${section.id}.${field.id}`}
                  fieldId={field.id}
                  value={values[field.id]}
                  onChange={(value) => handlePrimitiveChange(field.id, value)}
                  field={field}
                />
              ))}
            </div>
          </SectionContainer>
        );
      })}

      {onSubmit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

interface FieldRendererProps {
  fieldId: string;
  field: FormSection['fields'][number];
  value: FormValue | undefined;
  onChange: (value: FormValue) => void;
}

function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const baseProps = {
    id: field.id,
    name: field.id,
    required: field.required,
  };

  switch (field.type) {
    case 'text':
      return (
        <Input
          {...baseProps}
          label={field.label}
          placeholder={field.placeholder}
          value={(value as string) ?? ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'number':
      return (
        <Input
          {...baseProps}
          type="number"
          label={field.label}
          placeholder={field.placeholder}
          value={value === undefined ? '' : String(value)}
          onChange={(event) => onChange(event.target.value ? Number(event.target.value) : '')}
        />
      );
    case 'date':
      return (
        <Input
          {...baseProps}
          type="date"
          label={field.label}
          value={(value as string) ?? ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'textarea':
      return (
        <div className="space-y-1">
          <label htmlFor={field.id} className="block text-xs font-semibold uppercase tracking-wide text-white/70">
            {field.label}
          </label>
          <textarea
            {...baseProps}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white placeholder:text-white/40 focus:border-cyan-300 focus:outline-none"
            rows={4}
            value={(value as string) ?? ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
          />
        </div>
      );
    case 'select':
      return (
        <div className="space-y-1">
          <label htmlFor={field.id} className="block text-xs font-semibold uppercase tracking-wide text-white/70">
            {field.label}
          </label>
          <select
            {...baseProps}
            className="w-full rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-sm text-white focus:border-cyan-300 focus:outline-none"
            value={(value as string) ?? ''}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Selecione...</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    case 'checkbox':
      return (
        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-white">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/30 bg-slate-950"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{field.label}</span>
        </label>
      );
    case 'checkbox-group':
      return (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{field.label}</p>
          <div className="space-y-2">
            {field.options?.map((option) => {
              const checked = ((value as string[]) ?? []).includes(option.value);
              return (
                <label
                  key={option.value}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-white"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/30 bg-slate-950"
                    checked={checked}
                    onChange={() => {
                      const current = (value as string[]) ?? [];
                      const exists = current.includes(option.value);
                      const next = exists
                        ? current.filter((item) => item !== option.value)
                        : [...current, option.value];
                      onChange(next);
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      );
    case 'signature':
      return (
        <div className="space-y-1">
          <label htmlFor={field.id} className="block text-xs font-semibold uppercase tracking-wide text-white/70">
            {field.label}
          </label>
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-white/20 bg-slate-900/40 p-4 text-sm text-white/70">
            <span className="text-xs text-white/60">
              Utilize campo abaixo para registrar nome completo do signatário ou cole identificação de assinatura digital.
            </span>
            <Input
              {...baseProps}
              placeholder="Nome completo / hash da assinatura"
              value={(value as string) ?? ''}
              onChange={(event) => onChange(event.target.value)}
            />
            <button
              type="button"
              className="self-start text-xs text-cyan-200 hover:text-cyan-100"
              onClick={() => {
                const current = ((value as string) ?? '').trim();
                onChange(current ? current : `Assinado digitalmente em ${new Date().toLocaleString('pt-BR')}`);
              }}
            >
              Gerar carimbo de data/hora
            </button>
          </div>
        </div>
      );
    case 'multi-text':
      return (
        <MultiTextField
          fieldId={field.id}
          label={field.label}
          values={(value as string[]) ?? []}
          onChange={(next) => onChange(next)}
          addLabel={field.multiTextConfig?.addLabel ?? 'Adicionar registro'}
          emptyLabel={field.multiTextConfig?.emptyLabel ?? 'Nenhum registro.'}
        />
      );
    case 'rating':
      return (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{field.label}</p>
          <div className="flex items-center gap-2">
            {Array.from({ length: 10 }).map((_, index) => {
              const score = index + 1;
              const active = Number(value ?? 0) >= score;
              return (
                <button
                  type="button"
                  key={score}
                  className={clsx(
                    'h-8 w-8 rounded-full border text-sm font-semibold transition',
                    active
                      ? 'border-amber-300 bg-amber-400/30 text-amber-100'
                      : 'border-white/10 bg-white/5 text-white/60 hover:border-white/40 hover:text-white',
                  )}
                  onClick={() => onChange(score)}
                >
                  {score}
                </button>
              );
            })}
          </div>
        </div>
      );
    default:
      return null;
  }
}

interface MultiTextFieldProps {
  fieldId: string;
  label: string;
  values: string[];
  addLabel: string;
  emptyLabel: string;
  onChange: (values: string[]) => void;
}

function MultiTextField({ fieldId, label, values, onChange, addLabel, emptyLabel }: MultiTextFieldProps) {
  const handleChange = (index: number, value: string) => {
    const next = values.map((item, i) => (i === index ? value : item));
    onChange(next);
  };

  const handleAdd = () => {
    onChange([...values, '']);
  };

  const handleRemove = (index: number) => {
    const next = values.filter((_, i) => i !== index);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{label}</p>
      {values.length === 0 && <p className="text-sm text-white/60">{emptyLabel}</p>}
      <div className="space-y-2">
        {values.map((item, index) => (
          <div key={`${fieldId}-${index}`} className="flex items-center gap-3">
            <Input
              id={`${fieldId}-${index}`}
              value={item}
              onChange={(event) => handleChange(index, event.target.value)}
            />
            <button
              type="button"
              className="text-xs text-rose-200 hover:text-rose-100"
              onClick={() => handleRemove(index)}
            >
              Remover
            </button>
          </div>
        ))}
      </div>
      <Button type="button" variant="secondary" onClick={handleAdd}>
        {addLabel}
      </Button>
    </div>
  );
}
