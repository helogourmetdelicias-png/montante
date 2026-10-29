const businessCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function businessDateKey(date: Date): string {
  const parts = businessCalendar.formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}

/** Daily operations follow the store's Sao Paulo calendar. */
export function isCurrentBusinessDay(openedAt: Date, now = new Date()): boolean {
  return openedAt <= now && businessDateKey(openedAt) === businessDateKey(now);
}

export function businessDayRange(now = new Date()) {
  const start = new Date(`${businessDateKey(now)}T00:00:00-03:00`);
  return { gte: start, lt: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
