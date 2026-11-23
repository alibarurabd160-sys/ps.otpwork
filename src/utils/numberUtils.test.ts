import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPhoneFromPayload,
  getGridClassForCount,
  parseTgzGetNumResponse,
  parseTgzOtpResponse,
  parseTgzRangesResponse,
  stripCountryCode,
  validateHttpUrl,
} from './numberUtils';

test('stripCountryCode removes explicit country codes and leading +/00', () => {
  assert.equal(stripCountryCode('+8801712345678', '880'), '1712345678');
  assert.equal(stripCountryCode('008801819876543', '880'), '1819876543');
  assert.equal(stripCountryCode('+1 415-555-0142', '1'), '4155550142');
});

test('stripCountryCode auto-detects common country prefixes', () => {
  assert.equal(stripCountryCode('+8801911223344', 'auto'), '1911223344');
  assert.equal(stripCountryCode('+447911123456', 'auto'), '7911123456');
  assert.equal(stripCountryCode('01712345678', 'auto'), '01712345678');
});

test('parseTgzGetNumResponse extracts national and full numbers cleanly', () => {
  const result = parseTgzGetNumResponse(
    {
      meta: { code: 200, status: 'ok' },
      data: {
        full_number: '+447404333228',
        national_number: '7404333228',
        no_plus_number: '447404333228',
        country: 'United Kingdom',
        operator: 'EE',
        rate: 0.5,
      },
      message: 'number allocated',
      rid: '26134',
    },
    '26134',
  );
  assert.equal(result.nationalNumber, '7404333228');
  assert.equal(result.noPlusNumber, '447404333228');
  assert.equal(result.country, 'United Kingdom');
  assert.equal(result.rate, 0.5);
});

test('parseTgzGetNumResponse throws descriptive error on stock out 2946', () => {
  assert.throws(
    () =>
      parseTgzGetNumResponse(
        { meta: { code: 2946, status: 'not_found' }, data: null },
        '26134',
      ),
    /2946/,
  );
});

test('parseTgzOtpResponse handles waiting and ok states', () => {
  const waiting = parseTgzOtpResponse(
    { meta: { code: 200, status: 'waiting' }, data: null },
    '447404333228',
  );
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.otp, null);

  const ok = parseTgzOtpResponse(
    {
      meta: { code: 200, status: 'ok' },
      data: {
        number: '447404333228',
        otp: '619402',
        message: 'Code: 619402',
        service: 'TELEGRAM',
        time: 1779460000000,
      },
    },
    '447404333228',
  );
  assert.equal(ok.status, 'ok');
  assert.equal(ok.otp, '619402');
  assert.equal(ok.service, 'TELEGRAM');
});

test('parseTgzRangesResponse maps range rows', () => {
  const ranges = parseTgzRangesResponse({
    data: { ranges: [{ range: '26134', rate: 0.5 }, { range: '88017', rate: 0.25 }] },
  });
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].range, '26134');
});

test('extractPhoneFromPayload and validateHttpUrl work as expected', () => {
  assert.equal(extractPhoneFromPayload({ number: '+8801712345678' }), '+8801712345678');
  assert.equal(validateHttpUrl('https://example.com'), 'https://example.com/');
  assert.throws(() => validateHttpUrl('javascript:alert(1)'));
  assert.equal(getGridClassForCount(4), 'grid-cols-2 sm:grid-rows-2');
});
