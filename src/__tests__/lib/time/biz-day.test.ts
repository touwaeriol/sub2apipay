import { describe, expect, it } from 'vitest';
import { getBizDayStartUTC, getNextBizDayStartUTC, toBizDateStr } from '@/lib/time/biz-day';

describe('biz-day helpers', () => {
  it('formats business date in Asia/Shanghai timezone', () => {
    expect(toBizDateStr(new Date('2026-03-09T15:59:59.000Z'))).toBe('2026-03-09');
    expect(toBizDateStr(new Date('2026-03-09T16:00:00.000Z'))).toBe('2026-03-10');
  });

  it('returns business day start in UTC', () => {
    expect(getBizDayStartUTC(new Date('2026-03-09T15:59:59.000Z')).toISOString()).toBe('2026-03-08T16:00:00.000Z');
    expect(getBizDayStartUTC(new Date('2026-03-09T16:00:00.000Z')).toISOString()).toBe('2026-03-09T16:00:00.000Z');
  });

  it('returns next business day start in UTC', () => {
    expect(getNextBizDayStartUTC(new Date('2026-03-09T12:00:00.000Z')).toISOString()).toBe('2026-03-09T16:00:00.000Z');
  });
});
