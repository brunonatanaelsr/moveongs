# IMM PDF Renderer (Playwright + Handlebars)

Serviço simples para transformar templates Handlebars em PDFs com visual consistente.

## Uso

```bash
cd tools/pdf-renderer
npm install
npm run render templates/recibo_beneficio.hbs templates/recibo_exemplo.json ../out/recibo.pdf
```

- O HTML é renderizado pelo Chromium headless, garantindo que fundos/gradientes sejam mantidos.
- Ajuste o CSS inline em `render_pdf.js` ou utilize `{{#> layout}}`/`partials` para compartilhamento de estilos.
- Integre ao backend chamando o comando via fila ou criando um micro-serviço HTTP.
