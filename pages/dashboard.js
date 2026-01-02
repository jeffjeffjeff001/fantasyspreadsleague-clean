// pages/dashboard.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'

const DEBUG = false; // set true to log detailed diagnostics

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

  // Helpers
  const safeUpper = (s) =>
    (s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()

  // ================================================================
  // Leaderboard: read from SQL views (deterministic, server-scored)
  // ================================================================
  useEffect(() => {
    async function loadLeaderboard() {
      setLbLoading(true)
      try {
        // 1) Username lookup
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('email,username')
        if (profErr) throw profErr

        const nameByEmail = {}
        ;(profiles || []).forEach(p => {
          if (!p?.email) return
          nameByEmail[p.email.toLowerCase()] = p.username || p.email
        })

        // 2) Cumulative totals (already includes perfect-week bonus + overrides)
        const { data: totals, error: totErr } = await supabase
          .from('leaderboard_totals_v')
          .select('email,total_correct_final,total_points_final')
        if (totErr) throw totErr

        const rows = (totals || []).map(t => ({
          username: nameByEmail[(t.email || '').toLowerCase()] || t.email,
          totalCorrect: Number(t.total_correct_final || 0),
          totalPoints:  Number(t.total_points_final  || 0),
        }))

        rows.sort((a, b) =>
          b.totalPoints - a.totalPoints || b.totalCorrect - a.totalCorrect
        )

        if (DEBUG) {
          console.debug('[DEBUG] leaderboard rows →', rows.slice(0, 5))
        }

        setLeaderboard(rows)
      } catch (err) {
        console.error('Leaderboard load error:', err)
        setLeaderboard([])
      } finally {
        setLbLoading(false)
      }
    }

    loadLeaderboard()
  }, [])

  // ================================================================
  // Weekly Score box: read per-week from view + lock breakdown
  // ================================================================
  async function fetchWeeklyScore() {
    setWsError('')
    setWsResult(null)
    setWsLoading(true)
    try {
      const email = wsEmail.trim()
      const week  = wsWeek

      // 1) Pull main per-week row (already includes perfect-week bonus)
      const { data: wkRows, error: wErr } = await supabase
        .from('user_weekly_points_v')
        .select('email, week, total_picks, correct_picks, perfect_bonus, weekly_points_final')
        .eq('email', email)
        .eq('week', week)
        .limit(1)

      if (wErr) throw wErr
      if (!wkRows || wkRows.length === 0) {
        setWsError('No picks found for that email & week.')
        return
      }

      const wk = wkRows[0]

      // 2) Lock breakdown (correct / incorrect) from pick_outcomes_v
      const { data: lockRows, error: lErr } = await supabase
        .from('pick_outcomes_v')
        .select('is_lock, correct')
        .eq('email', email)
        .eq('week', week)
      if (lErr) throw lErr

      let lockCorrect = 0
      let lockIncorrect = 0
      ;(lockRows || []).forEach(r => {
        if (!r || !r.is_lock || r.correct == null) return
        if (r.correct) lockCorrect += 1
        else lockIncorrect += 1
      })

      const payload = {
        email: wk.email,
        correct: Number(wk.correct_picks || 0),
        lockCorrect,
        lockIncorrect,
        perfectBonus: Number(wk.perfect_bonus || 0),
        weeklyPoints: Number(wk.weekly_points_final || 0),
      }

      if (DEBUG) console.debug('[DEBUG] weekly-score payload →', payload)

      setWsResult(payload)
    } catch (err) {
      setWsError(err.message)
    } finally {
      setWsLoading(false)
    }
  }

  // ================================================================
  // League Picks: robust path (games for the week → picks IN game_id)
  // ================================================================
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

      // 2) games for the week
      const { data: games, error: gErr } = await supabase
        .from('games')
        .select('id, kickoff_time, week')
        .eq('week', lpWeek)
        .order('kickoff_time', { ascending: true })
      if (gErr) throw gErr

      if (!games || games.length === 0) {
        setLpPicks([])
        return
      }
      const gameIds  = games.map(g => g.id)
      const gamesById = Object.fromEntries(games.map(g => [String(g.id), g]))

      // 3) picks via IN(game_id)
      const { data: picks, error: pErr } = await supabase
        .from('picks')
        .select('user_email, selected_team, is_lock, game_id')
        .in('game_id', gameIds)
      if (pErr) throw pErr

      // 4) group into Thu / Best / Mon buckets
      const grouped = {}
      ;(picks || []).forEach(pk => {
        const g = gamesById[String(pk.game_id)]
        if (!g) return
        const email = (pk.user_email || '').toLowerCase()
        if (!grouped[email]) {
          grouped[email] = {
            username: userMap[email] || pk.user_email || email,
            thursday: null,   // { team, isLock }
            best:     [],     // Array<{ team, isLock }>
            monday:   null    // { team, isLock }
          }
        }
        const day = new Date(g.kickoff_time).getDay() // local TZ; 4=Thu, 1=Mon
        const item = { team: (pk.selected_team || '').trim(), isLock: !!pk.is_lock }

        if (day === 4)      grouped[email].thursday = item
        else if (day === 1) grouped[email].monday   = item
        else                grouped[email].best.push(item)
      })

      // include users with no picks
      ;(profiles || []).forEach(p => {
        const k = (p.email || '').toLowerCase()
        if (k && !grouped[k]) {
          grouped[k] = { username: p.username, thursday: null, best: [], monday: null }
        }
      })

      // sort by username
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

  // Render helpers for league picks
  const renderPick = (p) => {
    if (!p || !p.team) return ''
    return p.isLock ? <strong>{p.team}</strong> : p.team
  }
 const renderBestList = (arr = []) => {
  const maxBest = (lpWeek === 18) ? 5 : 3
  const upto = arr.slice(0, maxBest)

  return upto.map((p, idx) => (
    <span key={idx}>
      {renderPick(p)}
      {idx < upto.length - 1 ? ', ' : null}
    </span>
  ))
}

  // ================================================================
  // UI
  // ================================================================
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
