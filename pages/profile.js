// pages/profile.js

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Profile() {
  const { user } = useAuth()

  const [username, setUsername] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(1)

  const [picks, setPicks] = useState([])
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState('')

  const getDow = (iso) => {
    try {
      // iso is stored as UTC
      const d = new Date(iso)
      return d.getUTCDay() // 0 Sun, 1 Mon, ... 4 Thu
    } catch {
      return null
    }
  }

  const loadPicks = async () => {
    setLoading(true)
    setWarning('')

    if (!user) {
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('picks')
        .select(`
          id,
          week,
          user_id,
          game_id,
          pick_team,
          pick_type,
          created_at,
          games:games!picks_game_id_fkey (
            home_team,
            away_team,
            kickoff_time,
            spread
          )
        `)
        .eq('user_id', user.id)
        .eq('week', selectedWeek)
        .order('created_at', { ascending: true })

      if (error) throw error

      const valid = (data || []).filter(p => p.games)

      const thu = [], mon = [], best = []

      // Week 18: no Thu/Mon games, allow up to 5 'Best' picks
      const isWeek18 = (selectedWeek === 18)
      const maxBest = isWeek18 ? 5 : 3

      // bucket into Thursday, Monday, Best
      valid.forEach(pick => {
        const dow = getDow(pick.games.kickoff_time)
        if (!isWeek18 && dow === 4 && thu.length < 1) {
          thu.push(pick)
        } else if (!isWeek18 && dow === 1 && mon.length < 1) {
          mon.push(pick)
        } else {
          if (best.length < maxBest) best.push(pick)
        }
      })

      // only allow first lock pick
      const locks = valid.filter(p => p.pick_type === 'lock')
      const firstLock = locks.length ? locks[0] : null

      // rebuild filtered list
      let filtered = []
      if (thu.length) filtered = filtered.concat(thu)
      if (mon.length) filtered = filtered.concat(mon)
      if (best.length) filtered = filtered.concat(best)

      // ensure lock is included (but don't duplicate)
      if (firstLock && !filtered.some(p => p.id === firstLock.id)) {
        filtered.push(firstLock)
      }

      // warn if we dropped any extras
      if (filtered.length < valid.length) {
        setWarning(isWeek18 ? '⚠️ Showing max of 5 Best-Choice picks for Week 18.' : '⚠️ Showing max of 1 Thursday, 1 Monday & 3 Best-Choice picks.')
      }

      setPicks(filtered)
    } catch (e) {
      console.error('loadPicks error', e)
      setPicks([])
      setWarning(e.message || 'Error loading picks.')
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>My Profile & Picks</h2>
      <p>
        Logged in as <strong>{username}</strong> |{' '}
        <Link href="/">Home</Link> | <Link href="/dashboard">Dashboard</Link>
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Week:{' '}
          <select
            value={selectedWeek}
            onChange={e => setSelectedWeek(parseInt(e.target.value, 10))}
          >
            {Array.from({ length: 18 }, (_, i) => i + 1).map(wk => (
              <option key={wk} value={wk}>{wk}</option>
            ))}
          </select>
        </label>

        <button onClick={loadPicks} disabled={loading}>
          {loading ? 'Loading...' : 'Load Picks'}
        </button>
      </div>

      {warning && <p style={{ color: 'darkorange' }}>{warning}</p>}

      <div style={{ marginTop: 16 }}>
        <h3>My Picks (Week {selectedWeek})</h3>
        {(!picks || picks.length === 0) ? (
          <p>No picks found.</p>
        ) : (
          <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th>Kickoff (UTC)</th>
                <th>Away</th>
                <th>Home</th>
                <th>Spread</th>
                <th>Pick</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {picks.map(p => (
                <tr key={p.id}>
                  <td>{p.games?.kickoff_time || ''}</td>
                  <td>{p.games?.away_team || ''}</td>
                  <td>{p.games?.home_team || ''}</td>
                  <td>{p.games?.spread ?? ''}</td>
                  <td>{p.pick_team || ''}</td>
                  <td>{p.pick_type || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
