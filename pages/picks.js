// pages/picks.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function PickSubmission() {
  const { session, profile } = useAuth()
  const username = profile?.username || session?.user?.email

  const [selectedWeek, setSelectedWeek] = useState(1)
  const [games, setGames]               = useState([])
  const [picks, setPicks]               = useState({})
  const [lockPick, setLockPick]         = useState(null)
  const [status, setStatus]             = useState(null)

  // Load games once user is signed‑in
  useEffect(() => {
    if (!session) return
    const loadGames = async () => {
      setStatus(null)
      setPicks({})
      setLockPick(null)
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('week', selectedWeek)
        .gt('kickoff_time', now)
        .order('kickoff_time', { ascending: true })

      if (error) setStatus(`🚫 ${error.message}`)
      else setGames(data || [])
    }
    loadGames()
  }, [selectedWeek, session])

  if (!session) {
    return (
      <div style={{ padding: 20 }}>
        <p>
          <Link href="/join‑league"><a>Please join the league to submit picks →</a></Link>
        </p>
      </div>
    )
  }

  // Helpers — use local getDay() so Thu/Mon buckets match user TZ
  const countCats  = map => {
    let th = 0, mo = 0, be = 0
    Object.keys(map).forEach(id => {
      const g = games.find(x => x.id === id)
      if (!g) return
      const day = new Date(g.kickoff_time).getDay()
      if (day === 4)       th++
      else if (day === 1)  mo++
      else                 be++
    })
    console.log('counts →', { th, mo, be })
    return { th, mo, be }
  }

  // ← UPDATED handlePick to special-case WEEK 18
  const handlePick = (gid, team) => {
    setStatus(null)
    const copy = { ...picks }

    // un‑select same pick
    if (copy[gid] === team) {
      delete copy[gid]
      setPicks(copy)
      return
    }

    // max 5 total always
    if (Object.keys(copy).length >= 5) {
      setStatus('🚫 You can only pick up to 5 games total.')
      return
    }

    // tentatively add and count
    copy[gid] = team
    const { th, mo, be } = countCats(copy)

    if (selectedWeek === 18) {
      // Week 18: only "best" picks allowed, up to 5
      if (th > 0 || mo > 0) {
        delete copy[gid]
        setStatus('🚫 Week 18 only “Best” picks allowed.')
        return
      }
      if (be > 5) {
        delete copy[gid]
        setStatus('🚫 Only 5 picks allowed in Week 18.')
        return
      }
    } else {
      // Regular weeks: 1 Thu, 1 Mon, 3 Best
      if (th > 1) {
        delete copy[gid]
        setStatus('🚫 Only 1 Thursday pick allowed.')
        return
      }
      if (mo > 1) {
        delete copy[gid]
        setStatus('🚫 Only 1 Monday pick allowed.')
        return
      }
      if (be > 3) {
        delete copy[gid]
        setStatus('🚫 Only 3 “Best Choice” picks allowed.')
        return
      }
    }

    setPicks(copy)
  }

  const handleLock = gid => {
    setLockPick(lockPick === gid ? null : gid)
  }

  const savePicks = async () => {
    const entries = Object.entries(picks)
    const inserts = entries.map(([gid, team]) => ({
      user_email:    session.user.email,
      game_id:       gid,
      selected_team: team,
      is_lock:       gid === lockPick
    }))
    const { error } = await supabase.from('picks').insert(inserts)
    if (error) {
      setStatus(`🚫 ${error.message}`)
      return
    }
    const submittedIds = entries.map(([gid]) => gid)
    setGames(prev => prev.filter(g => !submittedIds.includes(g.id)))
    setPicks({})
    setLockPick(null)
    setStatus('✅ Picks submitted—those games are now hidden.')
  }

  const submitPicks = () => {
    setStatus(null)
    if (!Object.keys(picks).length) {
      return setStatus('🚫 Please select at least one game.')
    }
    savePicks()
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Submit Your Picks</h2>
      <p>
        Logged in as <strong>{username}</strong> |{' '}
        <Link href="/"><a>Home</a></Link>
      </p>

      {status && (
        <pre style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>
          {status}
        </pre>
      )}

      <div style={{ marginBottom: 16 }}>
        <label>
          Week:&nbsp;
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
      </div>

      {games.length === 0 ? (
        <p>No upcoming games for Week {selectedWeek}.</p>
      ) : (
        games.map(g => (
          <div key={g.id} style={{ marginBottom: 12 }}>
            <strong>
              {g.away_team} @ {g.home_team}{' '}
              ({g.spread > 0 ? `+${g.spread}` : g.spread}) —{' '}
              {new Date(g.kickoff_time).toLocaleString(undefined,{
                weekday:'short',hour:'2-digit',minute:'2-digit'
              })}
            </strong>
            <br/>
            <label>
              <input
                type="radio"
                name={`pick-${g.id}`}
                checked={picks[g.id]===g.home_team}
                onClick={()=>handlePick(g.id,g.home_team)}
              />{' '}
              {g.home_team}
            </label>
            <label style={{ marginLeft:12 }}>
              <input
                type="radio"
                name={`pick-${g.id}`}
                checked={picks[g.id]===g.away_team}
                onClick={()=>handlePick(g.id,g.away_team)}
              />{' '}
              {g.away_team}
            </label>
            <label style={{ marginLeft:12 }}>
              <input
                type="checkbox"
                checked={lockPick===g.id}
                onChange={()=>handleLock(g.id)}
              />{' '}
              Lock
            </label>
          </div>
        ))
      )}

      <button onClick={submitPicks}>Submit Picks</button>
    </div>
  )
}
