/**
 * seed-challenges.js
 * ------------------
 * Run once to migrate challenges.json → PostgreSQL challenges table.
 *
 * Usage:
 *   node seed-challenges.js
 *
 * Make sure your .env file has DATABASE_URL or the individual
 * DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME variables
 * set before running.
 */

require('dotenv').config()
const pool = require('./config/db')   // reuse your existing pool

const challenges = [
    {
        id: '0c2ff69b-14c8-484a-aac5-263e233ba8b0',
        title: 'SQL Injection 101',
        description: 'A basic login form is vulnerable to SQL injection. Can you bypass the authentication?\n\nThe login page accepts username and password. Try to think like an attacker.',
        category: 'Web',
        difficulty: 'easy',
        points: 100,
        flag: 'CTF{sql_1nj3ct10n_b4s1cs}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 2,
        created_at: '2026-05-11T11:13:25.351Z'
    },
    {
        "id": "b1d9a2c3-9f2d-4c91-ae12-7c4f9a991abc",
        "title": "Base64 Puzzle",
        "description": "Someone encoded a secret message multiple times using Base64.\n\nCan you decode it back to the original flag?",
        "category": "Crypto",
        "difficulty": "medium",
        "points": 200,
        "flag": "CTF{base64_is_not_encryption}",
        "flag_hint": "Try decoding more than once",
        "enabled": true,
        "solves": 0,
        "created_at": "2026-05-14T10:35:00.000Z"
    },
    {
        id: '935f93ac-76c1-4e2d-9874-e147d86ac656',
        title: "Caesar's Revenge",
        description: 'Decrypt the following ciphertext: "Fdhvduflvhdvblqwkhiluvw". The key is 3. This is a classic substitution cipher.',
        category: 'Crypto',
        difficulty: 'easy',
        points: 150,
        flag: 'CTF{caesaris_easy_inthe_first}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 1,
        created_at: '2026-05-11T11:13:25.351Z'
    },
    {
        id: 'b477b942-003e-4cbe-98c8-8cb9ea2085c6',
        title: 'Hidden in Plain Sight',
        description: 'Download the image and look closely. Sometimes the answer is hiding in the metadata or encoded in the pixels.\nExtract the hidden message from the provided file.',
        category: 'Forensics',
        difficulty: 'medium',
        points: 200,
        flag: 'CTF{st3g0n0graphy_1s_c00l}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 0,
        created_at: '2026-05-11T11:13:25.351Z'
    },
    {
        id: 'a61b681b-7fea-48c1-9f27-36c486255db3',
        title: 'Buffer Overflow Basics',
        description: 'A simple C program has a buffer overflow vulnerability. Read the source code and exploit it to print the flag.\nThe program reads 200 bytes into a 64-byte buffer.',
        category: 'Pwn',
        difficulty: 'hard',
        points: 350,
        flag: 'CTF{b0f_m4st3r_2024}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 0,
        created_at: '2026-05-11T11:13:25.351Z'
    },
    {
        id: 'b86bbd52-9c0d-40a9-912f-bc3d852d613d',
        title: 'XSS Reflected',
        description: 'A search page reflects user input without sanitization. Craft a payload that triggers a JavaScript alert.\nProve the vulnerability exists.',
        category: 'Web',
        difficulty: 'medium',
        points: 200,
        flag: 'CTF{xss_reflect3d_2024}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 0,
        created_at: '2026-05-11T11:13:25.351Z'
    },
    {
        id: '36d071c0-6c69-4765-bb38-05f6f218f5f5',
        title: 'Reverse the Binary',
        description: 'A stripped binary needs to be reverse engineered. Find the correct password that makes the program print the flag.\nUse a disassembler to analyze the executable.',
        category: 'Reverse',
        difficulty: 'hard',
        points: 400,
        flag: 'CTF{r3v3rs3_3ng1n33r1ng}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 0,
        created_at: '2026-05-11T11:13:25.351Z'
    },
    {
        id: 'cce432e1-37f0-4a89-b685-92c09d4389b9',
        title: 'RSA Oracle',
        description: 'An RSA encryption oracle gives you the encrypted flag. The public key is (n=3233, e=17). Find the private key and decrypt the message.\nHint: n is very small for this challenge.',
        category: 'Crypto',
        difficulty: 'medium',
        points: 250,
        flag: 'CTF{rsa_brut3f0rc3}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 0,
        created_at: '2026-05-11T11:13:25.351Z'
    },
    {
        id: '9d968b7b-d685-44bf-be10-d6e2fc167a1a',
        title: 'Command Injection',
        description: "A web application pings an IP address you provide. It doesn't sanitize the input properly. Can you execute arbitrary commands?\nTry to read /etc/passwd or list the directory.",
        category: 'Web',
        difficulty: 'medium',
        points: 250,
        flag: 'CTF{cmd_1nj3ct10n_2024}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 0,
        created_at: '2026-05-11T11:13:25.351Z'
    },
    {
        id: '57e6759f-8f6f-4470-bcec-e84caae27dbb',
        title: 'Packet Detective',
        description: 'A pcap file is provided containing network traffic. Find the flag hidden in the packets.\nLook for unusual data in the TCP streams.',
        category: 'Forensics',
        difficulty: 'medium',
        points: 200,
        flag: 'CTF{p4ck3t_sn1ff3r}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 0,
        created_at: '2026-05-11T11:13:25.351Z'
    },
    {
        id: 'a41a5b13-2d79-4ac7-bf58-b41d3b3666c9',
        title: 'Hash Collision',
        description: 'Find two different inputs that produce the same MD5 hash starting with "0e". This is a PHP type juggling vulnerability.\nThe provided code uses loose comparison (==).',
        category: 'Web',
        difficulty: 'hard',
        points: 350,
        flag: 'CTF{php_typ3_juggling}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 0,
        created_at: '2026-05-11T11:13:25.351Z'
    },
    {
        id: '3dfe7344-c835-4c86-8fc2-da8ac277c5e3',
        title: 'Binary Exploitation 101',
        description: 'A simple format string vulnerability exists in the binary. Use %x and %n to read and write memory.\nLeak the stack cookie and bypass NX protection.',
        category: 'Pwn',
        difficulty: 'insane',
        points: 500,
        flag: 'CTF{f0rm4t_str1ng_m4st3r}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 0,
        created_at: '2026-05-11T11:13:25.351Z'
    },
    {
        id: '71932838-0154-4cb5-a2b7-7ecad0ec268e',
        title: 'Morse Code Madness',
        description: 'Decode the following Morse code: "-.-. - ..-. -- ----- .-. ... ...--"',
        category: 'Misc',
        difficulty: 'easy',
        points: 50,
        flag: 'CTF{m0rs3_c0d3}',
        flag_hint: 'CTF{...}',
        enabled: true,
        solves: 0,
        created_at: '2026-05-11T11:13:25.351Z'
    }
]

async function seed() {

    const client = await pool.connect()

    try {

        console.log('🔌 Connected to database.')
        console.log(`📦 Seeding ${challenges.length} challenges...\n`)

        // ── Step 1: get the admin user's ID to use as author_id ──────────────────
        const adminResult = await client.query(
            `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
        )

        if (adminResult.rows.length === 0) {
            console.error('❌  No admin user found in the users table.')
            console.error('    Create an admin account first, then re-run this script.')
            process.exit(1)
        }

        const adminId = adminResult.rows[0].id
        console.log(`✅  Using admin ID: ${adminId}\n`)

        await client.query('BEGIN')

        let inserted = 0
        let skipped = 0

        for (const ch of challenges) {

            // ON CONFLICT DO NOTHING — safe to re-run without duplicating rows
            const result = await client.query(
                `INSERT INTO challenges
           (id, title, description, category, difficulty, points,
            flag, flag_hint, author_id, enabled, solves, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         ON CONFLICT (id) DO NOTHING`,
                [
                    ch.id,
                    ch.title,
                    ch.description,
                    ch.category,
                    ch.difficulty,
                    ch.points,
                    ch.flag,
                    ch.flag_hint,
                    adminId,
                    ch.enabled,
                    ch.solves,
                    ch.created_at
                ]
            )

            if (result.rowCount > 0) {
                console.log(`  ✅  Inserted: ${ch.title}`)
                inserted++
            } else {
                console.log(`  ⏭️   Skipped (already exists): ${ch.title}`)
                skipped++
            }
        }

        await client.query('COMMIT')

        console.log('\n─────────────────────────────────────')
        console.log(`✅  Done! Inserted: ${inserted}  |  Skipped: ${skipped}`)
        console.log('─────────────────────────────────────')

    } catch (error) {

        await client.query('ROLLBACK')
        console.error('\n❌  Seed failed — transaction rolled back.')
        console.error(error.message)
        process.exit(1)

    } finally {
        client.release()
        await pool.end()
    }
}

seed()