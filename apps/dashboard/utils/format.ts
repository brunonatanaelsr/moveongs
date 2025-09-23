export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return `${(Number(value) * 100).toFixed(1)}%`;
}

export function formatCount(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('pt-BR').format(value);
}
