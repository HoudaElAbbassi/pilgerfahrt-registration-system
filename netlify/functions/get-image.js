// netlify/functions/get-image.js - Separate Image Loading
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

exports.handler = async (event, context) => {
    console.log('=== GET IMAGE FUNCTION START ===');

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
        const queryParams = event.queryStringParameters || {};
        const { id, type } = queryParams; // id=1&type=passport or type=document

        if (!id || !type) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing id or type parameter' }),
            };
        }

        console.log(`Getting ${type} image for registration ${id}`);

        // Query specific image
        let columnName = type === 'passport' ? 'passport_image' : 'document_image';
        let filenameColumn = type === 'passport' ? 'passport_image_filename' : 'document_image_filename';

        const query = `
            SELECT ${columnName} as image_data, ${filenameColumn} as filename
            FROM passport_registrations 
            WHERE id = $1
        `;

        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Registration not found' }),
            };
        }

        const row = result.rows[0];

        if (!row.image_data) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Image not found' }),
            };
        }

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                imageData: row.image_data,
                filename: row.filename,
                type
            }),
        };

    } catch (error) {
        console.error('Get image error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Failed to get image',
                details: error.message
            }),
        };
    }
};