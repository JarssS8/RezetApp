import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { SupportedStorage } from '@supabase/supabase-js';

export const sessionFilePath =
  process.env.REZET_MCP_SESSION_FILE ?? path.join(os.homedir(), '.config', 'rezet-mcp', 'session.json');

type SessionFile = Record<string, string>;

async function readAll(): Promise<SessionFile> {
  try {
    const raw = await readFile(sessionFilePath, 'utf8');
    return JSON.parse(raw) as SessionFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

async function writeAll(data: SessionFile): Promise<void> {
  await mkdir(path.dirname(sessionFilePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${sessionFilePath}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data), { mode: 0o600 });
  await rename(tmpPath, sessionFilePath);
}

export const fileStorage: SupportedStorage = {
  async getItem(key: string) {
    const data = await readAll();
    return data[key] ?? null;
  },
  async setItem(key: string, value: string) {
    const data = await readAll();
    data[key] = value;
    await writeAll(data);
  },
  async removeItem(key: string) {
    const data = await readAll();
    delete data[key];
    await writeAll(data);
  },
};

export async function clearSession(): Promise<void> {
  try {
    await unlink(sessionFilePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
