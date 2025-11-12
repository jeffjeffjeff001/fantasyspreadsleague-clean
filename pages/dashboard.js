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

  // Render helpers for league picks
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

  // ---------- Normalization helpers ----------
  const normTeam = (s) =>
    (s || '')
      .replace(/\u00A0/g, ' ')  // NBSP → space
      .replace(/\s+/g, ' ')     // collapse
      .trim()
      .toUpperCase()

  const keyOf = (w, home, away) => `${w}|${normTeam(home)}|${normTeam(away)}`

  // ====================================================================
  // Leaderboard (fixed): fetch picks & games separately to avoid NULL nested joins
  // ====================================================================
  useEffect(() => {
    async function loadLeaderboard() {
      setLbLoading(true)
      try {
        // 1) profiles (for usernames)
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('email,username')
        if (profErr) throw profErr

        const usernameByEmail = {}
        const emailSet = new Set()
        ;(profiles || []).forEach(p => {
          if (!p?.email) return
          const k = p.email.toLowerCase()
          usernameByEmail[k] = p.username || p.email
          emailSet.add(k)
        })

        // 2) all results, build lookup both directions
        const { data: results, error: resErr } = await supabase
          .from('results')
          .select('away_team,home_team,away_score,home_score,week')
        if (resErr) throw resErr

        const resByHomeAway = {}
        const resByAwayHome = {}
        ;(results || []).forEach(r => {
          resByHomeAway[keyOf(r.week, r.home_team, r.away_team)] = r
          resByAwayHome[keyOf(r.week, r.away_team, r.home_team)] = r
        })

        // 3) all picks (flat) + add their emails into the set
        const { data: picks, error: pickErr } = await supabase
          .from('picks')
          .select('user_email, selected_team, is_lock, game_id')
        if (pickErr) throw pickErr

        ;(picks || []).forEach(pk => {
          if (pk?.user_email) emailSet.add(pk.user_email.toLowerCase())
        })

        // 4) fetch all games referenced by those picks and map by id
        const gameIds = Array.from(new Set((picks || []).map(p => p.game_id).filter(Boolean)))
        let gamesById = {}
        if (gameIds.length) {
          const { data: games, error: gamesErr } = await supabase
            .from('games')
            .select('id, home_team, away_team, spread, week')
            .in('id', gameIds)
          if (gamesErr) throw gamesErr
          gamesById = Object.fromEntries((games || []).map(g => [String(g.id), g]))
        }

        // 5) seed stats for everyone that appears
        const stats = {}
        ;(Array.from(emailSet)).forEach(k => {
          stats[k] = {
            username: usernameByEmail[k] || k,
            totalCorrect: 0,
            totalPoints:  0,
            weeklyStats:  {}   // week -> { total, correct }
          }
        })

        // helper: resolve a result for a game regardless of swap in results
        function resolveResultForGame(week, home, away) {
          const k1 = keyOf(week, home, away)
          let r = resByHomeAway[k1]
          if (r) return { hs: r.home_score, as: r.away_score } // aligned
          const k2 = keyOf(week, away, home)
          r = resByAwayHome[k2]
          if (r) return { hs: r.away_score, as: r.home_score } // flipped; re-map
          return null
        }

        // 6) score every pick
        ;(picks || []).forEach(pk => {
          const g = gamesById[String(pk.game_id)]
          if (!g) return // if game not found, skip

          const emailKey = (pk.user_email || '').toLowerCase()
          const u = stats[emailKey]
          if (!u) return

          const w = g.week
          if (!u.weeklyStats[w]) u.weeklyStats[w] = { total: 0, correct: 0 }
          u.weeklyStats[w].total += 1

          const resolved = resolveResultForGame(w, g.home_team, g.away_team)
          if (!resolved) return

          const spread = parseFloat(g.spread) || 0
          const homeCover = (resolved.hs + spread) > resolved.as
          const winner = homeCover ? normTeam(g.home_team) : normTeam(g.away_team)
          const picked = normTeam(pk.selected_team)

          if (picked === winner) {
            u.totalCorrect += 1
            u.totalPoints  += 1
            u.weeklyStats[w].correct += 1
            if (pk.is_lock) u.totalPoints += 2
          } else if (pk.is_lock) {
            u.totalPoints -= 2
          }
        })

        // 7) perfect-week bonus
        Object.values(stats).forEach(u => {
          Object.values(u.weeklyStats).forEach(ws => {
            if (ws.total > 0 && ws.correct === ws.total) {
              u.totalPoints += 3
            }
          })
        })

        // 8) sort and set
        const list = Object.values(stats).sort((a,b) => {
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
  // — League Picks loader (your robust version using explicit IN) —
  // ====================================================================
  async function loadLeaguePicks() {
    setLpLoading(true)
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('email,username')

      const userMap = {}
      ;(profiles || []).forEach(p => {
        if (!p?.email) return
        userMap[p.email.toLowerCase()] = p.username
      })

      const { data: games } = await supabase
        .from('games')
        .select('id, kickoff_time, week')
        .eq('week', lpWeek)
        .order('kickoff_time', { ascending: true })

      if (!games || games.length === 0) { setLpPicks([]); return }
      const gameIds = games.map(g => g.id)
      const gamesById = Object.fromEntries(games.map(g => [String(g.id), g]))

      const { data: picks } = await supabase
        .from('picks')
        .select('user_email, selected_team, is_lock, game_id')
        .in('game_id', gameIds)

      const grouped = {}
      ;(picks || []).forEach(pk => {
        const g = gamesById[String(pk.game_id)]
        if (!g) return
        const email = (pk.user_email || '').toLowerCase()
        if (!grouped[email]) {
          grouped[email] = { username: userMap[email] || pk.user_email || email, thursday: null, best: [], monday: null }
        }
        const day  = new Date(g.kickoff_time).getDay()  // 0 Sun, 1 Mon, 4 Thu
        const item = { team: (pk.selected_team || '').trim(), isLock: !!pk.is_lock }
        if (day === 4) grouped[email].thursday = item
        else if (day === 1) grouped[email].monday = item
        else grouped[email].best.push(item)
      })

      ;(profiles || []).forEach(p => {
        const k = (p.email || '').toLowerCase()
        if (k && !grouped[k]) {
          grouped[k] = { username: p.username, thursday: null, best: [], monday: null }
        }
      })

      const list = Object.values(grouped).sort((a, b) =>
        (a.username || '').localeCompare(b.username || '')
      )

      setLpPicks(list)
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
