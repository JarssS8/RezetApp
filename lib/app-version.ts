import packageJson from '../package.json'

// Identidad del paquete leída de package.json, no duplicada a mano: evita que
// el nombre/versión que expone el servidor MCP (u otros sitios) se desincronice.
export const APP_NAME: string = packageJson.name
export const APP_VERSION: string = packageJson.version
