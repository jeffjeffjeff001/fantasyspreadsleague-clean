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
  const [error, setError]               = useState(null)
  const [loading, setLoading]           = useState(false)

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
    setPicks([])

    const { data, error: picksError } =
      await supabase
        .from('picks')
        .select(`
          id,
          selected_team,
          is_lock,
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

    // Drop any pick whose joined game is null.
    const valid = (data || []).filter(
      pick =>
        pick.games &&
        pick.games.kickoff_time
    )

    // Use local getDay() so Thursday/Monday match user TZ.
    const getDow = iso =>
      new Date(iso).getDay()

    const thursday = []
    const monday = []
    const best = []

    const isWeek18 = week === 18
    const maxBest = isWeek18 ? 5 : 3

    valid.forEach(pick => {
      const day = getDow(
        pick.games.kickoff_time
      )

      if (
        !isWeek18 &&
        day === 4 &&
        thursday.length < 1
      ) {
        thursday.push(pick)
      } else if (
        !isWeek18 &&
        day === 1 &&
        monday.length < 1
      ) {
        monday.push(pick)
      } else if (best.length < maxBest) {
        best.push(pick)
      }
    })

    // Only display the first lock pick if bad data
    // somehow contains more than one.
    let lockFound = false

    const filtered = [
      ...thursday,
      ...best,
      ...monday,
    ].map(pick => {
      if (pick.is_lock && !lockFound) {
        lockFound = true
        return pick
      }

      return {
        ...pick,
        is_lock: false,
      }
    })

    if (filtered.length < valid.length) {
      setWarning(
        isWeek18
          ? '⚠️ Showing a maximum of 5 Best-Choice picks for Week 18.'
          : '⚠️ Showing a maximum of 1 Thursday, 3 Best-Choice, and 1 Monday pick.'
      )
    }

    setPicks(filtered)
    setLoading(false)
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
        <p style={{ color: 'red' }}>
          Error: {error}
        </p>
      )}

      {warning && (
        <p style={{ color: '#a67c00' }}>
          {warning}
        </p>
      )}

      {!weekReady || loading ? (
        <p>
          Loading Week {selectedWeek} picks…
        </p>
      ) : picks.length > 0 ? (
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
            </tr>
          </thead>

          <tbody>
            {picks.map(pick => {
              const game = pick.games

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
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p>
          No picks found for Week {selectedWeek}.
        </p>
      )}
    </div>
  )
}
