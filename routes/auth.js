require('dotenv').config()

const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const pool = require('../config/db')
const { forwardAuth } = require('../midleware/auth')


// ==========================================
// LOGIN PAGE
// ==========================================

router.get('/login', forwardAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.render('login', { error: null, user: null, currentPage: 'login' })
})


// ==========================================
// REGISTER PAGE
// ==========================================

router.get('/register', forwardAuth, (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.render('register', { error: null, user: null, currentPage: 'register' })
})


// ==========================================
// REGISTER USER
// ==========================================

router.post('/register', async (req, res) => {

    try {

        const s = (v) => typeof v === 'string' ? v.trim() : ''

        const username = s(req.body.username)
        const email    = s(req.body.email).toLowerCase()
        const password = req.body.password || ''

        // ── Validation ──────────────────────────────────────
        if (!username || !email || !password) {
            return res.render('register', {
                error: 'All fields are required', user: null, currentPage: 'register'
            })
        }

        if (password.length < 6) {
            return res.render('register', {
                error: 'Password must be at least 6 characters', user: null, currentPage: 'register'
            })
        }

        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            return res.render('register', {
                error: 'Username must be 3-20 chars (letters, numbers, underscores)',
                user: null, currentPage: 'register'
            })
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.render('register', {
                error: 'Invalid email address', user: null, currentPage: 'register'
            })
        }

        // ── Check username / email uniqueness ────────────────
        const dupCheck = await pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE LOWER(username) = LOWER($1)) AS username_count,
                COUNT(*) FILTER (WHERE LOWER(email)    = LOWER($2)) AS email_count
             FROM users`,
            [username, email]
        )

        if (parseInt(dupCheck.rows[0].username_count) > 0) {
            return res.render('register', {
                error: 'Username already exists', user: null, currentPage: 'register'
            })
        }

        if (parseInt(dupCheck.rows[0].email_count) > 0) {
            return res.render('register', {
                error: 'Email already exists', user: null, currentPage: 'register'
            })
        }

        // ── Hash password & insert ───────────────────────────
        const passwordHash = await bcrypt.hash(password, 10)

        const result = await pool.query(
            `INSERT INTO users
                (username, email, password_hash, role, points, created_at, updated_at)
             VALUES ($1, $2, $3, 'user', 0, NOW(), NOW())
             RETURNING id, username, email, role, points`,
            [username, email, passwordHash]
        )

        const newUser = result.rows[0]

        // ── Create session ───────────────────────────────────
        req.session.regenerate((err) => {

            if (err) {
                console.error(err)
                return res.redirect('/login')
            }

            req.session.user = {
                id:       newUser.id,
                username: newUser.username,
                email:    newUser.email,
                role:     newUser.role,
                points:   newUser.points
            }

            res.redirect('/dashboard')
        })

    } catch (error) {
        console.error('Register error:', error)
        res.render('register', {
            error: 'Registration failed. Please try again.',
            user: null, currentPage: 'register'
        })
    }
})


// ==========================================
// LOGIN USER
// ==========================================

router.post('/login', async (req, res) => {

    try {

        const username = (req.body.username || '').trim()
        const password = req.body.password || ''

        if (!username || !password) {
            return res.render('login', {
                error: 'Username and password are required', user: null, currentPage: 'login'
            })
        }

        // ── Find user ────────────────────────────────────────
        const result = await pool.query(
            `SELECT id, username, email, password_hash, role, points
             FROM users
             WHERE username = $1`,
            [username]
        )

        const user = result.rows[0]

        if (!user) {
            return res.render('login', {
                error: 'Invalid username or password', user: null, currentPage: 'login'
            })
        }

        // ── Verify password ──────────────────────────────────
        const validPassword = await bcrypt.compare(password, user.password_hash)

        if (!validPassword) {
            return res.render('login', {
                error: 'Invalid username or password', user: null, currentPage: 'login'
            })
        }

        // ── Create session ───────────────────────────────────
        req.session.regenerate((err) => {

            if (err) {
                console.error(err)
                return res.redirect('/login')
            }

            req.session.user = {
                id:       user.id,
                username: user.username,
                email:    user.email,
                role:     user.role,
                points:   user.points
            }

            if (user.role === 'admin') return res.redirect('/admin/dashboard')

            res.redirect('/dashboard')
        })

    } catch (error) {
        console.error('Login error:', error)
        res.render('login', {
            error: 'Login failed. Please try again.', user: null, currentPage: 'login'
        })
    }
})


// ==========================================
// LOGOUT
// ==========================================

router.get('/logout', (req, res) => {

    req.session.destroy((err) => {

        if (err) console.error(err)

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        res.clearCookie('connect.sid')
        res.redirect('/')
    })
})


module.exports = router