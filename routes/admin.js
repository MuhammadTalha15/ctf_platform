const express = require('express')
const router  = express.Router()
const bcrypt  = require('bcryptjs')
const pool    = require('../config/db')
const { requireAdmin } = require('../midleware/auth')

router.use(requireAdmin)

router.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
})

// Attach global admin stats to every admin response
router.use(async (req, res, next) => {

    try {

        const stats = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM users       WHERE role = 'user')  AS total_users,
                (SELECT COUNT(*) FROM challenges)                        AS total_challenges,
                (SELECT COUNT(*) FROM submissions)                       AS total_submissions`
        )

        const challengesResult = await pool.query(
            `SELECT id, title, category, difficulty, points, enabled, solves FROM challenges ORDER BY created_at DESC`
        )

        const usersResult = await pool.query(
            `SELECT id, username, email, role, points, created_at FROM users ORDER BY created_at DESC`
        )

        res.locals.stats      = stats.rows[0]
        res.locals.challenges = challengesResult.rows
        res.locals.users      = usersResult.rows

        next()

    } catch (error) {
        console.error('Admin middleware error:', error)
        next()
    }
})


// ==========================================
// ADMIN DASHBOARD
// ==========================================

router.get('/dashboard', async (req, res) => {

    try {

        // ── Summary stats ────────────────────────────────────
        const statsResult = await pool.query(
            `SELECT
                (SELECT COUNT(*)              FROM users       WHERE role = 'user')  AS total_users,
                (SELECT COUNT(*)              FROM challenges)                        AS total_challenges,
                (SELECT COUNT(*) FILTER (WHERE enabled = true)
                                              FROM challenges)                       AS enabled_challenges,
                (SELECT COUNT(*)              FROM submissions)                      AS total_submissions,
                (SELECT COUNT(*) FILTER (WHERE correct = true)
                                              FROM submissions)                      AS correct_submissions,
                (SELECT COALESCE(SUM(points), 0) FROM users WHERE role = 'user')    AS total_points`
        )
        const stats = statsResult.rows[0]

        // ── Category breakdown ───────────────────────────────
        const catResult = await pool.query(
            `SELECT category,
                    COUNT(*)       AS total,
                    SUM(solves)    AS solves
             FROM challenges
             GROUP BY category`
        )
        const categoryStats = {}
        catResult.rows.forEach(r => {
            categoryStats[r.category] = {
                total:  parseInt(r.total),
                solves: parseInt(r.solves)
            }
        })

        // ── 5 most recently registered users ─────────────────
        const recentUsersResult = await pool.query(
            `SELECT id, username, email, points, created_at
             FROM users
             WHERE role = 'user'
             ORDER BY created_at DESC
             LIMIT 5`
        )

        // ── 10 most recent submissions (flag masked) ─────────
        const recentSubsResult = await pool.query(
            `SELECT
                s.id, s.flag, s.correct, s.submitted_at,
                u.username,
                c.title AS challenge_title
             FROM submissions s
             JOIN users      u ON u.id = s.user_id
             JOIN challenges c ON c.id = s.challenge_id
             ORDER BY s.submitted_at DESC
             LIMIT 10`
        )

        const maskFlag = (f) => {
            if (!f) return ''
            return f.length <= 8 ? '****' : f.substring(0, 4) + '****' + f.substring(f.length - 2)
        }

        const recentSubs = recentSubsResult.rows.map(s => ({
            ...s,
            flag: maskFlag(s.flag)
        }))

        // ── 7-day chart data ─────────────────────────────────
        const chartResult = await pool.query(
            `SELECT
                gs.day::date AS day,
                COUNT(DISTINCT u.id)  FILTER (WHERE u.created_at::date  = gs.day AND u.role = 'user') AS new_users,
                COUNT(DISTINCT s.id)  FILTER (WHERE s.submitted_at::date = gs.day AND s.correct = true) AS solves,
                COUNT(DISTINCT s2.id) FILTER (WHERE s2.submitted_at::date = gs.day)                      AS submissions
             FROM generate_series(
                 NOW() - INTERVAL '6 days',
                 NOW(),
                 INTERVAL '1 day'
             ) AS gs(day)
             LEFT JOIN users       u  ON u.created_at::date  = gs.day
             LEFT JOIN submissions s  ON s.submitted_at::date = gs.day AND s.correct = true
             LEFT JOIN submissions s2 ON s2.submitted_at::date = gs.day
             GROUP BY gs.day
             ORDER BY gs.day ASC`
        )

        const chartLabels      = chartResult.rows.map(r =>
            new Date(r.day).toLocaleDateString('en-US', { weekday: 'short' })
        )
        const chartUsers       = chartResult.rows.map(r => parseInt(r.new_users)   || 0)
        const chartSolves      = chartResult.rows.map(r => parseInt(r.solves)      || 0)
        const chartSubmissions = chartResult.rows.map(r => parseInt(r.submissions) || 0)

        // ── Activities ───────────────────────────────────────
        const activitiesResult = await pool.query(
            `SELECT id, type, metadata, created_at
             FROM activities
             ORDER BY created_at DESC
             LIMIT 20`
        )

        res.render('admin/dashboard', {
            user:        req.session.user,
            currentPage: 'admin-dashboard',
            stats: {
                totalUsers:          parseInt(stats.total_users),
                totalChallenges:     parseInt(stats.total_challenges),
                enabledChallenges:   parseInt(stats.enabled_challenges),
                totalSubmissions:    parseInt(stats.total_submissions),
                correctSubmissions:  parseInt(stats.correct_submissions),
                totalPoints:         parseInt(stats.total_points)
            },
            categoryStats,
            recentUsers:   recentUsersResult.rows,
            recentSubs,
            activities:    activitiesResult.rows,
            chartLabels:      JSON.stringify(chartLabels),
            chartUsers:       JSON.stringify(chartUsers),
            chartSolves:      JSON.stringify(chartSolves),
            chartSubmissions: JSON.stringify(chartSubmissions)
        })

    } catch (error) {
        console.error('Admin dashboard error:', error)
        res.status(500).render('error', {
            error: 'Failed to load admin dashboard', user: req.session.user, currentPage: ''
        })
    }
})


// ==========================================
// USERS LIST
// ==========================================

router.get('/users', async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT
                u.id, u.username, u.email, u.role, u.points, u.created_at,
                COUNT(sc.challenge_id) AS solve_count
             FROM users u
             LEFT JOIN solved_challenges sc ON sc.user_id = u.id
             WHERE u.role != 'admin'
             GROUP BY u.id
             ORDER BY u.created_at DESC`
        )

        res.render('admin/users', {
            user:        req.session.user,
            currentPage: 'admin-users',
            users:       result.rows
        })

    } catch (error) {
        console.error('Admin users error:', error)
        res.redirect('/admin/dashboard')
    }
})


// ── Helper: verify admin password + target username ──────────────────────────

async function verifyAdmin(req, targetUsername) {

    const s = (v) => typeof v === 'string' ? v.trim() : ''
    const confirmPassword = s(req.body.confirmPassword)
    const confirmUsername = s(req.body.confirmUsername)

    if (!confirmPassword || !confirmUsername) return false
    if (confirmUsername !== targetUsername)    return false

    const result = await pool.query(
        `SELECT password_hash FROM users WHERE id = $1 AND role = 'admin'`,
        [req.session.user.id]
    )

    if (result.rows.length === 0) return false

    return await bcrypt.compare(confirmPassword, result.rows[0].password_hash)
}


// ==========================================
// DELETE USER
// ==========================================

router.post('/users/:id/delete', async (req, res) => {

    try {

        const userResult = await pool.query(
            `SELECT username, role FROM users WHERE id = $1`,
            [req.params.id]
        )

        if (userResult.rows.length === 0 || userResult.rows[0].role === 'admin') {
            return res.redirect('/admin/users')
        }

        if (!await verifyAdmin(req, userResult.rows[0].username)) {
            return res.redirect('/admin/users')
        }

        // CASCADE in the schema handles submissions, solved_challenges, notifications
        await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id])

        res.redirect('/admin/users')

    } catch (error) {
        console.error('Delete user error:', error)
        res.redirect('/admin/users')
    }
})


// ==========================================
// RESET USER POINTS
// ==========================================

router.post('/users/:id/reset-points', async (req, res) => {

    const client = await pool.connect()

    try {

        const userResult = await pool.query(
            `SELECT username, role FROM users WHERE id = $1`,
            [req.params.id]
        )

        if (userResult.rows.length === 0 || userResult.rows[0].role === 'admin') {
            return res.redirect('/admin/users')
        }

        if (!await verifyAdmin(req, userResult.rows[0].username)) {
            return res.redirect('/admin/users')
        }

        await client.query('BEGIN')

        // Remove all solves — triggers will decrement challenges.solves
        await client.query(
            `DELETE FROM solved_challenges WHERE user_id = $1`,
            [req.params.id]
        )

        // Zero out points directly (trigger may leave small rounding, force 0)
        await client.query(
            `UPDATE users SET points = 0, updated_at = NOW() WHERE id = $1`,
            [req.params.id]
        )

        // Remove all submissions for this user
        await client.query(
            `DELETE FROM submissions WHERE user_id = $1`,
            [req.params.id]
        )

        await client.query('COMMIT')

        res.redirect('/admin/users')

    } catch (error) {
        await client.query('ROLLBACK')
        console.error('Reset points error:', error)
        res.redirect('/admin/users')
    } finally {
        client.release()
    }
})


// ==========================================
// CHALLENGES LIST
// ==========================================

router.get('/challenges', async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT c.id, c.title, c.category, c.difficulty,
                    c.points, c.enabled, c.solves, c.created_at,
                    u.username AS author
             FROM challenges c
             JOIN users u ON u.id = c.author_id
             ORDER BY c.created_at DESC`
        )

        res.render('admin/challenges', {
            user:        req.session.user,
            currentPage: 'admin-challenges',
            challenges:  result.rows
        })

    } catch (error) {
        console.error('Admin challenges error:', error)
        res.redirect('/admin/dashboard')
    }
})


router.get('/challenges/new', (req, res) => {
    res.render('admin/challenge-form', {
        user:        req.session.user,
        currentPage: 'admin-challenges',
        challenge:   null,
        error:       null
    })
})


router.get('/challenges/:id/edit', async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT * FROM challenges WHERE id = $1`,
            [req.params.id]
        )

        if (result.rows.length === 0) return res.redirect('/admin/challenges')

        res.render('admin/challenge-form', {
            user:        req.session.user,
            currentPage: 'admin-challenges',
            challenge:   result.rows[0],
            error:       null
        })

    } catch (error) {
        console.error('Edit challenge GET error:', error)
        res.redirect('/admin/challenges')
    }
})


// ==========================================
// CREATE CHALLENGE
// ==========================================

router.post('/challenges/new', async (req, res) => {

    const s = (v) => typeof v === 'string' ? v.trim() : ''

    const title       = s(req.body.title)
    const description = s(req.body.description)
    const category    = s(req.body.category)    || 'Misc'
    const difficulty  = s(req.body.difficulty)  || 'easy'
    const points      = parseInt(req.body.points) || 100
    const flag        = s(req.body.flag)
    const flagHint    = s(req.body.flagHint)    || 'CTF{...}'
    const enabled     = req.body.enabled === 'on'

    if (!title || !description || !flag) {
        return res.render('admin/challenge-form', {
            user:        req.session.user,
            currentPage: 'admin-challenges',
            challenge:   null,
            error:       'Title, description, and flag are required'
        })
    }

    if (points < 1 || points > 9999) {
        return res.render('admin/challenge-form', {
            user:        req.session.user,
            currentPage: 'admin-challenges',
            challenge:   null,
            error:       'Points must be between 1 and 9999'
        })
    }

    const client = await pool.connect()

    try {

        await client.query('BEGIN')

        const result = await client.query(
            `INSERT INTO challenges
                (title, description, category, difficulty, points,
                 flag, flag_hint, author_id, enabled, solves, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, NOW(), NOW())
             RETURNING id, title, category, points`,
            [title, description, category, difficulty, points,
             flag, flagHint, req.session.user.id, enabled]
        )

        const newChallenge = result.rows[0]

        // Notify all regular users
        await client.query(
            `INSERT INTO notifications (user_id, type, title, message, challenge_id, is_read, created_at)
             SELECT
                id,
                'new_challenge',
                $1,
                $2,
                $3,
                false,
                NOW()
             FROM users
             WHERE role = 'user'`,
            [
                `New Challenge: ${title}`,
                `A new ${category} challenge has been added (${points}pts)`,
                newChallenge.id
            ]
        )

        await client.query('COMMIT')

        res.redirect('/admin/challenges')

    } catch (error) {
        await client.query('ROLLBACK')
        console.error('Create challenge error:', error)
        res.render('admin/challenge-form', {
            user:        req.session.user,
            currentPage: 'admin-challenges',
            challenge:   null,
            error:       'Failed to create challenge. Please try again.'
        })
    } finally {
        client.release()
    }
})


// ==========================================
// EDIT CHALLENGE
// ==========================================

router.post('/challenges/:id/edit', async (req, res) => {

    const s = (v) => typeof v === 'string' ? v.trim() : ''

    const title       = s(req.body.title)
    const description = s(req.body.description)
    const category    = s(req.body.category)   || 'Misc'
    const difficulty  = s(req.body.difficulty) || 'easy'
    const points      = parseInt(req.body.points) || 100
    const flag        = s(req.body.flag)
    const flagHint    = s(req.body.flagHint)   || 'CTF{...}'
    const enabled     = req.body.enabled === 'on'

    if (!title || !description || !flag) {
        const current = await pool.query(`SELECT * FROM challenges WHERE id = $1`, [req.params.id])
        return res.render('admin/challenge-form', {
            user:        req.session.user,
            currentPage: 'admin-challenges',
            challenge:   current.rows[0] || null,
            error:       'Title, description, and flag are required'
        })
    }

    if (points < 1 || points > 9999) {
        const current = await pool.query(`SELECT * FROM challenges WHERE id = $1`, [req.params.id])
        return res.render('admin/challenge-form', {
            user:        req.session.user,
            currentPage: 'admin-challenges',
            challenge:   current.rows[0] || null,
            error:       'Points must be between 1 and 9999'
        })
    }

    try {

        const result = await pool.query(
            `UPDATE challenges SET
                title       = $1,
                description = $2,
                category    = $3,
                difficulty  = $4,
                points      = $5,
                flag        = $6,
                flag_hint   = $7,
                enabled     = $8,
                updated_at  = NOW()
             WHERE id = $9`,
            [title, description, category, difficulty, points,
             flag, flagHint, enabled, req.params.id]
        )

        if (result.rowCount === 0) return res.redirect('/admin/challenges')

        res.redirect('/admin/challenges')

    } catch (error) {
        console.error('Edit challenge error:', error)
        res.redirect('/admin/challenges')
    }
})


// ==========================================
// DELETE CHALLENGE
// ==========================================

router.post('/challenges/:id/delete', async (req, res) => {

    const client = await pool.connect()

    try {

        await client.query('BEGIN')

        // Fetch points before deleting (to subtract from users)
        const challengeResult = await client.query(
            `SELECT points FROM challenges WHERE id = $1`,
            [req.params.id]
        )

        if (challengeResult.rows.length === 0) {
            await client.query('ROLLBACK')
            return res.redirect('/admin/challenges')
        }

        // Remove solves — triggers decrement users.points automatically
        await client.query(
            `DELETE FROM solved_challenges WHERE challenge_id = $1`,
            [req.params.id]
        )

        // Remove all submissions for this challenge
        await client.query(
            `DELETE FROM submissions WHERE challenge_id = $1`,
            [req.params.id]
        )

        // Remove related notifications
        await client.query(
            `DELETE FROM notifications WHERE challenge_id = $1`,
            [req.params.id]
        )

        // Delete the challenge itself
        await client.query(
            `DELETE FROM challenges WHERE id = $1`,
            [req.params.id]
        )

        await client.query('COMMIT')

        res.redirect('/admin/challenges')

    } catch (error) {
        await client.query('ROLLBACK')
        console.error('Delete challenge error:', error)
        res.redirect('/admin/challenges')
    } finally {
        client.release()
    }
})


// ==========================================
// TOGGLE CHALLENGE ENABLED
// ==========================================

router.post('/challenges/:id/toggle', async (req, res) => {

    try {

        await pool.query(
            `UPDATE challenges
             SET enabled = NOT enabled, updated_at = NOW()
             WHERE id = $1`,
            [req.params.id]
        )

        res.redirect('/admin/challenges')

    } catch (error) {
        console.error('Toggle challenge error:', error)
        res.redirect('/admin/challenges')
    }
})


// ==========================================
// SUBMISSIONS LIST
// ==========================================

router.get('/submissions', async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT
                s.id, s.flag, s.correct, s.submitted_at,
                u.username,
                c.title AS challenge_title
             FROM submissions s
             JOIN users      u ON u.id = s.user_id
             JOIN challenges c ON c.id = s.challenge_id
             ORDER BY s.submitted_at DESC`
        )

        const maskFlag = (f) => {
            if (!f) return ''
            return f.length <= 8 ? '****' : f.substring(0, 4) + '****' + f.substring(f.length - 2)
        }

        const enriched = result.rows.map(s => ({ ...s, flag: maskFlag(s.flag) }))

        res.render('admin/submissions', {
            user:        req.session.user,
            currentPage: 'admin-subs',
            submissions: enriched
        })

    } catch (error) {
        console.error('Admin submissions error:', error)
        res.redirect('/admin/dashboard')
    }
})


// ==========================================
// ACTIVITY CRUD
// ==========================================

router.post('/activity/add', async (req, res) => {

    const { text } = req.body

    if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Activity text is required.' })
    }

    try {

        await pool.query(
            `INSERT INTO activities (user_id, type, metadata, created_at)
             VALUES ($1, 'announcement', $2, NOW())`,
            [
                req.session.user.id,
                JSON.stringify({ text: req.sanitize(text).slice(0, 500) })
            ]
        )

        res.json({ success: true })

    } catch (error) {
        console.error('Add activity error:', error)
        res.status(500).json({ error: 'Failed to add activity.' })
    }
})


router.post('/activity/edit', async (req, res) => {

    const { id, text } = req.body

    if (!id || !text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'ID and text are required.' })
    }

    try {

        const result = await pool.query(
            `UPDATE activities
             SET metadata   = $1,
                 created_at = NOW()
             WHERE id = $2`,
            [
                JSON.stringify({ text: req.sanitize(text).slice(0, 500) }),
                id
            ]
        )

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Activity not found.' })
        }

        res.json({ success: true })

    } catch (error) {
        console.error('Edit activity error:', error)
        res.status(500).json({ error: 'Failed to edit activity.' })
    }
})


router.post('/activity/delete', async (req, res) => {

    const { id } = req.body

    if (!id) return res.status(400).json({ error: 'ID is required.' })

    try {

        const result = await pool.query(
            `DELETE FROM activities WHERE id = $1`,
            [id]
        )

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Activity not found.' })
        }

        res.json({ success: true })

    } catch (error) {
        console.error('Delete activity error:', error)
        res.status(500).json({ error: 'Failed to delete activity.' })
    }
})


module.exports = router