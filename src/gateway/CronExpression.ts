export type CronTimezone = 'local' | 'utc'

export interface CronExpression {
  readonly source: string
  readonly minute: CronField
  readonly hour: CronField
  readonly dayOfMonth: CronField
  readonly month: CronField
  readonly dayOfWeek: CronField
}

interface CronField {
  readonly raw: string
  readonly matches: (value: number) => boolean
}

const MONTH_RANGE: readonly [number, number] = [1, 12]
const DAY_OF_MONTH_RANGE: readonly [number, number] = [1, 31]
const HOUR_RANGE: readonly [number, number] = [0, 23]
const MINUTE_RANGE: readonly [number, number] = [0, 59]
const DAY_OF_WEEK_RANGE: readonly [number, number] = [0, 6]

export function parseCronExpression(value: string): CronExpression {
  const source = value.trim()
  const parts = source.split(/\s+/)
  if (parts.length !== 5) {
    throw new Error('Cron expression must have exactly 5 fields.')
  }

  return {
    source,
    minute: parseCronField(parts[0], MINUTE_RANGE, 'minute'),
    hour: parseCronField(parts[1], HOUR_RANGE, 'hour'),
    dayOfMonth: parseCronField(parts[2], DAY_OF_MONTH_RANGE, 'day of month'),
    month: parseCronField(parts[3], MONTH_RANGE, 'month'),
    dayOfWeek: parseCronField(parts[4], DAY_OF_WEEK_RANGE, 'day of week', { allowSevenAsSunday: true }),
  }
}

export function nextCronOccurrence(input: {
  expression: CronExpression
  after: Date
  timezone: CronTimezone
}): Date | null {
  const cursor = new Date(input.after.getTime())
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  const maxMinutesToScan = 366 * 24 * 60
  for (let step = 0; step < maxMinutesToScan; step += 1) {
    if (matchesCronDate(input.expression, cursor, input.timezone)) {
      return new Date(cursor.getTime())
    }
    cursor.setMinutes(cursor.getMinutes() + 1)
  }

  return null
}

function matchesCronDate(expression: CronExpression, date: Date, timezone: CronTimezone): boolean {
  const minute = timezone === 'utc' ? date.getUTCMinutes() : date.getMinutes()
  const hour = timezone === 'utc' ? date.getUTCHours() : date.getHours()
  const dayOfMonth = timezone === 'utc' ? date.getUTCDate() : date.getDate()
  const month = (timezone === 'utc' ? date.getUTCMonth() : date.getMonth()) + 1
  const dayOfWeek = timezone === 'utc' ? date.getUTCDay() : date.getDay()

  return expression.minute.matches(minute)
    && expression.hour.matches(hour)
    && expression.dayOfMonth.matches(dayOfMonth)
    && expression.month.matches(month)
    && expression.dayOfWeek.matches(dayOfWeek)
}

function parseCronField(
  source: string,
  range: readonly [number, number],
  label: string,
  options: { allowSevenAsSunday?: boolean } = {},
): CronField {
  const values = new Set<number>()
  for (const token of source.split(',')) {
    addCronToken(values, token, range, label, options)
  }

  if (values.size === 0) {
    throw new Error(`Cron ${label} field is empty.`)
  }

  return {
    raw: source,
    matches: (value) => values.has(value),
  }
}

function addCronToken(
  values: Set<number>,
  token: string,
  range: readonly [number, number],
  label: string,
  options: { allowSevenAsSunday?: boolean },
): void {
  const trimmed = token.trim()
  if (!trimmed) {
    throw new Error(`Cron ${label} field contains an empty token.`)
  }

  const [base, stepPart] = trimmed.split('/')
  const step = stepPart === undefined ? 1 : parsePositiveInteger(stepPart, `${label} step`)
  if (step < 1) {
    throw new Error(`Cron ${label} step must be at least 1.`)
  }

  if (base === '*') {
    for (let value = range[0]; value <= range[1]; value += step) {
      values.add(normalizeCronValue(value, range, options))
    }
    return
  }

  const [startRaw, endRaw] = base.includes('-') ? base.split('-', 2) : [base, base]
  const start = normalizeCronValue(parseCronValue(startRaw, range, label), range, options)
  const end = normalizeCronValue(parseCronValue(endRaw, range, label), range, options)

  if (end < start) {
    throw new Error(`Cron ${label} range must be ascending.`)
  }

  for (let value = start; value <= end; value += step) {
    values.add(normalizeCronValue(value, range, options))
  }
}

function parseCronValue(source: string, range: readonly [number, number], label: string): number {
  const value = parsePositiveInteger(source, label)
  if (value < range[0] || value > range[1]) {
    throw new Error(`Cron ${label} value must be between ${range[0]} and ${range[1]}.`)
  }
  return value
}

function normalizeCronValue(
  value: number,
  range: readonly [number, number],
  options: { allowSevenAsSunday?: boolean },
): number {
  if (options.allowSevenAsSunday && range === DAY_OF_WEEK_RANGE && value === 7) {
    return 0
  }
  return value
}

function parsePositiveInteger(source: string, label: string): number {
  if (!/^\d+$/.test(source.trim())) {
    throw new Error(`Cron ${label} must be numeric.`)
  }
  return Number.parseInt(source, 10)
}
