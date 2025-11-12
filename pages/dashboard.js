// pages/dashboard.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'

export default function Dashboard() {
  // — Weekly Score state —
  const [wsEmail,    setWsEmail]    = useState('')
  const [wsWeek,     setWsWeek]     = useState(1)
  const [wsResult,   setWsResult]   = useState(null)
  const [wsError,    setWsError]    = useState('')
  const [wsLoading,  setWsLoading]  = useState(false)

  // — Leaderboard state —
  const [leaderboard, setLeaderboard] = useState([])
  const [lbLoading,   setLbLoading]   = useState(true)

  // — League Picks state —
  const [lpWeek,     setLpWeek]     = useState(1)
  const [lpPicks,    setLpPicks]    = useState([])
  const [lpLoading,  setLpLoading]  = useState(false)

  // Render helpers for league picks (bold lock picks)
  const renderPick = (p) => {
    if (!p || !p.team) return ''
    return p.isLock ? <strong>{p.team}</strong> : p.team
  }
  const renderBestList = (arr = []) => {
    const upto = arr.slice(0, 3)
    return upto.map((p, idx) => (
      <span key={idx}>
        {renderPick(p)}
        {idx < upto.length - 1 ? ', ' : null}
      </span>
    ))
  }

  // ===============================
  // Leaderboard (workaround version)
  // ===============================
  useEffect(() => {
    async function loadLeaderboardFromWeekly() {
      setLbLoading(true)
      try {
        // 1) Profiles for usernames
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('email,username')
        if (profErr) throw profErr

        const usernameByEmail = {}
        ;(profiles || []).forEach(p => {
          if (p?.email) usernameByEmail[p.email.toLowerCase()] = p.username || p.email
        })

        // 2) Fetch weekly scores for weeks 1..18 from your existing API
        // Each call returns an array of rows like:
        // { email, weeklyPoints, correct, lockCorrect, lockIncorrect, perfectBonus, weeklyTotal }
        const weeks = Array.from({ length: 18 }, (_, i) => i + 1)
        const weeklyArrays = await Promise.all(
          weeks.map(async w => {
            try {
              const resp = await fetch(`/api/weekly-scores?week=${w}`)
              const json = await resp.json()
              if (!resp.ok) throw new Error(json.error || `Weekly scores error for week ${w}`)
              // Attach week for debugging (optional)
              return (json || []).map(r => ({ ...r, week: w }))
            } catch (e) {
              // If a week has no data yet, treat as empty
              return []
            }
          })
        )

        // 3) Roll up totals by email
        // We only need totalCorrect and totalPoints across all weeks.
        const rollup = {}
        weeklyArrays.flat().forEach(row => {
          const emailKey = (row.email || '').toLowerCase()
          if (!emailKey) return
          if (!rollup[emailKey]) {
            rollup[emailKey] = {
              username: usernameByEmail[emailKey] || row.email || emailKey,
              totalCorrect: 0,
              totalPoints:  0,
            }
          }
          // Sum what Admin calculates per week:
          rollup[emailKey].totalPoints  += Number(row.weeklyPoints || 0)
          rollup[emailKey].totalCorrect += Number(row.correct || 0)
        })

        // 4) Apply manual overrides (points_delta, correct_delta)
        // Table: leaderboard_overrides (email PK, points_delta int, correct_delta int)
        const { data: overrides, error: ovErr } = await supabase
          .from('leaderboard_overrides')
          .select('email, points_delta, correct_delta')
        if (ovErr && ovErr.code !== 'PGRST116') { // ignore "relation does not exist" if you haven't created it yet
          throw ovErr
        }

        ;(overrides || []).forEach(o => {
          const emailKey = (o.email || '').toLowerCase()
          if (!emailKey) return
          if (!rollup[emailKey]) {
            // allow creating a row via override even if user had no weeks yet
            rollup[emailKey] = {
              username: usernameByEmail[emailKey] || o.email || emailKey,
              totalCorrect: 0,
              totalPoints:  0,
            }
          }
          rollup[emailKey].totalPoints  += Number(o.points_delta  || 0)
          rollup[emailKey].totalCorrect += Number(o.correct_delta || 0)
        })

        // 5) Sort: points desc, then correct desc
        const list = Object.values(rollup)
        list.sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
          return b.totalCorrect - a.totalCorrect
        })

        setLeaderboard(list)
      } catch (err) {
        console.error('Leaderboard (weekly+override) load error:', err)
        setLeaderboard([])
      } finally {
        setLbLoading(false)
      }
    }

    loadLeaderboardFromWeekly()
  }, [])

  // — Weekly Score Lookup —
  async function fetchWeeklyScore() {
    setWsError('')
    setWsResult(null)
    setWsLoading(true)
    try {
      const resp = await fetch(`/api/weekly-scores?week=${wsWeek}`)
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Error')
      const me = (json || []).find(r => (r.email || '').toLowerCase() === wsEmail.trim().toLowerCase())
      if (!me) {
        setWsError('No picks found for that email & week.')
      } else {
        setWsResult(me)
      }
    } catch (err) {
      setWsError(err.message)
    } finally {
      setWsLoading(false)
    }
  }

  // — Load & group league picks (robust to nested-join quirks/RLS) —
  async function loadLeaguePicks() {
    setLpLoading(true)
    try {
      // 1) profiles for username lookup
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('email,username')
      if (profErr) throw profErr

      const userMap = {}
      ;(profiles || []).forEach(p => {
        if (!p?.email) return
        userMap[p.email.toLowerCase()] = p.username
      })

      // 2) fetch the week's games first (ids + kickoff for day-bucketing)
      const { data: games, error: gamesErr } = await supabase
        .from('games')
        .select('id, kickoff_time, week')
        .eq('week', lpWeek)
        .order('kickoff_time', { ascending: true })
      if (gamesErr) throw gamesErr

      if (!games || games.length === 0) {
        setLpPicks([])
        return
      }

      const gameIds = games.map(g => g.id)
      const gamesById = Object.fromEntries(games.map(g => [String(g.id), g]))

      // 3) fetch picks via explicit IN on game_id (no nested filter)
      const { data: picks, error: picksErr } = await supabase
        .from('picks')
        .select('user_email, selected_team, is_lock, game_id')
        .in('game_id', gameIds)
      if (picksErr) throw picksErr

      // 4) group by user (preserve lock to render bold)
      const grouped = {}
      for (const pk of (picks || [])) {
        const g = gamesById[String(pk.game_id)]
        if (!g) continue

        const emailKey = (pk.user_email || '').toLowerCase()
        if (!grouped[emailKey]) {
          grouped[emailKey] = {
            username: userMap[emailKey] || pk.user_email || emailKey,
            thursday: null,   // {team, isLock} | null
            best:     [],     // Array<{team, isLock}>
            monday:   null    // {team, isLock} | null
          }
        }

        const day  = new Date(g.kickoff_time).getDay() // 0=Sun,1=Mon,...,4=Thu (local TZ)
        const item = {
          team: (pk.selected_team && pk.selected_team.trim) ? pk.selected_team.trim() : pk.selected_team,
          isLock: !!pk.is_lock
        }

        if (day === 4)      grouped[emailKey].thursday = item
        else if (day === 1) grouped[emailKey].monday   = item
        else                grouped[emailKey].best.push(item)
      }

      // Ensure every league member appears (even with no picks)
      ;(profiles || []).forEach(p => {
        const k = (p.email || '').toLowerCase()
        if (k && !grouped[k]) {
          grouped[k] = {
            username: p.username,
            thursday: null,
            best:     [],
            monday:   null
          }
        }
      })

      // sort by username for consistent display
      const list = Object.values(grouped).sort((a, b) =>
        (a.username || '').localeCompare(b.username || '')
      )

      setLpPicks(list)
    } catch (err) {
      console.error('loadLeaguePicks error:', err)
      setLpPicks([])
    } finally {
      setLpLoading(false)
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>League Dashboard</h1>
      <nav><Link href="/"><a>← Home</a></Link></nav>

      {/* Weekly Score */}
      <section style={{ marginTop: 40 }}>
        <h2>Weekly Score</h2>
        <label>
          Email:{' '}
          <input
            type="email"
            value={wsEmail}
            onChange={e => setWsEmail(e.target.value)}
          />
        </label>{' '}
        <label>
          Week:{' '}
          <select
            value={wsWeek}
            onChange={e => setWsWeek(parseInt(e.target.value,10))}
          >
            {Array.from({ length: 18 }, (_, i) => i + 1).map(wk => (
              <option key={wk} value={wk}>{wk}</option>
            ))}
          </select>
        </label>
        <button onClick={fetchWeeklyScore} disabled={wsLoading}>
          {wsLoading ? 'Loading…' : 'Get Score'}
        </button>
        {wsError && <p style={{ color: 'red' }}>{wsError}</p>}
        {wsResult && (
          <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', marginTop: 10 }}>
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
                <td style={{ textAlign: 'center' }}>{wsResult.correct}</td>
                <td style={{ textAlign: 'center' }}>{wsResult.lockCorrect}</td>
                <td style={{ textAlign: 'center' }}>{wsResult.lockIncorrect}</td>
                <td style={{ textAlign: 'center' }}>{wsResult.perfectBonus}</td>
                <td style={{ textAlign: 'center' }}>{wsResult.weeklyPoints}</td>
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
          <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', marginTop: 10 }}>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Username</th>
                <th>Total Correct</th>
                <th>Total Points</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((u, i) => (
                <tr key={(u.username || '') + i}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td>{u.username}</td>
                  <td style={{ textAlign: 'center' }}>{u.totalCorrect}</td>
                  <td style={{ textAlign: 'center' }}>{u.totalPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* League Picks */}
      <section style={{ marginTop: 60 }}>
        <h2>League Picks <small style={{ color:'#94a3b8', fontWeight: 400 }}>(lock picks appear in bold)</small></h2>
        <div style={{ marginBottom: 12 }}>
          <label>
            Week:&nbsp;
            <select
              value={lpWeek}
              onChange={e => setLpWeek(parseInt(e.target.value, 10))}
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map(wk => (
                <option key={wk} value={wk}>{wk}</option>
              ))}
            </select>
          </label>
          <button
            onClick={loadLeaguePicks}
            disabled={lpLoading}
            style={{ marginLeft: 8 }}
          >
            {lpLoading ? 'Loading…' : 'Load Picks'}
          </button>
        </div>

        {lpLoading ? (
          <p>Loading picks…</p>
        ) : lpPicks.length > 0 ? (
          <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', marginTop: 10 }}>
            <thead>
              <tr>
                <th>Username</th>
                <th>Thursday Pick</th>
                <th>Best-3 Picks</th>
                <th>Monday Pick</th>
              </tr>
            </thead>
            <tbody>
              {lpPicks.map((u, i) => (
                <tr key={i}>
                  <td>{u.username}</td>
                  <td style={{ textAlign: 'center' }}>{renderPick(u.thursday)}</td>
                  <td>{renderBestList(u.best)}</td>
                  <td style={{ textAlign: 'center' }}>{renderPick(u.monday)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No league picks found for Week {lpWeek}.</p>
        )}
      </section>
    </div>
  )
}
