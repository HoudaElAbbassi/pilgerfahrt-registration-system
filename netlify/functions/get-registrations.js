// netlify/functions/get-registrations.js - OPTIMIZED VERSION
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

exports.handler = async (event, context) => {
    console.log('=== OPTIMIZED GET REGISTRATIONS START ===');

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
        const limit = parseInt(queryParams.limit) || 50;
        const offset = parseInt(queryParams.offset) || 0;

        console.log('Query params:', { includeImages, limit, offset });

        // First, get basic registrations without images (fast query)
        let query = `
            SELECT 
                id, vorname, nachname, telefon, passnummer, 
                gueltigkeit, ausstellungsort,
                passport_image_filename, document_image_filename,
                CASE WHEN passport_image IS NOT NULL THEN true ELSE false END as has_passport_image,
                CASE WHEN document_image IS NOT NULL THEN true ELSE false END as has_document_image,
                created_at, updated_at
            FROM passport_registrations 
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
        `;

        let values = [limit, offset];

        // If images are specifically requested, include them (slower query)
        if (includeImages) {
            query = `
                SELECT 
                    id, vorname, nachname, telefon, passnummer, 
                    gueltigkeit, ausstellungsort,
                    passport_image, document_image,
                    passport_image_filename, document_image_filename,
                    created_at, updated_at
                FROM passport_registrations 
                ORDER BY created_at DESC
                LIMIT $1 OFFSET $2
            `;
        }

        console.log('Executing query...');
        const result = await pool.query(query, values);

        // Get total count
        const countResult = await pool.query('SELECT COUNT(*) as total FROM passport_registrations');
        const totalCount = parseInt(countResult.rows[0].total);

        console.log(`Found ${result.rows.length} registrations (${totalCount} total)`);

        // Process the results
        const registrations = result.rows.map(row => ({
            ...row,
            // Convert dates to ISO strings for better JSON handling
            created_at: row.created_at.toISOString(),
            updated_at: row.updated_at.toISOString(),
            gueltigkeit: row.gueltigkeit.toISOString().split('T')[0], // Just date part

            // Add image indicators if not including full images
            ...(!includeImages && {
                passport_image: null,
                document_image: null
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
                error: 'Failed to fetch registrations',
                details: error.message
            }),
        };
    }
};