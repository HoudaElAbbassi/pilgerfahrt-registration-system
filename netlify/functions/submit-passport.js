// ===== DATEI 1: netlify/functions/submit-passport.js =====
const { Pool } = require('pg');

// Neon Database Connection
const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

exports.handler = async (event, context) => {
    // CORS Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: '',
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        // Parse multipart form data
        const boundary = event.headers['content-type'].split('boundary=')[1];
        const parts = parseMultipartForm(event.body, boundary);

        // Extract form fields
        const formData = {};
        const images = {};

        parts.forEach(part => {
            if (part.filename) {
                // This is a file
                images[part.name] = {
                    filename: part.filename,
                    data: part.data,
                    contentType: part.contentType
                };
            } else {
                // This is a text field
                formData[part.name] = part.data;
            }
        });

        // Convert images to base64 for database storage
        const passportImageBase64 = images['passport-image'] ?
            Buffer.from(images['passport-image'].data, 'binary').toString('base64') : null;
        const documentImageBase64 = images['document-image'] ?
            Buffer.from(images['document-image'].data, 'binary').toString('base64') : null;

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

        const result = await pool.query(query, values);

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
        console.error('Database error:', error);
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

// Helper function to parse multipart form data
function parseMultipartForm(body, boundary) {
    const parts = [];
    const bodyBuffer = Buffer.from(body, 'binary');
    const boundaryBuffer = Buffer.from(`--${boundary}`);

    let start = 0;
    let end = bodyBuffer.indexOf(boundaryBuffer, start);

    while (end !== -1) {
        if (start !== 0) {
            const part = bodyBuffer.slice(start, end);
            const parsed = parsePart(part);
            if (parsed) parts.push(parsed);
        }

        start = end + boundaryBuffer.length;
        end = bodyBuffer.indexOf(boundaryBuffer, start);
    }

    return parts;
}

function parsePart(part) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) return null;

    const headers = part.slice(0, headerEnd).toString();
    const data = part.slice(headerEnd + 4, part.length - 2); // Remove trailing \r\n

    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    const contentTypeMatch = headers.match(/Content-Type: ([^\r\n]+)/);

    if (!nameMatch) return null;

    return {
        name: nameMatch[1],
        filename: filenameMatch ? filenameMatch[1] : null,
        contentType: contentTypeMatch ? contentTypeMatch[1] : 'text/plain',
        data: filenameMatch ? data : data.toString()
    };
}




