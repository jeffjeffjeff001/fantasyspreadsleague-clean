// pages/api/verify-league-password.js

import crypto from 'crypto'

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])

    return res.status(405).json({
      ok: false,
      error: 'Method not allowed.',
    })
  }

  const submittedPassword =
    typeof req.body?.leaguePassword === 'string'
      ? req.body.leaguePassword
      : ''

  const correctPassword =
    process.env.LEAGUE_PASSWORD || ''

  if (!correctPassword) {
    console.error(
      'LEAGUE_PASSWORD is not configured in Vercel.'
    )

    return res.status(500).json({
      ok: false,
      error:
        'League access is temporarily unavailable. Please contact the commissioner.',
    })
  }

  const submittedBuffer = Buffer.from(
    submittedPassword,
    'utf8'
  )

  const correctBuffer = Buffer.from(
    correctPassword,
    'utf8'
  )

  const passwordsMatch =
    submittedBuffer.length === correctBuffer.length &&
    crypto.timingSafeEqual(
      submittedBuffer,
      correctBuffer
    )

  if (!passwordsMatch) {
    return res.status(401).json({
      ok: false,
      error: 'Incorrect league password.',
    })
  }

  return res.status(200).json({
    ok: true,
  })
}
