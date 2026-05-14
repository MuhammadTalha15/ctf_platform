const express   = require('express')
const router    = express.Router()
const bcrypt    = require('bcryptjs')
const rateLimit = require('express-rate-limit')
const pool      = require('../config/db')
const { requireAuth } = require('../midleware/auth')


// ── Rate limiters ────────────────────────────────────────────────────────────

const passwordChangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many password change attempts. Try again later.' }
})

const profileEditLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many profile edit attempts. Try again later.' }
})


// ==========================================
// DASHBOARD
// ==========================================

router.get('/dashboard', requireAuth, async (req, res) => {

    if (req.session.user.role === 'admin') return res.redirect('/admin/dashboard')

    try {

        const userId = req.session.user.id

        // User row with fresh points
        const userResult = await pool.query(
            `SELECT id, username, email, role, points, display_name, avatar_url
             FROM users WHERE id = $1`,
            [userId]
        )
        const user = userResult.rows[0]

        // Category breakdown: total per category + how many this user solved
        const categoryResult = await pool.query(
            `SELECT
                c.category,
                COUNT(*)                                             AS total,
                COUNT(sc.challenge_id) FILTER (WHERE sc.user_id = $1) AS user_solves
             FROM challenges c
             LEFT JOIN solved_challenges sc
                ON sc.challenge_id = c.id AND sc.user_id = $1
             WHERE c.enabled = true
             GROUP BY c.category`,
            [userId]
        )

        const categoryStats = {}
        categoryResult.rows.forEach(r => {
            categoryStats[r.category] = {
                total:      parseInt(r.total),
                userSolves: parseInt(r.user_solves)
            }
        })

        // Total enabled challenges
        const totalChallenges = Object.values(categoryStats)
            .reduce((sum, s) => sum + s.total, 0)

        // Rank (only users with points > 0)
        const rankResult = await pool.query(
            `SELECT COUNT(*) + 1 AS rank
             FROM users
             WHERE role = 'user'
               AND points > $1`,
            [user.points || 0]
        )
        const rank = user.points > 0 ? parseInt(rankResult.rows[0].rank) : 0

        // Total ranked users
        const totalUsersResult = await pool.query(
            `SELECT COUNT(*) AS cnt FROM users WHERE role = 'user' AND points > 0`
        )
        const totalUsers = parseInt(totalUsersResult.rows[0].cnt)

        // Recent 10 correct submissions for this user
        const recentResult = await pool.query(
            `SELECT c.title, c.points, s.submitted_at AS time
             FROM submissions s
             JOIN challenges c ON c.id = s.challenge_id
             WHERE s.user_id = $1 AND s.correct = true
             ORDER BY s.submitted_at DESC
             LIMIT 10`,
            [userId]
        )

        const recentActivity = recentResult.rows.map(r => ({
            text: `Solved "${r.title}" (${r.points}pts)`,
            time: r.time
        }))

        // Suggested: up to 5 unsolved enabled challenges
        const suggestedResult = await pool.query(
            `SELECT c.id, c.title, c.category, c.difficulty, c.points
             FROM challenges c
             WHERE c.enabled = true
               AND NOT EXISTS (
                   SELECT 1 FROM solved_challenges sc
                   WHERE sc.challenge_id = c.id AND sc.user_id = $1
               )
             ORDER BY c.points ASC
             LIMIT 5`,
            [userId]
        )

        // Activities (admin-created announcements)
        const activitiesResult = await pool.query(
            `SELECT id, type, metadata, created_at AS time
             FROM activities
             ORDER BY created_at DESC
             LIMIT 20`
        )

        res.locals.activities = activitiesResult.rows

        // Solved challenge IDs for the session
        const solvedResult = await pool.query(
            `SELECT challenge_id FROM solved_challenges WHERE user_id = $1`,
            [userId]
        )
        const solvedIds = solvedResult.rows.map(r => r.challenge_id)

        res.render('dashboard', {
            user: {
                ...req.session.user,
                points:            user.points,
                solvedChallenges:  solvedIds
            },
            currentPage:    'dashboard',
            stats:          { totalChallenges },
            rank,
            categoryStats,
            recentActivity,
            suggested:      suggestedResult.rows,
            totalUsers
        })

    } catch (error) {
        console.error('Dashboard error:', error)
        res.status(500).render('error', {
            error: 'Failed to load dashboard', user: req.session.user, currentPage: ''
        })
    }
})


// ==========================================
// PROFILE
// ==========================================

router.get('/profile', requireAuth, async (req, res) => {

    if (req.session.user.role === 'admin') return res.redirect('/admin/dashboard')

    try {

        const userId = req.session.user.id

        const userResult = await pool.query(
            `SELECT id, username, email, display_name, bio, avatar_url,
                    points, github, twitter, linkedin, website, created_at
             FROM users WHERE id = $1`,
            [userId]
        )
        const profileUser = userResult.rows[0]

        // Solved challenges with full details
        const solvedResult = await pool.query(
            `SELECT c.id, c.title, c.category, c.difficulty, c.points, sc.solved_at
             FROM solved_challenges sc
             JOIN challenges c ON c.id = sc.challenge_id
             WHERE sc.user_id = $1
             ORDER BY sc.solved_at DESC`,
            [userId]
        )

        // Rank
        const rankResult = await pool.query(
            `SELECT COUNT(*) + 1 AS rank FROM users
             WHERE role = 'user' AND points > $1`,
            [profileUser.points || 0]
        )
        const rank = profileUser.points > 0 ? parseInt(rankResult.rows[0].rank) : 0

        // Recent 10 solves as activity feed
        const recentActivity = solvedResult.rows.slice(0, 10).map(r => ({
            text: `Solved "${r.title}"`,
            time: r.solved_at
        }))

        res.render('profile', {
            user:             req.session.user,
            currentPage:      'profile',
            profileUser,
            solvedChallenges: solvedResult.rows,
            recentActivity,
            rank
        })

    } catch (error) {
        console.error('Profile error:', error)
        res.status(500).render('error', {
            error: 'Failed to load profile', user: req.session.user, currentPage: ''
        })
    }
})


// ==========================================
// LEADERBOARD
// ==========================================

router.get('/leaderboard', requireAuth, async (req, res) => {

    if (req.session.user.role === 'admin') return res.redirect('/admin/dashboard')

    try {

        // Use the v_scoreboard view from the schema
        const result = await pool.query(
            `SELECT
                id,
                username,
                display_name,
                avatar_url,
                points,
                solve_count,
                last_solve_at,
                ROW_NUMBER() OVER (ORDER BY points DESC, last_solve_at ASC) AS rank
             FROM v_scoreboard`
        )

        const entries = result.rows
        const top3    = entries.slice(0, 3)

        res.render('leaderboard', {
            user:        req.session.user,
            currentPage: 'leaderboard',
            entries,
            top3
        })

    } catch (error) {
        console.error('Leaderboard error:', error)
        res.status(500).render('error', {
            error: 'Failed to load leaderboard', user: req.session.user, currentPage: ''
        })
    }
})


// ==========================================
// API: PUBLIC USER PROFILE
// ==========================================

router.get('/api/users/:id/profile', requireAuth, async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT
                u.id, u.username, u.display_name, u.avatar_url,
                u.bio, u.points, u.github, u.twitter,
                u.linkedin, u.website, u.created_at,
                COUNT(sc.challenge_id) AS solved_count
             FROM users u
             LEFT JOIN solved_challenges sc ON sc.user_id = u.id
             WHERE u.id = $1 AND u.role = 'user'
             GROUP BY u.id`,
            [req.params.id]
        )

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' })
        }

        const user = result.rows[0]

        const rankResult = await pool.query(
            `SELECT COUNT(*) + 1 AS rank FROM users
             WHERE role = 'user' AND points > $1`,
            [user.points || 0]
        )
        const rank = user.points > 0 ? parseInt(rankResult.rows[0].rank) : 0

        res.json({
            id:          user.id,
            username:    user.username,
            displayName: user.display_name || user.username,
            avatarUrl:   user.avatar_url   || '',
            bio:         user.bio          || '',
            points:      user.points       || 0,
            solvedCount: parseInt(user.solved_count),
            rank,
            github:      user.github    || '',
            twitter:     user.twitter   || '',
            linkedin:    user.linkedin  || '',
            website:     user.website   || '',
            createdAt:   user.created_at
        })

    } catch (error) {
        console.error('User profile API error:', error)
        res.status(500).json({ error: 'Failed to load profile' })
    }
})


// ==========================================
// API: NOTIFICATIONS
// ==========================================

router.get('/api/notifications', requireAuth, async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT id, type, title, message, challenge_id, is_read, created_at
             FROM notifications
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 20`,
            [req.session.user.id]
        )

        res.json(result.rows)

    } catch (error) {
        console.error('Notifications error:', error)
        res.status(500).json({ error: 'Failed to load notifications' })
    }
})


router.post('/api/notifications/read', requireAuth, async (req, res) => {

    try {

        await pool.query(
            `UPDATE notifications
             SET is_read = true
             WHERE user_id = $1 AND is_read = false`,
            [req.session.user.id]
        )

        // notif_unread is synced automatically by the DB trigger
        res.json({ success: true })

    } catch (error) {
        console.error('Mark-read error:', error)
        res.status(500).json({ error: 'Failed to mark notifications as read' })
    }
})


router.post('/api/notifications/:id/dismiss', requireAuth, async (req, res) => {

    try {

        const result = await pool.query(
            `DELETE FROM notifications
             WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.session.user.id]
        )

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Notification not found' })
        }

        // notif_unread is synced automatically by the DB trigger
        res.json({ success: true })

    } catch (error) {
        console.error('Dismiss notification error:', error)
        res.status(500).json({ error: 'Failed to dismiss notification' })
    }
})


router.get('/api/notifications/unread', requireAuth, async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT notif_unread FROM users WHERE id = $1`,
            [req.session.user.id]
        )

        res.json({ unread: result.rows[0]?.notif_unread || 0 })

    } catch (error) {
        console.error('Unread count error:', error)
        res.status(500).json({ error: 'Failed to fetch unread count' })
    }
})


// ==========================================
// PROFILE EDIT — GET
// ==========================================

router.get('/profile/edit', requireAuth, async (req, res) => {

    if (req.session.user.role === 'admin') return res.redirect('/')

    try {

        const result = await pool.query(
            `SELECT id, username, email, display_name, bio, avatar_url,
                    github, twitter, linkedin, website
             FROM users WHERE id = $1`,
            [req.session.user.id]
        )

        if (result.rows.length === 0) return res.redirect('/login')

        res.render('profile-edit', {
            user:        req.session.user,
            currentPage: 'profile',
            profileUser: result.rows[0],
            error:       null,
            success:     null
        })

    } catch (error) {
        console.error('Profile edit GET error:', error)
        res.redirect('/profile')
    }
})


// ==========================================
// PROFILE EDIT — POST
// ==========================================

router.post('/profile/edit', requireAuth, profileEditLimiter, async (req, res) => {

    if (req.session.user.role === 'admin') return res.redirect('/')

    const s = (v) => typeof v === 'string' ? v.trim() : ''

    const displayName = req.sanitize(s(req.body.displayName)).slice(0, 50)
    const username    = s(req.body.username)
    const email       = s(req.body.email).toLowerCase()
    const bio         = req.sanitize(s(req.body.bio)).slice(0, 500)
    const avatarUrl   = s(req.body.avatarUrl).slice(0, 500)
    const github      = s(req.body.github).slice(0, 200)
    const twitter     = s(req.body.twitter).slice(0, 200)
    const linkedin    = s(req.body.linkedin).slice(0, 200)
    const website     = req.validateUrl(s(req.body.website)).slice(0, 500)

    // Helper to re-render edit page with current DB data
    const renderError = async (errorMsg) => {
        const current = await pool.query(
            `SELECT id, username, email, display_name, bio, avatar_url,
                    github, twitter, linkedin, website
             FROM users WHERE id = $1`,
            [req.session.user.id]
        )
        return res.render('profile-edit', {
            user:        req.session.user,
            currentPage: 'profile',
            profileUser: current.rows[0] || {},
            error:       errorMsg,
            success:     null
        })
    }

    // ── Validation ───────────────────────────────────────────────────────────

    if (!username || !email)
        return renderError('Username and email are required')

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
        return renderError('Username must be 3-20 chars (letters, numbers, underscores)')

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return renderError('Invalid email address')

    if (avatarUrl && !avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://'))
        return renderError('Avatar URL must start with http:// or https://')

    if (github   && !github.startsWith('http://') && !github.startsWith('https://'))
        return renderError('GitHub URL must start with http:// or https://')

    if (twitter  && !twitter.startsWith('http://') && !twitter.startsWith('https://'))
        return renderError('Twitter URL must start with http:// or https://')

    if (linkedin && !linkedin.startsWith('http://') && !linkedin.startsWith('https://'))
        return renderError('LinkedIn URL must start with http:// or https://')

    try {

        // Check username taken by someone else (case-insensitive)
        const dupCheck = await pool.query(
            `SELECT id FROM users
             WHERE LOWER(username) = LOWER($1) AND id <> $2`,
            [username, req.session.user.id]
        )

        if (dupCheck.rows.length > 0)
            return renderError('Username is not available')

        // Update user
        const result = await pool.query(
            `UPDATE users SET
                username     = $1,
                email        = $2,
                display_name = $3,
                bio          = $4,
                avatar_url   = $5,
                github       = $6,
                twitter      = $7,
                linkedin     = $8,
                website      = $9,
                updated_at   = NOW()
             WHERE id = $10
             RETURNING id, username, email, display_name, bio, avatar_url,
                       github, twitter, linkedin, website`,
            [
                username,
                email,
                displayName || username,
                bio        || '',
                avatarUrl  || '',
                github     || '',
                twitter    || '',
                linkedin   || '',
                website    || '',
                req.session.user.id
            ]
        )

        const updated = result.rows[0]

        // Refresh session
        req.session.user = {
            ...req.session.user,
            username:    updated.username,
            email:       updated.email,
            displayName: updated.display_name || updated.username,
            avatarUrl:   updated.avatar_url   || ''
        }
        req.session.save()

        res.render('profile-edit', {
            user:        req.session.user,
            currentPage: 'profile',
            profileUser: updated,
            error:       null,
            success:     'Profile updated successfully'
        })

    } catch (error) {
        console.error('Profile edit POST error:', error)
        return renderError('Failed to update profile. Please try again.')
    }
})


// ==========================================
// CHANGE PASSWORD
// ==========================================

router.post('/profile/change-password', requireAuth, passwordChangeLimiter, async (req, res) => {

    if (req.session.user.role === 'admin') return res.redirect('/')

    const { currentPassword, newPassword, confirmPassword } = req.body

    const renderError = async (errorMsg) => {
        const current = await pool.query(
            `SELECT id, username, email, display_name, bio, avatar_url,
                    github, twitter, linkedin, website
             FROM users WHERE id = $1`,
            [req.session.user.id]
        )
        return res.render('profile-edit', {
            user:        req.session.user,
            currentPage: 'profile',
            profileUser: current.rows[0] || {},
            error:       errorMsg,
            success:     null
        })
    }

    if (!currentPassword || !newPassword || !confirmPassword)
        return renderError('All password fields are required')

    if (newPassword.length < 6)
        return renderError('New password must be at least 6 characters')

    if (newPassword !== confirmPassword)
        return renderError('New passwords do not match')

    try {

        const result = await pool.query(
            `SELECT password_hash FROM users WHERE id = $1`,
            [req.session.user.id]
        )

        if (result.rows.length === 0) return res.redirect('/login')

        const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash)

        if (!valid) return renderError('Current password is incorrect')

        const newHash = await bcrypt.hash(newPassword, 10)

        await pool.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            [newHash, req.session.user.id]
        )

        const updated = await pool.query(
            `SELECT id, username, email, display_name, bio, avatar_url,
                    github, twitter, linkedin, website
             FROM users WHERE id = $1`,
            [req.session.user.id]
        )

        res.render('profile-edit', {
            user:        req.session.user,
            currentPage: 'profile',
            profileUser: updated.rows[0],
            error:       null,
            success:     'Password changed successfully'
        })

    } catch (error) {
        console.error('Password change error:', error)
        return renderError('Failed to change password. Please try again.')
    }
})


module.exports = router