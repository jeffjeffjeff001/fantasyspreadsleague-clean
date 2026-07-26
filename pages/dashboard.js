// pages/dashboard.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'
import { fetchCurrentWeek } from '../lib/currentWeek'

const DEBUG = false

export default function Dashboard() {
  // Weekly Score state
  const [wsEmail, setWsEmail]       = useState('')
  const [wsWeek, setWsWeek]         = useState(1)
  const [wsResult, setWsResult]     = useState(null)
  const [wsError, setWsError]       = useState('')
  const [wsLoading, setWsLoading]   = useState(false)

  // Shared current-week state
  const [weekReady, setWeekReady]   = useState(false)
  const [weekError, setWeekError]   = useState('')

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState([])
  const [lbLoading, setLbLoading]     = useState(true)

  // League Picks state
  const [lpWeek, setLpWeek]       = useState(1)
  const [lpPicks, setLpPicks]     = useState([])
  const [lpLoading, setLpLoading] = useState(false)

  // Set both Dashboard week selectors to the current NFL week.
  useEffect(() => {
    let cancelled = false

    async function initializeWeek() {
      try {
        const currentWeek =
          await fetchCurrentWeek(supabase)

        if (!cancelled) {
          setWsWeek(currentWeek)
          setLpWeek(currentWeek)
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

  const safeUpper = value =>
    (value || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()

  // ================================================================
  // Leaderboard: read from SQL views
  // ================================================================
  useEffect(() => {
    async function loadLeaderboard() {
      setLbLoading(true)

      try {
        const {
          data: profiles,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select('email,username')

        if (profileError) {
          throw profileError
        }

        const nameByEmail = {}

        ;(profiles || []).forEach(profile => {
          if (!profile?.email) return

          nameByEmail[
            profile.email.toLowerCase()
          ] = profile.username || profile.email
        })

        const {
          data: totals,
          error: totalsError,
        } = await supabase
          .from('leaderboard_totals_v')
          .select(
            'email,total_correct_final,total_points_final'
          )

        if (totalsError) {
          throw totalsError
        }

        const rows = (totals || []).map(total => ({
          username:
            nameByEmail[
              (total.email || '').toLowerCase()
            ] || total.email,
          totalCorrect: Number(
            total.total_correct_final || 0
          ),
          totalPoints: Number(
            total.total_points_final || 0
          ),
        }))

        rows.sort(
          (a, b) =>
            b.totalPoints - a.totalPoints ||
            b.totalCorrect - a.totalCorrect
        )

        if (DEBUG) {
          console.debug(
            '[DEBUG] leaderboard rows →',
            rows.slice(0, 5)
          )
        }

        setLeaderboard(rows)
      } catch (error) {
        console.error(
          'Leaderboard load error:',
          error
        )
        setLeaderboard([])
      } finally {
        setLbLoading(false)
      }
    }

    loadLeaderboard()
  }, [])

  // ================================================================
  // Weekly Score
  // ================================================================
  async function fetchWeeklyScore() {
    setWsError('')
    setWsResult(null)
    setWsLoading(true)

    try {
      const email = wsEmail.trim()
      const week = wsWeek

      if (!email) {
        setWsError(
          'Please enter the email address associated with the league account.'
        )
        return
      }

      const {
        data: weekRows,
        error: weekErrorResult,
      } = await supabase
        .from('user_weekly_points_v')
        .select(
          'email, week, total_picks, correct_picks, perfect_bonus, weekly_points_final'
        )
        .eq('email', email)
        .eq('week', week)
        .limit(1)

      if (weekErrorResult) {
        throw weekErrorResult
      }

      if (!weekRows || weekRows.length === 0) {
        setWsError(
          'No picks found for that email and week.'
        )
        return
      }

      const weekRow = weekRows[0]

      const {
        data: lockRows,
        error: lockError,
      } = await supabase
        .from('pick_outcomes_v')
        .select('is_lock, correct')
        .eq('email', email)
        .eq('week', week)

      if (lockError) {
        throw lockError
      }

      let lockCorrect = 0
      let lockIncorrect = 0

      ;(lockRows || []).forEach(row => {
        if (
          !row ||
          !row.is_lock ||
          row.correct == null
        ) {
          return
        }

        if (row.correct) {
          lockCorrect += 1
        } else {
          lockIncorrect += 1
        }
      })

      const payload = {
        email: weekRow.email,
        correct: Number(
          weekRow.correct_picks || 0
        ),
        lockCorrect,
        lockIncorrect,
        perfectBonus: Number(
          weekRow.perfect_bonus || 0
        ),
        weeklyPoints: Number(
          weekRow.weekly_points_final || 0
        ),
      }

      if (DEBUG) {
        console.debug(
          '[DEBUG] weekly-score payload →',
          payload
        )
      }

      setWsResult(payload)
    } catch (error) {
      setWsError(error.message)
    } finally {
      setWsLoading(false)
    }
  }

  // ================================================================
  // League Picks
  // ================================================================
  async function loadLeaguePicks(week = lpWeek) {
    setLpLoading(true)

    try {
      const {
        data: profiles,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('email,username')

      if (profileError) {
        throw profileError
      }

      const userMap = {}

      ;(profiles || []).forEach(profile => {
        if (!profile?.email) return

        userMap[
          profile.email.toLowerCase()
        ] = profile.username
      })

      const {
        data: games,
        error: gamesError,
      } = await supabase
        .from('games')
        .select('id,kickoff_time,week')
        .eq('week', week)
        .order('kickoff_time', {
          ascending: true,
        })

      if (gamesError) {
        throw gamesError
      }

      if (!games || games.length === 0) {
        setLpPicks([])
        return
      }

      const gameIds = games.map(game => game.id)

      const gamesById = Object.fromEntries(
        games.map(game => [
          String(game.id),
          game,
        ])
      )

      const {
        data: picks,
        error: picksError,
      } = await supabase
        .from('picks')
        .select(
          'user_email,selected_team,is_lock,game_id'
        )
        .in('game_id', gameIds)

      if (picksError) {
        throw picksError
      }

      const grouped = {}

      ;(picks || []).forEach(pick => {
        const game =
          gamesById[String(pick.game_id)]

        if (!game) return

        const email = (
          pick.user_email || ''
        ).toLowerCase()

        if (!grouped[email]) {
          grouped[email] = {
            username:
              userMap[email] ||
              pick.user_email ||
              email,
            thursday: null,
            best: [],
            monday: null,
          }
        }

        const day = new Date(
          game.kickoff_time
        ).getDay()

        const item = {
          team: (
            pick.selected_team || ''
          ).trim(),
          isLock: Boolean(pick.is_lock),
        }

        if (week !== 18 && day === 4) {
          grouped[email].thursday = item
        } else if (week !== 18 && day === 1) {
          grouped[email].monday = item
        } else {
          grouped[email].best.push(item)
        }
      })

      // Include users who have no picks.
      ;(profiles || []).forEach(profile => {
        const email = (
          profile.email || ''
        ).toLowerCase()

        if (email && !grouped[email]) {
          grouped[email] = {
            username: profile.username,
            thursday: null,
            best: [],
            monday: null,
          }
        }
      })

      const list = Object.values(grouped).sort(
        (a, b) =>
          (a.username || '').localeCompare(
            b.username || ''
          )
      )

      setLpPicks(list)
    } catch (error) {
      console.error(
        'loadLeaguePicks error:',
        error
      )
      setLpPicks([])
    } finally {
      setLpLoading(false)
    }
  }

  // Automatically load League Picks after determining the
  // current week and whenever the week selector changes.
  useEffect(() => {
    if (!weekReady) return

    loadLeaguePicks(lpWeek)
  }, [lpWeek, weekReady])

  const renderPick = pick => {
    if (!pick || !pick.team) {
      return ''
    }

    return pick.isLock
      ? <strong>{pick.team}</strong>
      : pick.team
  }

  const renderBestList = (items = []) => {
    const maxBest =
      lpWeek === 18 ? 5 : 3

    const displayedItems =
      items.slice(0, maxBest)

    return displayedItems.map(
      (pick, index) => (
        <span key={index}>
          {renderPick(pick)}
          {index <
          displayedItems.length - 1
            ? ', '
            : null}
        </span>
      )
    )
  }

  return (
    <div
      style={{
        padding: 20,
        fontFamily: 'sans-serif',
      }}
    >
      <h1>League Dashboard</h1>

      <nav>
        <Link href="/">
          <a>← Home</a>
        </Link>
      </nav>

      {weekError && (
        <p style={{ color: '#a67c00' }}>
          ⚠️ {weekError}
        </p>
      )}

      {/* Weekly Score */}
      <section style={{ marginTop: 40 }}>
        <h2>Weekly Score</h2>

        <label>
          Email:{' '}
          <input
            type="email"
            value={wsEmail}
            onChange={event =>
              setWsEmail(event.target.value)
            }
          />
        </label>{' '}

        <label>
          Week:{' '}
          <select
            value={wsWeek}
            onChange={event =>
              setWsWeek(
                parseInt(
                  event.target.value,
                  10
                )
              )
            }
            disabled={!weekReady}
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
          onClick={fetchWeeklyScore}
          disabled={
            wsLoading || !weekReady
          }
          style={{ marginLeft: 8 }}
        >
          {wsLoading
            ? 'Loading…'
            : 'Get Score'}
        </button>

        {weekReady && (
          <small
            style={{
              marginLeft: 10,
              color: '#64748b',
            }}
          >
            Defaults to the current week.
          </small>
        )}

        {wsError && (
          <p style={{ color: 'red' }}>
            {wsError}
          </p>
        )}

        {wsResult && (
          <table
            border={1}
            cellPadding={8}
            style={{
              borderCollapse: 'collapse',
              marginTop: 10,
            }}
          >
            <thead>
              <tr>
                <th>Email</th>
                <th>Correct</th>
                <th>Lock ✔</th>
                <th>Lock ✘</th>
                <th>Bonus</th>
                <th>Points</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>{wsResult.email}</td>

                <td style={{ textAlign: 'center' }}>
                  {wsResult.correct}
                </td>

                <td style={{ textAlign: 'center' }}>
                  {wsResult.lockCorrect}
                </td>

                <td style={{ textAlign: 'center' }}>
                  {wsResult.lockIncorrect}
                </td>

                <td style={{ textAlign: 'center' }}>
                  {wsResult.perfectBonus}
                </td>

                <td style={{ textAlign: 'center' }}>
                  {wsResult.weeklyPoints}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Leaderboard */}
      <section style={{ marginTop: 60 }}>
        <h2>League Leaderboard</h2>

        {lbLoading ? (
          <p>Loading leaderboard…</p>
        ) : (
          <table
            border={1}
            cellPadding={8}
            style={{
              borderCollapse: 'collapse',
              marginTop: 10,
            }}
          >
            <thead>
              <tr>
                <th>Rank</th>
                <th>Username</th>
                <th>Total Correct</th>
                <th>Total Points</th>
              </tr>
            </thead>

            <tbody>
              {leaderboard.map(
                (user, index) => (
                  <tr
                    key={
                      user.username || index
                    }
                  >
                    <td
                      style={{
                        textAlign: 'center',
                      }}
                    >
                      {index + 1}
                    </td>

                    <td>{user.username}</td>

                    <td
                      style={{
                        textAlign: 'center',
                      }}
                    >
                      {user.totalCorrect}
                    </td>

                    <td
                      style={{
                        textAlign: 'center',
                      }}
                    >
                      {user.totalPoints}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </section>

      {/* League Picks */}
      <section style={{ marginTop: 60 }}>
        <h2>
          League Picks{' '}
          <small
            style={{
              color: '#94a3b8',
              fontWeight: 400,
            }}
          >
            (lock picks appear in bold)
          </small>
        </h2>

        <div style={{ marginBottom: 12 }}>
          <label>
            Week:&nbsp;
            <select
              value={lpWeek}
              onChange={event =>
                setLpWeek(
                  parseInt(
                    event.target.value,
                    10
                  )
                )
              }
              disabled={!weekReady}
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
            onClick={() =>
              loadLeaguePicks(lpWeek)
            }
            disabled={
              lpLoading || !weekReady
            }
            style={{ marginLeft: 8 }}
          >
            {lpLoading
              ? 'Loading…'
              : 'Refresh Picks'}
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

        {!weekReady || lpLoading ? (
          <p>
            Loading Week {lpWeek} picks…
          </p>
        ) : lpPicks.length > 0 ? (
          <table
            border={1}
            cellPadding={8}
            style={{
              borderCollapse: 'collapse',
              marginTop: 10,
            }}
          >
            <thead>
              <tr>
                <th>Username</th>

                {lpWeek !== 18 && (
                  <th>Thursday Pick</th>
                )}

                <th>
                  {lpWeek === 18
                    ? 'Best-5 Picks'
                    : 'Best-3 Picks'}
                </th>

                {lpWeek !== 18 && (
                  <th>Monday Pick</th>
                )}
              </tr>
            </thead>

            <tbody>
              {lpPicks.map(
                (user, index) => (
                  <tr key={index}>
                    <td>{user.username}</td>

                    {lpWeek !== 18 && (
                      <td
                        style={{
                          textAlign: 'center',
                        }}
                      >
                        {renderPick(
                          user.thursday
                        )}
                      </td>
                    )}

                    <td>
                      {renderBestList(
                        user.best
                      )}
                    </td>

                    {lpWeek !== 18 && (
                      <td
                        style={{
                          textAlign: 'center',
                        }}
                      >
                        {renderPick(
                          user.monday
                        )}
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        ) : (
          <p>
            No league picks found for Week{' '}
            {lpWeek}.
          </p>
        )}
      </section>
    </div>
  )
}
