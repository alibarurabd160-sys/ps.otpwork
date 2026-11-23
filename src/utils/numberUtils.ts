const COMMON_COUNTRY_CODES = ['880', '91', '44', '61', '65', '60', '971', '966', '1'];

export interface AllocatedNumberResult {
  fullNumber: string;
  nationalNumber: string;
  noPlusNumber: string;
  country: string;
  operator: string;
  rate: number;
  rid: string;
}

export interface OtpLookupResult {
  status: 'ok' | 'waiting';
  number: string;
  otp: string | null;
  message: string | null;
  service: string | null;
  time: number | null;
}

export interface RangeOption {
  range: string;
  rate: number;
}

export function validateHttpUrl(rawUrl: string): string {
  const candidate = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Please enter a valid URL starting with http:// or https://');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must start with http:// or https://');
  }
  return parsed.toString();
}

export function stripCountryCode(rawNumber: string, countryCode: string = 'auto'): string {
  const cleaned = rawNumber.trim().replace(/[^\d+]/g, '');
  if (!cleaned) {
    return '';
  }

  let hasPlus = cleaned.startsWith('+');
  let digits = cleaned.replace(/^\++/, '');

  if (digits.startsWith('00') && digits.length > 4) {
    digits = digits.slice(2);
    hasPlus = true;
  }

  const normalizedCode = countryCode.replace(/\D/g, '');
  if (normalizedCode && countryCode.toLowerCase() !== 'auto') {
    if (digits.startsWith(normalizedCode) && digits.length > normalizedCode.length) {
      return digits.slice(normalizedCode.length);
    }
    return digits;
  }

  if (hasPlus || digits.length > 10) {
    for (const prefix of COMMON_COUNTRY_CODES) {
      if (digits.startsWith(prefix) && digits.length > prefix.length + 5) {
        return digits.slice(prefix.length);
      }
    }
  }

  return digits;
}

export function extractPhoneFromPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  if (Array.isArray(payload) && payload.length > 0) {
    return extractPhoneFromPayload(payload[0]);
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['full_number', 'number', 'phone', 'phone_number', 'mobile', 'msisdn', 'tel']) {
      const value = record[key];
      if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) {
        return String(value).trim();
      }
    }
    for (const nestedKey of ['data', 'result', 'response']) {
      const nested = record[nestedKey];
      if (nested && typeof nested === 'object') {
        return extractPhoneFromPayload(nested);
      }
    }
  }
  throw new Error('API response did not contain a recognizable phone number field');
}

export function parseTgzGetNumResponse(payload: unknown, fallbackRid: string): AllocatedNumberResult {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid JSON response from number API');
  }
  const root = payload as Record<string, unknown>;
  const meta = (root.meta ?? {}) as Record<string, unknown>;
  const metaCode = Number(meta.code ?? 0);

  if (metaCode === 2946 || meta.status === 'not_found') {
    throw new Error(`No numbers in stock for range ${fallbackRid} (code 2946)`);
  }
  if (metaCode && metaCode !== 200) {
    throw new Error(String(root.message || `API error code ${metaCode}`));
  }

  const data = (root.data ?? root) as Record<string, unknown>;
  const fullNumber = String(data.full_number ?? data.number ?? '').trim();
  const rawNational = String(data.national_number ?? '').trim();
  const rawNoPlus = String(data.no_plus_number ?? fullNumber.replace(/^\+/, '')).trim();

  if (!fullNumber && !rawNational && !rawNoPlus) {
    throw new Error('Number API returned no phone number');
  }

  const resolvedFull = fullNumber || (rawNoPlus ? `+${rawNoPlus}` : rawNational);
  const resolvedNational = rawNational || stripCountryCode(resolvedFull, 'auto');

  return {
    fullNumber: resolvedFull,
    nationalNumber: resolvedNational,
    noPlusNumber: rawNoPlus || resolvedFull.replace(/^\+/, ''),
    country: String(data.country ?? 'Unknown'),
    operator: String(data.operator ?? 'Standard'),
    rate: Number(data.rate ?? 0),
    rid: String(root.rid ?? fallbackRid),
  };
}

export function parseTgzOtpResponse(payload: unknown, requestedNumber: string): OtpLookupResult {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid OTP response from API');
  }
  const root = payload as Record<string, unknown>;
  const meta = (root.meta ?? {}) as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | null | undefined;

  if (!data || meta.status === 'waiting') {
    return {
      status: 'waiting',
      number: requestedNumber,
      otp: null,
      message: null,
      service: null,
      time: null,
    };
  }

  return {
    status: 'ok',
    number: String(data.number ?? requestedNumber),
    otp: data.otp ? String(data.otp) : null,
    message: data.message ? String(data.message) : null,
    service: data.service ? String(data.service) : null,
    time: typeof data.time === 'number' ? data.time : null,
  };
}

export function parseTgzRangesResponse(payload: unknown): RangeOption[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const root = payload as Record<string, unknown>;
  const data = (root.data ?? {}) as Record<string, unknown>;
  const rawRanges = Array.isArray(data.ranges) ? data.ranges : [];
  return rawRanges
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      range: String(item.range ?? '').trim(),
      rate: Number(item.rate ?? 0),
    }))
    .filter((item) => item.range.length > 0);
}

export function getGridClassForCount(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 lg:grid-cols-2';
  if (count === 3) return 'grid-cols-1 lg:grid-cols-3';
  return 'grid-cols-2 sm:grid-rows-2';
}
