require('dotenv').config()

const { Pool } = require('pg')

// Create PostgreSQL connection pool
const pool = new Pool({

    host: process.env.DB_HOST,

    port: process.env.DB_PORT,

    user: process.env.DB_USER,

    password: process.env.DB_PASSWORD,

    database: process.env.DB_NAME
})

// Export pool
module.exports = pool