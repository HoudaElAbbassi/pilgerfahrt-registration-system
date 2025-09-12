// netlify/functions/delete-hajj-registration.js
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

exports.handler = async (event, context) => {
    console.log('=== DELETE HAJJ REGISTRATION FUNCTION START ===');

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        const { id } = JSON.parse(event.body);

        if (!id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Missing registration ID' }),
            };
        }

        console.log('Deleting Hajj registration with ID:', id);

        // Delete the registration from hajj_registrations table
        const query = 'DELETE FROM hajj_registrations WHERE id = $1 RETURNING id';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Hajj registration not found' }),
            };
        }

        console.log('Hajj registration deleted successfully:', result.rows[0].id);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Hajj registration deleted successfully',
                deletedId: result.rows[0].id
            }),
        };

    } catch (error) {
        console.error('Delete Hajj registration error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Failed to delete Hajj registration',
                details: error.message
            }),
        };
    }
};