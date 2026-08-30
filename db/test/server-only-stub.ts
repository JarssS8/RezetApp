// Sustituye al paquete "server-only" en vitest (los tres proyectos: unit, ui y
// db). Fuera de webpack ese paquete lanza a propósito (ver lib/cache/tags.ts):
// resuelve por el condition "react-server" a un módulo vacío en un Server
// Component real, pero Vitest no declara esa condición y cae al "default",
// que lanza siempre. Next resuelve exactamente el mismo problema para Jest
// con next/dist/build/jest/__mocks__/empty.js; este fichero es el equivalente
// para Vitest, enlazado una sola vez desde vitest.config.ts (resolve.alias)
// en vez de repetir vi.mock('server-only', ...) en cada fichero de test que
// toque (ahora también) lib/services/** a través de lib/cache/tags.ts.
export {}
