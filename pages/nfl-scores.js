// pages/nfl-scores.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'

export default function NFLScores() {
  const [week, setWeek] = useState(1)

  // Scores (results table)
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(false)

  // Spreads (games table)
  const [games, setGames] = useState([])
  const [gamesLoading, setGamesLoading] = useState(false)

  // Load final scores for the selected week
  useEffect(() => {
    setLoading(true)
    supabase
      .from('results')
      .select('*')
      .eq('week', week)
      .order('id', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          alert('Error loading scores: ' + error.message)
        } else {
          setScores(data || [])
        }
        setLoading(false)
      })
  }, [week])

  // Load scheduled games & spreads for the selected week
  useEffect(() => {
    setGamesLoading(true)
    supabase
      .from('games')
      .select('id, away_team, home_team, spread, kickoff_time')
      .eq('week', week)
      .order('kickoff_time', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          alert('Error loading spreads: ' + error.message)
        } else {
          setGames(data || [])
        }
        setGamesLoading(false)
      })
  }, [week])

  return (
    <div style={{ padding: 20 }}>
      <h1>NFL Scores (Week {week})</h1>
      <p>
        <Link href="/">
          <a>← Home</a>
        </Link>
      </p>

      <div style={{ margin: '16px 0' }}>
        <label>
          Week:&nbsp;
          <select
            value={week}
            onChange={e => setWeek(parseInt(e.target.value, 10))}
            style={{ width: 60 }}
          >
            {Array.from({ length: 18 }, (_, i) => i + 1).map(wk => (
              <option key={wk} value={wk}>
                {wk}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Final Scores */}
      {loading ? (
        <p>Loading…</p>
      ) : scores.length ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Away</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Home</th>
              <th style={{ border: '1px solid #ccc', padding: 8 }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {scores.map(r => (
              <tr key={r.id}>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{r.away_team}</td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>{r.home_team}</td>
                <td style={{ border: '1px solid #ccc', padding: 8 }}>
                  {r.away_score} – {r.home_score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No scores loaded for Week {week}.</p>
      )}

      {/* Spreads (always visible) */}
      <section style={{ marginTop: 40 }}>
        <h2>This Week’s Spreads</h2>
        {gamesLoading ? (
          <p>Loading spreads…</p>
        ) : games.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Away</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Home</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Spread</th>
                <th style={{ border: '1px solid #ccc', padding: 8 }}>Kickoff</th>
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
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>
                    {g.kickoff_time
                      ? new Date(g.kickoff_time).toLocaleString(undefined, {
                          weekday: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No scheduled games found for Week {week}.</p>
        )}
      </section>
    </div>
  )
}
