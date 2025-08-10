// pages/profile.js

import { useState } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function UserProfile() {
  const { session, profile } = useAuth()
  const username = profile?.username || session?.user?.email

  const [selectedWeek, setSelectedWeek] = useState(1)
  const [picks, setPicks]               = useState([])
  const [warning, setWarning]           = useState('')
  const [error, setError]               = useState(null)
  const [loading, setLoading]           = useState(false)

  if (!session) {
    return (
      <div style={{ padding: 20 }}>
        <p>
          <Link href="/join‑league"><a>Join the league to view your profile</a></Link>
        </p>
      </div>
    )
  }

  const loadPicks = async () => {
    setLoading(true)
    setError(null)
    setWarning('')
    setPicks([])

    const { data, error } = await supabase
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
      .eq('games.week', selectedWeek)
      .order('kickoff_time', { ascending: true, foreignTable: 'games' })

    if (error) {
      setError(error.message)
    } else {
      // **DROP any pick whose joined game is null**
      const valid = data.filter(p => p.games && p.games.kickoff_time)

      // use local getDay() so Thursday/Monday match user TZ
      const getDow = iso => new Date(iso).getDay()
      const thu = [], mon = [], best = []

      // bucket into Thursday, Monday, Best‑3
      valid.forEach(pick => {
        const dow = getDow(pick.games.kickoff_time)
        if (dow === 4 && thu.length < 1) {
          thu.push(pick)
        } else if (dow === 1 && mon.length < 1) {
          mon.push(pick)
        } else if (dow !== 1 && dow !== 4 && best.length < 3) {
          best.push(pick)
        }
      })

      // only allow first lock pick
      let lockFound = false
      const filtered = [...thu, ...mon, ...best].map(pick => {
        if (pick.is_lock && !lockFound) {
          lockFound = true
          return pick
        }
        return { ...pick, is_lock: false }
      })

      // warn if we dropped any extras
      if (filtered.length < valid.length) {
        setWarning('⚠️ Showing max of 1 Thursday, 1 Monday & 3 Best-Choice picks.')
      }

      setPicks(filtered)
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>My Profile & Picks</h2>
      <p>
        Logged in as <strong>{username}</strong> |{' '}
        <Link href="/"><a>Home</a></Link>
      </p>

      <div style={{ margin: '16px 0' }}>
        <label>
          Week:&nbsp;
          <select
            value={selectedWeek}
            onChange={e => setSelectedWeek(parseInt(e.target.value, 10))}
            style={{ width: 60 }}
          >
            {Array.from({ length: 18 }, (_, i) => i + 1).map(wk => (
              <option key={wk} value={wk}>{wk}</option>
            ))}
          </select>
        </label>
        {/* ← REPLACED THE INVALID BUTTON */}
        <button
          onClick={loadPicks}
          disabled={loading}
          style={{ marginLeft: 12 }}
        >
          {loading ? 'Loading…' : `Load Week ${selectedWeek} Picks`}
        </button>
      </div>

      {error && <p style={{ color:'red' }}>Error: {error}</p>}
      {warning && <p style={{ color:'#a67c00' }}>{warning}</p>}

      {picks.length > 0 ? (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={{ border:'1px solid #ccc', padding:8 }}>Game</th>
              <th style={{ border:'1px solid #ccc', padding:8 }}>Spread</th>
              <th style={{ border:'1px solid #ccc', padding:8 }}>Your Pick</th>
              <th style={{ border:'1px solid #ccc', padding:8 }}>Lock?</th>
            </tr>
          </thead>
          <tbody>
            {picks.map(pick => {
              const g = pick.games
              return (
                <tr key={pick.id}>
                  <td style={{ border:'1px solid #ccc', padding:8 }}>
                    {g.away_team} @ {g.home_team}
                    <br/>
                    <small>
                      {new Date(g.kickoff_time).toLocaleString(undefined, {
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </small>
                  </td>
                  <td style={{ border:'1px solid #ccc', padding:8 }}>
                    {g.spread > 0 ? `+${g.spread}` : g.spread}
                  </td>
                  <td style={{ border:'1px solid #ccc', padding:8 }}>
                    {pick.selected_team}
                  </td>
                  <td style={{ border:'1px solid #ccc', padding:8, textAlign:'center' }}>
                    {pick.is_lock ? '✅' : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        !loading && <p>No picks found for Week {selectedWeek}.</p>
      )}
    </div>
  )
}
