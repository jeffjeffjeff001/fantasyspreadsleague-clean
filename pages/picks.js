// pages/picks.js

import { useState, useEffect } from 'react'
import Link from '../components/LegacyLink'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchCurrentWeek } from '../lib/currentWeek'

export default function PickSubmission() {
  const { session, profile } = useAuth()

  const username =
    profile?.username ||
    session?.user?.email

  const [
    selectedWeek,
    setSelectedWeek,
  ] = useState(1)

  const [
    weekReady,
    setWeekReady,
  ] = useState(false)

  const [
    allWeekGames,
    setAllWeekGames,
  ] = useState([])

  const [
    games,
    setGames,
  ] = useState([])

  const [
    existingPicks,
    setExistingPicks,
  ] = useState([])

  const [
    picks,
    setPicks,
  ] = useState({})

  const [
    lockPick,
    setLockPick,
  ] = useState(null)

  const [
    status,
    setStatus,
  ] = useState(null)

  const [
    loadingGames,
    setLoadingGames,
  ] = useState(false)

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  // ================================================================
  // CURRENT WEEK
  //
  // The week advances only after Tuesday at 10:00 PM Eastern.
  // ================================================================

  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function initializeWeek() {
      try {
        const currentWeek =
          await fetchCurrentWeek(
            supabase
          )

        if (!cancelled) {
          setSelectedWeek(
            currentWeek
          )
        }
      } catch (error) {
        console.error(
          'Unable to determine current week:',
          error
        )

        if (!cancelled) {
          setStatus(
            '⚠️ The current week could not be determined automatically. Week 1 has been selected.'
          )
        }
      } finally {
        if (!cancelled) {
          setWeekReady(
            true
          )
        }
      }
    }

    initializeWeek()

    return () => {
      cancelled = true
    }
  }, [session])

  // ================================================================
  // LOAD WEEK GAMES + EXISTING PICKS
  //
  // Games already picked by this user and games whose kickoff has
  // passed are removed from the available selection list.
  // ================================================================

  useEffect(() => {
    if (
      !session ||
      !weekReady
    ) {
      return
    }

    let cancelled = false

    async function loadWeekData() {
      setLoadingGames(true)
      setStatus(null)
      setPicks({})
      setLockPick(null)

      const {
        data:
          weekGames,

        error:
          gamesError,
      } = await supabase
        .from('games')
        .select('*')
        .eq(
          'week',
          selectedWeek
        )
        .order(
          'kickoff_time',
          {
            ascending:
              true,
          }
        )

      if (cancelled) return

      if (gamesError) {
        setStatus(
          `🚫 ${gamesError.message}`
        )

        setAllWeekGames([])
        setGames([])
        setExistingPicks([])
        setLoadingGames(false)

        return
      }

      const loadedGames =
        weekGames || []

      const gameIds =
        loadedGames.map(
          game =>
            game.id
        )

      let storedPicks = []

      if (
        gameIds.length >
        0
      ) {
        const {
          data,

          error:
            picksError,
        } = await supabase
          .from('picks')
          .select(
            'id,user_email,game_id,selected_team,is_lock,submitted_at'
          )
          .eq(
            'user_email',
            session.user.email
          )
          .in(
            'game_id',
            gameIds
          )

        if (cancelled) return

        if (picksError) {
          setStatus(
            `🚫 ${picksError.message}`
          )

          setAllWeekGames(
            loadedGames
          )

          setGames([])
          setExistingPicks([])
          setLoadingGames(false)

          return
        }

        storedPicks =
          data || []
      }

      // Keep the same small grace period
      // used by the previous submit page.
      const GRACE_MS =
        60 * 1000

      const cutoffMs =
        Date.now() -
        GRACE_MS

      const submittedGameIds =
        new Set(
          storedPicks.map(
            pick =>
              String(
                pick.game_id
              )
          )
        )

      const availableGames =
        loadedGames.filter(
          game => {
            const kickoffMs =
              new Date(
                game.kickoff_time
              ).getTime()

            return (
              kickoffMs >=
                cutoffMs &&
              !submittedGameIds.has(
                String(
                  game.id
                )
              )
            )
          }
        )

      setAllWeekGames(
        loadedGames
      )

      setExistingPicks(
        storedPicks
      )

      setGames(
        availableGames
      )

      setLoadingGames(
        false
      )
    }

    loadWeekData()

    return () => {
      cancelled = true
    }
  }, [
    selectedWeek,
    session,
    weekReady,
  ])

  // ================================================================
  // AUTH CHECK
  // ================================================================

  if (!session) {
    return (
      <div
        style={{
          padding: 20,
        }}
      >
        <p>
          <Link href="/join-league">
            <a>
              Please join the league to submit picks →
            </a>
          </Link>
        </p>
      </div>
    )
  }

  // ================================================================
  // GAME / CATEGORY HELPERS
  // ================================================================

  const findGameById =
    id =>
      allWeekGames.find(
        game =>
          String(
            game.id
          ) ===
          String(id)
      )

  const countCategoriesByGameIds =
    gameIds => {
      // Week 18 = any five picks.
      if (
        selectedWeek ===
        18
      ) {
        return {
          th: 0,
          mo: 0,
          be:
            gameIds.length,
        }
      }

      let th = 0
      let mo = 0
      let be = 0

      gameIds.forEach(
        id => {
          const game =
            findGameById(
              id
            )

          if (!game) return

          const day =
            new Date(
              game.kickoff_time
            ).getDay()

          // Thursday
          if (day === 4) {
            th += 1

          // Monday
          } else if (
            day === 1
          ) {
            mo += 1

          // All other days =
          // Best Choice.
          } else {
            be += 1
          }
        }
      )

      return {
        th,
        mo,
        be,
      }
    }

  const getCombinedGameIds = (
    pendingPicks =
      picks,

    storedPicks =
      existingPicks
  ) => [
    ...storedPicks.map(
      pick =>
        String(
          pick.game_id
        )
    ),

    ...Object.keys(
      pendingPicks
    ).map(String),
  ]

  const countCombinedCategories = (
    pendingPicks =
      picks,

    storedPicks =
      existingPicks
  ) =>
    countCategoriesByGameIds(
      getCombinedGameIds(
        pendingPicks,
        storedPicks
      )
    )

  const getExistingLockCount = (
    storedPicks =
      existingPicks
  ) =>
    storedPicks.filter(
      pick =>
        Boolean(
          pick.is_lock
        )
    ).length

  // ================================================================
  // VALIDATION
  //
  // IMPORTANT 2026 UPDATE:
  //
  // Users may submit picks incrementally.
  //
  // Example:
  // Thursday = submit 1
  // Sunday   = submit 3
  // Monday   = submit final 1
  //
  // Partial cards are allowed as long as they do not violate the
  // maximum category limits.
  //
  // Once the card reaches 5 picks, ALL final weekly rules must be met.
  // ================================================================

  const validateCombinedPicks = (
    pendingPicks,
    storedPicks,
    pendingLockPick =
      lockPick
  ) => {
    const pendingCount =
      Object.keys(
        pendingPicks
      ).length

    const storedCount =
      storedPicks.length

    const combinedCount =
      storedCount +
      pendingCount

    // --------------------------------------------------------------
    // Never allow more than five total picks.
    // --------------------------------------------------------------

    if (
      combinedCount >
      5
    ) {
      return '🚫 You can only have 5 picks stored for a week.'
    }

    const {
      th,
      mo,
      be,
    } =
      countCombinedCategories(
        pendingPicks,
        storedPicks
      )

    // --------------------------------------------------------------
    // Category maximums apply EVEN on partial submissions.
    //
    // This prevents a player from submitting a partial card that
    // could never become a legal final card.
    // --------------------------------------------------------------

    if (
      selectedWeek ===
      18
    ) {
      if (be > 5) {
        return '🚫 Only 5 picks are allowed in Week 18.'
      }
    } else {
      if (th > 1) {
        return '🚫 Only 1 Thursday pick is allowed.'
      }

      if (mo > 1) {
        return '🚫 Only 1 Monday pick is allowed.'
      }

      if (be > 3) {
        return '🚫 Only 3 “Best Choice” picks are allowed.'
      }
    }

    // --------------------------------------------------------------
    // LOCK VALIDATION
    //
    // A partial submission does NOT have to contain a lock.
    //
    // But users may never have more than one lock stored/pending.
    // --------------------------------------------------------------

    const existingLockCount =
      getExistingLockCount(
        storedPicks
      )

    const pendingLockCount =
      pendingLockPick != null &&
      Object.prototype.hasOwnProperty.call(
        pendingPicks,
        pendingLockPick
      )
        ? 1
        : 0

    const totalLocks =
      existingLockCount +
      pendingLockCount

    if (
      totalLocks >
      1
    ) {
      return '🚫 Only one lock pick is allowed each week.'
    }

    // --------------------------------------------------------------
    // PARTIAL CARD
    //
    // If the user has fewer than five total picks, this submission
    // is allowed at this point.
    // --------------------------------------------------------------

    if (
      combinedCount <
      5
    ) {
      return null
    }

    // --------------------------------------------------------------
    // COMPLETE FIVE-PICK CARD
    //
    // Once the card reaches five, enforce ALL final rules.
    // --------------------------------------------------------------

    if (
      selectedWeek ===
      18
    ) {
      if (
        be !== 5
      ) {
        return '🚫 Week 18 requires exactly 5 picks.'
      }
    } else if (
      th !== 1 ||
      mo !== 1 ||
      be !== 3
    ) {
      return (
        '🚫 Your completed five-pick card must include exactly ' +
        '1 Thursday pick, 3 Best Choice picks, and 1 Monday pick.'
      )
    }

    // A completed card MUST contain exactly one lock.
    if (
      totalLocks !== 1
    ) {
      return '🚫 Your completed five-pick card must contain exactly one lock pick.'
    }

    return null
  }

  // ================================================================
  // SELECT PICK
  // ================================================================

  const handlePick = (
    gid,
    team
  ) => {
    setStatus(null)

    const copy = {
      ...picks,
    }

    // Clicking the same selected team
    // again removes the selection.
    if (
      copy[gid] ===
      team
    ) {
      delete copy[gid]

      if (
        String(
          lockPick
        ) ===
        String(gid)
      ) {
        setLockPick(
          null
        )
      }

      setPicks(copy)

      return
    }

    const alreadySelectedThisGame =
      Object.prototype.hasOwnProperty.call(
        copy,
        gid
      )

    const remainingSlots =
      Math.max(
        0,

        5 -
          existingPicks.length
      )

    if (
      !alreadySelectedThisGame &&
      Object.keys(
        copy
      ).length >=
        remainingSlots
    ) {
      setStatus(
        '🚫 You already have the maximum of 5 picks stored for this week.'
      )

      return
    }

    copy[gid] =
      team

    const {
      th,
      mo,
      be,
    } =
      countCombinedCategories(
        copy,
        existingPicks
      )

    // --------------------------------------------------------------
    // Prevent category overages while the user is selecting.
    // --------------------------------------------------------------

    if (
      selectedWeek !==
      18
    ) {
      if (
        th > 1
      ) {
        delete copy[gid]

        setStatus(
          '🚫 Only 1 Thursday pick is allowed.'
        )

        return
      }

      if (
        mo > 1
      ) {
        delete copy[gid]

        setStatus(
          '🚫 Only 1 Monday pick is allowed.'
        )

        return
      }

      if (
        be > 3
      ) {
        delete copy[gid]

        setStatus(
          '🚫 Only 3 “Best Choice” picks are allowed.'
        )

        return
      }
    } else if (
      be > 5
    ) {
      delete copy[gid]

      setStatus(
        '🚫 Only 5 picks are allowed in Week 18.'
      )

      return
    }

    setPicks(copy)
  }

  // ================================================================
  // SELECT LOCK
  // ================================================================

  const handleLock =
    gid => {
      if (
        !picks[gid]
      ) {
        setStatus(
          '🚫 Select a team from this game before marking it as your lock.'
        )

        return
      }

      if (
        getExistingLockCount() >
        0
      ) {
        setStatus(
          '🚫 You already have a lock pick submitted for this week. Delete that lock pick from My Profile before choosing a new one.'
        )

        return
      }

      setStatus(null)

      setLockPick(
        String(
          lockPick
        ) ===
          String(gid)
          ? null
          : gid
      )
    }

  // ================================================================
  // FRESH DATABASE CHECK BEFORE SUBMISSION
  // ================================================================

  async function fetchFreshExistingPicks() {
    const gameIds =
      allWeekGames.map(
        game =>
          game.id
      )

    if (
      gameIds.length ===
      0
    ) {
      return {
        data: [],
        error: null,
      }
    }

    return supabase
      .from('picks')
      .select(
        'id,user_email,game_id,selected_team,is_lock,submitted_at'
      )
      .eq(
        'user_email',
        session.user.email
      )
      .in(
        'game_id',
        gameIds
      )
  }

  // ================================================================
  // SAVE PICKS
  // ================================================================

  const savePicks =
    async () => {
      setSubmitting(
        true
      )

      try {
        const entries =
          Object.entries(
            picks
          )

        // ------------------------------------------------------------
        // Re-check Supabase immediately before insert.
        //
        // Protects against stale browser tabs and repeat submissions.
        // ------------------------------------------------------------

        const {
          data:
            freshExistingPicks,

          error:
            existingError,
        } =
          await fetchFreshExistingPicks()

        if (
          existingError
        ) {
          setStatus(
            `🚫 ${existingError.message}`
          )

          return
        }

        const freshStoredPicks =
          freshExistingPicks ||
          []

        const freshGameIds =
          new Set(
            freshStoredPicks.map(
              pick =>
                String(
                  pick.game_id
                )
            )
          )

        // ------------------------------------------------------------
        // DUPLICATE PROTECTION
        // ------------------------------------------------------------

        const hasDuplicate =
          entries.some(
            ([gid]) =>
              freshGameIds.has(
                String(
                  gid
                )
              )
          )

        if (
          hasDuplicate
        ) {
          setStatus(
            '🚫 Duplicate pick submitted, please try again.'
          )

          return
        }

        // ------------------------------------------------------------
        // MAXIMUM 5 PICKS
        // ------------------------------------------------------------

        if (
          freshStoredPicks.length +
            entries.length >
          5
        ) {
          setStatus(
            '🚫 You already have 5 picks stored for this week. Delete an existing pick from My Profile before submitting another.'
          )

          return
        }

        // ------------------------------------------------------------
        // KICKOFF PROTECTION
        // ------------------------------------------------------------

        const startedGame =
          entries.find(
            ([gid]) => {
              const game =
                findGameById(
                  gid
                )

              return (
                !game ||
                new Date(
                  game.kickoff_time
                ).getTime() <=
                  Date.now()
              )
            }
          )

        if (
          startedGame
        ) {
          setStatus(
            '🚫 One of the selected games has already started. Refresh the page and try again.'
          )

          return
        }

        // ------------------------------------------------------------
        // PARTIAL / COMPLETE CARD VALIDATION
        // ------------------------------------------------------------

        const validationError =
          validateCombinedPicks(
            picks,
            freshStoredPicks,
            lockPick
          )

        if (
          validationError
        ) {
          setStatus(
            validationError
          )

          setExistingPicks(
            freshStoredPicks
          )

          return
        }

        // ------------------------------------------------------------
        // INSERT
        // ------------------------------------------------------------

        const inserts =
          entries.map(
            (
              [
                gid,
                team,
              ]
            ) => ({
              user_email:
                session.user.email,

              game_id:
                gid,

              selected_team:
                team,

              is_lock:
                String(
                  gid
                ) ===
                String(
                  lockPick
                ),
            })
          )

        const {
          data:
            insertedPicks,

          error,
        } =
          await supabase
            .from('picks')
            .insert(
              inserts
            )
            .select(
              'id,user_email,game_id,selected_team,is_lock,submitted_at'
            )

        if (error) {
          const errorMessage =
            String(
              error.message ||
                ''
            ).toUpperCase()

          if (
            errorMessage.includes(
              'LOCK_ALREADY_EXISTS'
            )
          ) {
            setStatus(
              '🚫 You already have a lock pick submitted for this week. Only one lock pick is allowed.'
            )
          } else if (
            error.code ===
              '23505' ||
            errorMessage.includes(
              'DUPLICATE_PICK'
            ) ||
            errorMessage.includes(
              'DUPLICATE KEY'
            )
          ) {
            setStatus(
              '🚫 Duplicate pick submitted, please try again.'
            )
          } else if (
            errorMessage.includes(
              'MAX_WEEKLY_PICKS'
            )
          ) {
            setStatus(
              '🚫 You already have 5 picks stored for this week. Delete an existing pick from My Profile before submitting another.'
            )
          } else {
            setStatus(
              `🚫 ${error.message}`
            )
          }

          return
        }

        // ------------------------------------------------------------
        // UPDATE LOCAL PAGE STATE
        // ------------------------------------------------------------

        const submittedIds =
          entries.map(
            ([gid]) =>
              String(
                gid
              )
          )

        setGames(
          previousGames =>
            previousGames.filter(
              game =>
                !submittedIds.includes(
                  String(
                    game.id
                  )
                )
            )
        )

        setExistingPicks([
          ...freshStoredPicks,
          ...(
            insertedPicks ||
            []
          ),
        ])

        setPicks({})
        setLockPick(null)

        setStatus(
          '✅ Success! Your picks were submitted.'
        )
      } finally {
        setSubmitting(
          false
        )
      }
    }

  // ================================================================
  // SUBMIT BUTTON
  // ================================================================

  const submitPicks =
    () => {
      if (
        submitting
      ) {
        return
      }

      setStatus(null)

      const pendingCount =
        Object.keys(
          picks
        ).length

      if (
        pendingCount ===
        0
      ) {
        if (
          existingPicks.length >=
          5
        ) {
          setStatus(
            '🚫 You already have 5 picks stored for this week.'
          )
        } else {
          setStatus(
            '🚫 Please select at least one game.'
          )
        }

        return
      }

      const validationError =
        validateCombinedPicks(
          picks,
          existingPicks,
          lockPick
        )

      if (
        validationError
      ) {
        setStatus(
          validationError
        )

        return
      }

      savePicks()
    }

  // ================================================================
  // UI HELPERS
  // ================================================================

  const isSuccess =
    typeof status ===
      'string' &&
    status.startsWith(
      '✅'
    )

  const isWarning =
    typeof status ===
      'string' &&
    status.startsWith(
      '⚠️'
    )

  const submittedCount =
    existingPicks.length

  const remainingSlots =
    Math.max(
      0,

      5 -
        submittedCount
    )

  const hasExistingLock =
    getExistingLockCount() >
    0

  // ================================================================
  // RENDER
  // ================================================================

  return (
    <div
      style={{
        padding: 20,
      }}
    >
      <h2>
        Submit Your Picks
      </h2>

      <p>
        Logged in as{' '}

        <strong>
          {username}
        </strong>{' '}

        |{' '}

        <Link href="/">
          <a>
            Home
          </a>
        </Link>
      </p>

      {/* ========================================================= */}
      {/* STATUS MESSAGE */}
      {/* ========================================================= */}

      {status && (
        <div
          className={
            isSuccess
              ? 'submission-message success-message'
              : isWarning
                ? 'submission-message warning-message'
                : 'submission-message error-message'
          }
          role="status"
          aria-live="polite"
        >
          {status}
        </div>
      )}

      {/* ========================================================= */}
      {/* WEEK SELECTOR */}
      {/* ========================================================= */}

      <div
        style={{
          marginBottom: 16,
        }}
      >
        <label>
          Week:&nbsp;

          <select
            value={
              selectedWeek
            }
            onChange={
              event =>
                setSelectedWeek(
                  parseInt(
                    event.target
                      .value,
                    10
                  )
                )
            }
            disabled={
              !weekReady
            }
            style={{
              width: 60,
            }}
          >
            {Array.from(
              {
                length: 18,
              },
              (
                _,
                index
              ) =>
                index + 1
            ).map(
              week => (
                <option
                  key={
                    week
                  }
                  value={
                    week
                  }
                >
                  {week}
                </option>
              )
            )}
          </select>
        </label>

        {weekReady && (
          <small
            style={{
              marginLeft: 10,
              color:
                '#64748b',
            }}
          >
            Automatically opens to the current week.
          </small>
        )}
      </div>

      {/* ========================================================= */}
      {/* PICK COUNT */}
      {/* ========================================================= */}

      {weekReady &&
        !loadingGames && (
          <div
            className={
              submittedCount >
              5
                ? 'pick-count-box pick-count-error'
                : 'pick-count-box'
            }
          >
            <strong>
              Submitted picks:{' '}
              {
                submittedCount
              }
              /5
            </strong>

            {submittedCount <
            5 ? (
              <span>
                {' '}
                —{' '}
                {
                  remainingSlots
                }{' '}
                pick
                {remainingSlots ===
                1
                  ? ''
                  : 's'}{' '}
                remaining.
              </span>
            ) : submittedCount ===
              5 ? (
              <span>
                {' '}
                — Your Week{' '}
                {
                  selectedWeek
                }{' '}
                card is full.
              </span>
            ) : (
              <span>
                {' '}
                — More than 5 picks are currently stored. Please
                delete the extra picks from My Profile.
              </span>
            )}

            {hasExistingLock && (
              <div
                className="lock-note"
              >
                Your lock pick has
                already been
                submitted.
              </div>
            )}

            {submittedCount <
              5 && (
              <div
                className="partial-submit-note"
              >
                You may submit your
                picks one at a time
                or in groups. Your
                completed 5-pick
                card must include
                exactly one lock.
              </div>
            )}
          </div>
        )}

      {/* ========================================================= */}
      {/* GAME LIST */}
      {/* ========================================================= */}

      {!weekReady ||
      loadingGames ? (
        <p>
          Loading Week{' '}
          {selectedWeek}{' '}
          games…
        </p>
      ) : submittedCount >=
        5 ? (
        <p>
          You already have 5 picks
          submitted for Week{' '}
          {selectedWeek}. To make a
          change before kickoff,
          delete an eligible pick
          from My Profile first.
        </p>
      ) : allWeekGames.length ===
        0 ? (
        <div
          className="spread-posting-message"
        >
          Week {selectedWeek} spreads
          will be posted up to 2 days
          prior to kickoff of the
          first game.
        </div>
      ) : games.length ===
        0 ? (
        <p>
          No upcoming games are
          available for Week{' '}
          {selectedWeek}.
        </p>
      ) : (
        games.map(
          game => (
            <div
              key={
                game.id
              }
              style={{
                marginBottom:
                  12,
              }}
            >
              <strong>
                {
                  game.away_team
                }{' '}
                @{' '}
                {
                  game.home_team
                }{' '}

                (
                {game.spread >
                0
                  ? `+${game.spread}`
                  : game.spread}
                ) —{' '}

                {new Date(
                  game.kickoff_time
                ).toLocaleString(
                  undefined,
                  {
                    weekday:
                      'short',

                    hour:
                      '2-digit',

                    minute:
                      '2-digit',
                  }
                )}
              </strong>

              <br />

              <label>
                <input
                  type="radio"
                  name={`pick-${game.id}`}
                  checked={
                    picks[
                      game.id
                    ] ===
                    game.home_team
                  }
                  onChange={() =>
                    handlePick(
                      game.id,
                      game.home_team
                    )
                  }
                  disabled={
                    remainingSlots ===
                    0
                  }
                />{' '}

                {
                  game.home_team
                }
              </label>

              <label
                style={{
                  marginLeft:
                    12,
                }}
              >
                <input
                  type="radio"
                  name={`pick-${game.id}`}
                  checked={
                    picks[
                      game.id
                    ] ===
                    game.away_team
                  }
                  onChange={() =>
                    handlePick(
                      game.id,
                      game.away_team
                    )
                  }
                  disabled={
                    remainingSlots ===
                    0
                  }
                />{' '}

                {
                  game.away_team
                }
              </label>

              <label
                style={{
                  marginLeft:
                    12,
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    String(
                      lockPick
                    ) ===
                    String(
                      game.id
                    )
                  }
                  onChange={() =>
                    handleLock(
                      game.id
                    )
                  }
                  disabled={
                    remainingSlots ===
                      0 ||
                    hasExistingLock
                  }
                />{' '}

                Lock
              </label>
            </div>
          )
        )
      )}

      {/* ========================================================= */}
      {/* SUBMIT BUTTON */}
      {/* ========================================================= */}

      <button
        className="action-button submit-picks-button"
        onClick={
          submitPicks
        }
        disabled={
          !weekReady ||
          loadingGames ||
          submitting ||
          games.length ===
            0 ||
          remainingSlots ===
            0
        }
      >
        {submitting
          ? 'Submitting…'
          : 'Submit Picks'}
      </button>

      {/* ========================================================= */}
      {/* STYLES */}
      {/* ========================================================= */}

      <style jsx>{`
        .submission-message {
          max-width: 560px;
          margin: 0 0 18px;
          padding: 14px 16px;
          border: 1px solid;
          border-radius: 8px;
          font-weight: 700;
          line-height: 1.4;
        }

        .success-message {
          color: #166534;
          background: #dcfce7;
          border-color: #86efac;
        }

        .warning-message {
          color: #854d0e;
          background: #fef9c3;
          border-color: #fde047;
        }

        .error-message {
          color: #991b1b;
          background: #fee2e2;
          border-color: #fca5a5;
        }

        .spread-posting-message {
          max-width: 620px;
          margin: 0 0 18px;
          padding: 14px 16px;
          border: 1px solid #fde68a;
          border-radius: 8px;
          background: #fffbeb;
          color: #92400e;
          font-weight: 700;
          line-height: 1.45;
        }

        .pick-count-box {
          max-width: 620px;
          margin: 0 0 18px;
          padding: 12px 14px;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          background: #eff6ff;
          color: #1e3a8a;
          line-height: 1.4;
        }

        .pick-count-error {
          border-color: #fca5a5;
          background: #fee2e2;
          color: #991b1b;
        }

        .lock-note {
          margin-top: 5px;
          font-size: 14px;
        }

        .partial-submit-note {
          margin-top: 7px;
          font-size: 13px;
          color: #475569;
        }

        .action-button {
          appearance: none;
          min-width: 150px;
          padding: 11px 20px;
          border: 1px solid #b91c1c;
          border-radius: 8px;
          background: #dc2626;
          color: #ffffff;
          font-size: 16px;
          font-weight: 700;
          line-height: 1.2;
          cursor: pointer;
          box-shadow: 0 4px 0 #991b1b;

          transition:
            transform 80ms ease,
            box-shadow 80ms ease,
            background-color 150ms ease;

          user-select: none;

          -webkit-tap-highlight-color:
            transparent;
        }

        .action-button:hover:not(:disabled) {
          background: #b91c1c;
        }

        .action-button:active:not(:disabled) {
          transform:
            translateY(4px);

          box-shadow:
            0 0 0 #991b1b;
        }

        .action-button:focus-visible {
          outline:
            3px solid
            rgba(
              37,
              99,
              235,
              0.35
            );

          outline-offset:
            3px;
        }

        .action-button:disabled {
          border-color: #94a3b8;
          background: #cbd5e1;
          color: #64748b;
          cursor: not-allowed;

          box-shadow:
            0 3px 0 #94a3b8;

          transform: none;
        }
      `}</style>
    </div>
  )
}
