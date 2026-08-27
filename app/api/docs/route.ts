export const runtime = 'nodejs'

// Página mínima de Swagger UI, servida entera desde este origen. `dom_id` y la
// URL del documento son toda la configuración que hace falta.
const HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RezetApp API</title>
    <link rel="stylesheet" href="/api/docs/assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger"></div>
    <script src="/api/docs/assets/swagger-ui-bundle.js"></script>
    <script src="/api/docs/assets/swagger-ui-standalone-preset.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger', presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset], layout: 'BaseLayout' })
    </script>
  </body>
</html>`

export function GET(): Response {
  return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
