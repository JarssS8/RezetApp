import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRezetClient, requireSession, NoSessionError } from './supabase.js';
import { clearSession, sessionFilePath } from './sessionStorage.js';

interface Args {
  provider: 'google' | 'apple';
  port: number;
  logout: boolean;
}

function parseArgs(argv: string[]): Args {
  let provider: 'google' | 'apple' = 'google';
  let port = 8765;
  let logout = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--logout') {
      logout = true;
    } else if (arg === '--provider') {
      const value = argv[++i];
      if (value !== 'google' && value !== 'apple') {
        throw new Error(`--provider must be "google" or "apple", got: ${value ?? '(missing)'}`);
      }
      provider = value;
    } else if (arg?.startsWith('--provider=')) {
      const value = arg.slice('--provider='.length);
      if (value !== 'google' && value !== 'apple') {
        throw new Error(`--provider must be "google" or "apple", got: ${value}`);
      }
      provider = value;
    } else if (arg === '--port') {
      const value = argv[++i];
      const parsed = Number(value);
      if (!value || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`--port must be a positive integer, got: ${value ?? '(missing)'}`);
      }
      port = parsed;
    } else if (arg?.startsWith('--port=')) {
      const value = arg.slice('--port='.length);
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`--port must be a positive integer, got: ${value}`);
      }
      port = parsed;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { provider, port, logout };
}

/** Escapes text for use inside HTML content. Apply to every value taken from the OAuth callback query string. */
function sanitizeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openBrowser(url: string): void {
  const attempts: [string, string[]][] = [
    ['wslview', [url]],
    ['xdg-open', [url]],
    ['cmd.exe', ['/c', 'start', '""', url]],
    ['open', [url]],
  ];
  for (const [cmd, args] of attempts) {
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
      child.unref();
      child.on('error', () => {});
      return;
    } catch {
      continue;
    }
  }
}

async function waitForCallback(
  port: number
): Promise<{ code: string; flowId: string | null }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');
      if (error) {
        res.writeHead(400, { 'content-type': 'text/html' }).end(
          `<p>Rezet MCP: sign-in failed — ${sanitizeText(error)}: ${sanitizeText(errorDescription ?? '')}</p>`
        );
        server.close();
        reject(new Error(`OAuth callback error: ${error} ${errorDescription ?? ''}`));
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400, { 'content-type': 'text/html' }).end('<p>Rezet MCP: missing code.</p>');
        server.close();
        reject(new Error('OAuth callback missing "code" parameter'));
        return;
      }

      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end('<p>Rezet MCP: signed in, you can close this tab.</p>');
      server.close();
      resolve({ code, flowId: url.searchParams.get('sb_flow_id') });
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1');

    const timeout = setTimeout(
      () => {
        server.close();
        reject(new Error('Timed out waiting for the OAuth callback after 5 minutes.'));
      },
      5 * 60 * 1000
    );
    timeout.unref();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.logout) {
    await clearSession();
    console.error(`[rezet-mcp] Logged out. Removed ${sessionFilePath} (if it existed).`);
    return;
  }

  const supabase = createRezetClient({ autoRefresh: false });

  try {
    const existing = await requireSession(supabase);
    console.error(
      `[rezet-mcp] Already logged in as ${existing.email} (household ${existing.householdId}). Use --logout to reset.`
    );
    return;
  } catch (err) {
    if (!(err instanceof NoSessionError)) throw err;
  }

  const redirectTo = `http://localhost:${args.port}/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: args.provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    throw new Error(`signInWithOAuth failed: ${error?.message ?? 'no URL returned'}`);
  }

  console.error('[rezet-mcp] Open this URL in your browser:');
  console.error(data.url);
  openBrowser(data.url);

  const { code, flowId } = await waitForCallback(args.port);

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined
  );
  if (exchangeError) {
    throw new Error(`exchangeCodeForSession failed: ${exchangeError.message}`);
  }

  const session = await requireSession(supabase);
  const { data: household } = await supabase
    .from('household')
    .select('name')
    .eq('id', session.householdId)
    .single();

  console.error(
    `[rezet-mcp] Signed in as ${session.email} · household "${household?.name ?? session.householdId}" (${session.householdId}) · session stored at ${sessionFilePath}`
  );
}

main().catch((err) => {
  console.error(`[rezet-mcp] login failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
