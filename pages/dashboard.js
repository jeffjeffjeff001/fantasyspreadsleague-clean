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

  // Render helpers (unchanged)
  const renderPick = (p) => (!p || !p.team) ? '' : (p.isLock ? <strong>{p.team}</strong> : p.team)
  const renderBestList = (arr = []) => {
    const upto = arr.slice(0, 3)
    return upto.map((p, idx) => (
      <span key={idx}>
        {renderPick(p)}
        {idx < upto.length - 1 ? ', ' : null}
      </span>
    ))
  }

  // -------- normalization helpers (used for result/pick matching) -------
  const normalizeTeam = (s) =>
    (s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()

  const resultKey = (w, home, away) => `${w}|${normalizeTeam(home)}|${normalizeTeam(away)}`

  // ======================= LEADERBOARD =======================
  useEffect(() => {
    async function loadLeaderboard() {
      setLbLoading(true)
      try {
        // 1) profiles
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('email,username')
        if (profErr) throw profErr

        const usernameByEmail = {}
        ;(profiles || []).forEach(p => {
          if (p?.email) usernameByEmail[p.email.toLowerCase()] = p.username || p.email
        })

        // 2) results -> normalized lookup
        const { data: results, error: resErr } = await supabase
          .from('results')
          .select('away_team,home_team,away_score,home_score,week')
        if (resErr) throw resErr

        const resultsByKey = {}
        ;(results || []).forEach(r => {
          resultsByKey[resultKey(r.week, r.home_team, r.away_team)] = r
        })

        // 3) picks with game_id + created_at so we can de-dupe
        const { data: picksRaw, error: pickErr } = await supabase
          .from('picks')
          .select(`
            id,
            created_at,
            user_email,
            selected_team,
            is_lock,
            game_id,
            games (
              away_team,
              home_team,
              spread,
              week
            )
          `)
        if (pickErr) throw pickErr

        // 3a) DE-DUPE: keep only the latest pick for (user_email, game_id)
        const latestByUserGame = {}
        for (const p of (picksRaw || [])) {
          if (!p?.game_id || !p?.user_email) continue
          const k = `${p.user_email.toLowerCase()}|${p.game_id}`
          const cur = latestByUserGame[k]
          if (!cur) {
            latestByUserGame[k] = p
          } else {
            // prefer newest created_at; fallback to highest id
            const curTs = cur.created_at ? Date.parse(cur.created_at) : 0
            const pTs   = p.created_at   ? Date.parse(p.created_at)   : 0
            if (pTs > curTs || (!cur.created_at && p.id > cur.id)) {
              latestByUserGame[k] = p
            }
          }
        }
        const picks = Object.values(latestByUserGame)

        // 4) init stats keyed by lowercased email
        const stats = {}
        ;(profiles || []).forEach(p => {
          if (!p?.email) return
          const k = p.email.toLowerCase()
          stats[k] = {
            username:     usernameByEmail[k] || p.email,
            totalCorrect: 0,
            totalPoints:  0,
            weeklyStats:  {} // week -> { total, correct }
          }
        })

        // 5) score each (de-duped) pick
        for (const pick of picks) {
          const g = pick.games
          if (!g) continue

          const emailKey = (pick.user_email || '').toLowerCase()
          const u = stats[emailKey]
          if (!u) continue

          const week = g.week
          if (!u.weeklyStats[week]) u.weeklyStats[week] = { total: 0, correct: 0 }
          u.weeklyStats[week].total += 1

          const r = resultsByKey[resultKey(week, g.home_team, g.away_team)]
          if (!r) continue

          const spread = parseFloat(g.spread) || 0
          const homeCover = (r.home_score + spread) > r.away_score
          const winner = homeCover
            ? normalizeTeam(g.home_team)
            : normalizeTeam(g.away_team)

          const picked = normalizeTeam(pick.selected_team)
          const isLock = !!pick.is_lock

          if (picked === winner) {
            u.totalCorrect += 1
            u.totalPoints  += 1
            u.weeklyStats[week].correct += 1
            if (isLock) u.totalPoints += 2
          } else if (isLock) {
            u.totalPoints -= 2
          }
        }

        // 6) perfect-week bonus (+3) — only when user had picks that week
        Object.values(stats).forEach(u => {
          Object.values(u.weeklyStats).forEach(ws => {
            if (ws.total > 0 && ws.correct === ws.total) {
              u.totalPoints += 3
            }
          })
        })

        // 7) sort
        const list = Object.values(stats)
        list.sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
          return b.totalCorrect - a.totalCorrect
        })

        setLeaderboard(list)
      } catch (e) {
        console.error('Leaderboard load error:', e)
        setLeaderboard([])
      } finally {
        setLbLoading(false)
      }
    }
    loadLeaderboard()
  }, [])

  // ======================= WEEKLY SCORE LOOKUP (unchanged) =======================
  async function fetchWeeklyScore() {
    setWsError('')
    setWsResult(null)
    setWsLoading(true)
    try {
      const resp = await fetch(`/api/weekly-scores?week=${wsWeek}`)
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Error')
      const me = json.find(r => (r.email || '').toLowerCase() === wsEmail.trim().toLowerCase())
      if (!me) setWsError('No picks found for that email & week.')
      else setWsResult(me)
    } catch (err) {
      setWsError(err.message)
    } finally {
      setWsLoading(false)
    }
  }

  // ======================= LEAGUE PICKS (unchanged from your robust version) =======================
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

      if (!games || games.length === 0) {
        setLpPicks([])
        return
      }

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
          grouped[email] = {
            username: userMap[email] || pk.user_email || email,
            thursday: null,
            best:     [],
            monday:   null
          }
        }
        const day  = new Date(g.kickoff_time).getDay()
        const item = { team: (pk.selected_team || '').trim(), isLock: !!pk.is_lock }
        if (day === 4)      grouped[email].thursday = item
        else if (day === 1) grouped[email].monday   = item
        else                grouped[email].best.push(item)
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

  // ======================= UI (unchanged) =======================
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>League Dashboard</h1>
      <nav><Link href="/"><a>← Home</a></Link></nav>

      {/* Weekly Score */}
      <section style={{ marginTop: 40 }}>
        <h2>Weekly Score</h2>
        <label>
          Email:{' '}
          <input type="email" value={wsEmail} onChange={e => setWsEmail(e.target.value)} />
        </label>{' '}
        <label>
          Week:{' '}
          <select value={wsWeek} onChange={e => setWsWeek(parseInt(e.target.value,10))}>
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
            <select value={lpWeek} onChange={e => setLpWeek(parseInt(e.target.value, 10))}>
              {Array.from({ length: 18 }, (_, i) => i + 1).map(wk => (
                <option key={wk} value={wk}>{wk}</option>
              ))}
            </select>
          </label>
          <button onClick={loadLeaguePicks} disabled={lpLoading} style={{ marginLeft: 8 }}>
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
