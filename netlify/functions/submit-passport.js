// netlify/functions/submit-passport.js - FIXED VERSION
const { Pool } = require('pg');

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
        let formData = {};
        let images = {};

        // Check if it's multipart form data
        const contentType = event.headers['content-type'] || '';

        if (contentType.includes('multipart/form-data')) {
            console.log('Parsing multipart form data...');

            // Get boundary
            const boundary = contentType.split('boundary=')[1];
            if (!boundary) {
                throw new Error('No boundary found in multipart data');
            }

            console.log('Boundary:', boundary);

            // Parse multipart data
            const parts = parseMultipartForm(event.body, boundary);
            console.log('Parsed parts:', parts.length);

            parts.forEach(part => {
                console.log('Part:', part.name, part.filename ? '(file)' : '(text)');
                if (part.filename) {
                    images[part.name] = {
                        filename: part.filename,
                        data: part.data,
                        contentType: part.contentType
                    };
                } else {
                    formData[part.name] = part.data;
                }
            });

        } else if (contentType.includes('application/json')) {
            // Handle JSON data
            const body = JSON.parse(event.body);
            formData = body;

        } else {
            // Handle URL encoded data
            const params = new URLSearchParams(event.body);
            for (const [key, value] of params) {
                formData[key] = value;
            }
        }

        console.log('Form data keys:', Object.keys(formData));
        console.log('Image keys:', Object.keys(images));

        // Validate required fields
        const requiredFields = ['vorname', 'nachname', 'telefon', 'passnummer', 'gueltigkeit', 'ausstellungsort'];
        const missingFields = requiredFields.filter(field => !formData[field]);

        if (missingFields.length > 0) {
            console.log('Missing fields:', missingFields);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Missing required fields',
                    missingFields,
                    receivedFields: Object.keys(formData),
                    debug: {
                        contentType,
                        bodyPreview: event.body?.substring(0, 200)
                    }
                }),
            };
        }

        // Convert images to base64 if present
        const passportImageBase64 = images['passport-image'] ?
            Buffer.from(images['passport-image'].data, 'binary').toString('base64') : null;
        const documentImageBase64 = images['document-image'] ?
            Buffer.from(images['document-image'].data, 'binary').toString('base64') : null;

        console.log('Inserting into database...');

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
            formData.vorname,
            formData.nachname,
            formData.telefon,
            formData.passnummer,
            formData.gueltigkeit,
            formData.ausstellungsort,
            passportImageBase64,
            documentImageBase64,
            images['passport-image']?.filename,
            images['document-image']?.filename
        ];

        console.log('Query values (without images):', values.slice(0, 6));

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
                debug: {
                    errorMessage: error.message,
                    errorCode: error.code,
                    contentType: event.headers['content-type']
                }
            }),
        };
    }
};

// Improved multipart form parsing
function parseMultipartForm(body, boundary) {
    const parts = [];

    try {
        // Convert body to buffer if it's not already
        const bodyBuffer = typeof body === 'string' ? Buffer.from(body, 'binary') : body;
        const boundaryBuffer = Buffer.from(`--${boundary}`);

        // Split by boundary
        const sections = [];
        let start = 0;
        let boundaryIndex = bodyBuffer.indexOf(boundaryBuffer);

        while (boundaryIndex !== -1) {
            if (start !== boundaryIndex) {
                sections.push(bodyBuffer.slice(start, boundaryIndex));
            }
            start = boundaryIndex + boundaryBuffer.length;
            boundaryIndex = bodyBuffer.indexOf(boundaryBuffer, start);
        }

        // Parse each section
        for (const section of sections) {
            if (section.length < 10) continue; // Skip empty sections

            const part = parsePart(section);
            if (part) {
                parts.push(part);
            }
        }

    } catch (error) {
        console.error('Multipart parsing error:', error);
    }

    return parts;
}

function parsePart(part) {
    try {
        // Find header/body separator
        const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
        if (headerEnd === -1) return null;

        const headers = part.slice(0, headerEnd).toString();
        const data = part.slice(headerEnd + 4);

        // Remove trailing boundary markers
        let cleanData = data;
        if (cleanData.length > 2 && cleanData.slice(-2).equals(Buffer.from('\r\n'))) {
            cleanData = cleanData.slice(0, -2);
        }

        // Extract field name
        const nameMatch = headers.match(/name="([^"]+)"/);
        if (!nameMatch) return null;

        const name = nameMatch[1];
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);

        return {
            name,
            filename: filenameMatch ? filenameMatch[1] : null,
            contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'text/plain',
            data: filenameMatch ? cleanData : cleanData.toString('utf8')
        };

    } catch (error) {
        console.error('Part parsing error:', error);
        return null;
    }
}