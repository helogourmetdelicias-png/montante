export function parsePeriod(url: URL) {
  const startInput = url.searchParams.get('startDate');
  const endInput = url.searchParams.get('endDate');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if ((startInput && !datePattern.test(startInput)) || (endInput && !datePattern.test(endInput))) return null;

  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const today = `${todayParts.find(({ type }) => type === 'year')?.value}-${todayParts.find(({ type }) => type === 'month')?.value}-${todayParts.find(({ type }) => type === 'day')?.value}`;
  const startDate = startInput ?? today;
  const endDate = endInput ?? today;
  const startCalendarDate = new Date(`${startDate}T00:00:00.000Z`);
  const endCalendarDate = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(startCalendarDate.getTime()) || Number.isNaN(endCalendarDate.getTime()) || startDate !== startCalendarDate.toISOString().slice(0, 10) || endDate !== endCalendarDate.toISOString().slice(0, 10) || startDate > endDate) return null;
  const endExclusiveCalendarDate = new Date(endCalendarDate);
  endExclusiveCalendarDate.setUTCDate(endExclusiveCalendarDate.getUTCDate() + 1);
  // Store reporting dates use the Brazilian business timezone (UTC−3).
  return {
    startDate,
    endDate,
    startAt: new Date(`${startDate}T00:00:00-03:00`),
    endBefore: new Date(`${endExclusiveCalendarDate.toISOString().slice(0, 10)}T00:00:00-03:00`),
  };
}
