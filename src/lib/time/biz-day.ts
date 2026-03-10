export const BIZ_TZ_NAME = 'Asia/Shanghai';
export const BIZ_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function toBizDateStr(date: Date): string {
  const local = new Date(date.getTime() + BIZ_TZ_OFFSET_MS);
  return local.toISOString().split('T')[0];
}

export function getBizDayStartUTC(date: Date = new Date()): Date {
  return new Date(`${toBizDateStr(date)}T00:00:00+08:00`);
}

export function getNextBizDayStartUTC(date: Date = new Date()): Date {
  return new Date(getBizDayStartUTC(date).getTime() + ONE_DAY_MS);
}
