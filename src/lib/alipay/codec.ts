const HEADER_CHARSET_RE = /charset=([^;]+)/i;
const BODY_CHARSET_RE = /(?:^|&)charset=([^&]+)/i;

function normalizeCharset(charset: string | null | undefined): string | null {
  if (!charset) return null;

  const normalized = charset.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  if (!normalized) return null;

  switch (normalized) {
    case 'utf8':
      return 'utf-8';
    case 'gb2312':
    case 'gb_2312-80':
      return 'gbk';
    default:
      return normalized;
  }
}

function detectCharsetFromHeaders(headers: Record<string, string>): string | null {
  const contentType = headers['content-type'];
  const match = contentType?.match(HEADER_CHARSET_RE);
  return normalizeCharset(match?.[1]);
}

function detectCharsetFromBody(rawBody: Buffer): string | null {
  const latin1Body = rawBody.toString('latin1');
  const match = latin1Body.match(BODY_CHARSET_RE);
  if (!match) return null;

  try {
    return normalizeCharset(decodeURIComponent(match[1].replace(/\+/g, ' ')));
  } catch {
    return normalizeCharset(match[1]);
  }
}

function decodeBuffer(rawBody: Buffer, charset: string): string {
  return new TextDecoder(charset).decode(rawBody);
}

export function decodeAlipayPayload(rawBody: string | Buffer, headers: Record<string, string> = {}): string {
  if (typeof rawBody === 'string') {
    return rawBody;
  }

  const primaryCharset = detectCharsetFromHeaders(headers) || detectCharsetFromBody(rawBody) || 'utf-8';
  const candidates = Array.from(new Set([primaryCharset, 'utf-8', 'gbk', 'gb18030']));

  let fallbackDecoded: string | null = null;
  let lastError: unknown = null;

  for (const charset of candidates) {
    try {
      const decoded = decodeBuffer(rawBody, charset);
      if (!decoded.includes('\uFFFD')) {
        return decoded;
      }
      fallbackDecoded ??= decoded;
    } catch (error) {
      lastError = error;
    }
  }

  if (fallbackDecoded) {
    return fallbackDecoded;
  }

  throw new Error(
    `Failed to decode Alipay payload${lastError instanceof Error ? `: ${lastError.message}` : ''}`,
  );
}

export function normalizeAlipaySignature(sign: string): string {
  return sign.replace(/ /g, '+').trim();
}

export function parseAlipayNotificationParams(
  rawBody: string | Buffer,
  headers: Record<string, string> = {},
): Record<string, string> {
  const body = decodeAlipayPayload(rawBody, headers);
  const searchParams = new URLSearchParams(body);

  const params: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }

  if (params.sign) {
    params.sign = normalizeAlipaySignature(params.sign);
  }

  return params;
}

export async function parseAlipayJsonResponse<T>(response: Response): Promise<T> {
  const rawBody = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || '';
  const text = decodeAlipayPayload(rawBody, { 'content-type': contentType });
  return JSON.parse(text) as T;
}
