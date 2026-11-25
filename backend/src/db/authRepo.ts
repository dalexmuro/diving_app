export interface WebAuthnCredentialRecord {
  id: string;
  public_key: string;
  counter: number;
  transports_json: string;
  created_at: string;
}

export interface AuthRepository {
  listCredentials(): Promise<WebAuthnCredentialRecord[]>;
  getCredentialById(id: string): Promise<WebAuthnCredentialRecord | null>;
  saveCredential(id: string, publicKey: string, transports: string[]): Promise<void>;
  updateCredentialCounter(id: string, counter: number): Promise<void>;
}

export function createD1AuthRepository(db: D1Database): AuthRepository {
  return {
    async listCredentials(): Promise<WebAuthnCredentialRecord[]> {
      const { results } = await db
        .prepare(
          'SELECT id, public_key, counter, transports_json, created_at FROM webauthn_credentials ORDER BY created_at DESC',
        )
        .all<WebAuthnCredentialRecord>();
      return results ?? [];
    },

    async getCredentialById(id: string): Promise<WebAuthnCredentialRecord | null> {
      const row = await db
        .prepare(
          'SELECT id, public_key, counter, transports_json, created_at FROM webauthn_credentials WHERE id = ?',
        )
        .bind(id)
        .first<WebAuthnCredentialRecord>();
      return row ?? null;
    },

    async saveCredential(id: string, publicKey: string, transports: string[]): Promise<void> {
      await db
        .prepare(
          `INSERT INTO webauthn_credentials (id, public_key, counter, transports_json)
           VALUES (?, ?, 0, ?)
           ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key, transports_json = excluded.transports_json`,
        )
        .bind(id, publicKey, JSON.stringify(transports))
        .run();
    },

    async updateCredentialCounter(id: string, counter: number): Promise<void> {
      await db
        .prepare('UPDATE webauthn_credentials SET counter = ? WHERE id = ?')
        .bind(counter, id)
        .run();
    },
  };
}
