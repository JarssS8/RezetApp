import { useEffect, useRef, type ReactNode } from 'react';
import { useSheetDrag } from '../motion/useSheetDrag';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { EASE_SHEET } from '../motion/motion';
import { maxW, radius, text as T } from './tokens';

/**
 * Hoja inferior arrastrable.
 *
 * Diálogo modal: atrapa el foco, cierra con Escape y devuelve el foco al
 * disparador. El asa arrastra con proyección de momento (ver `useSheetDrag`).
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const { y, onPointerDown } = useSheetDrag(onClose);
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);

  useEffect(() => {
    restoreTo.current = document.activeElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
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
  }, [onClose]);

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
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(8,12,8,.42)',
          animation: 'fadein .22s both',
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
          animation: `rise .34s ${EASE_SHEET} both`,
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
            onClick={onClose}
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
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
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
            scale={0.97}
            style={{
              height: 50,
              borderRadius: 15,
              background: 'var(--warnsoft)',
              color: 'var(--warn-ink)',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {confirmLabel}
          </Pressable>
        </div>
      </div>
    </div>
  );
}
