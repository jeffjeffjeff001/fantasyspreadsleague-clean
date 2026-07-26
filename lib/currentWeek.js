// lib/currentWeek.js

const EASTERN_TIME_ZONE = 'America/New_York'
const TUESDAY = 2
const ROLLOVER_HOUR = 22

const easternPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function getEasternParts(date) {
  const parts = Object.fromEntries(
    easternPartsFormatter
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  )

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

function easternLocalToDate({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
}) {
  const desiredUtcLike = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second
  )

  let candidate = new Date(desiredUtcLike)

  // Resolve the correct EST or EDT offset without hard-coding it.
  for (let i = 0; i < 2; i += 1) {
    const actual = getEasternParts(candidate)

    const actualUtcLike = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    )

    candidate = new Date(
      candidate.getTime() + (desiredUtcLike - actualUtcLike)
    )
  }

  return candidate
}

function addCalendarDays({ year, month, day }, daysToAdd) {
  const date = new Date(
    Date.UTC(year, month - 1, day + daysToAdd)
  )

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function getEasternWeekday({ year, month, day }) {
  return new Date(
    Date.UTC(year, month - 1, day)
  ).getUTCDay()
}

export function getTuesdayRolloverAfter(kickoffTime) {
  const kickoff = new Date(kickoffTime)

  if (Number.isNaN(kickoff.getTime())) {
    return null
  }

  const easternDate = getEasternParts(kickoff)
  const weekday = getEasternWeekday(easternDate)

  let daysUntilTuesday =
    (TUESDAY - weekday + 7) % 7

  let rolloverDate = addCalendarDays(
    easternDate,
    daysUntilTuesday
  )

  let rollover = easternLocalToDate({
    ...rolloverDate,
    hour: ROLLOVER_HOUR,
  })

  /*
   * A rare Tuesday night game that starts after 10:00 PM ET
   * should not cause the app to advance while that game is
   * still being played.
   */
  if (rollover.getTime() <= kickoff.getTime()) {
    rolloverDate = addCalendarDays(
      rolloverDate,
      7
    )

    rollover = easternLocalToDate({
      ...rolloverDate,
      hour: ROLLOVER_HOUR,
    })
  }

  return rollover
}

export function getCurrentWeek(
  games = [],
  now = new Date()
) {
  const weeks = new Map()

  for (const game of games || []) {
    const week = Number(game?.week)

    const kickoffMs = new Date(
      game?.kickoff_time
    ).getTime()

    if (
      !Number.isInteger(week) ||
      week < 1 ||
      Number.isNaN(kickoffMs)
    ) {
      continue
    }

    const previousLatest = weeks.get(week)

    if (
      previousLatest == null ||
      kickoffMs > previousLatest
    ) {
      weeks.set(week, kickoffMs)
    }
  }

  const availableWeeks = [...weeks.keys()]
    .sort((a, b) => a - b)

  if (availableWeeks.length === 0) {
    return 1
  }

  let currentWeek = availableWeeks[0]
  const nowMs = now.getTime()

  for (
    let index = 0;
    index < availableWeeks.length - 1;
    index += 1
  ) {
    const week = availableWeeks[index]
    const nextWeek = availableWeeks[index + 1]

    const rollover = getTuesdayRolloverAfter(
      weeks.get(week)
    )

    if (
      rollover &&
      nowMs >= rollover.getTime()
    ) {
      currentWeek = nextWeek
    } else {
      break
    }
  }

  return currentWeek
}

export async function fetchCurrentWeek(
  supabase,
  now = new Date()
) {
  const { data, error } = await supabase
    .from('games')
    .select('week,kickoff_time')
    .order('week', { ascending: true })
    .order('kickoff_time', { ascending: true })

  if (error) {
    throw error
  }

  return getCurrentWeek(data || [], now)
}
