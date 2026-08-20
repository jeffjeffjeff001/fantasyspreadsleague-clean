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
  const [currentWeek, setCurrentWeek] = useState(1)
  const [weekReady, setWeekReady]     = useState(false)
  const [weekError, setWeekError]     = useState('')

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState([])
  const [lbLoading, setLbLoading]     = useState(true)

  // League Picks state
  const [lpWeek, setLpWeek]       = useState(1)
  const [lpPicks, setLpPicks]     = useState([])
  const [lpLoading, setLpLoading] = useState(false)

  // Set Dashboard selectors and standings to the current NFL week.
  useEffect(() => {
    let cancelled = false

    async function initializeWeek() {
      try {
        const currentWeek =
          await fetchCurrentWeek(supabase)

        if (!cancelled) {
          setCurrentWeek(currentWeek)
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
  // Leaderboard: current standings + prior-week movement
  // ================================================================
  useEffect(() => {
    if (!weekReady) return

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

        // Current cumulative standings.
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

        // Build cumulative standings through the end
        // of the previous NFL week.
        let previousWeekRows = []

        if (currentWeek > 1) {
          const {
            data: weeklyRows,
            error: weeklyError,
          } = await supabase
            .from('user_weekly_points_v')
            .select(
              'email,week,correct_picks,weekly_points_final'
            )
            .lt('week', currentWeek)

          if (weeklyError) {
            throw weeklyError
          }

          previousWeekRows = weeklyRows || []
        }

        const previousByEmail = {}

        previousWeekRows.forEach(row => {
          const email = (
            row.email || ''
          ).toLowerCase()

          if (!email) return

          if (!previousByEmail[email]) {
            previousByEmail[email] = {
              email,
              totalCorrect: 0,
              totalPoints: 0,
            }
          }

          previousByEmail[email].totalCorrect +=
            Number(row.correct_picks || 0)

          previousByEmail[email].totalPoints +=
            Number(row.weekly_points_final || 0)
        })

        // Rank previous standings using the same rules
        // as the live leaderboard:
        // Total Points first, Total Correct second.
        const previousStandings = Object.values(
          previousByEmail
        ).sort(
          (a, b) =>
            b.totalPoints - a.totalPoints ||
            b.totalCorrect - a.totalCorrect
        )

        const previousRankByEmail = {}

        previousStandings.forEach(
          (row, index) => {
            previousRankByEmail[row.email] =
              index + 1
          }
        )

        const rows = (totals || []).map(total => {
          const email = (
            total.email || ''
          ).toLowerCase()

          return {
            email,
            username:
              nameByEmail[email] ||
              total.email,
            totalCorrect: Number(
              total.total_correct_final || 0
            ),
            totalPoints: Number(
              total.total_points_final || 0
            ),
          }
        })

        rows.sort(
          (a, b) =>
            b.totalPoints - a.totalPoints ||
            b.totalCorrect - a.totalCorrect
        )

        const rowsWithMovement = rows.map(
          (row, index) => {
            const currentRank = index + 1

            // Week 1 has no previous standings.
            if (currentWeek === 1) {
              return {
                ...row,
                currentRank,
                previousTotal: null,
                previousRank: null,
                rankChange: null,
                isNewToStandings: false,
              }
            }

            const previous =
              previousByEmail[row.email]

            const previousRank =
              previousRankByEmail[row.email] ??
              null

            return {
              ...row,
              currentRank,

              previousTotal:
                previous?.totalPoints ?? 0,

              previousRank,

              // Positive = moved up.
              // Negative = moved down.
              rankChange:
                previousRank == null
                  ? null
                  : previousRank -
                    currentRank,

              isNewToStandings:
                previousRank == null,
            }
          }
        )

        if (DEBUG) {
          console.debug(
            '[DEBUG] leaderboard rows →',
            rowsWithMovement.slice(0, 5)
          )
        }

        setLeaderboard(rowsWithMovement)
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
  }, [weekReady, currentWeek])

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

      const gameIds =
        games.map(game => game.id)

      const gamesById =
        Object.fromEntries(
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
          gamesById[
            String(pick.game_id)
          ]

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

          isLock:
            Boolean(pick.is_lock),
        }

        if (
          week !== 18 &&
          day === 4
        ) {
          grouped[email].thursday =
            item
        } else if (
          week !== 18 &&
          day === 1
        ) {
          grouped[email].monday =
            item
        } else {
          grouped[email].best.push(
            item
          )
        }
      })

      // Include users who have no picks.
      ;(profiles || []).forEach(
        profile => {
          const email = (
            profile.email || ''
          ).toLowerCase()

          if (
            email &&
            !grouped[email]
          ) {
            grouped[email] = {
              username:
                profile.username,

              thursday: null,
              best: [],
              monday: null,
            }
          }
        }
      )

      const list =
        Object.values(grouped).sort(
          (a, b) =>
            (
              a.username || ''
            ).localeCompare(
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

  const renderBestList = (
    items = []
  ) => {
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

  // ================================================================
  // Ranking movement display
  // ================================================================
  const renderRankMovement = user => {
    // No previous standings in Week 1.
    if (currentWeek === 1) {
      return null
    }

    // Player did not appear in the previous standings.
    if (user.isNewToStandings) {
      return (
        <span
          className="rank-movement rank-new"
          title="New to the standings"
        >
          NEW
        </span>
      )
    }

    // Positive means they moved upward.
    if (user.rankChange > 0) {
      return (
        <span
          className="rank-movement rank-up"
          title={`Moved up ${user.rankChange} spot${
            user.rankChange === 1
              ? ''
              : 's'
          }`}
        >
          ↑{user.rankChange}
        </span>
      )
    }

    // Negative means they moved downward.
    if (user.rankChange < 0) {
      const spots =
        Math.abs(user.rankChange)

      return (
        <span
          className="rank-movement rank-down"
          title={`Moved down ${spots} spot${
            spots === 1 ? '' : 's'
          }`}
        >
          ↓{spots}
        </span>
      )
    }

    return (
      <span
        className="rank-movement rank-same"
        title="No change in rank"
      >
        —
      </span>
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
        <p
          style={{
            color: '#a67c00',
          }}
        >
          ⚠️ {weekError}
        </p>
      )}

      {/* Weekly Score */}
      <section
        style={{
          marginTop: 40,
        }}
      >
        <h2>Weekly Score</h2>

        <label>
          Email:{' '}

          <input
            type="email"
            value={wsEmail}
            onChange={event =>
              setWsEmail(
                event.target.value
              )
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
              (_, index) =>
                index + 1
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
          onClick={
            fetchWeeklyScore
          }
          disabled={
            wsLoading ||
            !weekReady
          }
          style={{
            marginLeft: 8,
          }}
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
          <p
            style={{
              color: 'red',
            }}
          >
            {wsError}
          </p>
        )}

        {wsResult && (
          <table
            border={1}
            cellPadding={8}
            style={{
              borderCollapse:
                'collapse',
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
                <td>
                  {wsResult.email}
                </td>

                <td
                  style={{
                    textAlign:
                      'center',
                  }}
                >
                  {wsResult.correct}
                </td>

                <td
                  style={{
                    textAlign:
                      'center',
                  }}
                >
                  {wsResult.lockCorrect}
                </td>

                <td
                  style={{
                    textAlign:
                      'center',
                  }}
                >
                  {wsResult.lockIncorrect}
                </td>

                <td
                  style={{
                    textAlign:
                      'center',
                  }}
                >
                  {wsResult.perfectBonus}
                </td>

                <td
                  style={{
                    textAlign:
                      'center',
                  }}
                >
                  {wsResult.weeklyPoints}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Leaderboard */}
      <section
        style={{
          marginTop: 60,
        }}
      >
        <h2>
          League Leaderboard
        </h2>

        {currentWeek > 1 && (
          <p className="leaderboard-note">
            Last Wk Total shows each
            player's cumulative points at
            the end of Week{' '}
            {currentWeek - 1}. Rank arrows
            show movement from those
            standings to the current
            leaderboard.
          </p>
        )}

        {lbLoading ? (
          <p>
            Loading leaderboard…
          </p>
        ) : (
          <div className="leaderboard-scroll">
            <table
              border={1}
              cellPadding={8}
              className="leaderboard-table"
              style={{
                borderCollapse:
                  'collapse',
                marginTop: 10,
              }}
            >
              <thead>
                <tr>
                  <th>Rank</th>

                  <th>
                    Username
                  </th>

                  <th>
                    Total Correct
                  </th>

                  <th>
                    Total Points
                  </th>

                  <th>
                    Last Wk Total
                  </th>

                  <th>
                    Last Wk Rank
                  </th>
                </tr>
              </thead>

              <tbody>
                {leaderboard.map(
                  user => (
                    <tr
                      key={
                        user.email
                      }
                    >
                      <td
                        style={{
                          textAlign:
                            'center',
                        }}
                      >
                        <div className="rank-cell">
                          <strong>
                            {
                              user.currentRank
                            }
                          </strong>

                          {renderRankMovement(
                            user
                          )}
                        </div>
                      </td>

                      <td>
                        {
                          user.username
                        }
                      </td>

                      <td
                        style={{
                          textAlign:
                            'center',
                        }}
                      >
                        {
                          user.totalCorrect
                        }
                      </td>

                      <td
                        style={{
                          textAlign:
                            'center',
                        }}
                      >
                        {
                          user.totalPoints
                        }
                      </td>

                      <td
                        style={{
                          textAlign:
                            'center',
                        }}
                      >
                        {currentWeek === 1
                          ? '—'
                          : user.previousTotal}
                      </td>

                      <td
                        style={{
                          textAlign:
                            'center',
                        }}
                      >
                        {currentWeek ===
                          1 ||
                        user.previousRank ==
                          null
                          ? '—'
                          : user.previousRank}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* League Picks */}
      <section
        style={{
          marginTop: 60,
        }}
      >
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

        <div
          style={{
            marginBottom: 12,
          }}
        >
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
              disabled={
                !weekReady
              }
            >
              {Array.from(
                { length: 18 },
                (_, index) =>
                  index + 1
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
            className="action-button load-picks-button"
            onClick={() =>
              loadLeaguePicks(
                lpWeek
              )
            }
            disabled={
              lpLoading ||
              !weekReady
            }
          >
            {lpLoading
              ? 'Loading…'
              : 'Load Picks'}
          </button>

          {weekReady && (
            <small
              style={{
                marginLeft: 10,
                color: '#64748b',
              }}
            >
              Automatically opens to
              the current week.
            </small>
          )}
        </div>

        {!weekReady ||
        lpLoading ? (
          <p>
            Loading Week {lpWeek}{' '}
            picks…
          </p>
        ) : lpPicks.length >
          0 ? (
          <table
            border={1}
            cellPadding={8}
            style={{
              borderCollapse:
                'collapse',
              marginTop: 10,
            }}
          >
            <thead>
              <tr>
                <th>
                  Username
                </th>

                {lpWeek !==
                  18 && (
                  <th>
                    Thursday Pick
                  </th>
                )}

                <th>
                  {lpWeek === 18
                    ? 'Best-5 Picks'
                    : 'Best-3 Picks'}
                </th>

                {lpWeek !==
                  18 && (
                  <th>
                    Monday Pick
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {lpPicks.map(
                (
                  user,
                  index
                ) => (
                  <tr
                    key={
                      index
                    }
                  >
                    <td>
                      {
                        user.username
                      }
                    </td>

                    {lpWeek !==
                      18 && (
                      <td
                        style={{
                          textAlign:
                            'center',
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

                    {lpWeek !==
                      18 && (
                      <td
                        style={{
                          textAlign:
                            'center',
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
            No league picks found for
            Week {lpWeek}.
          </p>
        )}
      </section>

      <style jsx>{`
        .leaderboard-note {
          margin: 6px 0 0;
          color: #94a3b8;
          font-size: 13px;
          line-height: 1.45;
        }

        .leaderboard-scroll {
          width: 100%;
          overflow-x: auto;
        }

        .leaderboard-table {
          min-width: 660px;
        }

        .rank-cell {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          white-space: nowrap;
        }

        .rank-movement {
          font-size: 12px;
          font-weight: 800;
        }

        .rank-up {
          color: #22c55e;
        }

        .rank-down {
          color: #ef4444;
        }

        .rank-same {
          color: #94a3b8;
        }

        .rank-new {
          color: #eab308;
          font-size: 10px;
          letter-spacing: 0.04em;
        }

        .action-button {
          appearance: none;
          min-width: 120px;
          margin-left: 8px;
          padding: 9px 16px;
          border: 1px solid #1d4ed8;
          border-radius: 8px;
          background: #2563eb;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.2;
          cursor: pointer;
          box-shadow:
            0 4px 0 #1e40af;
          transition:
            transform 80ms ease,
            box-shadow 80ms ease,
            background-color 150ms ease;
          user-select: none;
          -webkit-tap-highlight-color:
            transparent;
        }

        .action-button:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .action-button:active:not(:disabled) {
          transform:
            translateY(4px);
          box-shadow:
            0 0 0 #1e40af;
        }

        .action-button:focus-visible {
          outline:
            3px solid
            rgba(
              37,
              99,
              235,
              0.35
            );
          outline-offset: 3px;
        }

        .action-button:disabled {
          border-color: #94a3b8;
          background: #cbd5e1;
          color: #64748b;
          cursor: not-allowed;
          box-shadow:
            0 3px 0 #94a3b8;
          transform: none;
        }
      `}</style>
    </div>
  )
}
