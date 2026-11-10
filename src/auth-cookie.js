import { createHmac, timingSafeEqual } from 'node:crypto';

export function signUserIdCookie(userId, secret) {
  const value = String(userId);
  const signature = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${signature}`;
}

export function verifyUserIdCookie(cookieValue, secret) {
  const separator = cookieValue?.lastIndexOf('.') ?? -1;
  if (separator <= 0) {
    return null;
  }

  const value = cookieValue.slice(0, separator);
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const userId = Number(value);
  if (!Number.isSafeInteger(userId)) {
    return null;
  }

  const signature = cookieValue.slice(separator + 1);
  const expected = signUserIdCookie(userId, secret).slice(separator + 1);
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    suppliedBytes.length !== expectedBytes.length
    || !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    return null;
  }

  return userId;
}
