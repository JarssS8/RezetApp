// Clasificación de hosts de red compartida por dos usos con reglas opuestas
// (fix 11/12 de la revisión final: antes había dos copias divergentes,
// una en lib/validation/household.ts y otra en lib/services/recipe-import.ts):
//
// - isLanOrLoopbackHost: permisivo, para decidir cuándo se permite http (sin
//   TLS) a un servidor que el propio hogar aloja (llama-server/Ollama en su
//   máquina o en la LAN). NO incluye link-local (169.254.0.0/16, donde vive
//   el endpoint de metadatos de varias nubes) ni 0.0.0.0: exponer eso por
//   http "porque es de la LAN" sería un SSRF, no una comodidad de autoalojado.
// - isPrivateOrReservedHost: restrictivo, para bloquear CUALQUIER destino
//   privado o reservado antes de que la propia app dispare una petición hacia
//   él (SSRF): la descarga de una URL de receta, o una URL "en la nube"
//   (https) que en realidad apunta a la LAN del propio servidor.

// host.docker.internal: como llama-server/Ollama suelen correr en el host
// desde un contenedor Docker de la propia app.
const LAN_OR_LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal'])

// URL.hostname devuelve las IPv6 entre corchetes ('[::1]'); hay que quitarlos
// antes de comparar contra rangos o nombres reservados.
export function stripIPv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

// new URL() normaliza cualquier IPv4-mapped ('::ffff:127.0.0.1',
// '::ffff:192.168.1.20'…) a su forma hexadecimal ('::ffff:7f00:1',
// '::ffff:c0a8:114'…); hay que deshacerla para aplicar las reglas de IPv4.
export function ipv4MappedToDotted(hostname: string): string | null {
  const m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(hostname)
  if (!m || m[1] === undefined || m[2] === undefined) return null
  const g1 = Number.parseInt(m[1], 16)
  const g2 = Number.parseInt(m[2], 16)
  return [(g1 >> 8) & 0xff, g1 & 0xff, (g2 >> 8) & 0xff, g2 & 0xff].join('.')
}

// Loopback (127/8), LAN privada (10/8, 172.16/12, 192.168/16), link-local
// (169.254/16) y 0.0.0.0. new URL() ya canonicaliza a esta forma cualquier
// variante decimal/octal/hex de la IP.
export function isReservedIPv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!m) return false
  const octets = [m[1], m[2], m[3], m[4]].map(Number)
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  const [a, b, c, d] = octets
  if (a === undefined || b === undefined || c === undefined || d === undefined) return false
  if (a === 127) return true // loopback 127.0.0.0/8
  if (a === 10) return true // LAN 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // LAN 172.16.0.0/12
  if (a === 192 && b === 168) return true // LAN 192.168.0.0/16
  if (a === 169 && b === 254) return true // link-local 169.254.0.0/16
  if (a === 0 && b === 0 && c === 0 && d === 0) return true // 0.0.0.0
  return false
}

// Rango IPv4 privado de RFC 1918 (LAN) sin loopback ni link-local: es lo único
// que isLanOrLoopbackHost necesita además del set de nombres/IPs de arriba, y
// deliberadamente NO reutiliza isReservedIPv4 (que sí incluye link-local y
// 0.0.0.0 — ver la nota de cabecera sobre por qué eso no debe permitir http).
function isPrivateLanIPv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!m) return false
  const octets = [m[1], m[2], m[3], m[4]].map(Number)
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  const [a, b] = octets
  if (a === undefined || b === undefined) return false
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

// Primer grupo hexadecimal de una IPv6 completa (sin comprimir con '::' al
// principio): sirve para acotar fe80::/10 (link-local) y fc00::/7 (ULA) sin
// tener que expandir la dirección entera.
function firstHextet(hostname: string): number | null {
  const m = /^([0-9a-f]{1,4})(?::|$)/i.exec(hostname)
  return m && m[1] !== undefined ? Number.parseInt(m[1], 16) : null
}

// Host local o de LAN al que tiene sentido permitir http (sin TLS): el propio
// hogar aloja ahí su servidor de IA. Ver la nota de cabecera para por qué esto
// es deliberadamente más estrecho que isPrivateOrReservedHost.
export function isLanOrLoopbackHost(hostname: string): boolean {
  const h = stripIPv6Brackets(hostname).toLowerCase()
  if (LAN_OR_LOOPBACK_HOSTNAMES.has(h)) return true
  const mapped = ipv4MappedToDotted(h)
  if (mapped !== null) return mapped === '127.0.0.1' || isPrivateLanIPv4(mapped)
  return isPrivateLanIPv4(h)
}

// Host privado o reservado: no debe usarse como destino de una petición que
// dispara la propia app (SSRF). Cubre nombres reservados, loopback, LAN
// privada, link-local (v4 y v6), ULA v6 e IPv4-mapped-a-IPv6.
export function isPrivateOrReservedHost(rawHostname: string): boolean {
  // DNS resuelve 'localhost.' igual que 'localhost' (FQDN con punto final);
  // sin quitarlo, 'localhost.' o 'sub.local.' se colarían como si fueran
  // hosts distintos. Un FQDN público ('example.com.') sigue funcionando: el
  // punto final no lo hace privado, solo se normaliza antes de comparar.
  const h = stripIPv6Brackets(rawHostname).toLowerCase().replace(/\.+$/, '')
  if (h === 'localhost' || h.endsWith('.local')) return true
  if (h === '::1' || h === '::' || h === '0.0.0.0') return true
  if (isReservedIPv4(h)) return true
  const mapped = ipv4MappedToDotted(h)
  if (mapped !== null) return isReservedIPv4(mapped)
  if (!h.includes(':')) return false // no es una IPv6: ya se descartó como IPv4 arriba
  const hextet = firstHextet(h)
  if (hextet === null) return false
  if (hextet >= 0xfe80 && hextet <= 0xfebf) return true // link-local fe80::/10
  if (hextet >= 0xfc00 && hextet <= 0xfdff) return true // ULA fc00::/7
  return false
}
