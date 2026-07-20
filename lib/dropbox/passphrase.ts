import bcrypt from 'bcryptjs';

export async function hashPassphrase(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassphrase(pw: string | null, hash: string | null): Promise<boolean> {
  if (!hash) return true; // no passphrase configured on this dropbox
  if (!pw) return false;
  return bcrypt.compare(pw, hash);
}
