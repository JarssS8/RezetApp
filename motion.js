/* Rezet — física de interacción. Sin dependencias. Portable 1:1 a cualquier framework.
   Constantes tomadas de "Designing Fluid Interfaces" (WWDC 2018). No las cambies:
   están ajustadas para que nada rebote donde no debe. */

/* Muelle críticamente amortiguado. Integración por frame, no duración fija.
   Anima SIEMPRE desde el valor actual en pantalla (`from`) y con la velocidad
   de salida del gesto (`v0`), para que no haya salto ni "muro" al interrumpir.
   Devuelve una función de cancelación: llámala antes de lanzar otro muelle
   sobre el mismo valor. */
export function spring(from, to, v0, onUpdate, onDone, opts = {}) {
  const k = opts.stiffness ?? 190;   // rigidez
  const c = opts.damping ?? 27;      // amortiguación (27 con k=190 => sin rebote)
  let x = from, v = v0 || 0, last = performance.now(), raf = 0;

  const step = (now) => {
    const dt = Math.min(0.032, (now - last) / 1000); // techo de 32ms: evita saltos al volver de pestaña oculta
    last = now;
    v += (-k * (x - to) - c * v) * dt;
    x += v * dt;
    if (Math.abs(x - to) < 0.6 && Math.abs(v) < 14) { onUpdate(to); if (onDone) onDone(); return; }
    onUpdate(x);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/* Proyección de momento: dónde acabaría el gesto si lo dejaras decelerar.
   Es la fórmula exponencial que usa iOS, NO v²/(2·a).
   decel 0.998 = sensación de scroll normal; 0.99 = más seco. */
export function project(velocity /* px/s */, decel = 0.998) {
  return (velocity / 1000) * decel / (1 - decel);
}

/* Rubber-banding: resistencia progresiva al pasar de un límite.
   Para el arrastre de hoja basta con multiplicar el desplazamiento
   hacia arriba por 0.25; esta versión es la general. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/* Rastreador de velocidad. Usa los dos últimos eventos con un dt mínimo de 8ms:
   con menos, el ruido del puntero produce velocidades absurdas. */
export function velocityTracker() {
  let last = null, lastT = 0, v = 0;
  return {
    push(value) {
      const now = performance.now();
      if (last !== null) v = (value - last) / Math.max(8, now - lastT) * 1000;
      last = value; lastT = now;
      return v;
    },
    get value() { return v; }
  };
}

/* Hoja inferior arrastrable.
   handle: el asa (40x5px). onY: aplica translateY. onClose: cierra la hoja.
   getY: devuelve el desplazamiento actual (para poder agarrarla en vuelo).
   Umbral de cierre: proyección > 140px. Destino de salida: 620px. */
export function attachSheetDrag(handle, { onY, onClose, getY = () => 0, closeAt = 140, exitY = 620 }) {
  let cancel = null;

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (cancel) { cancel(); cancel = null; }          // interrumpible: se agarra en pleno vuelo
    const startY = e.clientY - getY();                 // respeta el offset de agarre
    const track = velocityTracker();

    const move = (ev) => {
      let dy = ev.clientY - startY;
      if (dy < 0) dy = dy * 0.25;                      // resistencia hacia arriba
      track.push(ev.clientY);
      onY(dy);                                         // seguimiento 1:1
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const y = getY(), vel = track.value;
      if (y + project(vel) > closeAt) {
        cancel = spring(y, exitY, vel, onY, onClose);   // se va hacia donde iba el gesto
      } else {
        cancel = spring(y, 0, vel, onY);                // vuelve, heredando la velocidad
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

/* Arrastre de una receta a un hueco del plan.
   Los huecos se identifican con data-slot="{fechaISO}|{franja}".
   Los listeners van en window: así el gesto no se pierde al salir del elemento.
   El fantasma DEBE llevar pointer-events:none, o elementFromPoint lo devuelve
   a él en vez del hueco y el arrastre no detecta nada. */
export function attachSlotDrag(el, { onStart, onMove, onDrop, onEnd }) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    onStart({ x: e.clientX, y: e.clientY });

    const move = (ev) => {
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const slotEl = under && under.closest ? under.closest("[data-slot]") : null;
      onMove({ x: ev.clientX, y: ev.clientY, slot: slotEl ? slotEl.getAttribute("data-slot") : null });
    };

    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const slotEl = under && under.closest ? under.closest("[data-slot]") : null;
      if (slotEl) onDrop(slotEl.getAttribute("data-slot"));
      onEnd();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

/* Haptics: solo en momentos que lo merecen. Nada de vibrar en cada toque. */
export const haptics = {
  addToPlan() { navigator.vibrate && navigator.vibrate(12); },
  timerDone() { navigator.vibrate && navigator.vibrate([40, 60, 40]); },
  cookSaved() { navigator.vibrate && navigator.vibrate([18, 40, 26]); }
};
