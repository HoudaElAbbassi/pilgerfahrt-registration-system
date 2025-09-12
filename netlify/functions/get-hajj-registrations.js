// netlify/functions/get-hajj-registrations.js
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

exports.handler = async (event, context) => {
    console.log('=== GET HAJJ REGISTRATIONS START ===');

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
        // Parse query parameters
        const queryParams = event.queryStringParameters || {};
        const includeImages = queryParams.includeImages === 'true';
        const limit = parseInt(queryParams.limit) || 100;
        const offset = parseInt(queryParams.offset) || 0;

        console.log('Query params:', { includeImages, limit, offset });

        // Build query based on whether images are requested
        let query = '';
        let values = [limit, offset];

        if (includeImages) {
            // Include images (slower but complete data)
            query = `
                SELECT
                    id, vorname, nachname, email, telefon, geburtsdatum, nationalitaet,
                    passart, passnummer, passgueltigkeit, nusuk_registriert,
                    passport_copy, passport_photo, aufenthaltstitel_image,
                    passport_copy_filename, passport_photo_filename, aufenthaltstitel_filename,
                    passport_copy_mimetype, passport_photo_mimetype, aufenthaltstitel_mimetype,
                    created_at, updated_at
                FROM hajj_registrations
                ORDER BY created_at DESC
                    LIMIT $1 OFFSET $2
            `;
        } else {
            // Basic data without images (faster)
            query = `
                SELECT 
                    id, vorname, nachname, email, telefon, geburtsdatum, nationalitaet,
                    passart, passnummer, passgueltigkeit, nusuk_registriert,
                    passport_copy_filename, passport_photo_filename, aufenthaltstitel_filename,
                    passport_copy_mimetype, passport_photo_mimetype, aufenthaltstitel_mimetype,
                    CASE WHEN passport_copy IS NOT NULL THEN true ELSE false END as has_passport_copy,
                    CASE WHEN passport_photo IS NOT NULL THEN true ELSE false END as has_passport_photo,
                    CASE WHEN aufenthaltstitel_image IS NOT NULL THEN true ELSE false END as has_aufenthaltstitel,
                    created_at, updated_at
                FROM hajj_registrations 
                ORDER BY created_at DESC
                LIMIT $1 OFFSET $2
            `;
        }

        console.log('Executing query...');
        const result = await pool.query(query, values);

        // Get total count
        const countResult = await pool.query('SELECT COUNT(*) as total FROM hajj_registrations');
        const totalCount = parseInt(countResult.rows[0].total);

        console.log(`Found ${result.rows.length} registrations (${totalCount} total)`);

        // Process the results
        const registrations = result.rows.map(row => ({
            ...row,
            // Convert dates to ISO strings for better JSON handling
            created_at: row.created_at ? row.created_at.toISOString() : null,
            updated_at: row.updated_at ? row.updated_at.toISOString() : null,
            geburtsdatum: row.geburtsdatum ? row.geburtsdatum.toISOString().split('T')[0] : null,
            passgueltigkeit: row.passgueltigkeit ? row.passgueltigkeit.toISOString().split('T')[0] : null,

            // Add null values for images if not included
            ...(!includeImages && {
                passport_copy: null,
                passport_photo: null,
                aufenthaltstitel_image: null
            })
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
                pagination: {
                    limit,
                    offset,
                    count: registrations.length,
                    total: totalCount,
                    hasMore: offset + limit < totalCount
                },
                includeImages
            }),
        };

    } catch (error) {
        console.error('Database error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Failed to fetch Hajj registrations',
                details: error.message
            }),
        };
    }
};