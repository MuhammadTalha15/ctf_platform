const pool = require('./src/config/db')

async function testDB() {

    try {

        const result = await pool.query(
            'SELECT NOW()'
        )

        console.log('Database connected successfully!')

        console.log(result.rows)

    } catch (error) {

        console.error(error)
    }
}

testDB()