// Singapore timezone utilities
export const SINGAPORE_TZ = 'Asia/Singapore';

export function getSingaporeDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: SINGAPORE_TZ }));
}

export function formatToSingaporeISO(date: Date): string {
  return new Date(date.toLocaleString('en-US', { timeZone: SINGAPORE_TZ })).toISOString();
}

export function toSingaporeTime(isoString: string): Date {
  return new Date(new Date(isoString).toLocaleString('en-US', { timeZone: SINGAPORE_TZ }));
}
