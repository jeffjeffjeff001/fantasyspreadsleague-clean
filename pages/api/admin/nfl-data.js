// pages/api/admin/nfl-data.js

const NFL_SEASON = 2026

const NFLVERSE_GAMES_URL =
  'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'

const ODDS_API_BASE =
  'https://api.the-odds-api.com/v4'

const TEAM_NAMES = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB: 'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs',
  LA: 'Los Angeles Rams',
  LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams',
  LV: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE: 'New England Patriots',
  NO: 'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers',
  TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders',
  WSH: 'Washington Commanders',
}

function normalizeTeam(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function matchupKey(
  awayTeam,
  homeTeam
) {
  return `${normalizeTeam(
    awayTeam
  )}|${normalizeTeam(homeTeam)}`
}

function parseCsv(text) {
  const rows = []

  let row = []
  let field = ''
  let inQuotes = false

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"') {
      if (
        inQuotes &&
        next === '"'
      ) {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }

      continue
    }

    if (
      char === ',' &&
      !inQuotes
    ) {
      row.push(field)
      field = ''
      continue
    }

    if (
      (
        char === '\n' ||
        char === '\r'
      ) &&
      !inQuotes
    ) {
      if (
        char === '\r' &&
        next === '\n'
      ) {
        index += 1
      }

      row.push(field)
      field = ''

      if (
        row.some(
          value => value !== ''
        )
      ) {
        rows.push(row)
      }

      row = []
      continue
    }

    field += char
  }

  if (
    field !== '' ||
    row.length > 0
  ) {
    row.push(field)
    rows.push(row)
  }

  if (rows.length === 0) {
    return []
  }

  const headers = rows[0]

  return rows
    .slice(1)
    .map(values => {
      const record = {}

      headers.forEach(
        (header, index) => {
          record[header] =
            values[index] ?? ''
        }
      )

      return record
    })
}

const easternFormatter =
  new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone:
        'America/New_York',

      year: 'numeric',
      month: '2-digit',
      day: '2-digit',

      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',

      hourCycle: 'h23',
    }
  )

function getEasternParts(date) {
  return Object.fromEntries(
    easternFormatter
      .formatToParts(date)
      .filter(
        part =>
          part.type !==
          'literal'
      )
      .map(part => [
        part.type,
        Number(part.value),
      ])
  )
}

function easternLocalToUtc(
  gameday,
  gametime
) {
  if (
    !gameday ||
    !gametime
  ) {
    return null
  }

  const [
    year,
    month,
    day,
  ] = gameday
    .split('-')
    .map(Number)

  const [
    hour,
    minute,
  ] = gametime
    .split(':')
    .map(Number)

  if (
    !year ||
    !month ||
    !day ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null
  }

  const desiredUtcLike =
    Date.UTC(
      year,
      month - 1,
      day,
      hour,
      minute,
      0
    )

  let candidate =
    new Date(
      desiredUtcLike
    )

  for (
    let index = 0;
    index < 3;
    index += 1
  ) {
    const actual =
      getEasternParts(
        candidate
      )

    const actualUtcLike =
      Date.UTC(
        actual.year,
        actual.month - 1,
        actual.day,
        actual.hour,
        actual.minute,
        actual.second
      )

    candidate =
      new Date(
        candidate.getTime() +
          (
            desiredUtcLike -
            actualUtcLike
          )
      )
  }

  return candidate
    .toISOString()
}

async function fetchNflverseWeek(
  week
) {
  const response =
    await fetch(
      NFLVERSE_GAMES_URL,
      {
        headers: {
          'User-Agent':
            'Fantasy-Spreads-League/2026',
        },
      }
    )

  if (!response.ok) {
    throw new Error(
      `NFL schedule source returned ${response.status}.`
    )
  }

  const text =
    await response.text()

  const records =
    parseCsv(text)

  return records
    .filter(record =>
      Number(
        record.season
      ) === NFL_SEASON &&
      record.game_type ===
        'REG' &&
      Number(
        record.week
      ) === week
    )
    .map(record => ({
      nflverse_game_id:
        record.game_id,

      week:
        Number(
          record.week
        ),

      gameday:
        record.gameday,

      gametime:
        record.gametime,

      away_team:
        TEAM_NAMES[
          record.away_team
        ] ||
        record.away_team,

      home_team:
        TEAM_NAMES[
          record.home_team
        ] ||
        record.home_team,

      fallback_kickoff_time:
        easternLocalToUtc(
          record.gameday,
          record.gametime
        ),

      away_score:
        record.away_score ===
        ''
          ? null
          : Number(
              record.away_score
            ),

      home_score:
        record.home_score ===
        ''
          ? null
          : Number(
              record.home_score
            ),
    }))
}

async function fetchJson(url) {
  const response =
    await fetch(url)

  let data

  try {
    data =
      await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    const apiMessage =
      data?.message ||
      data?.error ||
      `Request failed with status ${response.status}.`

    throw new Error(
      apiMessage
    )
  }

  return {
    data,
    response,
  }
}

async function loadScheduleWithDraftKings(
  week
) {
  const apiKey =
    process.env
      .ODDS_API_KEY

  if (!apiKey) {
    throw new Error(
      'ODDS_API_KEY is not configured in Vercel.'
    )
  }

  const schedule =
    await fetchNflverseWeek(
      week
    )

  if (
    schedule.length === 0
  ) {
    throw new Error(
      `No ${NFL_SEASON} NFL regular-season games were found for Week ${week}.`
    )
  }

  const fallbackTimes =
    schedule
      .map(
        game =>
          game
            .fallback_kickoff_time
      )
      .filter(Boolean)
      .map(
        value =>
          new Date(
            value
          ).getTime()
      )

  const minTime =
    Math.min(
      ...fallbackTimes
    )

  const maxTime =
    Math.max(
      ...fallbackTimes
    )

const formatOddsApiTime = date =>
  new Date(date)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')

const commenceTimeFrom =
  formatOddsApiTime(
    minTime -
      24 *
        60 *
        60 *
        1000
  )

const commenceTimeTo =
  formatOddsApiTime(
    maxTime +
      24 *
        60 *
        60 *
        1000
  )

  const eventsUrl =
    new URL(
      `${ODDS_API_BASE}/sports/americanfootball_nfl/events`
    )

  eventsUrl
    .searchParams
    .set(
      'apiKey',
      apiKey
    )

  eventsUrl
    .searchParams
    .set(
      'dateFormat',
      'iso'
    )

  eventsUrl
    .searchParams
    .set(
      'commenceTimeFrom',
      commenceTimeFrom
    )

  eventsUrl
    .searchParams
    .set(
      'commenceTimeTo',
      commenceTimeTo
    )

  const oddsUrl =
    new URL(
      `${ODDS_API_BASE}/sports/americanfootball_nfl/odds`
    )

  oddsUrl
    .searchParams
    .set(
      'apiKey',
      apiKey
    )

  oddsUrl
    .searchParams
    .set(
      'bookmakers',
      'draftkings'
    )

  oddsUrl
    .searchParams
    .set(
      'markets',
      'spreads'
    )

  oddsUrl
    .searchParams
    .set(
      'oddsFormat',
      'american'
    )

  oddsUrl
    .searchParams
    .set(
      'dateFormat',
      'iso'
    )

  oddsUrl
    .searchParams
    .set(
      'commenceTimeFrom',
      commenceTimeFrom
    )

  oddsUrl
    .searchParams
    .set(
      'commenceTimeTo',
      commenceTimeTo
    )

  const [
    eventsResult,
    oddsResult,
  ] =
    await Promise.all([
      fetchJson(
        eventsUrl
          .toString()
      ),

      fetchJson(
        oddsUrl
          .toString()
      ),
    ])

  const events =
    Array.isArray(
      eventsResult.data
    )
      ? eventsResult.data
      : []

  const oddsEvents =
    Array.isArray(
      oddsResult.data
    )
      ? oddsResult.data
      : []

  const eventByMatchup =
    new Map()

  const oddsByMatchup =
    new Map()

  events.forEach(event => {
    eventByMatchup.set(
      matchupKey(
        event.away_team,
        event.home_team
      ),
      event
    )
  })

  oddsEvents.forEach(
    event => {
      oddsByMatchup.set(
        matchupKey(
          event.away_team,
          event.home_team
        ),
        event
      )
    }
  )

  const fetchedAt =
    new Date()
      .toISOString()

  const games =
    schedule.map(
      scheduleGame => {
        const key =
          matchupKey(
            scheduleGame
              .away_team,

            scheduleGame
              .home_team
          )

        const oddsEvent =
          oddsByMatchup
            .get(key)

        const baseEvent =
          oddsEvent ||
          eventByMatchup
            .get(key)

        const bookmaker =
          oddsEvent
            ?.bookmakers
            ?.find(
              item =>
                item.key ===
                'draftkings'
            )

        const spreadMarket =
          bookmaker
            ?.markets
            ?.find(
              market =>
                market.key ===
                'spreads'
            )

        const homeOutcome =
          spreadMarket
            ?.outcomes
            ?.find(
              outcome =>
                normalizeTeam(
                  outcome.name
                ) ===
                normalizeTeam(
                  scheduleGame
                    .home_team
                )
            )

        const homeSpread =
          typeof homeOutcome
            ?.point ===
          'number'
            ? homeOutcome
                .point
            : null

        const kickoffTime =
          baseEvent
            ?.commence_time ||
          scheduleGame
            .fallback_kickoff_time

        let status =
          'ready'

        if (
          !kickoffTime
        ) {
          status =
            'missing_kickoff'
        } else if (
          homeSpread ==
          null
        ) {
          status =
            'missing_spread'
        }

        return {
          ...scheduleGame,

          api_event_id:
            baseEvent
              ?.id ||
            null,

          kickoff_time:
            kickoffTime,

          home_spread:
            homeSpread,

          bookmaker:
            'DraftKings',

          bookmaker_last_update:
            spreadMarket
              ?.last_update ||
            bookmaker
              ?.last_update ||
            null,

          fetched_at:
            fetchedAt,

          status,
        }
      }
    )

  return {
    season:
      NFL_SEASON,

    week,

    bookmaker:
      'DraftKings',

    games,

    quota: {
      remaining:
        oddsResult
          .response
          .headers
          .get(
            'x-requests-remaining'
          ),

      used:
        oddsResult
          .response
          .headers
          .get(
            'x-requests-used'
          ),

      last:
        oddsResult
          .response
          .headers
          .get(
            'x-requests-last'
          ),
    },
  }
}

async function loadResults(
  week
) {
  const schedule =
    await fetchNflverseWeek(
      week
    )

  if (
    schedule.length === 0
  ) {
    throw new Error(
      `No ${NFL_SEASON} NFL regular-season games were found for Week ${week}.`
    )
  }

  return {
    season:
      NFL_SEASON,

    week,

    source:
      'nflverse',

    games:
      schedule.map(
        game => ({
          nflverse_game_id:
            game
              .nflverse_game_id,

          away_team:
            game.away_team,

          home_team:
            game.home_team,

          away_score:
            game.away_score,

          home_score:
            game.home_score,

          scores_available:
            Number.isFinite(
              game.away_score
            ) &&
            Number.isFinite(
              game.home_score
            ),
        })
      ),
  }
}

export default async function handler(
  req,
  res
) {
  if (
    req.method !== 'POST'
  ) {
    res.setHeader(
      'Allow',
      ['POST']
    )

    return res
      .status(405)
      .json({
        error:
          'Method not allowed.',
      })
  }

  const adminPassword =
    process.env
      .ADMIN_PASSWORD ||
    process.env
      .NEXT_PUBLIC_ADMIN_PASSWORD

  if (
    !adminPassword ||
    req.body
      ?.adminPassword !==
      adminPassword
  ) {
    return res
      .status(401)
      .json({
        error:
          'Unauthorized.',
      })
  }

  const week =
    Number(
      req.body?.week
    )

  const action =
    req.body?.action

  if (
    !Number.isInteger(
      week
    ) ||
    week < 1 ||
    week > 18
  ) {
    return res
      .status(400)
      .json({
        error:
          'Week must be between 1 and 18.',
      })
  }

  try {
    if (
      action ===
      'schedule'
    ) {
      const data =
        await loadScheduleWithDraftKings(
          week
        )

      return res
        .status(200)
        .json(data)
    }

    if (
      action ===
      'results'
    ) {
      const data =
        await loadResults(
          week
        )

      return res
        .status(200)
        .json(data)
    }

    return res
      .status(400)
      .json({
        error:
          'Invalid action.',
      })
  } catch (error) {
    console.error(
      'NFL admin data error:',
      error
    )

    return res
      .status(500)
      .json({
        error:
          error.message ||
          'Unable to load NFL data.',
      })
  }
}
