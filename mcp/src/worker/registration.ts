/**
 * Límites de la Dynamic Client Registration (RFC 7591). /register es anónimo
 * por diseño (así se conecta Claude), y cada registro se guarda en OAUTH_KV
 * 90 días; su client_name además se copia en cada registro pendiente de
 * GET /authorize y en la página de consentimiento. La librería solo limita el
 * cuerpo a 1 MiB, así que un solo cliente podía pesar ~1 MB y multiplicarse
 * en cada /authorize (auditoría run-3). Un cliente de IA real manda un nombre
 * corto y una o dos redirect_uris; sobra margen.
 */
const MAX_METADATA_BYTES = 8 * 1024;
const MAX_CLIENT_NAME = 100;
const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2048;

function reject(description: string) {
  return { code: 'invalid_client_metadata', description };
}

/** `undefined` para aceptar el registro; si no, el error con que rechazarlo. */
export function registrationRejection(metadata: Record<string, unknown>): { code: string; description: string } | undefined {
  if (new TextEncoder().encode(JSON.stringify(metadata)).length > MAX_METADATA_BYTES) {
    return reject(`client metadata must be under ${MAX_METADATA_BYTES} bytes`);
  }
  const name = metadata.client_name;
  if (typeof name === 'string' && [...name].length > MAX_CLIENT_NAME) {
    return reject(`client_name must be at most ${MAX_CLIENT_NAME} characters`);
  }
  const uris = metadata.redirect_uris;
  if (Array.isArray(uris)) {
    if (uris.length > MAX_REDIRECT_URIS) return reject(`at most ${MAX_REDIRECT_URIS} redirect_uris`);
    if (uris.some((u) => typeof u === 'string' && u.length > MAX_REDIRECT_URI_LENGTH)) {
      return reject(`each redirect_uri must be at most ${MAX_REDIRECT_URI_LENGTH} characters`);
    }
  }
  return undefined;
}

/** Nombre del cliente tal como se guarda y se muestra; corta también los registrados antes del límite. */
export function clientDisplayName(clientName: string | undefined, clientId: string): string {
  return [...(clientName || clientId)].slice(0, MAX_CLIENT_NAME).join('');
}
