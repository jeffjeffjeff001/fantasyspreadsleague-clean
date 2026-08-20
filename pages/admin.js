// pages/admin.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'
import { fetchCurrentWeek } from '../lib/currentWeek'

function normalizeTeam(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function matchupKey(awayTeam, homeTeam) {
  return `${normalizeTeam(awayTeam)}|${normalizeTeam(homeTeam)}`
}

function isValidScore(value) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return false
  }

  const number = Number(value)

  return Number.isInteger(number) && number >= 0
}

function formatSpread(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '—'
  }

  return number > 0
    ? `+${number}`
    : String(number)
}

function isoToLocalDateTimeInput(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = number =>
    String(number).padStart(2, '0')

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('')
}

function localDateTimeInputToIso(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

export default function Admin() {
  const ADMIN_PW =
    process.env.NEXT_PUBLIC_ADMIN_PASSWORD

  // ================================================================
  // ADMIN / WEEK STATE
  // ================================================================

  const [enteredPw, setEnteredPw] =
    useState('')

  const [authorized, setAuthorized] =
    useState(false)

  const [selectedWeek, setSelectedWeek] =
    useState(1)

  const [weekReady, setWeekReady] =
    useState(false)

  const [weekError, setWeekError] =
    useState('')

  // ================================================================
  // PUBLISHED GAMES
  // ================================================================

  const [games, setGames] =
    useState([])

  const [loadingGames, setLoadingGames] =
    useState(false)

  const [newGameAway, setNewGameAway] =
    useState('')

  const [newGameHome, setNewGameHome] =
    useState('')

  const [
    newGameSpread,
    setNewGameSpread,
  ] = useState('')

  const [
    newGameKickoff,
    setNewGameKickoff,
  ] = useState('')

  // ================================================================
  // SCHEDULE + DRAFTKINGS PREVIEW
  // ================================================================

  const [
    schedulePreview,
    setSchedulePreview,
  ] = useState([])

  const [
    scheduleLoading,
    setScheduleLoading,
  ] = useState(false)

  const [
    schedulePublishing,
    setSchedulePublishing,
  ] = useState(false)

  const [
    scheduleMessage,
    setScheduleMessage,
  ] = useState('')

  const [
    scheduleError,
    setScheduleError,
  ] = useState('')

  const [
    scheduleMeta,
    setScheduleMeta,
  ] = useState(null)

  // ================================================================
  // RESULTS PREVIEW
  // ================================================================

  const [
    resultsPreview,
    setResultsPreview,
  ] = useState([])

  const [
    resultsLoading,
    setResultsLoading,
  ] = useState(false)

  const [
    resultsPublishing,
    setResultsPublishing,
  ] = useState(false)

  const [
    resultsMessage,
    setResultsMessage,
  ] = useState('')

  const [
    resultsError,
    setResultsError,
  ] = useState('')

  // ================================================================
  // USER MANAGEMENT
  // ================================================================

  const [profiles, setProfiles] =
    useState([])

  const [
    loadingProfiles,
    setLoadingProfiles,
  ] = useState(false)

  // ================================================================
  // VIEW USER PICKS
  // ================================================================

  const [
    userForPicks,
    setUserForPicks,
  ] = useState('')

  const [
    weekForPicks,
    setWeekForPicks,
  ] = useState(1)

  const [
    userPicks,
    setUserPicks,
  ] = useState([])

  const [
    loadingPicks,
    setLoadingPicks,
  ] = useState(false)

  // ================================================================
  // WEEKLY SCORES
  // ================================================================

  const [
    weeklyScores,
    setWeeklyScores,
  ] = useState([])

  const [
    loadingScores,
    setLoadingScores,
  ] = useState(false)

  // ================================================================
  // CURRENT WEEK
  // ================================================================

  useEffect(() => {
    let cancelled = false

    async function initializeWeek() {
      try {
        const currentWeek =
          await fetchCurrentWeek(supabase)

        if (!cancelled) {
          setSelectedWeek(currentWeek)
          setWeekForPicks(currentWeek)
        }
      } catch (error) {
        console.error(
          'Unable to determine current week:',
          error
        )

        if (!cancelled) {
          setWeekError(
            'The current week could not be determined automatically. Week 1 has been selected.'
          )
        }
      } finally {
        if (!cancelled) {
          setWeekReady(true)
        }
      }
    }

    initializeWeek()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!authorized || !weekReady) return

    loadGames()
  }, [
    authorized,
    selectedWeek,
    weekReady,
  ])

  useEffect(() => {
    if (!authorized) return

    loadProfiles()
  }, [authorized])

  // Clear previews if commissioner changes week.
  useEffect(() => {
    setSchedulePreview([])
    setScheduleMeta(null)
    setScheduleMessage('')
    setScheduleError('')

    setResultsPreview([])
    setResultsMessage('')
    setResultsError('')

    setWeeklyScores([])
  }, [selectedWeek])

  // ================================================================
  // ADMIN PASSWORD
  // ================================================================

  const handlePwSubmit = event => {
    event.preventDefault()

    if (enteredPw === ADMIN_PW) {
      setAuthorized(true)
    } else {
      alert('❌ Incorrect password')
      setEnteredPw('')
    }
  }

  if (!authorized) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Admin Login</h1>

        <form onSubmit={handlePwSubmit}>
          <label>
            Enter admin password:

            <input
              type="password"
              value={enteredPw}
              onChange={event =>
                setEnteredPw(
                  event.target.value
                )
              }
              style={{
                marginLeft: 8,
              }}
            />
          </label>

          <button
            type="submit"
            style={{
              marginLeft: 12,
            }}
          >
            Unlock
          </button>
        </form>
      </div>
    )
  }

  // ================================================================
  // LOAD PUBLISHED GAMES
  // ================================================================

  async function loadGames() {
    setLoadingGames(true)

    const { data, error } =
      await supabase
        .from('games')
        .select('*')
        .eq(
          'week',
          selectedWeek
        )
        .order(
          'kickoff_time',
          {
            ascending: true,
          }
        )

    if (error) {
      alert(
        'Error loading games: ' +
          error.message
      )

      setGames([])
    } else {
      setGames(data || [])
    }

    setLoadingGames(false)
  }

  // ================================================================
  // LOAD PROFILES
  // ================================================================

  async function loadProfiles() {
    setLoadingProfiles(true)

    const { data, error } =
      await supabase
        .from('profiles')
        .select(
          'email,username,first_name,last_name'
        )
        .order(
          'username',
          {
            ascending: true,
          }
        )

    if (error) {
      alert(
        'Error loading profiles: ' +
          error.message
      )

      setProfiles([])
    } else {
      setProfiles(data || [])
    }

    setLoadingProfiles(false)
  }

  // ================================================================
  // NFL DATA API
  // ================================================================

  async function requestNflData(action) {
    const response =
      await fetch(
        '/api/admin/nfl-data',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            action,
            week: selectedWeek,
            adminPassword:
              enteredPw,
          }),
        }
      )

    let payload = {}

    try {
      payload =
        await response.json()
    } catch {
      // Fallback handled below.
    }

    if (!response.ok) {
      throw new Error(
        payload.error ||
          'Unable to load NFL data.'
      )
    }

    return payload
  }

  // ================================================================
  // LOAD SCHEDULE + DRAFTKINGS SPREADS
  // ================================================================

  async function loadSchedulePreview() {
    setScheduleLoading(true)

    setScheduleMessage('')
    setScheduleError('')
    setSchedulePreview([])
    setScheduleMeta(null)

    try {
      const payload =
        await requestNflData(
          'schedule'
        )

      const rows =
        (payload.games || []).map(
          game => ({
            ...game,

            home_spread:
              game.home_spread ??
              '',
          })
        )

      setSchedulePreview(rows)

      setScheduleMeta({
        season:
          payload.season,

        week:
          payload.week,

        bookmaker:
          payload.bookmaker ||
          'DraftKings',

        quota:
          payload.quota ||
          null,

        fetchedAt:
          rows[0]
            ?.fetched_at ||
          new Date()
            .toISOString(),
      })

      if (rows.length === 0) {
        setScheduleError(
          `No Week ${selectedWeek} games were returned.`
        )
      } else {
        setScheduleMessage(
          `Loaded ${rows.length} Week ${selectedWeek} games for review. Nothing has been published yet.`
        )
      }
    } catch (error) {
      console.error(
        'Schedule preview error:',
        error
      )

      setScheduleError(
        error.message ||
          'Unable to load the weekly schedule.'
      )
    } finally {
      setScheduleLoading(false)
    }
  }

  // ================================================================
  // EDIT SCHEDULE PREVIEW
  // ================================================================

  function updateScheduleRow(
    index,
    field,
    value
  ) {
    setSchedulePreview(
      previous =>
        previous.map(
          (
            row,
            rowIndex
          ) =>
            rowIndex === index
              ? {
                  ...row,
                  [field]:
                    value,
                }
              : row
        )
    )

    setScheduleMessage('')
    setScheduleError('')
  }

  function getScheduleIssue(row) {
    if (
      !row.away_team?.trim()
    ) {
      return 'Missing away team'
    }

    if (
      !row.home_team?.trim()
    ) {
      return 'Missing home team'
    }

    if (
      row.home_spread ===
        '' ||
      row.home_spread ===
        null ||
      row.home_spread ===
        undefined ||
      !Number.isFinite(
        Number(
          row.home_spread
        )
      )
    ) {
      return 'Missing DraftKings spread'
    }

    const kickoff =
      new Date(
        row.kickoff_time
      )

    if (
      !row.kickoff_time ||
      Number.isNaN(
        kickoff.getTime()
      )
    ) {
      return 'Missing kickoff time'
    }

    return ''
  }

  // ================================================================
  // PUBLISH SCHEDULE
  // ================================================================

  async function publishSchedule() {
    setScheduleMessage('')
    setScheduleError('')

    if (
      schedulePreview.length ===
      0
    ) {
      setScheduleError(
        'Load the schedule before publishing.'
      )

      return
    }

    const problemRows =
      schedulePreview
        .map(
          (
            row,
            index
          ) => ({
            index,

            issue:
              getScheduleIssue(
                row
              ),
          })
        )
        .filter(
          item =>
            item.issue
        )

    if (
      problemRows.length >
      0
    ) {
      setScheduleError(
        `Cannot publish yet. ${problemRows.length} game${
          problemRows.length ===
          1
            ? ''
            : 's'
        } still need attention.`
      )

      return
    }

    const confirmed =
      window.confirm(
        `Publish Week ${selectedWeek} with the DraftKings lines shown in this preview?\n\nOnce published, these become the official Fantasy Spreads League lines visible to users.`
      )

    if (!confirmed) return

    setSchedulePublishing(
      true
    )

    try {
      // Safeguard:
      // never silently replace an already-published week.
      const {
        data:
          existingGames,

        error:
          existingError,
      } = await supabase
        .from('games')
        .select('id')
        .eq(
          'week',
          selectedWeek
        )
        .limit(1)

      if (
        existingError
      ) {
        throw existingError
      }

      if (
        existingGames &&
        existingGames.length >
          0
      ) {
        throw new Error(
          `Week ${selectedWeek} already has published games. Automatic republishing is blocked so official lines cannot change accidentally after users have seen them. Use the manual Game Management tools, or Clear Week only if you intentionally want to reset the entire week.`
        )
      }

      const rows =
        schedulePreview.map(
          row => ({
            week:
              selectedWeek,

            away_team:
              row.away_team
                .trim(),

            home_team:
              row.home_team
                .trim(),

            spread:
              Number(
                row.home_spread
              ),

            kickoff_time:
              new Date(
                row.kickoff_time
              ).toISOString(),

            odds_event_id:
              row.api_event_id ||
              null,

            spread_source:
              'DraftKings',

            spread_fetched_at:
              row.fetched_at ||
              scheduleMeta
                ?.fetchedAt ||
              new Date()
                .toISOString(),
          })
        )

      const {
        error:
          insertError,
      } = await supabase
        .from('games')
        .insert(rows)

      if (
        insertError
      ) {
        throw insertError
      }

      await loadGames()

      setSchedulePreview([])
      setScheduleMeta(null)

      setScheduleMessage(
        `✅ Week ${selectedWeek} published successfully. Users can now see these games on Submit Picks.`
      )
    } catch (error) {
      console.error(
        'Schedule publish error:',
        error
      )

      setScheduleError(
        error.message ||
          'Unable to publish the schedule.'
      )
    } finally {
      setSchedulePublishing(
        false
      )
    }
  }

  // ================================================================
  // LOAD RESULTS
  // ================================================================

  async function loadResultsPreview() {
    setResultsLoading(true)

    setResultsMessage('')
    setResultsError('')
    setResultsPreview([])

    try {
      const {
        data:
          publishedGames,

        error:
          gamesError,
      } = await supabase
        .from('games')
        .select(
          'id,away_team,home_team,kickoff_time'
        )
        .eq(
          'week',
          selectedWeek
        )
        .order(
          'kickoff_time',
          {
            ascending: true,
          }
        )

      if (
        gamesError
      ) {
        throw gamesError
      }

      if (
        !publishedGames ||
        publishedGames.length ===
          0
      ) {
        throw new Error(
          `Week ${selectedWeek} has no published games yet. Publish the weekly schedule before loading results.`
        )
      }

      const payload =
        await requestNflData(
          'results'
        )

      const publishedByMatchup =
        new Map(
          publishedGames.map(
            game => [
              matchupKey(
                game.away_team,
                game.home_team
              ),

              game,
            ]
          )
        )

      const matchedGameIds =
        new Set()

      const rows =
        (payload.games || []).map(
          result => {
            const key =
              matchupKey(
                result.away_team,
                result.home_team
              )

            const publishedGame =
              publishedByMatchup
                .get(key)

            if (
              publishedGame
            ) {
              matchedGameIds.add(
                String(
                  publishedGame.id
                )
              )
            }

            return {
              away_team:
                result.away_team,

              home_team:
                result.home_team,

              away_score:
                result.away_score ??
                '',

              home_score:
                result.home_score ??
                '',

              game_id:
                publishedGame
                  ?.id ||
                null,

              kickoff_time:
                publishedGame
                  ?.kickoff_time ||
                null,

              source_missing:
                false,
            }
          }
        )

      // If a published FSL game is missing
      // from the source, show it anyway so
      // commissioner can manually enter the result.
      publishedGames.forEach(
        game => {
          if (
            matchedGameIds.has(
              String(
                game.id
              )
            )
          ) {
            return
          }

          rows.push({
            away_team:
              game.away_team,

            home_team:
              game.home_team,

            away_score: '',
            home_score: '',

            game_id:
              game.id,

            kickoff_time:
              game.kickoff_time,

            source_missing:
              true,
          })
        }
      )

      rows.sort(
        (a, b) => {
          const aTime =
            new Date(
              a.kickoff_time ||
                0
            ).getTime()

          const bTime =
            new Date(
              b.kickoff_time ||
                0
            ).getTime()

          return (
            aTime - bTime
          )
        }
      )

      setResultsPreview(
        rows
      )

      const completeCount =
        rows.filter(
          row =>
            isValidScore(
              row.away_score
            ) &&
            isValidScore(
              row.home_score
            ) &&
            Boolean(
              row.game_id
            ) &&
            !row.source_missing
        ).length

      setResultsMessage(
        `Loaded Week ${selectedWeek} results for review: ${completeCount}/${rows.length} games currently have complete scores. Nothing has been approved yet.`
      )
    } catch (error) {
      console.error(
        'Results preview error:',
        error
      )

      setResultsError(
        error.message ||
          'Unable to load results.'
      )
    } finally {
      setResultsLoading(
        false
      )
    }
  }

  // ================================================================
  // EDIT RESULTS
  // ================================================================

  function updateResultRow(
    index,
    field,
    value
  ) {
    setResultsPreview(
      previous =>
        previous.map(
          (
            row,
            rowIndex
          ) =>
            rowIndex === index
              ? {
                  ...row,
                  [field]:
                    value,
                }
              : row
        )
    )

    setResultsMessage('')
    setResultsError('')
  }

  function getResultIssue(row) {
    if (!row.game_id) {
      return (
        'No matching published game'
      )
    }

    if (
      !isValidScore(
        row.away_score
      ) ||
      !isValidScore(
        row.home_score
      )
    ) {
      return (
        'Final score not available'
      )
    }

    return ''
  }

  // ================================================================
  // APPROVE RESULTS
  // ================================================================

  async function publishResults() {
    setResultsMessage('')
    setResultsError('')

    if (
      resultsPreview.length ===
      0
    ) {
      setResultsError(
        'Load the results before approving them.'
      )

      return
    }

    const problemRows =
      resultsPreview
        .map(
          (
            row,
            index
          ) => ({
            index,

            issue:
              getResultIssue(
                row
              ),
          })
        )
        .filter(
          item =>
            item.issue
        )

    if (
      problemRows.length >
      0
    ) {
      setResultsError(
        `Cannot approve results yet. ${problemRows.length} game${
          problemRows.length ===
          1
            ? ''
            : 's'
        } still need a final score or matchup review.`
      )

      return
    }

    const confirmed =
      window.confirm(
        `Approve all Week ${selectedWeek} final scores?\n\nThese results will immediately become the official results used by the scoring views.`
      )

    if (!confirmed) return

    setResultsPublishing(
      true
    )

    try {
      const rows =
        resultsPreview.map(
          row => ({
            week:
              selectedWeek,

            away_team:
              row.away_team,

            home_team:
              row.home_team,

            away_score:
              Number(
                row.away_score
              ),

            home_score:
              Number(
                row.home_score
              ),

            game_id:
              row.game_id,
          })
        )

      const {
        error:
          upsertError,
      } = await supabase
        .from('results')
        .upsert(
          rows,
          {
            onConflict:
              'game_id',
          }
        )

      if (
        upsertError
      ) {
        throw upsertError
      }

      setResultsMessage(
        `✅ Week ${selectedWeek} results approved successfully. You can now click Calculate Scores below to review the week's scoring.`
      )
    } catch (error) {
      console.error(
        'Results publish error:',
        error
      )

      setResultsError(
        error.message ||
          'Unable to approve results.'
      )
    } finally {
      setResultsPublishing(
        false
      )
    }
  }

  // ================================================================
  // MANUAL ADD GAME
  // ================================================================

  async function handleAddGame() {
    const spread =
      parseFloat(
        newGameSpread
      )

    const kickoff =
      new Date(
        newGameKickoff
      )

    if (
      !newGameAway.trim() ||
      !newGameHome.trim()
    ) {
      alert(
        'Please enter both the away team and home team.'
      )

      return
    }

    if (
      Number.isNaN(
        spread
      )
    ) {
      alert(
        'Please enter a valid spread.'
      )

      return
    }

    if (
      Number.isNaN(
        kickoff.getTime()
      )
    ) {
      alert(
        'Please enter a valid kickoff date and time.'
      )

      return
    }

    const {
      error,
    } = await supabase
      .from('games')
      .insert([
        {
          week:
            selectedWeek,

          away_team:
            newGameAway
              .trim(),

          home_team:
            newGameHome
              .trim(),

          spread,

          kickoff_time:
            kickoff
              .toISOString(),

          odds_event_id:
            null,

          spread_source:
            'Manual',

          spread_fetched_at:
            new Date()
              .toISOString(),
        },
      ])

    if (error) {
      alert(
        'Error adding game: ' +
          error.message
      )
    } else {
      setNewGameAway('')
      setNewGameHome('')
      setNewGameSpread('')
      setNewGameKickoff('')

      loadGames()
    }
  }

  // ================================================================
  // DELETE ONE GAME
  // ================================================================

  async function handleDeleteGame(
    id
  ) {
    if (
      !confirm(
        'Delete this game, its result, and all associated picks?'
      )
    ) {
      return
    }

    const {
      error:
        picksError,
    } = await supabase
      .from('picks')
      .delete()
      .eq(
        'game_id',
        id
      )

    if (
      picksError
    ) {
      alert(
        'Error deleting associated picks: ' +
          picksError.message
      )

      return
    }

    const {
      error:
        resultError,
    } = await supabase
      .from('results')
      .delete()
      .eq(
        'game_id',
        id
      )

    if (
      resultError
    ) {
      alert(
        'Error deleting associated result: ' +
          resultError.message
      )

      return
    }

    const {
      error:
        gameError,
    } = await supabase
      .from('games')
      .delete()
      .eq(
        'id',
        id
      )

    if (
      gameError
    ) {
      alert(
        'Error deleting game: ' +
          gameError.message
      )
    } else {
      loadGames()
    }
  }

  // ================================================================
  // CLEAR WEEK
  // ================================================================

  async function handleClearWeek() {
    if (
      !confirm(
        `Clear ALL games, results, and picks for Week ${selectedWeek}?\n\nThis should only be used if you intentionally want to reset the entire week.`
      )
    ) {
      return
    }

    const {
      data:
        weekGames,

      error:
        gameLookupError,
    } = await supabase
      .from('games')
      .select('id')
      .eq(
        'week',
        selectedWeek
      )

    if (
      gameLookupError
    ) {
      alert(
        'Error locating week games: ' +
          gameLookupError.message
      )

      return
    }

    const gameIds =
      (weekGames || []).map(
        game =>
          game.id
      )

    if (
      gameIds.length >
      0
    ) {
      const {
        error:
          picksError,
      } = await supabase
        .from('picks')
        .delete()
        .in(
          'game_id',
          gameIds
        )

      if (
        picksError
      ) {
        alert(
          'Error clearing picks: ' +
            picksError.message
        )

        return
      }

      const {
        error:
          resultsError,
      } = await supabase
        .from('results')
        .delete()
        .in(
          'game_id',
          gameIds
        )

      if (
        resultsError
      ) {
        alert(
          'Error clearing results: ' +
            resultsError.message
        )

        return
      }
    }

    const {
      error:
        gamesError,
    } = await supabase
      .from('games')
      .delete()
      .eq(
        'week',
        selectedWeek
      )

    if (
      gamesError
    ) {
      alert(
        'Error clearing games: ' +
          gamesError.message
      )
    } else {
      setGames([])
      setSchedulePreview([])
      setResultsPreview([])
      setWeeklyScores([])

      alert(
        `Week ${selectedWeek} has been cleared.`
      )
    }
  }

  // ================================================================
  // DELETE USER
  // ================================================================

  async function handleDeleteUser(
    email
  ) {
    if (
      !confirm(
        `Delete user ${email}?`
      )
    ) {
      return
    }

    const response =
      await fetch(
        '/api/delete-profile',
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify({
              email,
            }),
        }
      )

    const result =
      await response.json()

    if (
      result.error
    ) {
      alert(
        'Error deleting user: ' +
          result.error
      )
    } else {
      loadProfiles()
    }
  }

  // ================================================================
  // LOAD USER PICKS
  // ================================================================

  async function loadUserPicks() {
    if (
      !userForPicks
    ) {
      alert(
        'Please select a user'
      )

      return
    }

    setLoadingPicks(
      true
    )

    const {
      data,
      error,
    } = await supabase
      .from('picks')
      .select(`
        id,
        selected_team,
        is_lock,
        games (
          away_team,
          home_team,
          kickoff_time,
          week
        )
      `)
      .eq(
        'user_email',
        userForPicks
      )
      .eq(
        'games.week',
        weekForPicks
      )
      .order(
        'kickoff_time',
        {
          foreignTable:
            'games',

          ascending:
            true,
        }
      )

    if (error) {
      alert(
        'Error loading picks: ' +
          error.message
      )

      setUserPicks([])
      setLoadingPicks(
        false
      )

      return
    }

    const valid =
      (data || []).filter(
        pick =>
          pick.games &&
          pick.games
            .kickoff_time
      )

    setUserPicks(
      valid
    )

    setLoadingPicks(
      false
    )
  }

  // ================================================================
  // DELETE PICK
  // ================================================================

  async function handleDeletePick(
    pickId
  ) {
    if (
      !confirm(
        'Delete this pick?'
      )
    ) {
      return
    }

    const {
      error,
    } = await supabase
      .from('picks')
      .delete()
      .eq(
        'id',
        pickId
      )

    if (error) {
      alert(
        'Error deleting pick: ' +
          error.message
      )
    } else {
      loadUserPicks()
    }
  }

  // ================================================================
  // CALCULATE WEEKLY SCORES
  // ================================================================

  async function calculateScores() {
    setLoadingScores(
      true
    )

    try {
      const {
        data:
          profileRows,

        error:
          profileError,
      } = await supabase
        .from('profiles')
        .select(
          'email,username'
        )

      if (
        profileError
      ) {
        throw profileError
      }

      const {
        data:
          results,

        error:
          resultsError,
      } = await supabase
        .from('results')
        .select(
          'home_team,away_team,home_score,away_score,week'
        )
        .eq(
          'week',
          selectedWeek
        )

      if (
        resultsError
      ) {
        throw resultsError
      }

      const normalize =
        value =>
          (
            value ??
            ''
          ).trim()

      const {
        data:
          totals,

        error:
          totalsError,
      } = await supabase
        .from('picks')
        .select(
          'user_email,games!inner(week)'
        )
        .eq(
          'games.week',
          selectedWeek
        )

      if (
        totalsError
      ) {
        throw totalsError
      }

      const weeklyTotalByUser =
        {}

      for (
        const row of
          totals ||
        []
      ) {
        weeklyTotalByUser[
          row.user_email
        ] =
          (
            weeklyTotalByUser[
              row.user_email
            ] ||
            0
          ) + 1
      }

      const {
        data:
          picks,

        error:
          picksError,
      } = await supabase
        .from('picks')
        .select(`
          user_email,
          selected_team,
          is_lock,
          games!inner (
            home_team,
            away_team,
            spread,
            week
          )
        `)
        .eq(
          'games.week',
          selectedWeek
        )

      if (
        picksError
      ) {
        throw picksError
      }

      const stats = {}

      profileRows.forEach(
        profile => {
          stats[
            profile.email
          ] = {
            email:
              profile.email,

            weeklyPoints:
              0,

            correct:
              0,

            lockCorrect:
              0,

            lockIncorrect:
              0,

            perfectBonus:
              0,

            weeklyTotal:
              weeklyTotalByUser[
                profile.email
              ] ||
              0,
          }
        }
      )

      for (
        const pick of
          picks ||
        []
      ) {
        const game =
          pick.games

        if (!game) continue

        const user =
          stats[
            pick.user_email
          ]

        if (!user) continue

        const result =
          results.find(
            row =>
              row.week ===
                game.week &&

              normalize(
                row.home_team
              ) ===
                normalize(
                  game.home_team
                ) &&

              normalize(
                row.away_team
              ) ===
                normalize(
                  game.away_team
                )
          )

        if (!result) continue

        const spread =
          Number(
            game.spread
          )

        const adjustedHomeScore =
          Number(
            result.home_score
          ) +
          spread

        const awayScore =
          Number(
            result.away_score
          )

        // Preserve existing FSL push behavior.
        if (
          adjustedHomeScore ===
          awayScore
        ) {
          if (
            pick.is_lock
          ) {
            user.lockIncorrect +=
              1

            user.weeklyPoints -=
              2
          }

          continue
        }

        const homeCover =
          adjustedHomeScore >
          awayScore

        const winner =
          homeCover
            ? normalize(
                result.home_team
              )
            : normalize(
                result.away_team
              )

        const picked =
          normalize(
            pick.selected_team
          )

        if (
          picked === winner
        ) {
          user.correct +=
            1

          user.weeklyPoints +=
            1

          if (
            pick.is_lock
          ) {
            user.lockCorrect +=
              1

            user.weeklyPoints +=
              2
          }
        } else if (
          pick.is_lock
        ) {
          user.lockIncorrect +=
            1

          user.weeklyPoints -=
            2
        }
      }

      for (
        const user of
          Object.values(
            stats
          )
      ) {
        if (
          user.weeklyTotal >
            0 &&
          user.correct ===
            user.weeklyTotal
        ) {
          user.perfectBonus =
            3

          user.weeklyPoints +=
            3
        }
      }

      const rows =
        Object.values(
          stats
        )
          .filter(
            user =>
              user.weeklyTotal >
              0
          )
          .sort(
            (
              a,
              b
            ) =>
              b.weeklyPoints -
                a.weeklyPoints ||
              b.correct -
                a.correct
          )

      setWeeklyScores(
        rows
      )
    } catch (error) {
      console.error(
        error
      )

      alert(
        'Error calculating scores: ' +
          error.message
      )

      setWeeklyScores([])
    } finally {
      setLoadingScores(
        false
      )
    }
  }

  // ================================================================
  // READY COUNTS
  // ================================================================

  const scheduleReadyCount =
    schedulePreview.filter(
      row =>
        !getScheduleIssue(
          row
        )
    ).length

  const resultsReadyCount =
    resultsPreview.filter(
      row =>
        !getResultIssue(
          row
        )
    ).length

  // ================================================================
  // RENDER
  // ================================================================

  return (
    <div
      style={{
        padding: 20,
      }}
    >
      <h1>Admin</h1>

      <p>
        <Link href="/">
          <a>← Home</a>
        </Link>
      </p>

      {weekError && (
        <p
          style={{
            color:
              '#a67c00',
          }}
        >
          ⚠️ {weekError}
        </p>
      )}

      {/* ========================================================= */}
      {/* AUTOMATED NFL DATA */}
      {/* ========================================================= */}

      <section
        className="admin-panel"
      >
        <h2>
          Weekly NFL Data — Week{' '}
          {selectedWeek}
        </h2>

        <p
          className="panel-note"
        >
          Load data into a private commissioner preview first.
          Nothing becomes visible to league users until you approve it.
        </p>

        <div
          className="week-row"
        >
          <label>
            Week:&nbsp;

            <select
              value={
                selectedWeek
              }
              onChange={
                event =>
                  setSelectedWeek(
                    parseInt(
                      event.target
                        .value,
                      10
                    )
                  )
              }
              disabled={
                !weekReady
              }
            >
              {Array.from(
                {
                  length: 18,
                },
                (
                  _,
                  index
                ) =>
                  index + 1
              ).map(
                week => (
                  <option
                    key={
                      week
                    }
                    value={
                      week
                    }
                  >
                    {week}
                  </option>
                )
              )}
            </select>
          </label>

          <small
            className="muted"
          >
            Automatically opens to the current week.
          </small>
        </div>

        {/* ===================================================== */}
        {/* SCHEDULE + SPREADS */}
        {/* ===================================================== */}

        <div
          className="data-block"
        >
          <h3>
            1. Schedule + DraftKings Spreads
          </h3>

          <p
            className="panel-note"
          >
            DraftKings is the official automated line source.
            The spread shown here is always the home-team spread.
            You may edit any value before publishing.
          </p>

          <button
            className="admin-button load-button"
            onClick={
              loadSchedulePreview
            }
            disabled={
              scheduleLoading ||
              schedulePublishing
            }
          >
            {scheduleLoading
              ? 'Loading Schedule…'
              : `Load Week ${selectedWeek} Schedule + DraftKings Spreads`}
          </button>

          {scheduleMeta && (
            <div
              className="source-summary"
            >
              <strong>
                Source:
              </strong>{' '}
              {
                scheduleMeta.bookmaker
              }

              {' • '}

              <strong>
                Retrieved:
              </strong>{' '}

              {new Date(
                scheduleMeta
                  .fetchedAt
              ).toLocaleString()}

              {scheduleMeta
                .quota
                ?.remaining !=
                null && (
                <>
                  {' • '}

                  <strong>
                    Odds API credits remaining:
                  </strong>{' '}

                  {
                    scheduleMeta
                      .quota
                      .remaining
                  }
                </>
              )}
            </div>
          )}

          {scheduleMessage && (
            <div
              className="message success-lite"
            >
              {
                scheduleMessage
              }
            </div>
          )}

          {scheduleError && (
            <div
              className="message error-lite"
            >
              {
                scheduleError
              }
            </div>
          )}

          {schedulePreview.length >
            0 && (
            <>
              <p>
                Ready to publish:{' '}

                <strong>
                  {
                    scheduleReadyCount
                  }
                  /
                  {
                    schedulePreview.length
                  }
                </strong>
              </p>

              <div
                className="table-scroll"
              >
                <table
                  className="review-table"
                >
                  <thead>
                    <tr>
                      <th>
                        Away
                      </th>

                      <th>
                        Home
                      </th>

                      <th>
                        Home Spread
                      </th>

                      <th>
                        Kickoff
                      </th>

                      <th>
                        Source
                      </th>

                      <th>
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {schedulePreview.map(
                      (
                        row,
                        index
                      ) => {
                        const issue =
                          getScheduleIssue(
                            row
                          )

                        return (
                          <tr
                            key={
                              row.api_event_id ||
                              row.nflverse_game_id ||
                              index
                            }
                          >
                            <td>
                              <input
                                className="table-input team-input"
                                value={
                                  row.away_team
                                }
                                onChange={
                                  event =>
                                    updateScheduleRow(
                                      index,
                                      'away_team',
                                      event.target
                                        .value
                                    )
                                }
                              />
                            </td>

                            <td>
                              <input
                                className="table-input team-input"
                                value={
                                  row.home_team
                                }
                                onChange={
                                  event =>
                                    updateScheduleRow(
                                      index,
                                      'home_team',
                                      event.target
                                        .value
                                    )
                                }
                              />
                            </td>

                            <td>
                              <input
                                className="table-input spread-input"
                                type="number"
                                step="0.5"
                                value={
                                  row.home_spread
                                }
                                onChange={
                                  event =>
                                    updateScheduleRow(
                                      index,
                                      'home_spread',
                                      event.target
                                        .value
                                    )
                                }
                              />
                            </td>

                            <td>
                              <input
                                className="table-input kickoff-input"
                                type="datetime-local"
                                value={
                                  isoToLocalDateTimeInput(
                                    row.kickoff_time
                                  )
                                }
                                onChange={
                                  event =>
                                    updateScheduleRow(
                                      index,
                                      'kickoff_time',
                                      localDateTimeInputToIso(
                                        event.target
                                          .value
                                      )
                                    )
                                }
                              />
                            </td>

                            <td>
                              DraftKings
                            </td>

                            <td>
                              {issue ? (
                                <span
                                  className="status-bad"
                                >
                                  ⚠️{' '}
                                  {
                                    issue
                                  }
                                </span>
                              ) : (
                                <span
                                  className="status-good"
                                >
                                  ✓ Ready
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      }
                    )}
                  </tbody>
                </table>
              </div>

              <button
                className="admin-button approve-button"
                onClick={
                  publishSchedule
                }
                disabled={
                  schedulePublishing ||
                  scheduleReadyCount !==
                    schedulePreview.length
                }
              >
                {schedulePublishing
                  ? 'Publishing…'
                  : `Approve & Publish Week ${selectedWeek}`}
              </button>
            </>
          )}
        </div>

        {/* ===================================================== */}
        {/* RESULTS */}
        {/* ===================================================== */}

        <div
          className="data-block"
        >
          <h3>
            2. Final Results
          </h3>

          <p
            className="panel-note"
          >
            Load final scores after the week's games are complete.
            Review every score before approving it.
          </p>

          <button
            className="admin-button load-button"
            onClick={
              loadResultsPreview
            }
            disabled={
              resultsLoading ||
              resultsPublishing
            }
          >
            {resultsLoading
              ? 'Loading Results…'
              : `Load Week ${selectedWeek} Results`}
          </button>

          {resultsMessage && (
            <div
              className="message success-lite"
            >
              {
                resultsMessage
              }
            </div>
          )}

          {resultsError && (
            <div
              className="message error-lite"
            >
              {
                resultsError
              }
            </div>
          )}

          {resultsPreview.length >
            0 && (
            <>
              <p>
                Ready to approve:{' '}

                <strong>
                  {
                    resultsReadyCount
                  }
                  /
                  {
                    resultsPreview.length
                  }
                </strong>
              </p>

              <div
                className="table-scroll"
              >
                <table
                  className="review-table results-table"
                >
                  <thead>
                    <tr>
                      <th>
                        Away
                      </th>

                      <th>
                        Away Score
                      </th>

                      <th>
                        Home
                      </th>

                      <th>
                        Home Score
                      </th>

                      <th>
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {resultsPreview.map(
                      (
                        row,
                        index
                      ) => {
                        const issue =
                          getResultIssue(
                            row
                          )

                        return (
                          <tr
                            key={
                              row.game_id ||
                              `${row.away_team}-${row.home_team}-${index}`
                            }
                          >
                            <td>
                              {
                                row.away_team
                              }
                            </td>

                            <td>
                              <input
                                className="table-input score-input"
                                type="number"
                                min="0"
                                step="1"
                                value={
                                  row.away_score
                                }
                                onChange={
                                  event =>
                                    updateResultRow(
                                      index,
                                      'away_score',
                                      event.target
                                        .value
                                    )
                                }
                              />
                            </td>

                            <td>
                              {
                                row.home_team
                              }
                            </td>

                            <td>
                              <input
                                className="table-input score-input"
                                type="number"
                                min="0"
                                step="1"
                                value={
                                  row.home_score
                                }
                                onChange={
                                  event =>
                                    updateResultRow(
                                      index,
                                      'home_score',
                                      event.target
                                        .value
                                    )
                                }
                              />
                            </td>

                            <td>
                              {issue ? (
                                <span
                                  className="status-bad"
                                >
                                  ⚠️{' '}
                                  {
                                    issue
                                  }
                                </span>
                              ) : row.source_missing ? (
                                <span
                                  className="status-manual"
                                >
                                  ✓ Ready
                                  (manual)
                                </span>
                              ) : (
                                <span
                                  className="status-good"
                                >
                                  ✓ Ready
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      }
                    )}
                  </tbody>
                </table>
              </div>

              <button
                className="admin-button approve-button"
                onClick={
                  publishResults
                }
                disabled={
                  resultsPublishing ||
                  resultsReadyCount !==
                    resultsPreview.length
                }
              >
                {resultsPublishing
                  ? 'Approving…'
                  : `Approve Week ${selectedWeek} Results`}
              </button>
            </>
          )}
        </div>
      </section>

      {/* ========================================================= */}
      {/* PUBLISHED GAME MANAGEMENT */}
      {/* ========================================================= */}

      <section
        style={{
          marginTop: 40,
        }}
      >
        <h2>
          Published Game Management
          {' '}
          (Week{' '}
          {selectedWeek})
        </h2>

        <div
          style={{
            marginBottom: 12,
          }}
        >
          <button
            onClick={
              handleClearWeek
            }
            disabled={
              !weekReady
            }
            className="danger-button"
          >
            Clear Week
          </button>

          <small
            style={{
              marginLeft: 10,
              color:
                '#64748b',
            }}
          >
            Emergency/manual controls. Clear Week deletes that week's
            games, results, and picks.
          </small>
        </div>

        {!weekReady ||
        loadingGames ? (
          <p>
            Loading Week{' '}
            {selectedWeek}{' '}
            games…
          </p>
        ) : (
          <div
            className="table-scroll"
          >
            <table
              className="review-table"
            >
              <thead>
                <tr>
                  <th>
                    Away
                  </th>

                  <th>
                    Home
                  </th>

                  <th>
                    Home Spread
                  </th>

                  <th>
                    Kickoff
                  </th>

                  <th>
                    Source
                  </th>

                  <th>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {games.map(
                  game => (
                    <tr
                      key={
                        game.id
                      }
                    >
                      <td>
                        {
                          game.away_team
                        }
                      </td>

                      <td>
                        {
                          game.home_team
                        }
                      </td>

                      <td
                        className="center"
                      >
                        {formatSpread(
                          game.spread
                        )}
                      </td>

                      <td>
                        {new Date(
                          game.kickoff_time
                        ).toLocaleString()}
                      </td>

                      <td
                        className="center"
                      >
                        {game.spread_source ||
                          '—'}
                      </td>

                      <td
                        className="center"
                      >
                        <button
                          onClick={() =>
                            handleDeleteGame(
                              game.id
                            )
                          }
                          className="small-danger-button"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )}

                {games.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="center"
                    >
                      No published games found for Week{' '}
                      {
                        selectedWeek
                      }.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div
          className="manual-game-row"
        >
          <strong>
            Manual fallback:
          </strong>

          <input
            placeholder="Away Team"
            value={
              newGameAway
            }
            onChange={
              event =>
                setNewGameAway(
                  event.target
                    .value
                )
            }
          />

          <input
            placeholder="Home Team"
            value={
              newGameHome
            }
            onChange={
              event =>
                setNewGameHome(
                  event.target
                    .value
                )
            }
          />

          <input
            placeholder="Home Spread"
            type="number"
            step="0.5"
            value={
              newGameSpread
            }
            onChange={
              event =>
                setNewGameSpread(
                  event.target
                    .value
                )
            }
          />

          <input
            placeholder="Kickoff (ISO)"
            value={
              newGameKickoff
            }
            onChange={
              event =>
                setNewGameKickoff(
                  event.target
                    .value
                )
            }
          />

          <button
            onClick={
              handleAddGame
            }
            disabled={
              !weekReady
            }
          >
            Add Game
          </button>
        </div>
      </section>

      {/* ========================================================= */}
      {/* USER MANAGEMENT */}
      {/* ========================================================= */}

      <section
        style={{
          marginTop: 40,
        }}
      >
        <h2>
          User Management
        </h2>

        {loadingProfiles ? (
          <p>
            Loading profiles…
          </p>
        ) : (
          <div
            className="table-scroll"
          >
            <table
              className="review-table"
            >
              <thead>
                <tr>
                  <th>
                    Username
                  </th>

                  <th>
                    Name
                  </th>

                  <th>
                    Email
                  </th>

                  <th>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {profiles.map(
                  profile => (
                    <tr
                      key={
                        profile.email
                      }
                    >
                      <td>
                        {
                          profile.username
                        }
                      </td>

                      <td>
                        {
                          profile.first_name
                        }{' '}
                        {
                          profile.last_name
                        }
                      </td>

                      <td>
                        {
                          profile.email
                        }
                      </td>

                      <td
                        className="center"
                      >
                        <button
                          onClick={() =>
                            handleDeleteUser(
                              profile.email
                            )
                          }
                          className="small-danger-button"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* VIEW USER PICKS */}
      {/* ========================================================= */}

      <section
        style={{
          marginTop: 40,
        }}
      >
        <h2>
          View User Picks
        </h2>

        <div
          style={{
            marginBottom: 12,
          }}
        >
          <select
            value={
              userForPicks
            }
            onChange={
              event =>
                setUserForPicks(
                  event.target
                    .value
                )
            }
          >
            <option
              value=""
            >
              Select user
            </option>

            {profiles.map(
              profile => (
                <option
                  key={
                    profile.email
                  }
                  value={
                    profile.email
                  }
                >
                  {
                    profile.username
                  }
                </option>
              )
            )}
          </select>

          <select
            value={
              weekForPicks
            }
            onChange={
              event =>
                setWeekForPicks(
                  parseInt(
                    event.target
                      .value,
                    10
                  )
                )
            }
            disabled={
              !weekReady
            }
            style={{
              width: 60,
              marginLeft: 8,
            }}
          >
            {Array.from(
              {
                length: 18,
              },
              (
                _,
                index
              ) =>
                index + 1
            ).map(
              week => (
                <option
                  key={
                    week
                  }
                  value={
                    week
                  }
                >
                  {week}
                </option>
              )
            )}
          </select>

          <button
            onClick={
              loadUserPicks
            }
            disabled={
              loadingPicks ||
              !weekReady
            }
            style={{
              marginLeft: 8,
            }}
          >
            {loadingPicks
              ? 'Loading…'
              : 'Load Picks'}
          </button>
        </div>

        {loadingPicks ? (
          <p>
            Loading picks…
          </p>
        ) : (
          <div
            className="table-scroll"
          >
            <table
              className="review-table"
            >
              <thead>
                <tr>
                  <th>
                    Game
                  </th>

                  <th>
                    Pick
                  </th>

                  <th>
                    Lock?
                  </th>

                  <th>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {userPicks.map(
                  pick => (
                    <tr
                      key={
                        pick.id
                      }
                    >
                      <td>
                        {
                          pick.games
                            .away_team
                        }{' '}
                        @{' '}
                        {
                          pick.games
                            .home_team
                        }

                        <br />

                        <small>
                          {new Date(
                            pick.games
                              .kickoff_time
                          ).toLocaleString()}
                        </small>
                      </td>

                      <td>
                        {
                          pick.selected_team
                        }
                      </td>

                      <td
                        className="center"
                      >
                        {pick.is_lock
                          ? '✅'
                          : ''}
                      </td>

                      <td
                        className="center"
                      >
                        <button
                          onClick={() =>
                            handleDeletePick(
                              pick.id
                            )
                          }
                          className="small-danger-button"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )}

                {userPicks.length ===
                  0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="center"
                    >
                      No picks found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* CALCULATE SCORES */}
      {/* ========================================================= */}

      <section
        style={{
          marginTop: 40,
        }}
      >
        <h2>
          Calculate Scores
          {' '}
          (Week{' '}
          {selectedWeek})
        </h2>

        <p
          className="panel-note"
        >
          Approve the final results above first, then use this button
          to review each user's weekly scoring.
        </p>

        <button
          className="admin-button calculate-button"
          onClick={
            calculateScores
          }
          disabled={
            loadingScores ||
            !weekReady
          }
        >
          {loadingScores
            ? 'Calculating…'
            : 'Calculate Scores'}
        </button>

        {weeklyScores.length >
          0 && (
          <div
            className="table-scroll"
          >
            <table
              className="review-table score-table"
            >
              <thead>
                <tr>
                  <th>
                    Email
                  </th>

                  <th>
                    Points
                  </th>

                  <th>
                    Correct
                  </th>

                  <th>
                    Lock ✔
                  </th>

                  <th>
                    Lock ✘
                  </th>

                  <th>
                    Bonus
                  </th>
                </tr>
              </thead>

              <tbody>
                {weeklyScores.map(
                  user => (
                    <tr
                      key={
                        user.email
                      }
                    >
                      <td>
                        {
                          user.email
                        }
                      </td>

                      <td
                        className="center"
                      >
                        {
                          user.weeklyPoints
                        }
                      </td>

                      <td
                        className="center"
                      >
                        {
                          user.correct
                        }
                      </td>

                      <td
                        className="center"
                      >
                        {
                          user.lockCorrect
                        }
                      </td>

                      <td
                        className="center"
                      >
                        {
                          user.lockIncorrect
                        }
                      </td>

                      <td
                        className="center"
                      >
                        {
                          user.perfectBonus
                        }
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* STYLES */}
      {/* ========================================================= */}

      <style jsx>{`
        .admin-panel {
          margin-top: 20px;
          padding: 20px;
          border: 1px solid #334155;
          border-radius: 10px;
        }

        .data-block {
          margin-top: 28px;
          padding-top: 22px;
          border-top: 1px solid #334155;
        }

        .panel-note {
          max-width: 900px;
          color: #94a3b8;
          line-height: 1.5;
        }

        .week-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 12px;
        }

        .muted {
          color: #64748b;
        }

        .source-summary {
          margin-top: 14px;
          font-size: 14px;
          color: #cbd5e1;
        }

        .message {
          max-width: 900px;
          margin-top: 14px;
          padding: 12px 14px;
          border: 1px solid;
          border-radius: 8px;
          line-height: 1.45;
          font-weight: 600;
        }

        .success-lite {
          background: #dcfce7;
          border-color: #86efac;
          color: #166534;
        }

        .error-lite {
          background: #fee2e2;
          border-color: #fca5a5;
          color: #991b1b;
        }

        .table-scroll {
          width: 100%;
          overflow-x: auto;
          margin-top: 12px;
        }

        .review-table {
          width: 100%;
          min-width: 760px;
          border-collapse: collapse;
        }

        .review-table th,
        .review-table td {
          border: 1px solid #ccc;
          padding: 8px;
          vertical-align: middle;
        }

        .review-table th {
          text-align: left;
        }

        .review-table .center {
          text-align: center;
        }

        .table-input {
          box-sizing: border-box;
          padding: 7px 8px;
          border: 1px solid #94a3b8;
          border-radius: 5px;
          background: #fff;
          color: #111827;
        }

        .team-input {
          min-width: 190px;
          width: 100%;
        }

        .spread-input {
          width: 90px;
        }

        .kickoff-input {
          min-width: 190px;
        }

        .score-input {
          width: 80px;
        }

        .status-good {
          color: #16a34a;
          font-weight: 700;
          white-space: nowrap;
        }

        .status-bad {
          color: #dc2626;
          font-weight: 700;
        }

        .status-manual {
          color: #ca8a04;
          font-weight: 700;
          white-space: nowrap;
        }

        .admin-button {
          appearance: none;
          padding: 10px 16px;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
          transition:
            transform 80ms ease,
            box-shadow 80ms ease,
            opacity 150ms ease;
        }

        .admin-button:active:not(:disabled) {
          transform: translateY(3px);
          box-shadow: none;
        }

        .admin-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .load-button {
          border: 1px solid #1d4ed8;
          background: #2563eb;
          color: #fff;
          box-shadow: 0 3px 0 #1e40af;
        }

        .approve-button {
          margin-top: 14px;
          border: 1px solid #15803d;
          background: #16a34a;
          color: #fff;
          box-shadow: 0 3px 0 #166534;
        }

        .calculate-button {
          border: 1px solid #6d28d9;
          background: #7c3aed;
          color: #fff;
          box-shadow: 0 3px 0 #4c1d95;
        }

        .danger-button,
        .small-danger-button {
          appearance: none;
          border: 1px solid #b91c1c;
          background: #dc2626;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
          border-radius: 6px;
        }

        .danger-button {
          padding: 9px 14px;
        }

        .small-danger-button {
          padding: 6px 12px;
        }

        .manual-game-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-top: 16px;
        }

        .manual-game-row input {
          padding: 7px 8px;
        }

        .score-table {
          margin-top: 12px;
        }

        @media (max-width: 700px) {
          .admin-panel {
            padding: 14px;
          }

          .manual-game-row {
            align-items: stretch;
          }

          .manual-game-row input,
          .manual-game-row button {
            width: 100%;
            box-sizing: border-box;
          }
        }
      `}</style>
    </div>
  )
}
