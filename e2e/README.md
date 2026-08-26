# E2E (Playwright)

## Chromium headless shell: `libnspr4.so` ausente

En este entorno (Ubuntu 24.04, sin `sudo`) el shell headless de Chromium que
descarga Playwright falla al arrancar con:

```
error while loading shared libraries: libnspr4.so: cannot open shared object file
```

El resto de dependencias de Chromium (`libatk`, `libcups`, `libasound`, …) ya
están instaladas en el sistema (como paquetes `*t64`); solo faltan
`libnspr4` y `libnss3`. Se resuelve extrayendo esos `.deb` en el espacio de
usuario, sin `apt install`:

```bash
mkdir -p ~/.local/chromium-deps && cd ~/.local/chromium-deps
apt-get download libnspr4 libnss3
for d in *.deb; do dpkg -x "$d" .; done
```

Y ejecutando Playwright con:

```bash
export LD_LIBRARY_PATH=$HOME/.local/chromium-deps/usr/lib/x86_64-linux-gnu
pnpm exec playwright test
```

Si en otro entorno faltan más librerías, el error de Chromium las nombra una
a una (p. ej. `libXcomposite.so.1` → paquete `libxcomposite1`); se añaden al
mismo `apt-get download` y no hace falta ampliar `LD_LIBRARY_PATH` (todo
queda bajo el mismo directorio `usr/lib/x86_64-linux-gnu`).
