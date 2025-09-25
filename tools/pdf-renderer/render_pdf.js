import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_STYLES = `
  @page {
    margin: 18mm 16mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    color: #0f172a;
    background: #f8fafc;
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
  }

  header {
    margin-bottom: 12px;
  }

  .imm-meta {
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #475569;
    margin-bottom: 12px;
  }

  .imm-section {
    background: #ffffff;
    border-radius: 10px;
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
    padding: 18px 22px;
    margin-bottom: 16px;
    border: 1px solid rgba(148, 163, 184, 0.2);
  }

  .imm-section h1,
  .imm-section h2,
  .imm-section h3 {
    color: #0f172a;
    margin-top: 0;
  }

  .imm-section h1 {
    font-size: 20px;
    margin-bottom: 8px;
  }

  .imm-section h2 {
    font-size: 16px;
    margin-bottom: 6px;
  }

  .imm-section h3 {
    font-size: 14px;
  }

  .imm-section p {
    margin: 4px 0;
  }

  .imm-section ul {
    margin: 8px 0 0 18px;
    padding: 0;
  }

  .imm-section li {
    margin-bottom: 4px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 11px;
  }

  th,
  td {
    border: 1px solid rgba(100, 116, 139, 0.3);
    padding: 6px 8px;
    text-align: left;
  }

  thead th {
    background: rgba(37, 99, 235, 0.1);
    color: #1d4ed8;
    font-weight: 600;
  }

  .imm-verification {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
  }

  .imm-verification p {
    flex: 1 1 220px;
  }

  .imm-qr {
    flex: 0 0 140px;
    text-align: center;
  }

  .imm-qr img {
    width: 120px;
    height: 120px;
  }

  footer {
    position: fixed;
    bottom: 12px;
    left: 16mm;
    right: 16mm;
    font-size: 10px;
    color: #64748b;
    display: flex;
    justify-content: space-between;
  }
`;

async function main() {
  const [templatePath, dataPath, outputPath] = process.argv.slice(2);

  if (!templatePath || !dataPath || !outputPath) {
    console.error('Usage: node render_pdf.js <template.hbs> <data.json> <output.pdf>');
    process.exit(1);
  }

  const absoluteTemplate = path.isAbsolute(templatePath)
    ? templatePath
    : path.join(__dirname, templatePath);
  const absoluteData = path.isAbsolute(dataPath) ? dataPath : path.join(__dirname, dataPath);
  const absoluteOutput = path.isAbsolute(outputPath) ? outputPath : path.join(process.cwd(), outputPath);

  await registerHelpers();
  await registerPartials(path.dirname(absoluteTemplate));

  const [templateSource, dataSource] = await Promise.all([
    fs.readFile(absoluteTemplate, 'utf8'),
    fs.readFile(absoluteData, 'utf8'),
  ]);

  const template = Handlebars.compile(templateSource, { noEscape: true });
  const data = JSON.parse(dataSource);
  const bodyContent = template(data);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <style>${BASE_STYLES}</style>
    <title>IMM PDF</title>
  </head>
  <body>
    ${bodyContent}
    <footer>
      <span>Instituto Move Marias • Documento oficial</span>
      <span>Gerado em ${formatDateTime(data.generatedAt ?? new Date().toISOString())}</span>
    </footer>
  </body>
</html>`;

  await renderPdf(html, absoluteOutput);
}

async function registerHelpers() {
  Handlebars.registerHelper('percent', (value) => {
    if (value === null || value === undefined) {
      return '—';
    }

    const number = Number(value);
    if (Number.isNaN(number)) {
      return String(value);
    }

    return `${(number * 100).toFixed(1)}%`;
  });

  Handlebars.registerHelper('upper', (value) => {
    if (typeof value !== 'string') {
      return value;
    }
    return value.toUpperCase();
  });

  Handlebars.registerHelper('formatDate', (value) => {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toISOString().slice(0, 10);
  });
}

async function registerPartials(baseDir) {
  const candidates = [path.join(baseDir, 'partials'), path.join(baseDir, 'layouts')];

  for (const dir of candidates) {
    try {
      const stats = await fs.stat(dir);
      if (!stats.isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    const files = await fs.readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.hbs')) {
        continue;
      }

      const partialPath = path.join(dir, file);
      const source = await fs.readFile(partialPath, 'utf8');
      const name = path.basename(file, '.hbs');
      Handlebars.registerPartial(name, source);
    }
  }
}

async function renderPdf(html, outputPath) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '22mm', left: '16mm', right: '16mm' },
    });
  } finally {
    await browser.close();
  }
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

main().catch((error) => {
  console.error('Failed to render PDF:', error);
  process.exit(1);
});
