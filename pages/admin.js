// pages/admin.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'
import { fetchCurrentWeek } from '../lib/currentWeek'

export default function Admin() {
  // ── ALL HOOK DECLARATIONS ─────────────────────────────────────────────
  const ADMIN_PW =
    process.env.NEXT_PUBLIC_ADMIN_PASSWORD

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

  const [games, setGames] =
    useState([])

  const [profiles, setProfiles] =
    useState([])

  const [loadingGames, setLoadingGames] =
    useState(false)

  const [
    loadingProfiles,
    setLoadingProfiles,
  ] = useState(false)

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

  const [userForPicks, setUserForPicks] =
    useState('')

  const [weekForPicks, setWeekForPicks] =
    useState(1)

  const [userPicks, setUserPicks] =
    useState([])

  const [loadingPicks, setLoadingPicks] =
    useState(false)

  const [weeklyScores, setWeeklyScores] =
    useState([])

  const [
    loadingScores,
    setLoadingScores,
  ] = useState(false)

  // Determine the current week and use it for both
  // Game Management and View User Picks.
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
    if (!weekReady) return

    loadGames()
  }, [selectedWeek, weekReady])

  useEffect(() => {
    loadProfiles()
  }, [])

  // ── ADMIN PASSWORD GATE ────────────────────────────────────────────────
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
              style={{ marginLeft: 8 }}
            />
          </label>

          <button
            type="submit"
            style={{ marginLeft: 12 }}
          >
            Unlock
          </button>
        </form>
      </div>
    )
  }

  // ── Data loading ──────────────────────────────────────────────────────
  async function loadGames() {
    setLoadingGames(true)

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('week', selectedWeek)
      .order('kickoff_time', {
        ascending: true,
      })

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

  async function loadProfiles() {
    setLoadingProfiles(true)

    const { data, error } = await supabase
      .from('profiles')
      .select(
        'email,username,first_name,last_name'
      )
      .order('username', {
        ascending: true,
      })

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

  // ── Game management ───────────────────────────────────────────────────
  async function handleAddGame() {
    const spread = parseFloat(
      newGameSpread
    )

    const kickoff = new Date(
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

    if (Number.isNaN(spread)) {
      alert(
        'Please enter a valid spread.'
      )
      return
    }

    if (
      Number.isNaN(kickoff.getTime())
    ) {
      alert(
        'Please enter a valid kickoff date and time.'
      )
      return
    }

    const { error } = await supabase
      .from('games')
      .insert([
        {
          week: selectedWeek,
          away_team:
            newGameAway.trim(),
          home_team:
            newGameHome.trim(),
          spread,
          kickoff_time:
            kickoff.toISOString(),
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

  async function handleDeleteGame(id) {
    if (
      !confirm(
        'Delete this game and all its picks?'
      )
    ) {
      return
    }

    const {
      error: picksError,
    } = await supabase
      .from('picks')
      .delete()
      .eq('game_id', id)

    if (picksError) {
      alert(
        'Error deleting associated picks: ' +
          picksError.message
      )
      return
    }

    const {
      error: gameError,
    } = await supabase
      .from('games')
      .delete()
      .eq('id', id)

    if (gameError) {
      alert(
        'Error deleting game: ' +
          gameError.message
      )
    } else {
      loadGames()
    }
  }

  async function handleClearWeek() {
    if (
      !confirm(
        `Clear all games and picks for Week ${selectedWeek}?`
      )
    ) {
      return
    }

    const {
      data: weekGames,
      error: gameLookupError,
    } = await supabase
      .from('games')
      .select('id')
      .eq('week', selectedWeek)

    if (gameLookupError) {
      alert(
        'Error locating week games: ' +
          gameLookupError.message
      )
      return
    }

    const gameIds = (weekGames || []).map(
      game => game.id
    )

    if (gameIds.length > 0) {
      const {
        error: picksError,
      } = await supabase
        .from('picks')
        .delete()
        .in('game_id', gameIds)

      if (picksError) {
        alert(
          'Error clearing picks: ' +
            picksError.message
        )
        return
      }
    }

    const {
      error: gamesError,
    } = await supabase
      .from('games')
      .delete()
      .eq('week', selectedWeek)

    if (gamesError) {
      alert(
        'Error clearing games: ' +
          gamesError.message
      )
    } else {
      setGames([])
    }
  }

  // ── User management ───────────────────────────────────────────────────
  async function handleDeleteUser(email) {
    if (
      !confirm(`Delete user ${email}?`)
    ) {
      return
    }

    const response = await fetch(
      '/api/delete-profile',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({ email }),
      }
    )

    const result = await response.json()

    if (result.error) {
      alert(
        'Error deleting user: ' +
          result.error
      )
    } else {
      loadProfiles()
    }
  }

  // ── View user picks ───────────────────────────────────────────────────
  async function loadUserPicks() {
    if (!userForPicks) {
      alert('Please select a user')
      return
    }

    setLoadingPicks(true)

    const { data, error } = await supabase
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
      .eq('user_email', userForPicks)
      .eq('games.week', weekForPicks)
      .order('kickoff_time', {
        foreignTable: 'games',
        ascending: true,
      })

    if (error) {
      alert(
        'Error loading picks: ' +
          error.message
      )
      setUserPicks([])
      setLoadingPicks(false)
      return
    }

    const valid = (data || []).filter(
      pick =>
        pick.games &&
        pick.games.kickoff_time
    )

    setUserPicks(valid)
    setLoadingPicks(false)
  }

  async function handleDeletePick(pickId) {
    if (!confirm('Delete this pick?')) {
      return
    }

    const { error } = await supabase
      .from('picks')
      .delete()
      .eq('id', pickId)

    if (error) {
      alert(
        'Error deleting pick: ' +
          error.message
      )
    } else {
      loadUserPicks()
    }
  }

  // ── Calculate Weekly Scores ───────────────────────────────────────────
  async function calculateScores() {
    setLoadingScores(true)

    try {
      const {
        data: profileRows,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('email,username')

      if (profileError) {
        throw profileError
      }

      const {
        data: results,
        error: resultsError,
      } = await supabase
        .from('results')
        .select(
          'home_team,away_team,home_score,away_score,week'
        )
        .eq('week', selectedWeek)

      if (resultsError) {
        throw resultsError
      }

      const normalize = value =>
        (value ?? '').trim()

      const {
        data: totals,
        error: totalsError,
      } = await supabase
        .from('picks')
        .select(
          'user_email,games!inner(week)'
        )
        .eq('games.week', selectedWeek)

      if (totalsError) {
        throw totalsError
      }

      const weeklyTotalByUser = {}

      for (const row of totals || []) {
        weeklyTotalByUser[
          row.user_email
        ] =
          (
            weeklyTotalByUser[
              row.user_email
            ] || 0
          ) + 1
      }

      const {
        data: picks,
        error: picksError,
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
        .eq('games.week', selectedWeek)

      if (picksError) {
        throw picksError
      }

      const stats = {}

      profileRows.forEach(profile => {
        stats[profile.email] = {
          email: profile.email,
          weeklyPoints: 0,
          correct: 0,
          lockCorrect: 0,
          lockIncorrect: 0,
          perfectBonus: 0,
          weeklyTotal:
            weeklyTotalByUser[
              profile.email
            ] || 0,
        }
      })

      for (const pick of picks || []) {
        const game = pick.games

        if (!game) continue

        const user =
          stats[pick.user_email]

        if (!user) continue

        const result = results.find(
          row =>
            row.week === game.week &&
            normalize(row.home_team) ===
              normalize(
                game.home_team
              ) &&
            normalize(row.away_team) ===
              normalize(
                game.away_team
              )
        )

        if (!result) continue

        const spread = Number(
          game.spread
        )

        const adjustedHomeScore =
          Number(result.home_score) +
          spread

        const awayScore = Number(
          result.away_score
        )

        // Pushes are not counted as correct
        // for either side.
        if (
          adjustedHomeScore === awayScore
        ) {
          if (pick.is_lock) {
            user.lockIncorrect += 1
            user.weeklyPoints -= 2
          }

          continue
        }

        const homeCover =
          adjustedHomeScore > awayScore

        const winner = homeCover
          ? normalize(result.home_team)
          : normalize(result.away_team)

        const picked = normalize(
          pick.selected_team
        )

        if (picked === winner) {
          user.correct += 1
          user.weeklyPoints += 1

          if (pick.is_lock) {
            user.lockCorrect += 1
            user.weeklyPoints += 2
          }
        } else if (pick.is_lock) {
          user.lockIncorrect += 1
          user.weeklyPoints -= 2
        }
      }

      for (
        const user of Object.values(stats)
      ) {
        if (
          user.weeklyTotal > 0 &&
          user.correct ===
            user.weeklyTotal
        ) {
          user.perfectBonus = 3
          user.weeklyPoints += 3
        }
      }

      const rows = Object.values(stats)
        .filter(
          user => user.weeklyTotal > 0
        )
        .sort(
          (a, b) =>
            b.weeklyPoints -
              a.weeklyPoints ||
            b.correct - a.correct
        )

      setWeeklyScores(rows)
    } catch (error) {
      console.error(error)

      alert(
        'Error calculating scores: ' +
          error.message
      )

      setWeeklyScores([])
    } finally {
      setLoadingScores(false)
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Admin</h1>

      <p>
        <Link href="/">
          <a>← Home</a>
        </Link>
      </p>

      {weekError && (
        <p style={{ color: '#a67c00' }}>
          ⚠️ {weekError}
        </p>
      )}

      {/* Game Management */}
      <section style={{ marginTop: 20 }}>
        <h2>
          Game Management (Week{' '}
          {selectedWeek})
        </h2>

        <div style={{ marginBottom: 12 }}>
          <label>
            Week:&nbsp;
            <select
              value={selectedWeek}
              onChange={event =>
                setSelectedWeek(
                  parseInt(
                    event.target.value,
                    10
                  )
                )
              }
              disabled={!weekReady}
              style={{ width: 60 }}
            >
              {Array.from(
                { length: 18 },
                (_, index) => index + 1
              ).map(week => (
                <option
                  key={week}
                  value={week}
                >
                  {week}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={handleClearWeek}
            disabled={!weekReady}
            style={{ marginLeft: 12 }}
          >
            Clear Week
          </button>

          {weekReady && (
            <small
              style={{
                marginLeft: 10,
                color: '#64748b',
              }}
            >
              Automatically opens to the current week.
            </small>
          )}
        </div>

        {!weekReady || loadingGames ? (
          <p>
            Loading Week {selectedWeek} games…
          </p>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Away
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Home
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Spread
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Kickoff
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {games.map(game => (
                <tr key={game.id}>
                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {game.away_team}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {game.home_team}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {game.spread > 0
                      ? `+${game.spread}`
                      : game.spread}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {new Date(
                      game.kickoff_time
                    ).toLocaleString()}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                      textAlign: 'center',
                    }}
                  >
                    <button
                      onClick={() =>
                        handleDeleteGame(
                          game.id
                        )
                      }
                      style={{
                        background: 'red',
                        color: 'white',
                        padding: '6px 12px',
                        border: 'none',
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {games.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: 8,
                      textAlign: 'center',
                    }}
                  >
                    No games found for Week{' '}
                    {selectedWeek}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 12 }}>
          <input
            placeholder="Away Team"
            value={newGameAway}
            onChange={event =>
              setNewGameAway(
                event.target.value
              )
            }
            style={{ marginRight: 8 }}
          />

          <input
            placeholder="Home Team"
            value={newGameHome}
            onChange={event =>
              setNewGameHome(
                event.target.value
              )
            }
            style={{ marginRight: 8 }}
          />

          <input
            placeholder="Spread"
            type="number"
            value={newGameSpread}
            onChange={event =>
              setNewGameSpread(
                event.target.value
              )
            }
            style={{
              width: 80,
              marginRight: 8,
            }}
          />

          <input
            placeholder="Kickoff (ISO)"
            value={newGameKickoff}
            onChange={event =>
              setNewGameKickoff(
                event.target.value
              )
            }
            style={{ marginRight: 8 }}
          />

          <button
            onClick={handleAddGame}
            disabled={!weekReady}
          >
            Add Game
          </button>
        </div>
      </section>

      {/* User Management */}
      <section style={{ marginTop: 40 }}>
        <h2>User Management</h2>

        {loadingProfiles ? (
          <p>Loading profiles…</p>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Username
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Name
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Email
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {profiles.map(profile => (
                <tr key={profile.email}>
                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {profile.username}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {profile.first_name}{' '}
                    {profile.last_name}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {profile.email}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                      textAlign: 'center',
                    }}
                  >
                    <button
                      onClick={() =>
                        handleDeleteUser(
                          profile.email
                        )
                      }
                      style={{
                        background: 'red',
                        color: 'white',
                        padding: '6px 12px',
                        border: 'none',
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* View User Picks */}
      <section style={{ marginTop: 40 }}>
        <h2>View User Picks</h2>

        <div style={{ marginBottom: 12 }}>
          <select
            value={userForPicks}
            onChange={event =>
              setUserForPicks(
                event.target.value
              )
            }
          >
            <option value="">
              Select user
            </option>

            {profiles.map(profile => (
              <option
                key={profile.email}
                value={profile.email}
              >
                {profile.username}
              </option>
            ))}
          </select>

          <select
            value={weekForPicks}
            onChange={event =>
              setWeekForPicks(
                parseInt(
                  event.target.value,
                  10
                )
              )
            }
            disabled={!weekReady}
            style={{
              width: 60,
              marginLeft: 8,
            }}
          >
            {Array.from(
              { length: 18 },
              (_, index) => index + 1
            ).map(week => (
              <option
                key={week}
                value={week}
              >
                {week}
              </option>
            ))}
          </select>

          <button
            onClick={loadUserPicks}
            disabled={
              loadingPicks ||
              !weekReady
            }
            style={{ marginLeft: 8 }}
          >
            {loadingPicks
              ? 'Loading…'
              : 'Load Picks'}
          </button>
        </div>

        {loadingPicks ? (
          <p>Loading picks…</p>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Game
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Pick
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Lock?
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {userPicks.map(pick => (
                <tr key={pick.id}>
                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {pick.games.away_team} @{' '}
                    {pick.games.home_team}

                    <br />

                    <small>
                      {new Date(
                        pick.games.kickoff_time
                      ).toLocaleString()}
                    </small>
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {pick.selected_team}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                      textAlign: 'center',
                    }}
                  >
                    {pick.is_lock ? '✅' : ''}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                      textAlign: 'center',
                    }}
                  >
                    <button
                      onClick={() =>
                        handleDeletePick(
                          pick.id
                        )
                      }
                      style={{
                        background: 'red',
                        color: 'white',
                        padding: '6px 12px',
                        border: 'none',
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {userPicks.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: 8,
                      textAlign: 'center',
                    }}
                  >
                    No picks found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {/* Calculate Weekly Scores */}
      <section style={{ marginTop: 40 }}>
        <h2>
          Calculate Scores (Week{' '}
          {selectedWeek})
        </h2>

        <button
          onClick={calculateScores}
          disabled={
            loadingScores ||
            !weekReady
          }
        >
          {loadingScores
            ? 'Calculating…'
            : 'Calculate Scores'}
        </button>

        {weeklyScores.length > 0 && (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginTop: 12,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Email
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Points
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Correct
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Lock ✔
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Lock ✘
                </th>

                <th
                  style={{
                    border:
                      '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Bonus
                </th>
              </tr>
            </thead>

            <tbody>
              {weeklyScores.map(user => (
                <tr key={user.email}>
                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {user.email}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {user.weeklyPoints}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {user.correct}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {user.lockCorrect}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {user.lockIncorrect}
                  </td>

                  <td
                    style={{
                      border:
                        '1px solid #ccc',
                      padding: 8,
                    }}
                  >
                    {user.perfectBonus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
