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

  // =============== ROBUST LEADERBOARD (no nested join) =================
  useEffect(() => {
    async function loadLeaderboard() {
      setLbLoading(true)
      try {
        // 1) profiles (email → username), normalized to lowercase
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('email,username')
        if (profErr) throw profErr

        const userMap = {}
        ;(profiles || []).forEach(p => {
          if (!p?.email) return
          userMap[p.email.toLowerCase()] = p.username || p.email
        })

        // 2) pull ALL games we’ve stored (id, teams, spread, week)
        const { data: games, error: gamesErr } = await supabase
          .from('games')
          .select('id, home_team, away_team, spread, week')
        if (gamesErr) throw gamesErr

        const gamesById = Object.fromEntries(
          (games || []).map(g => [String(g.id), g])
        )

        // 3) pull ALL results once
        const { data: results, error: resErr } = await supabase
          .from('results')
          .select('week, home_team, away_team, home_score, away_score')
        if (resErr) throw resErr

        // Fast lookups by "week|home|away"
        const keyOf = (w, h, a) => `${w}|${(h||'').trim()}|${(a||'').trim()}`
        const resultsByKey = {}
        ;(results || []).forEach(r => {
          resultsByKey[keyOf(r.week, r.home_team, r.away_team)] = r
        })

        // 4) pull ALL picks (no nested join) → join in memory via game_id
        const { data: picks, error: picksErr } = await supabase
          .from('picks')
          .select('user_email, selected_team, is_lock, game_id')
        if (picksErr) throw picksErr

        // 5) init stats keyed by lowercase email
        const stats = {}
        const ensureUser = (emailLc) => {
          if (!stats[emailLc]) {
            stats[emailLc] = {
              username: userMap[emailLc] || emailLc,
              totalCorrect: 0,
              totalPoints:  0,
              weeklyStats:  {}  // week -> { total, correct }
            }
          }
          return stats[emailLc]
        }

        // 6) score every pick robustly
        for (const pk of (picks || [])) {
          const emailLc = (pk.user_email || '').toLowerCase()
          if (!emailLc) continue
          const u = ensureUser(emailLc)

          const g = gamesById[String(pk.game_id)]
          if (!g) continue  // guard against missing nested join rows

          const w = g.week
          if (!u.weeklyStats[w]) u.weeklyStats[w] = { total: 0, correct: 0 }
          u.weeklyStats[w].total += 1

          const r = resultsByKey[keyOf(g.week, g.home_team, g.away_team)]
          if (!r) continue

          const spread    = parseFloat(g.spread)
          const homeCover = (r.home_score + spread) > r.away_score
          const winner    = homeCover ? (g.home_team || '').trim()
                                      : (g.away_team || '').trim()

          const picked = (pk.selected_team && pk.selected_team.trim)
            ? pk.selected_team.trim()
            : pk.selected_team

          if (picked === winner) {
            u.totalCorrect += 1
            u.totalPoints  += 1
            u.weeklyStats[w].correct += 1
            if (pk.is_lock) u.totalPoints += 2
          } else if (pk.is_lock) {
            u.totalPoints -= 2
          }
        }

        // 7) perfect-week bonus (+3 when user’s correct === total for that week)
        Object.values(stats).forEach(u => {
          Object.values(u.weeklyStats).forEach(ws => {
            if (ws.total > 0 && ws.correct === ws.total) {
              u.totalPoints += 3
            }
          })
        })

        // 8) sort and store
        const list = Object.values(stats)
        list.sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
          return b.totalCorrect - a.totalCorrect
        })
        setLeaderboard(list)
      } catch (err) {
        console.error('loadLeaderboard error:', err)
        setLeaderboard([])
      } finally {
        setLbLoading(false)
      }
    }
    loadLeaderboard()
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

  // — Load & group league picks (robust to nested-join quirks/RLS) —
  async function loadLeaguePicks() {
    setLpLoading(true)
    try {
      // 1) profiles for username lookup (lowercased email keys)
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

      // 3) fetch picks via explicit IN on game_id
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
            thursday: null,
            best:     [],
            monday:   null
          }
        }

        const day  = new Date(g.kickoff_time).getDay()  // 0=Sun,1=Mon,...,4=Thu
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
