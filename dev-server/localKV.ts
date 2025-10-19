import { promises as fs } from 'fs';
import path from 'path';

type ListOptions = { prefix?: string };

type GetOptions = { type?: 'text' | 'json' | 'arrayBuffer' };

type KVListResult = { keys: { name: string }[]; list_complete: boolean };

// Minimaler KV-Emulator für lokale Entwicklung
export class LocalKV {
  private filePath: string;
  private data: Record<string, string> = {};

  constructor(storageFile = 'dev-server/.local-kv.json') {
    this.filePath = path.resolve(process.cwd(), storageFile);
  }

  async init(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      this.data = JSON.parse(content || '{}');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
        await fs.writeFile(this.filePath, '{}', 'utf-8');
        this.data = {};
      } else {
        throw err;
      }
    }
  }

  private async persist(): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  async get(key: string, options?: GetOptions): Promise<unknown> {
    const value = this.data[key];
    if (value === undefined) return null;
    const type = options?.type || 'text';
    switch (type) {
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      case 'arrayBuffer':
        return new TextEncoder().encode(value).buffer;
      case 'text':
      default:
        return value;
    }
  }

  async put(key: string, value: string): Promise<void> {
    this.data[key] = value;
    await this.persist();
  }

  async delete(key: string): Promise<void> {
    delete this.data[key];
    await this.persist();
  }

  async list(options?: ListOptions): Promise<KVListResult> {
    const prefix = options?.prefix || '';
    const keys = Object.keys(this.data)
      .filter((k) => (prefix ? k.startsWith(prefix) : true))
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

export type LocalEnv = {
  MY_OVERLOAD_KV: LocalKV;
  ASSETS: { fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response> };
};