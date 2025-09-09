// netlify/functions/get-registrations.js
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

exports.handler = async (event, context) => {
    console.log('=== GET REGISTRATIONS FUNCTION START ===');

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        console.log('Querying database for registrations...');

        // Query all registrations, ordered by most recent first
        const query = `
            SELECT 
                id, vorname, nachname, telefon, passnummer, 
                gueltigkeit, ausstellungsort, 
                passport_image, document_image,
                passport_image_filename, document_image_filename,
                created_at, updated_at
            FROM passport_registrations 
            ORDER BY created_at DESC
        `;

        const result = await pool.query(query);

        console.log(`Found ${result.rows.length} registrations`);

        // Process the results to handle base64 images
        const registrations = result.rows.map(row => ({
            ...row,
            // Convert dates to ISO strings for better JSON handling
            created_at: row.created_at.toISOString(),
            updated_at: row.updated_at.toISOString(),
            gueltigkeit: row.gueltigkeit.toISOString().split('T')[0] // Just date part
        }));

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                registrations,
                count: registrations.length
            }),
        };

    } catch (error) {
        console.error('Database error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Failed to fetch registrations',
                details: error.message
            }),
        };
    }
};