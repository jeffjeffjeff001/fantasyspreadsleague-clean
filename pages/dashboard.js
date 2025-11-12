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

  // ─────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────
  // Normalization used for matching results<->games and for picked team
  const normalizeTeam = (s) =>
    (s || '')
      .replace(/\u00A0/g, ' ')   // NBSP → space
      .replace(/\s+/g, ' ')      // collapse spaces
      .trim()
      .toUpperCase()

  const keyOf = (w, home, away) => `${w}|${normalizeTeam(home)}|${normalizeTeam(away)}`

  // ====================================================================
  // Fetch & compute the leaderboard on mount (RESTORED logic + overrides)
  // ====================================================================
  useEffect(() => {
    async function loadLeaderboard() {
      setLbLoading(true)
      try {
        // 1) profiles (for usernames; we key stats by lowercased email)
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('email,username')
        if (profErr) throw profErr

        const usernameByEmail = {}
        ;(profiles || []).forEach(p => {
          if (p?.email) usernameByEmail[p.email.toLowerCase()] = p.username || p.email
        })

        // 2) ALL results across all weeks, build normalized lookup
        const { data: results, error: resErr } = await supabase
          .from('results')
          .select('away_team,home_team,away_score,home_score,week')
        if (resErr) throw resErr

        const resultsByKey = {}
        ;(results || []).forEach(r => {
          resultsByKey[keyOf(r.week, r.home_team, r.away_team)] = r
        })

        // 3) ALL picks with games fields across all weeks
        const { data: picks, error: pickErr } = await supabase
          .from('picks')
          .select(`
            user_email,
            selected_team,
            is_lock,
            games (
              away_team,
              home_team,
              spread,
              week
            )
          `)
        if (pickErr) throw pickErr

        // 4) init stats keyed by lowercased email
        const stats = {}
        ;(profiles || []).forEach(p => {
          if (!p?.email) return
          const k = p.email.toLowerCase()
          stats[k] = {
            username:     usernameByEmail[k] || p.email,
            totalCorrect: 0,
            totalPoints:  0,
            weeklyStats:  {}   // week -> { total, correct }
          }
        })

        // 5) score every pick with normalized keys (restored working logic)
        ;(picks || []).forEach(pick => {
          const g = pick.games
          if (!g) return

          const emailKey = (pick.user_email || '').toLowerCase()
          const u = stats[emailKey]
          if (!u) return

          const week = g.week
          if (!u.weeklyStats[week]) u.weeklyStats[week] = { total: 0, correct: 0 }
          u.weeklyStats[week].total += 1

          const r = resultsByKey[keyOf(week, g.home_team, g.away_team)]
          if (!r) return  // no result match → skip scoring

          const spread = parseFloat(g.spread) || 0
          const homeCover = (r.home_score + spread) > r.away_score
          const winner = homeCover
            ? normalizeTeam(g.home_team)
            : normalizeTeam(g.away_team)

          const picked = normalizeTeam(pick.selected_team)

          if (picked === winner) {
            u.totalCorrect += 1
            u.totalPoints  += 1
            u.weeklyStats[week].correct += 1
            if (pick.is_lock) {
              u.totalPoints += 2
            }
          } else if (pick.is_lock) {
            u.totalPoints -= 2
          }
        })

        // 6) perfect-week bonus (+3) if correct==total in that week
        Object.values(stats).forEach(u => {
          Object.values(u.weeklyStats).forEach(ws => {
            if (ws.total > 0 && ws.correct === ws.total) {
              u.totalPoints += 3
            }
          })
        })

        // 7) APPLY MANUAL OVERRIDES (leaderboard_overrides)
        const { data: overrides, error: ovErr } = await supabase
          .from('leaderboard_overrides')
          .select('email, points_delta, correct_delta')
        if (ovErr) throw ovErr

        const ovByEmail = {}
        ;(overrides || []).forEach(row => {
          if (!row?.email) return
          ovByEmail[row.email.toLowerCase()] = {
            points: Number(row.points_delta || 0),
            correct: Number(row.correct_delta || 0),
          }
        })

        Object.entries(stats).forEach(([emailKey, u]) => {
          const bump = ovByEmail[emailKey]
          if (!bump) return
          u.totalPoints  += bump.points
          u.totalCorrect += bump.correct
        })

        // 8) sort & set
        const list = Object.values(stats)
        list.sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
          return b.totalCorrect - a.totalCorrect
        })
        setLeaderboard(list)
      } catch (err) {
        console.error('Leaderboard load error:', err)
        setLeaderboard([])
      } finally {
        setLbLoading(false)
      }
    }

    loadLeaderboard()
  }, [])

  // ====================================================================
  // — Weekly Score Lookup — (unchanged)
  // ====================================================================
  async function fetchWeeklyScore() {
    setWsError('')
    setWsResult(null)
    setWsLoading(true)
    try {
      const resp = await fetch(`/api/weekly-scores?week=${wsWeek}`)
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Error')
      const me = json.find(r => (r.email || '').toLowerCase() === wsEmail.trim().toLowerCase())
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

  // ====================================================================
  // — Load & group league picks (robust to nested-join quirks/RLS) —
  // ====================================================================
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

        const email = (pk.user_email || '').toLowerCase()
        if (!grouped[email]) {
          grouped[email] = {
            username: userMap[email] || pk.user_email || email,
            thursday: null,   // {team, isLock} | null
            best:     [],     // Array<{team, isLock}>
            monday:   null    // {team, isLock} | null
          }
        }

        const day  = new Date(g.kickoff_time).getDay()  // 0=Sun,1=Mon...4=Thu
        const item = { team: (pk.selected_team || '').trim(), isLock: !!pk.is_lock }

        if (day === 4)      grouped[email].thursday = item
        else if (day === 1) grouped[email].monday   = item
        else                grouped[email].best.push(item)
      }

      // Ensure every league member appears (even with no picks)
      ;(profiles || []).forEach(p => {
        const k = (p.email || '').toLowerCase()
        if (k && !grouped[k]) {
          grouped[k] = { username: p.username, thursday: null, best: [], monday: null }
        }
      })

      // Optional: sort by username
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

  // ====================================================================
  // UI
  // ====================================================================
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
                <tr key={u.username || i}>
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
