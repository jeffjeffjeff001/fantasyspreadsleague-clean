// pages/api/weekly-scores.js

import { createClient } from '@supabase/supabase-js'

// ————————————————————————————————————————————————————————————————
// Initialize an ADMIN Supabase client using your service‐role key
// ————————————————————————————————————————————————————————————————
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: null }
)

export default async function handler(req, res) {
  // 1) parse & validate week
  const week = parseInt(req.query.week, 10)
  if (isNaN(week)) {
    return res.status(400).json({ error: 'Invalid week parameter' })
  }

  // 2) load that week’s final scores
  const { data: results = [], error: resultsError } = await supabaseAdmin
    .from('results')
    .select('away_team,home_team,away_score,home_score,week')
    .eq('week', week)

  if (resultsError) {
    return res.status(500).json({ error: resultsError.message })
  }
  if (results.length === 0) {
    return res.status(404).json({ error: `No results for week ${week}` })
  }

  // 3) load all picks joined with their games for the same week
  const { data: picks = [], error: picksError } = await supabaseAdmin
    .from('picks')
    .select(`
      user_email,
      selected_team,
      is_lock,
      games (
        id,
        away_team,
        home_team,
        spread,
        kickoff_time,
        week
      )
    `)
    .eq('games.week', week)

  if (picksError) {
    return res.status(500).json({ error: picksError.message })
  }

  // 4) bucket & filter each user’s picks into 1 Thur, 1 Mon, 3 Best
  const buckets = {}
  picks.forEach(pick => {
    if (!pick.games) return
    const email = pick.user_email
    if (!buckets[email]) buckets[email] = { thu: [], mon: [], best: [] }

    const dow  = new Date(pick.games.kickoff_time).getDay()
    const slot = dow === 4 ? 'thu' : dow === 1 ? 'mon' : 'best'
    const max  = slot === 'best' ? 3 : 1

    if (buckets[email][slot].length < max) {
      buckets[email][slot].push(pick)
    }
  })

  // 5) flatten back into exactly five picks per user
  const filteredPicks = []
  Object.values(buckets).forEach(({ thu, best, mon }) => {
    filteredPicks.push(...thu, ...best, ...mon)
  })

  // 6) initialize stats only for those filteredPicks
  const statsByUser = {}
  filteredPicks.forEach(pick => {
    if (!statsByUser[pick.user_email]) {
      statsByUser[pick.user_email] = {
        correct:       0,
        lockCorrect:   0,
        lockIncorrect: 0,
        perfectBonus:  0
      }
    }
  })

  // 7) score each of the filteredPicks, treating a push (home+spread === away) as correct for either team
  for (const pick of filteredPicks) {
    const g = pick.games
    const pickAway = g.away_team.trim()
    const pickHome = g.home_team.trim()

    const result = results.find(r =>
      r.home_team.trim() === pickHome &&
      r.away_team.trim() === pickAway
    )
    if (!result) continue

    const spread = parseFloat(g.spread)
    const homeAdj = result.home_score + spread
    const u = statsByUser[pick.user_email]
    const selected = pick.selected_team.trim()

    if (homeAdj > result.away_score) {
      // home truly covers
      if (selected === pickHome) {
        u.correct += 1
        if (pick.is_lock) u.lockCorrect += 1
      } else if (pick.is_lock) {
        u.lockIncorrect += 1
      }

    } else if (homeAdj < result.away_score) {
      // away covers
      if (selected === pickAway) {
        u.correct += 1
        if (pick.is_lock) u.lockCorrect += 1
      } else if (pick.is_lock) {
        u.lockIncorrect += 1
      }

    } else {
      // push: both home & away get credit
      if (selected === pickHome || selected === pickAway) {
        u.correct += 1
        if (pick.is_lock) u.lockCorrect += 1
      }
      // no penalty on a lock that pushes
    }
  }

  // 8) perfect‐week bonus (5/5 → +3)
  Object.values(statsByUser).forEach(u => {
    if (u.correct === 5) u.perfectBonus = 3
  })

  // 9) build final JSON array and return
  const response = Object.entries(statsByUser).map(([email, u]) => {
    const weeklyPoints =
      u.correct +             // +1 per correct pick
      u.lockCorrect * 2 +     // +2 extra for each correct lock
      u.lockIncorrect * -2 +  // -2 for each wrong lock
      u.perfectBonus          // +3 bonus if perfect week

    return {
      email,
      correct:       u.correct,
      lockCorrect:   u.lockCorrect,
      lockIncorrect: u.lockIncorrect,
      perfectBonus:  u.perfectBonus,
      weeklyPoints
    }
  })

  return res.status(200).json(response)
}
