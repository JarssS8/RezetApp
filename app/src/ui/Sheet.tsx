import { useEffect, useRef, type ReactNode } from 'react';
import { useSheetDrag } from '../motion/useSheetDrag';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { EASE_SHEET } from '../motion/motion';
import { maxW, radius, text as T } from './tokens';

/**
 * Pila de hojas `<Sheet>` montadas, en orden de montaje (a nivel de módulo:
 * la comparten todas las instancias de la app). Hace falta porque
 * `IntakeAddSheet` monta `<RecipePickerSheet>` — que es a su vez un
 * `<Sheet>` — dentro de su propio `<Sheet>`, así que puede haber dos
 * instancias escuchando `keydown` en el mismo `document` a la vez. Cada una
 * tiene su propio `e.stopPropagation()`, pero eso solo corta la
 * *propagación* por el árbol del DOM: no impide que el resto de listeners
 * registrados en ese mismo `document` se ejecuten (para eso haría falta
 * `stopImmediatePropagation`, y ni con eso alcanzaría, porque el orden de
 * registro no tiene por qué coincidir con "la hoja que se ve encima"). Sin
 * esta pila, Escape ejecuta los `dismiss()` de las dos hojas: se cierra el
 * selector de recetas y toda la hoja que lo contiene de un solo golpe.
 * Cada `Sheet` se apunta a la pila al montarse y se da de baja en la
 * limpieza del `useEffect` — nunca en un `onClose` manual — para que
 * cualquier vía de desmontaje (Escape, botón de cerrar, o que el padre deje
 * de renderizarla) la retire igual; si no, la pila acumula ids fantasma y
 * Escape deja de responder en toda la app tras un rato de uso.
 *
 * Esta pila asume que la última hoja en montarse es la de arriba. Eso es
 * cierto mientras las hojas anidadas se abran por interacción del usuario
 * (la hoja padre ya está montada cuando la hija aparece). Si alguna vez una
 * hoja hija se monta en el MISMO commit que su padre, React ejecuta el
 * efecto del hijo antes que el del padre y el orden de la pila queda
 * invertido — Escape respondería en la hoja equivocada. Hoy no pasa en
 * ningún sitio de la app; quien añada un anidamiento nuevo debe saberlo.
 */
let nextSheetId = 0;
const openSheetStack: number[] = [];

/**
 * Hoja inferior arrastrable.
 *
 * Diálogo modal: atrapa el foco, cierra con Escape y devuelve el foco al
 * disparador. El asa arrastra con proyección de momento (ver `useSheetDrag`).
 *
 * `canClose` (I2, revisión final de rama): opcional, para la única hoja
 * cuyo cierre puede fallar (`DashboardEditSheet`, por el guardado en red).
 * `onClose` sigue siendo el contrato de siempre para las demás — nunca
 * falla, siempre desmonta; ver el comentario en `useSheetDrag.ts`.
 */
export function Sheet({
  title,
  onClose,
  canClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  canClose?: () => boolean | Promise<boolean>;
  children: ReactNode;
}) {
  const { y, fading, scrimOpacity, onPointerDown, dismiss } = useSheetDrag(onClose, canClose);
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  // Id estable por instancia, asignado una sola vez (no en un efecto: hace
  // falta antes del primer registro en la pila).
  const idRef = useRef<number>();
  if (idRef.current === undefined) idRef.current = ++nextSheetId;

  // Registro/baja en la pila, separado del efecto de teclado para que no
  // dependa de `dismiss` — se apunta una vez al montar y se da de baja una
  // vez al desmontar, sea cual sea el motivo del desmontaje.
  useEffect(() => {
    const id = idRef.current!;
    openSheetStack.push(id);
    return () => {
      const at = openSheetStack.indexOf(id);
      if (at !== -1) openSheetStack.splice(at, 1);
    };
  }, []);

  useEffect(() => {
    restoreTo.current = document.activeElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Solo la última hoja montada (la de arriba) reacciona a Escape —
        // ver el comentario de `openSheetStack` más arriba. Con una sola
        // hoja abierta (el 99 % de los casos) esto es un no-op: siempre es
        // la única de la pila.
        if (openSheetStack[openSheetStack.length - 1] !== idRef.current) return;
        e.stopPropagation();
        dismiss();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const focusables = panel.current.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (restoreTo.current as HTMLElement | null)?.focus?.();
    };
  }, [dismiss]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={() => dismiss()}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(8,12,8,.42)',
          opacity: scrimOpacity,
          transition: fading ? 'opacity .12s ease' : undefined,
          animation: 'fadein .22s',
        }}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: maxW.sheet,
          margin: '0 auto',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
          boxShadow: 'var(--shadow-l)',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          transform: y ? `translateY(${y}px)` : 'none',
          opacity: fading ? 0 : 1,
          transition: fading ? 'opacity .12s ease' : undefined,
          // Sin relleno final: un keyframe "retenido" pisaría el translateY del arrastre.
          animation: `rise .34s ${EASE_SHEET} backwards`,
          outline: 'none',
        }}
      >
        <div
          onPointerDown={onPointerDown}
          style={{
            padding: '12px 0 6px',
            display: 'grid',
            placeItems: 'center',
            touchAction: 'none',
            cursor: 'grab',
          }}
        >
          <div style={{ width: 40, height: 5, borderRadius: radius.pill, background: 'var(--line)' }} />
        </div>
        <div style={{ padding: '6px 20px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, ...T.sheetTitle }}>{title}</div>
          <Pressable
            onClick={() => dismiss()}
            ariaLabel="Cerrar"
            scale={0.9}
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.pill,
              background: 'var(--surface2)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--muted)',
            }}
          >
            <Icon name="close" size={14} strokeWidth={2.6} />
          </Pressable>
        </div>
        <div
          style={{
            overflowY: 'auto',
            padding: '0 20px calc(24px + env(safe-area-inset-bottom))',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Diálogo de alerta centrado, para decisiones destructivas. */
export function AlertDialog({
  title,
  body,
  children,
  confirmLabel,
  cancelLabel,
  confirmDisabled,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  /**
   * Contenido extra entre el cuerpo y los botones — p. ej. el campo de
   * "escribe el nombre para confirmar" del borrado de hogar. Opcional a
   * propósito: los demás usos de este diálogo (salir de cocinar, etc.) no
   * lo necesitan.
   */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Para gatear la acción destructiva a una confirmación previa (p. ej. escribir el nombre exacto). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 78, display: 'grid', placeItems: 'center', padding: 24 }}>
      <div
        onClick={onCancel}
        style={{ position: 'absolute', inset: 0, background: 'rgba(8,12,8,.5)', animation: 'fadein .2s both' }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 360,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: radius.hero,
          boxShadow: 'var(--shadow-l)',
          padding: 24,
          animation: `rise .28s ${EASE_SHEET} both`,
        }}
      >
        <div style={{ ...T.sheetTitle, lineHeight: 1.2 }}>{title}</div>
        <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, color: 'var(--muted)', textWrap: 'pretty' }}>
          {body}
        </div>
        {children}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* La acción segura va primera y en acento. */}
          <Pressable
            onClick={onCancel}
            scale={0.97}
            style={{
              height: 50,
              borderRadius: 15,
              background: 'var(--accent)',
              color: 'var(--onaccent)',
              fontSize: 16,
              fontWeight: 650,
            }}
          >
            {cancelLabel}
          </Pressable>
          <Pressable
            onClick={onConfirm}
            disabled={confirmDisabled}
            scale={0.97}
            style={{
              height: 50,
              borderRadius: 15,
              background: 'var(--warnsoft)',
              color: 'var(--warn-ink)',
              fontSize: 16,
              fontWeight: 600,
              opacity: confirmDisabled ? 0.5 : 1,
            }}
          >
            {confirmLabel}
          </Pressable>
        </div>
      </div>
    </div>
  );
}
