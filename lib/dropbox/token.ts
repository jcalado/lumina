import { nanoid } from 'nanoid';

/** Unguessable, URL-safe public dropbox token. */
export function generateDropboxToken(): string {
  return nanoid(21);
}
