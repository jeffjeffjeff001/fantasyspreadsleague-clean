// pages/admin.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'

export default function Admin() {
  // ── ALL HOOK DECLARATIONS ─────────────────────────────────────────────
  const ADMIN_PW = process.env.NEXT_PUBLIC_ADMIN_PASSWORD
  const [enteredPw, setEnteredPw]     = useState('')
  const [authorized, setAuthorized]   = useState(false)

  const [selectedWeek, setSelectedWeek]       = useState(1)
  const [games, setGames]                     = useState([])
  const [profiles, setProfiles]               = useState([])
  const [loadingGames, setLoadingGames]       = useState(false)
  const [loadingProfiles, setLoadingProfiles] = useState(false)

  const [newGameAway, setNewGameAway]       = useState('')
  const [newGameHome, setNewGameHome]       = useState('')
  const [newGameSpread, setNewGameSpread]   = useState('')
  const [newGameKickoff, setNewGameKickoff] = useState('')

  const [userForPicks, setUserForPicks]   = useState('')
  const [weekForPicks, setWeekForPicks]   = useState(1)
  const [userPicks, setUserPicks]         = useState([])
  const [loadingPicks, setLoadingPicks]   = useState(false)

  const [weeklyScores, setWeeklyScores]   = useState([])   // shown in existing table
  const [loadingScores, setLoadingScores] = useState(false)

  useEffect(() => {
    loadGames()
    loadProfiles()
  }, [selectedWeek])

  // ── ADMIN PASSWORD GATE ────────────────────────────────────────────────
  const handlePwSubmit = e => {
    e.preventDefault()
    if (enteredPw === ADMIN_PW) {
      setAuthorized(true)
    } else {
      alert('❌ Incorrect password')
      setEnteredPw('')
    }
  }

  if (!authorized) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Admin Login</h1>
        <form onSubmit={handlePwSubmit}>
          <label>
            Enter admin password:
            <input
              type="password"
              value={enteredPw}
              onChange={e => setEnteredPw(e.target.value)}
              style={{ marginLeft: 8 }}
            />
          </label>
          <button type="submit" style={{ marginLeft: 12 }}>
            Unlock
          </button>
        </form>
      </div>
    )
  }
  // ── END PASSWORD GATE ───────────────────────────────────────────────────

  // ── Data loading ──────────────────────────────────────────────────
  async function loadGames() {
    setLoadingGames(true)
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('week', selectedWeek)
      .order('kickoff_time', { ascending: true })
    if (error) {
      alert('Error loading games: ' + error.message)
    } else {
      setGames(data)
    }
    setLoadingGames(false)
  }

  async function loadProfiles() {
    setLoadingProfiles(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('email, username, first_name, last_name')
      .order('username', { ascending: true })
    if (error) {
      alert('Error loading profiles: ' + error.message)
    } else {
      setProfiles(data)
    }
    setLoadingProfiles(false)
  }

  // ── Game management ────────────────────────────────────────────────
  async function handleAddGame() {
    const { error } = await supabase.from('games').insert([{
      week:         selectedWeek,
      away_team:    newGameAway,
      home_team:    newGameHome,
      spread:       parseFloat(newGameSpread),
      kickoff_time: new Date(newGameKickoff).toISOString(),
    }])
    if (error) {
      alert('Error adding game: ' + error.message)
    } else {
      setNewGameAway('')
      setNewGameHome('')
      setNewGameSpread('')
      setNewGameKickoff('')
      loadGames()
    }
  }

  async function handleDeleteGame(id) {
    if (!confirm('Delete this game and all its picks?')) return

    const { error: pickErr } = await supabase
      .from('picks')
      .delete()
      .eq('game_id', id)
    if (pickErr) {
      alert('Error deleting associated picks: ' + pickErr.message)
      return
    }

    const { error: gameErr } = await supabase
      .from('games')
      .delete()
      .eq('id', id)
    if (gameErr) {
      alert('Error deleting game: ' + gameErr.message)
    } else {
      loadGames()
    }
  }

  async function handleClearWeek() {
    if (!confirm(`Clear all games and picks for Week ${selectedWeek}?`)) return

    const { error: pickErr } = await supabase
      .from('picks')
      .delete()
      .eq('games.week', selectedWeek)
    if (pickErr) {
      alert('Error clearing picks: ' + pickErr.message)
      return
    }

    const { error: gameErr } = await supabase
      .from('games')
      .delete()
      .eq('week', selectedWeek)
    if (gameErr) {
      alert('Error clearing games: ' + gameErr.message)
    } else {
      setGames([])
    }
  }

  // ── User management ────────────────────────────────────────────────
  async function handleDeleteUser(email) {
    if (!confirm(`Delete user ${email}?`)) return
    const res = await fetch('/api/delete-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const { error } = await res.json()
    if (error) alert('Error deleting user: ' + error)
    else loadProfiles()
  }

  // ── View user picks ────────────────────────────────────────────────
  async function loadUserPicks() {
    if (!userForPicks) {
      alert('Please select a user')
      return
    }
    setLoadingPicks(true)

    const { data, error } = await supabase
      .from('picks')
      .select('id, selected_team, is_lock, games(away_team,home_team,kickoff_time)')
      .eq('user_email', userForPicks)
      .eq('games.week', weekForPicks)
      .order('kickoff_time', { foreignTable: 'games', ascending: true })

    if (error) {
      alert('Error loading picks: ' + error.message)
      setLoadingPicks(false)
      return
    }

    const valid = data.filter(pk => pk.games && pk.games.kickoff_time)
    setUserPicks(valid)
    setLoadingPicks(false)
  }

  async function handleDeletePick(pickId) {
    if (!confirm('Delete this pick?')) return
    const { error } = await supabase
      .from('picks')
      .delete()
      .eq('id', pickId)
    if (error) alert('Error deleting pick: ' + error.message)
    else loadUserPicks()
  }

  // ── Calculate Weekly Scores (client-side to match Dashboard) ──────
  async function calculateScores() {
    setLoadingScores(true)
    try {
      // 1) profiles
      const { data: profileRows, error: profErr } = await supabase
        .from('profiles')
        .select('email,username')
      if (profErr) throw profErr

      // 2) results for selectedWeek
      const { data: results, error: resErr } = await supabase
        .from('results')
        .select('away_team,home_team,away_score,home_score,week')
        .eq('week', selectedWeek)
      if (resErr) throw resErr

      // 3) picks (with games) for selectedWeek
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
        .eq('games.week', selectedWeek)
      if (pickErr) throw pickErr

      // 4) score exactly like Dashboard
      const stats = {}
      profileRows.forEach(p => {
        stats[p.email] = {
          email:         p.email,
          weeklyPoints:  0,
          correct:       0,
          lockCorrect:   0,
          lockIncorrect: 0,
          perfectBonus:  0,
          weeklyTotal:   0,
        }
      })

      picks.forEach(pick => {
        const g = pick.games
        if (!g) return
        const u = stats[pick.user_email]
        if (!u) return

        u.weeklyTotal += 1

        const result = results.find(r =>
          r.week === g.week &&
          r.home_team.trim() === g.home_team.trim() &&
          r.away_team.trim() === g.away_team.trim()
        )
        if (!result) return

        const spread    = parseFloat(g.spread)
        const homeCover = (result.home_score + spread) > result.away_score
        const winner    = homeCover ? result.home_team.trim() : result.away_team.trim()

        const picked = pick.selected_team.trim()
        if (picked === winner) {
          u.correct += 1
          u.weeklyPoints += 1
          if (pick.is_lock) {
            u.lockCorrect += 1
            u.weeklyPoints += 2
          }
        } else if (pick.is_lock) {
          u.lockIncorrect += 1
          u.weeklyPoints -= 2
        }
      })

      // perfect-week bonus (+3 if user got all their picks correct that week)
      Object.values(stats).forEach(u => {
        if (u.weeklyTotal > 0 && u.correct === u.weeklyTotal) {
          u.perfectBonus += 3
          u.weeklyPoints += 3
        }
      })

      // show only users who made picks this week; sort by points desc, then correct desc
      const arr = Object.values(stats).filter(u => u.weeklyTotal > 0)
      arr.sort((a, b) => {
        if (b.weeklyPoints !== a.weeklyPoints) return b.weeklyPoints - a.weeklyPoints
        return b.correct - a.correct
      })

      setWeeklyScores(arr)
    } catch (err) {
      console.error(err)
      alert('Error calculating scores: ' + err.message)
      setWeeklyScores([])
    } finally {
      setLoadingScores(false)
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Admin</h1>
      <p><Link href="/"><a>← Home</a></Link></p>

      {/* Game Management */}
      <section style={{ marginTop: 20 }}>
        <h2>Game Management (Week {selectedWeek})</h2>
        <div style={{ marginBottom: 12 }}>
          <label>Week:&nbsp;
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(parseInt(e.target.value,10))}
              style={{ width: 60 }}
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map(wk => (
                <option key={wk} value={wk}>{wk}</option>
              ))}
            </select>
          </label>
          <button onClick={handleClearWeek} style={{ marginLeft: 12 }}>
            Clear Week
          </button>
        </div>
        {loadingGames ? (
          <p>Loading games…</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Away</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Home</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Spread</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Kickoff</th>
                <th style={{ border: '1px solid ' + '#ccc', padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {games.map(g => (
                <tr key={g.id}>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{g.away_team}</td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{g.home_team}</td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>
                    {g.spread > 0 ? `+${g.spread}` : g.spread}
                  </td>
                  <td style={{ border: '1px solid '#ccc', padding: 8 }}>
                    {new Date(g.kickoff_time).toLocaleString()}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: 8, textAlign: 'center' }}>
                    <button
                      onClick={() => handleDeleteGame(g.id)}
                      style={{ background: 'red', color: 'white', padding: '6px 12px', border: 'none' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 12 }}>
          <input
            placeholder="Away Team"
            value={newGameAway}
            onChange={e => setNewGameAway(e.target.value)}
            style={{ marginRight: 8 }}
          />
          <input
            placeholder="Home Team"
            value={newGameHome}
            onChange={e => setNewGameHome(e.target.value)}
            style={{ marginRight: 8 }}
          />
          <input
            placeholder="Spread"
            type="number"
            value={newGameSpread}
            onChange={e => setNewGameSpread(e.target.value)}
            style={{ width: 80, marginRight: 8 }}
          />
          <input
            placeholder="Kickoff (ISO)"
            value={newGameKickoff}
            onChange={e => setNewGameKickoff(e.target.value)}
            style={{ marginRight: 8 }}
          />
          <button onClick={handleAddGame}>Add Game</button>
        </div>
      </section>

      {/* User Management */}
      <section style={{ marginTop: 40 }}>
        <h2>User Management</h2>
        {loadingProfiles ? (
          <p>Loading profiles…</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Username</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Name</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Email</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.email}>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{p.username}</td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>
                    {p.first_name} {p.last_name}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{p.email}</td>
                  <td style={{ border: '1px solid #ccc', padding: 8, textAlign: 'center' }}>
                    <button
                      onClick={() => handleDeleteUser(p.email)}
                      style={{ background: 'red', color: 'white', padding: '6px 12px', border: 'none' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* View User Picks */}
      <section style={{ marginTop: 40 }}>
        <h2>View User Picks</h2>
        <div style={{ marginBottom: 12 }}>
          <select
            value={userForPicks}
            onChange={e => setUserForPicks(e.target.value)}
          >
            <option value="">Select user</option>
            {profiles.map(p => (
              <option key={p.email} value={p.email}>{p.username}</option>
            ))}
          </select>

          <select
            value={weekForPicks}
            onChange={e => setWeekForPicks(parseInt(e.target.value, 10))}
            style={{ width: 60, marginLeft: 8 }}
          >
            {Array.from({ length: 18 }, (_, i) => i + 1).map(wk => (
              <option key={wk} value={wk}>{wk}</option>
            ))}
          </select>

          <button onClick={loadUserPicks} style={{ marginLeft: 8 }}>
            Load Picks
          </button>
        </div>
        {loadingPicks ? (
          <p>Loading picks…</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Game</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Pick</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Lock?</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {userPicks.map(pk => (
                <tr key={pk.id}>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>
                    {pk.games.away_team} @ {pk.games.home_team}
                    <br /><small>{new Date(pk.games.kickoff_time).toLocaleString()}</small>
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{pk.selected_team}</td>
                  <td style={{ border: '1px solid #ccc', padding: 8, textAlign: 'center' }}>
                    {pk.is_lock ? '✅' : ''}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: 8, textAlign: 'center' }}>
                    <button
                      onClick={() => handleDeletePick(pk.id)}
                      style={{ background: 'red', color: 'white', padding: '6px 12px', border: 'none' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {userPicks.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 8, textAlign: 'center' }}>No picks found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {/* Calculate Weekly Scores (existing table, corrected math) */}
      <section style={{ marginTop: 40 }}>
        <h2>Calculate Scores (Week {selectedWeek})</h2>
        <button onClick={calculateScores}>Calculate Scores</button>
        {loadingScores && <p>Calculating…</p>}
        {weeklyScores.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr>
                <th style={{ border:'1px solid #ccc', padding: 8 }}>Email</th>
                <th style={{ border:'1px solid #ccc', padding: 8 }}>Points</th>
                <th style={{ border:'1px solid #ccc', padding: 8 }}>Correct</th>
                <th style={{ border:'1px solid #ccc', padding: 8 }}>Lock ✔</th>
                <th style={{ border:'1px solid #ccc', padding: 8 }}>Lock ✘</th>
                <th style={{ border:'1px solid #ccc', padding: 8 }}>Bonus</th>
              </tr>
            </thead>
            <tbody>
              {weeklyScores.map(u => (
                <tr key={u.email}>
                  <td style={{ border:'1px solid #ccc', padding: 8 }}>{u.email}</td>
                  <td style={{ border:'1px solid #ccc', padding: 8 }}>{u.weeklyPoints}</td>
                  <td style={{ border:'1px solid #ccc', padding: 8 }}>{u.correct}</td>
                  <td style={{ border:'1px solid #ccc', padding: 8 }}>{u.lockCorrect}</td>
                  <td style={{ border:'1px solid #ccc', padding: 8 }}>{u.lockIncorrect}</td>
                  <td style={{ border:'1px solid #ccc', padding: 8 }}>{u.perfectBonus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
