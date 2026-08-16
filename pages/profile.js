// pages/profile.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchCurrentWeek } from '../lib/currentWeek'

export default function UserProfile() {
  const { session, profile } = useAuth()
  const username =
    profile?.username || session?.user?.email

  const [selectedWeek, setSelectedWeek] = useState(1)
  const [weekReady, setWeekReady]       = useState(false)
  const [picks, setPicks]               = useState([])
  const [warning, setWarning]           = useState('')
  const [success, setSuccess]           = useState('')
  const [error, setError]               = useState(null)
  const [loading, setLoading]           = useState(false)
  const [deletingPickId, setDeletingPickId] = useState(null)
  const [nowMs, setNowMs]               = useState(Date.now())

  // Determine the current NFL week.
  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function initializeWeek() {
      try {
        const currentWeek =
          await fetchCurrentWeek(supabase)

        if (!cancelled) {
          setSelectedWeek(currentWeek)
        }
      } catch (initializationError) {
        console.error(
          'Unable to determine current week:',
          initializationError
        )

        if (!cancelled) {
          setError(
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
  }, [session])

  // Keep the delete/locked display current as kickoff approaches.
  useEffect(() => {
    if (!session) return

    const interval = setInterval(() => {
      setNowMs(Date.now())
    }, 15000)

    return () => {
      clearInterval(interval)
    }
  }, [session])

  // Automatically load picks when the current week is ready
  // or when the user manually changes weeks.
  useEffect(() => {
    if (!session || !weekReady) return

    loadPicks(selectedWeek)
  }, [session, selectedWeek, weekReady])

  if (!session) {
    return (
      <div style={{ padding: 20 }}>
        <p>
          <Link href="/join-league">
            <a>Join the league to view your profile</a>
          </Link>
        </p>
      </div>
    )
  }

  async function loadPicks(week = selectedWeek) {
    setLoading(true)
    setError(null)
    setWarning('')
    setSuccess('')
    setPicks([])

    const { data, error: picksError } =
      await supabase
        .from('picks')
        .select(`
          id,
          selected_team,
          is_lock,
          submitted_at,
          games (
            id,
            home_team,
            away_team,
            spread,
            kickoff_time,
            week
          )
        `)
        .eq('user_email', session.user.email)
        .eq('games.week', week)
        .order('kickoff_time', {
          ascending: true,
          foreignTable: 'games',
        })

    if (picksError) {
      setError(picksError.message)
      setLoading(false)
      return
    }

    // Drop rows whose joined game is null.
    const valid = (data || []).filter(
      pick =>
        pick.games &&
        pick.games.kickoff_time
    )

    const seenGameIds = new Set()
    let duplicateFound = false

    valid.forEach(pick => {
      const gameId = String(pick.games.id)

      if (seenGameIds.has(gameId)) {
        duplicateFound = true
      }

      seenGameIds.add(gameId)
    })

    if (duplicateFound) {
      setWarning(
        '⚠️ Duplicate picks are currently stored for this week. Delete the extra duplicate rows before submitting new picks.'
      )
    } else if (valid.length > 5) {
      setWarning(
        '⚠️ More than 5 picks are currently stored for this week. Delete the extra picks before submitting new picks.'
      )
    }

    // Show every stored pick so the user can see and remove
    // accidental duplicates or extra picks.
    setPicks(valid)
    setLoading(false)
  }

  async function deletePick(pick) {
    setError(null)
    setSuccess('')

    const kickoffMs = new Date(
      pick.games.kickoff_time
    ).getTime()

    if (
      Number.isNaN(kickoffMs) ||
      kickoffMs <= Date.now()
    ) {
      setError(
        'This pick can no longer be deleted because the game has already started.'
      )
      setNowMs(Date.now())
      return
    }

    const confirmed = window.confirm(
      `Delete your ${pick.selected_team} pick?`
    )

    if (!confirmed) return

    setDeletingPickId(pick.id)

    const { error: deleteError } = await supabase
      .from('picks')
      .delete()
      .eq('id', pick.id)
      .eq('user_email', session.user.email)

    if (deleteError) {
      setError(deleteError.message)
      setDeletingPickId(null)
      return
    }

    setPicks(previousPicks =>
      previousPicks.filter(
        currentPick => currentPick.id !== pick.id
      )
    )

    setSuccess(
      '✅ Pick deleted successfully. You can return to Submit Picks to choose a replacement before kickoff.'
    )
    setDeletingPickId(null)
    setNowMs(Date.now())
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>My Profile & Picks</h2>

      <p>
        Logged in as <strong>{username}</strong> |{' '}
        <Link href="/">
          <a>Home</a>
        </Link>
      </p>

      <div style={{ margin: '16px 0' }}>
        <label>
          Week:&nbsp;
          <select
            value={selectedWeek}
            onChange={event =>
              setSelectedWeek(
                parseInt(event.target.value, 10)
              )
            }
            disabled={!weekReady}
            style={{ width: 60 }}
          >
            {Array.from(
              { length: 18 },
              (_, index) => index + 1
            ).map(week => (
              <option key={week} value={week}>
                {week}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={() =>
            loadPicks(selectedWeek)
          }
          disabled={loading || !weekReady}
          style={{ marginLeft: 12 }}
        >
          {loading
            ? 'Loading…'
            : `Refresh Week ${selectedWeek} Picks`}
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

      {error && (
        <div
          className="profile-message error-message"
          role="alert"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="profile-message success-message"
          role="status"
          aria-live="polite"
        >
          {success}
        </div>
      )}

      {warning && (
        <div
          className="profile-message warning-message"
          role="status"
        >
          {warning}
        </div>
      )}

      {!weekReady || loading ? (
        <p>
          Loading Week {selectedWeek} picks…
        </p>
      ) : picks.length > 0 ? (
        <>
          <p>
            Stored picks for Week {selectedWeek}:{' '}
            <strong>{picks.length}/5</strong>
          </p>

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
                    border: '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Game
                </th>

                <th
                  style={{
                    border: '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Home Team Spread
                </th>

                <th
                  style={{
                    border: '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Your Pick
                </th>

                <th
                  style={{
                    border: '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Lock?
                </th>

                <th
                  style={{
                    border: '1px solid #ccc',
                    padding: 8,
                  }}
                >
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {picks.map(pick => {
                const game = pick.games
                const kickoffMs = new Date(
                  game.kickoff_time
                ).getTime()

                const canDelete =
                  !Number.isNaN(kickoffMs) &&
                  kickoffMs > nowMs

                const deleting =
                  deletingPickId === pick.id

                return (
                  <tr key={pick.id}>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: 8,
                      }}
                    >
                      {game.away_team} @{' '}
                      {game.home_team}

                      <br />

                      <small>
                        {new Date(
                          game.kickoff_time
                        ).toLocaleString(undefined, {
                          weekday: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </td>

                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: 8,
                      }}
                    >
                      {game.spread > 0
                        ? `+${game.spread}`
                        : game.spread}
                    </td>

                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: 8,
                      }}
                    >
                      {pick.selected_team}
                    </td>

                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: 8,
                        textAlign: 'center',
                      }}
                    >
                      {pick.is_lock ? '✅' : ''}
                    </td>

                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: 8,
                        textAlign: 'center',
                      }}
                    >
                      {canDelete ? (
                        <button
                          className="delete-pick-button"
                          onClick={() =>
                            deletePick(pick)
                          }
                          disabled={deleting}
                        >
                          {deleting
                            ? 'Deleting…'
                            : 'Delete Pick'}
                        </button>
                      ) : (
                        <span className="locked-pick">
                          🔒 Locked
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      ) : (
        <p>
          No picks found for Week {selectedWeek}.
        </p>
      )}

      <style jsx>{`
        .profile-message {
          max-width: 620px;
          margin: 0 0 16px;
          padding: 12px 14px;
          border: 1px solid;
          border-radius: 8px;
          font-weight: 700;
          line-height: 1.4;
        }

        .success-message {
          color: #166534;
          background: #dcfce7;
          border-color: #86efac;
        }

        .warning-message {
          color: #854d0e;
          background: #fef9c3;
          border-color: #fde047;
        }

        .error-message {
          color: #991b1b;
          background: #fee2e2;
          border-color: #fca5a5;
        }

        .delete-pick-button {
          appearance: none;
          padding: 8px 12px;
          border: 1px solid #b91c1c;
          border-radius: 7px;
          background: #dc2626;
          color: white;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 3px 0 #991b1b;
          transition:
            transform 80ms ease,
            box-shadow 80ms ease,
            background-color 150ms ease;
        }

        .delete-pick-button:hover:not(:disabled) {
          background: #b91c1c;
        }

        .delete-pick-button:active:not(:disabled) {
          transform: translateY(3px);
          box-shadow: 0 0 0 #991b1b;
        }

        .delete-pick-button:disabled {
          background: #cbd5e1;
          border-color: #94a3b8;
          color: #64748b;
          box-shadow: none;
          cursor: not-allowed;
        }

        .locked-pick {
          color: #64748b;
          font-weight: 700;
          white-space: nowrap;
        }
      `}</style>
    </div>
  )
}
