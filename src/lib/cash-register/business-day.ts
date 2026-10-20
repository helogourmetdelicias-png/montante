const businessCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function businessDateKey(date: Date): string {
  const parts = businessCalendar.formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}

/** An old drawer remains open for reconciliation, but cannot start a new day's sales. */
export function isCurrentBusinessDay(openedAt: Date, now = new Date()): boolean {
  return openedAt <= now && businessDateKey(openedAt) === businessDateKey(now);
}
