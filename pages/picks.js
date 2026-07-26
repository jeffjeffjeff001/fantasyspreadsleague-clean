// pages/picks.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchCurrentWeek } from '../lib/currentWeek'

export default function PickSubmission() {
  const { session, profile } = useAuth()
  const username = profile?.username || session?.user?.email

  const [selectedWeek, setSelectedWeek] = useState(1)
  const [weekReady, setWeekReady]       = useState(false)
  const [games, setGames]               = useState([])
  const [picks, setPicks]               = useState({})
  const [lockPick, setLockPick]         = useState(null)
  const [status, setStatus]             = useState(null)
  const [loadingGames, setLoadingGames] = useState(false)

  // Determine the current NFL week.
  // The week advances only after Tuesday at 10:00 PM Eastern.
  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function initializeWeek() {
      try {
        const currentWeek = await fetchCurrentWeek(supabase)

        if (!cancelled) {
          setSelectedWeek(currentWeek)
        }
      } catch (error) {
        console.error(
          'Unable to determine current week:',
          error
        )

        if (!cancelled) {
          setStatus(
            '⚠️ The current week could not be determined automatically. Week 1 has been selected.'
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

  // Load games after the automatic current week is ready.
  useEffect(() => {
    if (!session || !weekReady) return

    let cancelled = false

    async function loadGames() {
      setLoadingGames(true)
      setStatus(null)
      setPicks({})
      setLockPick(null)

      // DB-side filtering using UTC timestamptz + 60s grace.
      const GRACE_MS = 60 * 1000
      const nowIso = new Date(
        Date.now() - GRACE_MS
      ).toISOString()

      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('week', selectedWeek)
        .gte('kickoff_time', nowIso)
        .order('kickoff_time', { ascending: true })

      if (cancelled) return

      if (error) {
        setStatus(`🚫 ${error.message}`)
        setGames([])
        setLoadingGames(false)
        return
      }

      setGames(data || [])
      setLoadingGames(false)
    }

    loadGames()

    return () => {
      cancelled = true
    }
  }, [selectedWeek, session, weekReady])

  if (!session) {
    return (
      <div style={{ padding: 20 }}>
        <p>
          <Link href="/join-league">
            <a>Please join the league to submit picks →</a>
          </Link>
        </p>
      </div>
    )
  }

  // Helpers — use local getDay() so Thu/Mon buckets match user TZ.
  const findGameById = id =>
    games.find(game => String(game.id) === String(id))

  const countCats = map => {
    let th = 0
    let mo = 0
    let be = 0

    Object.keys(map).forEach(id => {
      const game = findGameById(id)

      if (!game) return

      const day = new Date(game.kickoff_time).getDay()

      if (day === 4) {
        th += 1
      } else if (day === 1) {
        mo += 1
      } else {
        be += 1
      }
    })

    return { th, mo, be }
  }

  const handlePick = (gid, team) => {
    setStatus(null)

    const copy = { ...picks }

    // Unselect the same pick.
    if (copy[gid] === team) {
      delete copy[gid]

      if (String(lockPick) === String(gid)) {
        setLockPick(null)
      }

      setPicks(copy)
      return
    }

    // A game that already has a selected side can switch sides
    // without increasing the total number of selected games.
    const alreadySelectedThisGame =
      Object.prototype.hasOwnProperty.call(copy, gid)

    if (
      !alreadySelectedThisGame &&
      Object.keys(copy).length >= 5
    ) {
      setStatus('🚫 You can only pick up to 5 games total.')
      return
    }

    // Tentatively add and count.
    copy[gid] = team

    const { th, mo, be } = countCats(copy)

    if (selectedWeek === 18) {
      // Week 18: up to five Best picks.
      if (be > 5) {
        delete copy[gid]
        setStatus('🚫 Only 5 picks are allowed in Week 18.')
        return
      }
    } else {
      // Regular weeks: 1 Thursday, 1 Monday, and 3 Best.
      if (th > 1) {
        delete copy[gid]
        setStatus('🚫 Only 1 Thursday pick is allowed.')
        return
      }

      if (mo > 1) {
        delete copy[gid]
        setStatus('🚫 Only 1 Monday pick is allowed.')
        return
      }

      if (be > 3) {
        delete copy[gid]
        setStatus(
          '🚫 Only 3 “Best Choice” picks are allowed.'
        )
        return
      }
    }

    setPicks(copy)
  }

  const handleLock = gid => {
    if (!picks[gid]) {
      setStatus(
        '🚫 Select a team from this game before marking it as your lock.'
      )
      return
    }

    setStatus(null)
    setLockPick(
      String(lockPick) === String(gid) ? null : gid
    )
  }

  const savePicks = async () => {
    const entries = Object.entries(picks)

    const inserts = entries.map(([gid, team]) => ({
      user_email: session.user.email,
      game_id: gid,
      selected_team: team,
      is_lock: String(gid) === String(lockPick),
    }))

    const { error } = await supabase
      .from('picks')
      .insert(inserts)

    if (error) {
      setStatus(`🚫 ${error.message}`)
      return
    }

    const submittedIds = entries.map(([gid]) =>
      String(gid)
    )

    setGames(previousGames =>
      previousGames.filter(
        game =>
          !submittedIds.includes(String(game.id))
      )
    )

    setPicks({})
    setLockPick(null)
    setStatus(
      '✅ Picks submitted—those games are now hidden.'
    )
  }

  const submitPicks = () => {
    setStatus(null)

    const entries = Object.entries(picks)
    const totalPicks = entries.length

    if (totalPicks === 0) {
      setStatus('🚫 Please select at least one game.')
      return
    }

    const { th, mo, be } = countCats(picks)

    if (selectedWeek === 18) {
      if (totalPicks !== 5) {
        setStatus(
          '🚫 Week 18 requires exactly 5 picks.'
        )
        return
      }
    } else {
      if (
        totalPicks !== 5 ||
        th !== 1 ||
        mo !== 1 ||
        be !== 3
      ) {
        setStatus(
          '🚫 You must select exactly 1 Thursday pick, 3 Best Choice picks, and 1 Monday pick.'
        )
        return
      }
    }

    if (lockPick == null || !picks[lockPick]) {
      setStatus(
        '🚫 Please select exactly one lock pick.'
      )
      return
    }

    savePicks()
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Submit Your Picks</h2>

      <p>
        Logged in as <strong>{username}</strong> |{' '}
        <Link href="/">
          <a>Home</a>
        </Link>
      </p>

      {status && (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            marginBottom: 16,
          }}
        >
          {status}
        </pre>
      )}

      <div style={{ marginBottom: 16 }}>
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
        <p>Loading Week {selectedWeek} games…</p>
      ) : games.length === 0 ? (
        <p>
          No upcoming games for Week {selectedWeek}.
        </p>
      ) : (
        games.map(game => (
          <div
            key={game.id}
            style={{ marginBottom: 12 }}
          >
            <strong>
              {game.away_team} @ {game.home_team}{' '}
              (
              {game.spread > 0
                ? `+${game.spread}`
                : game.spread}
              ) —{' '}
              {new Date(
                game.kickoff_time
              ).toLocaleString(undefined, {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </strong>

            <br />

            <label>
              <input
                type="radio"
                name={`pick-${game.id}`}
                checked={
                  picks[game.id] === game.home_team
                }
                onChange={() =>
                  handlePick(
                    game.id,
                    game.home_team
                  )
                }
              />{' '}
              {game.home_team}
            </label>

            <label style={{ marginLeft: 12 }}>
              <input
                type="radio"
                name={`pick-${game.id}`}
                checked={
                  picks[game.id] === game.away_team
                }
                onChange={() =>
                  handlePick(
                    game.id,
                    game.away_team
                  )
                }
              />{' '}
              {game.away_team}
            </label>

            <label style={{ marginLeft: 12 }}>
              <input
                type="checkbox"
                checked={
                  String(lockPick) ===
                  String(game.id)
                }
                onChange={() =>
                  handleLock(game.id)
                }
              />{' '}
              Lock
            </label>
          </div>
        ))
      )}

      <button
        onClick={submitPicks}
        disabled={
          !weekReady ||
          loadingGames ||
          games.length === 0
        }
      >
        Submit Picks
      </button>
    </div>
  )
}
