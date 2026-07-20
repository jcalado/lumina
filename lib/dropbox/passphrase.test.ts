import { describe, it, expect } from 'vitest';
import { hashPassphrase, verifyPassphrase } from './passphrase';

describe('passphrase', () => {
  it('verifies a correct passphrase', async () => {
    const h = await hashPassphrase('hunter2');
    expect(await verifyPassphrase('hunter2', h)).toBe(true);
    expect(await verifyPassphrase('wrong', h)).toBe(false);
  });
  it('treats a null hash as open (no passphrase set)', async () => {
    expect(await verifyPassphrase(null, null)).toBe(true);
    expect(await verifyPassphrase('anything', null)).toBe(true);
  });
  it('rejects a missing passphrase when one is required', async () => {
    const h = await hashPassphrase('secret');
    expect(await verifyPassphrase(null, h)).toBe(false);
    expect(await verifyPassphrase('', h)).toBe(false);
  });
});
