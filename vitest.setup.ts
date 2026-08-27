import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest, a diferencia de Jest, no limpia el DOM entre tests automáticamente.
afterEach(() => {
  cleanup()
})

// Node 26 trae su propio `globalThis.localStorage` experimental (sin fichero
// de respaldo, siempre `undefined`). Como esa clave ya existe en el proceso,
// vitest no la sustituye por la de jsdom al montar el entorno "ui" y
// `window.localStorage` queda roto para cualquier componente o test que lo
// use. `jsdom` es la instancia real que vitest expone como global en este
// entorno: se restaura desde ahí.
declare const jsdom: { window: { localStorage: Storage; sessionStorage: Storage } } | undefined
if (typeof jsdom !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: jsdom.window.localStorage, configurable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: jsdom.window.sessionStorage, configurable: true })
}
