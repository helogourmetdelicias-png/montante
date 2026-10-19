import { timingSafeEqual } from 'node:crypto';

/** Validates a Bearer token without leaking timing information about the secret. */
export function hasValidCronSecret(request: Request, configuredSecret: string) {
  const authorization = request.headers.get('authorization') ?? '';
  const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearerToken) return false;

  const supplied = Buffer.from(bearerToken);
  const expected = Buffer.from(configuredSecret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
