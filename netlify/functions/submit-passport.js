// netlify/functions/submit-passport.js - WORKING VERSION with Busboy
const { Pool } = require('pg');
const Busboy = require('busboy');

const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

exports.handler = async (event, context) => {
    console.log('=== FUNCTION START ===');
    console.log('HTTP Method:', event.httpMethod);
    console.log('Content-Type:', event.headers['content-type']);

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
        // Parse multipart form data with Busboy
        const formData = await parseMultipartData(event);

        console.log('Parsed form data keys:', Object.keys(formData.fields));
        console.log('Parsed files:', Object.keys(formData.files));

        // Validate required fields
        const requiredFields = ['vorname', 'nachname', 'telefon', 'passnummer', 'gueltigkeit', 'ausstellungsort'];
        const missingFields = requiredFields.filter(field => !formData.fields[field]);

        if (missingFields.length > 0) {
            console.log('Missing fields:', missingFields);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Missing required fields',
                    missingFields,
                    receivedFields: Object.keys(formData.fields)
                }),
            };
        }

        // Convert images to base64 if present
        const passportImage = formData.files['passport-image'];
        const documentImage = formData.files['document-image'];

        const passportImageBase64 = passportImage ?
            Buffer.from(passportImage.data).toString('base64') : null;
        const documentImageBase64 = documentImage ?
            Buffer.from(documentImage.data).toString('base64') : null;

        console.log('Has passport image:', !!passportImage);
        console.log('Has document image:', !!documentImage);

        // Insert into database
        const query = `
            INSERT INTO passport_registrations (
                vorname, nachname, telefon, passnummer, gueltigkeit,
                ausstellungsort, passport_image, document_image,
                passport_image_filename, document_image_filename,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
                RETURNING id;
        `;

        const values = [
            formData.fields.vorname,
            formData.fields.nachname,
            formData.fields.telefon,
            formData.fields.passnummer,
            formData.fields.gueltigkeit,
            formData.fields.ausstellungsort,
            passportImageBase64,
            documentImageBase64,
            passportImage?.filename,
            documentImage?.filename
        ];

        console.log('Inserting with values (first 6):', values.slice(0, 6));

        const result = await pool.query(query, values);

        console.log('Database insert successful, ID:', result.rows[0].id);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                id: result.rows[0].id,
                message: 'Daten erfolgreich gespeichert!'
            }),
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Fehler beim Speichern der Daten',
                details: error.message
            }),
        };
    }
};

// Parse multipart data using Busboy
function parseMultipartData(event) {
    return new Promise((resolve, reject) => {
        const fields = {};
        const files = {};

        try {
            // Create busboy instance
            const bb = Busboy({
                headers: {
                    'content-type': event.headers['content-type']
                }
            });

            // Handle form fields
            bb.on('field', (fieldname, val) => {
                console.log('Field received:', fieldname, '=', val);
                fields[fieldname] = val;
            });

            // Handle file uploads
            bb.on('file', (fieldname, file, info) => {
                console.log('File received:', fieldname, info);

                const chunks = [];

                file.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                file.on('end', () => {
                    files[fieldname] = {
                        filename: info.filename,
                        encoding: info.encoding,
                        mimeType: info.mimeType,
                        data: Buffer.concat(chunks)
                    };
                    console.log('File processed:', fieldname, 'size:', files[fieldname].data.length);
                });
            });

            // Handle completion
            bb.on('finish', () => {
                console.log('Busboy parsing completed');
                resolve({ fields, files });
            });

            // Handle errors
            bb.on('error', (error) => {
                console.error('Busboy error:', error);
                reject(error);
            });

            // Convert body to buffer and pipe to busboy
            const bodyBuffer = Buffer.from(event.body, 'base64');
            console.log('Body buffer size:', bodyBuffer.length);

            // Write buffer to busboy
            bb.end(bodyBuffer);

        } catch (error) {
            console.error('Busboy setup error:', error);
            reject(error);
        }
    });
}