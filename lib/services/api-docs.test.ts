import { describe, expect, it } from 'vitest'
import { GET as getDocs } from '@/app/api/docs/route'
import { GET as getAsset } from '@/app/api/docs/assets/[file]/route'

describe('/api/docs', () => {
  it('sirve una página HTML que apunta al documento y a sus propios ficheros', async () => {
    const res = await getDocs()
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('/api/openapi.json')
    expect(html).toContain('/api/docs/assets/swagger-ui.css')
    expect(html).toContain('/api/docs/assets/swagger-ui-bundle.js')
    // Nada de CDN: todo sale del propio servidor
    expect(html).not.toContain('//unpkg.com')
    expect(html).not.toContain('//cdn.')
  })

  it('sirve los tres ficheros de la lista blanca con su tipo', async () => {
    for (const [file, type] of [['swagger-ui.css', 'text/css'], ['swagger-ui-bundle.js', 'javascript'], ['swagger-ui-standalone-preset.js', 'javascript']] as const) {
      const res = await getAsset(new Request(`http://localhost/api/docs/assets/${file}`), { params: Promise.resolve({ file }) })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain(type)
    }
  })

  it('cualquier otro fichero es 404: la lista blanca cierra el paso al directorio', async () => {
    for (const file of ['../../package.json', 'index.html', 'oauth2-redirect.html']) {
      const res = await getAsset(new Request('http://localhost/api/docs/assets/x'), { params: Promise.resolve({ file }) })
      expect(res.status).toBe(404)
    }
  })
})
