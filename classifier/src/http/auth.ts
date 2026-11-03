import { createHash, timingSafeEqual } from 'node:crypto';

export type Role = 'admin' | 'reader';

export interface Principal {
  name: string;
  role: Role;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Parses API_TOKENS: `name:role:token` entries separated by commas. Reviewer identity in the audit log comes
 * from here, never from the request body, so it can't be spoofed. Generate tokens with `openssl rand -hex 32`.
 */
export class TokenAuthenticator {
  private readonly tokens: Array<{ digest: Buffer; principal: Principal }> = [];

  constructor(spec: string) {
    for (const entry of spec.split(',').map((e) => e.trim()).filter(Boolean)) {
      const [name, role, ...rest] = entry.split(':');
      const token = rest.join(':');
      if (!name || (role !== 'admin' && role !== 'reader') || token.length < 16) {
        throw new Error(`Invalid API_TOKENS entry for "${name ?? '?'}". Expected name:admin|reader:token, token at least 16 characters.`);
      }
      this.tokens.push({ digest: digest(token), principal: { name, role } });
    }
  }

  get configured(): boolean {
    return this.tokens.length > 0;
  }

  /** Compares against every token in constant time. No configured tokens means nobody gets in. */
  authenticate(header: string | undefined): Principal | null {
    const presented = header?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!presented) return null;
    const candidate = digest(presented);
    let match: Principal | null = null;
    for (const { digest: known, principal } of this.tokens) {
      if (timingSafeEqual(candidate, known)) match = principal;
    }
    return match;
  }
}
