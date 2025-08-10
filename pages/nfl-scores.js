// pages/nfl-scores.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'

export default function NFLScores() {
  const [week, setWeek] = useState(1)
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(false)

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
          setScores(data)
        }
        setLoading(false)
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
    </div>
  )
}
