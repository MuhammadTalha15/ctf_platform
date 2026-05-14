const express  = require('express')
const router   = express.Router()
const pool     = require('../config/db')
const { requireAuth } = require('../midleware/auth')


// ==========================================
// CHALLENGES LIST
// ==========================================

router.get('/challenges', requireAuth, async (req, res) => {

    if (req.session.user.role === 'admin') return res.redirect('/admin/dashboard')

    try {

        // Fetch all enabled challenges + whether this user solved each one
        const result = await pool.query(
            `SELECT
                c.id,
                c.title,
                c.description,
                c.category,
                c.difficulty,
                c.points,
                c.flag_hint,
                c.solves,
                c.created_at,
                EXISTS (
                    SELECT 1 FROM solved_challenges sc
                    WHERE sc.challenge_id = c.id
                      AND sc.user_id = $1
                ) AS solved
             FROM challenges c
             WHERE c.enabled = true
             ORDER BY c.difficulty ASC, c.points ASC`,
            [req.session.user.id]
        )

        res.render('challenges', {
            user:        req.session.user,
            currentPage: 'challenges',
            challenges:  result.rows
        })

    } catch (error) {
        console.error('Challenges list error:', error)
        res.status(500).render('error', {
            error: 'Failed to load challenges',
            user:  req.session.user,
            currentPage: ''
        })
    }
})


// ==========================================
// SINGLE CHALLENGE
// ==========================================

router.get('/challenges/:id', requireAuth, async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT
                c.id,
                c.title,
                c.description,
                c.category,
                c.difficulty,
                c.points,
                c.flag_hint,
                c.solves,
                c.created_at,
                u.username AS author,
                EXISTS (
                    SELECT 1 FROM solved_challenges sc
                    WHERE sc.challenge_id = c.id
                      AND sc.user_id = $2
                ) AS solved
             FROM challenges c
             JOIN users u ON u.id = c.author_id
             WHERE c.id = $1 AND c.enabled = true`,
            [req.params.id, req.session.user.id]
        )

        if (result.rows.length === 0) {
            return res.status(404).render('error', {
                error: 'Challenge not found',
                user:  req.session.user,
                currentPage: ''
            })
        }

        const challenge = result.rows[0]

        res.render('challenge', {
            user:        req.session.user,
            currentPage: 'challenge',
            challenge,
            solved:      challenge.solved,
            admin:       req.session.user.role === 'admin'
        })

    } catch (error) {
        console.error('Challenge detail error:', error)
        res.status(500).render('error', {
            error: 'Failed to load challenge',
            user:  req.session.user,
            currentPage: ''
        })
    }
})


// ==========================================
// SUBMIT FLAG
// ==========================================

router.post('/challenges/:id/submit', requireAuth, async (req, res) => {

    if (req.session.user.role === 'admin') {
        return res.status(403).json({ correct: false, message: 'Admins cannot submit flags.' })
    }

    const rawFlag = (req.body.flag || '').trim()

    if (!rawFlag) {
        return res.json({ correct: false, message: 'Please enter a flag.' })
    }

    // Use a transaction so all counters stay consistent
    const client = await pool.connect()

    try {

        await client.query('BEGIN')

        // Lock the challenge row to prevent race conditions
        const challengeResult = await client.query(
            `SELECT id, flag, points, enabled
             FROM challenges
             WHERE id = $1
             FOR UPDATE`,
            [req.params.id]
        )

        if (challengeResult.rows.length === 0 || !challengeResult.rows[0].enabled) {
            await client.query('ROLLBACK')
            return res.status(404).json({ error: 'Challenge not found' })
        }

        const challenge = challengeResult.rows[0]

        // Check if already solved (uses the unique partial index on submissions)
        const alreadySolved = await client.query(
            `SELECT 1 FROM solved_challenges
             WHERE user_id = $1 AND challenge_id = $2`,
            [req.session.user.id, challenge.id]
        )

        if (alreadySolved.rows.length > 0) {
            await client.query('ROLLBACK')
            return res.json({ correct: false, message: 'Already solved!' })
        }

        const isCorrect = rawFlag === challenge.flag

        // Record every submission attempt
        await client.query(
            `INSERT INTO submissions
                (user_id, challenge_id, flag, correct, submitted_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [req.session.user.id, challenge.id, rawFlag, isCorrect]
        )

        if (isCorrect) {

            // Insert into solved_challenges — triggers auto-update
            // challenges.solves and users.points (see schema triggers)
            await client.query(
                `INSERT INTO solved_challenges (user_id, challenge_id, solved_at)
                 VALUES ($1, $2, NOW())`,
                [req.session.user.id, challenge.id]
            )

            // Read back updated points for session refresh
            const updatedUser = await client.query(
                `SELECT points FROM users WHERE id = $1`,
                [req.session.user.id]
            )

            await client.query('COMMIT')

            // Sync session points
            req.session.user.points = updatedUser.rows[0].points
            req.session.save()

            return res.json({
                correct: true,
                message: `Correct! +${challenge.points} points`,
                points:  challenge.points
            })
        }

        await client.query('COMMIT')

        res.json({ correct: false, message: 'Wrong flag. Try again!' })

    } catch (error) {

        await client.query('ROLLBACK')
        console.error('Flag submission error:', error)
        res.status(500).json({ error: 'Submission failed. Please try again.' })

    } finally {
        client.release()
    }
})


module.exports = router