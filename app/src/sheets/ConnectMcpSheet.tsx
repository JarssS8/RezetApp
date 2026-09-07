import { usePrefs } from '../store/prefs';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { radius, tabular } from '../ui/tokens';

const MCP_URL = 'https://rezet-mcp.jarsss8.es/mcp';

/** URL fija del server MCP remoto — igual para todos los hogares, cada quien inicia sesión con su propia cuenta. */
export function ConnectMcpSheet({ onClose, onToast }: { onClose: () => void; onToast: (msg: string) => void }) {
  const { t } = usePrefs();

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      onToast(t.connectAiCopiedUrl);
    } catch {
      /* portapapeles no disponible en este navegador */
    }
  };

  return (
    <Sheet title={t.connectAiSheetTitle} onClose={onClose}>
      <div style={{ paddingBottom: 6 }}>
        <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 18, textWrap: 'pretty' }}>
          {t.connectAiSheetBody}
        </div>

        <div style={{ fontSize: 13, fontWeight: 650, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
          {t.connectAiUrlLabel}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            borderRadius: radius.button,
            background: 'var(--soft)',
            marginBottom: 22,
          }}
        >
          <div style={{ fontSize: 14.5, fontWeight: 600, ...tabular, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {MCP_URL}
          </div>
          <Button size="header" onClick={() => void copyUrl()}>
            {t.connectAiCopyUrl}
          </Button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 650, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
          {t.connectAiStepsLabel}
        </div>
        <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[t.connectAiStep1, t.connectAiStep2, t.connectAiStep3].map((step, i) => (
            <li key={i} style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }}>
              {step}
            </li>
          ))}
        </ol>

        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4, marginTop: 18 }}>{t.connectAiNote}</div>
      </div>
    </Sheet>
  );
}
