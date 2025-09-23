#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import handlebars from 'handlebars';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const [templatePath, dataPath, outputPath] = process.argv.slice(2);

  if (!templatePath || !dataPath || !outputPath) {
    console.error('Usage: node render_pdf.js <template.hbs> <data.json> <out.pdf>');
    process.exit(1);
  }

  const resolvedTemplate = path.resolve(templatePath);
  const resolvedData = path.resolve(dataPath);
  const resolvedOutput = path.resolve(outputPath);

  const [templateContent, dataContent] = await Promise.all([
    fs.readFile(resolvedTemplate, 'utf8'),
    fs.readFile(resolvedData, 'utf8'),
  ]);

  const context = JSON.parse(dataContent);

  handlebars.registerHelper('percent', (value) => {
    if (value === null || value === undefined) {
      return '';
    }
    const num = Number(value);
    if (Number.isNaN(num)) {
      return '';
    }
    return (num * 100).toFixed(2) + '%';
  });

  const template = handlebars.compile(templateContent, {
    noEscape: true,
  });

  const html = template(context);
  const tmpDir = await fs.mkdtemp(path.join(__dirname, '.tmp-'));
  const htmlPath = path.join(tmpDir, 'index.html');

  await fs.writeFile(htmlPath, buildHtmlDocument(html));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.pdf({
    path: resolvedOutput,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '16mm',
      right: '16mm',
      bottom: '16mm',
      left: '16mm',
    },
  });

  await browser.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`PDF generated at ${resolvedOutput}`);
}

function buildHtmlDocument(body) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>IMM PDF</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    html, body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; background: #f9fafb; }
    .imm-document { max-width: 720px; margin: 0 auto; padding: 32px; background: white; color: #111827; }
    h1, h2, h3 { color: #0f172a; }
    .imm-meta { margin-bottom: 24px; font-size: 12px; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; }
    .imm-section { margin-bottom: 24px; }
    .imm-section + .imm-section { border-top: 1px solid #e2e8f0; padding-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
  </style>
</head>
<body>
  <div class="imm-document">
    ${body}
  </div>
</body>
</html>`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
