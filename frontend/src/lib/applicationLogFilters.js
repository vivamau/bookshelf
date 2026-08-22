const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const parseLocalDateTime = (date, time) => {
  const dateMatch = DATE_PATTERN.exec(String(date || ''));
  const timeMatch = TIME_PATTERN.exec(String(time || ''));
  if (!dateMatch || !timeMatch) throw new TypeError('Choose a valid date and time range.');

  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) throw new TypeError('Choose a valid date and time range.');

  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
    || parsed.getHours() !== hour
    || parsed.getMinutes() !== minute
  ) {
    throw new TypeError('Choose a valid date and time range.');
  }
  return parsed;
};

export const buildApplicationLogRange = ({ date, startTime, endTime }) => {
  const start = parseLocalDateTime(date, startTime);
  const end = parseLocalDateTime(date, endTime);
  const endTimestamp = end.getTime() + 60 * 1000;
  if (endTimestamp <= start.getTime()) {
    throw new TypeError('The ending time must be after the starting time.');
  }

  return {
    startTimestamp: start.getTime(),
    endTimestamp
  };
};

export const formatApplicationLogTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};
