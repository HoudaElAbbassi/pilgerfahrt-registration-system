// netlify/functions/submit-hajj-registration.js
const { Pool } = require('pg');
const Busboy = require('busboy');

const pool = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

exports.handler = async (event, context) => {
    console.log('=== HAJJ REGISTRATION FUNCTION START ===');

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
        const formData = await parseMultipartData(event);

        console.log('Form fields received:', Object.keys(formData.fields));
        console.log('Files received:', Object.keys(formData.files));

        // Validate required fields
        const requiredFields = [
            'vorname', 'nachname', 'email', 'telefon', 'geburtsdatum',
            'nationalitaet', 'passart', 'passnummer', 'passgueltigkeit',
            'nusuk_registriert'
        ];

        const missingFields = requiredFields.filter(field => !formData.fields[field]);

        if (missingFields.length > 0) {
            console.log('Missing required fields:', missingFields);
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

        // Validate email format
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(formData.fields.email)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Invalid email format',
                    email: formData.fields.email
                }),
            };
        }

        // Validate age (must be 18+)
        const birthDate = new Date(formData.fields.geburtsdatum);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        if (age < 18) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Applicant must be at least 18 years old',
                    age: age
                }),
            };
        }

        // Validate passport validity (should be at least 6 months in future)
        const passportExpiry = new Date(formData.fields.passgueltigkeit);
        const sixMonthsFromNow = new Date();
        sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

        if (passportExpiry < sixMonthsFromNow) {
            console.log('Warning: Passport expires within 6 months');
        }

        // Check if Aufenthaltstitel is required
        const isAufenthaltstitelRequired = formData.fields.passart === 'auslaendisch';

        // Validate required files
        const requiredFiles = ['passport-copy', 'passport-photo'];
        if (isAufenthaltstitelRequired) {
            requiredFiles.push('aufenthaltstitel-image');
        }

        // Filter out empty/invalid files
        const validFiles = {};
        Object.entries(formData.files).forEach(([key, fileData]) => {
            // Only include files that have actual content and valid filename
            if (fileData.data && fileData.data.length > 0 && fileData.filename && fileData.filename !== 'undefined') {
                validFiles[key] = fileData;
            }
        });

        const missingFiles = requiredFiles.filter(fileName => !validFiles[fileName]);

        if (missingFiles.length > 0) {
            console.log('Missing required files:', missingFiles);
            console.log('Valid files found:', Object.keys(validFiles));
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Missing required files',
                    missingFiles,
                    receivedFiles: Object.keys(formData.files),
                    validFiles: Object.keys(validFiles),
                    passartRequirement: `Aufenthaltstitel ${isAufenthaltstitelRequired ? 'required' : 'not required'} for passart: ${formData.fields.passart}`
                }),
            };
        }

        // Validate file sizes and types (only for valid files)
        const maxFileSize = 10 * 1024 * 1024; // 10MB
        const allowedMimeTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
            'image/webp', 'application/pdf'
        ];

        for (const [fileName, fileData] of Object.entries(validFiles)) {
            if (fileData.data.length > maxFileSize) {
                const sizeMB = (fileData.data.length / (1024 * 1024)).toFixed(2);
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        error: `File too large: ${fileName}`,
                        fileName,
                        size: `${sizeMB}MB`,
                        maxSize: '10MB'
                    }),
                };
            }

            if (!allowedMimeTypes.includes(fileData.mimeType)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        error: `Invalid file type: ${fileName}`,
                        fileName,
                        receivedType: fileData.mimeType,
                        allowedTypes: allowedMimeTypes
                    }),
                };
            }
        }

        // Process files for database storage (only valid files)
        const passportCopy = validFiles['passport-copy'];
        const passportPhoto = validFiles['passport-photo'];
        const aufenthaltstitel = validFiles['aufenthaltstitel-image']; // Will be undefined if not provided

        const passportCopyBase64 = passportCopy ?
            passportCopy.data.toString('base64') : null;
        const passportPhotoBase64 = passportPhoto ?
            passportPhoto.data.toString('base64') : null;
        const aufenthaltstitelBase64 = aufenthaltstitel ?
            aufenthaltstitel.data.toString('base64') : null;

        console.log('File processing completed');
        console.log('- Passport Copy:', passportCopy?.filename, `(${(passportCopy?.data.length / 1024).toFixed(1)}KB)`);
        console.log('- Passport Photo:', passportPhoto?.filename, `(${(passportPhoto?.data.length / 1024).toFixed(1)}KB)`);
        console.log('- Aufenthaltstitel:', aufenthaltstitel?.filename || 'Not provided', aufenthaltstitel ? `(${(aufenthaltstitel?.data.length / 1024).toFixed(1)}KB)` : '');

        // Insert into database
        const query = `
            INSERT INTO hajj_registrations (
                vorname, nachname, email, telefon, geburtsdatum, nationalitaet,
                passart, passnummer, passgueltigkeit, nusuk_registriert,
                passport_copy, passport_photo, aufenthaltstitel_image,
                passport_copy_filename, passport_photo_filename, aufenthaltstitel_filename,
                passport_copy_mimetype, passport_photo_mimetype, aufenthaltstitel_mimetype,
                created_at
            ) VALUES (
                         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                         $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
                     )
                RETURNING id;
        `;

        const values = [
            formData.fields.vorname,
            formData.fields.nachname,
            formData.fields.email,
            formData.fields.telefon,
            formData.fields.geburtsdatum,
            formData.fields.nationalitaet,
            formData.fields.passart,
            formData.fields.passnummer,
            formData.fields.passgueltigkeit,
            formData.fields.nusuk_registriert,
            passportCopyBase64,
            passportPhotoBase64,
            aufenthaltstitelBase64,
            passportCopy?.filename || null,
            passportPhoto?.filename || null,
            aufenthaltstitel?.filename || null,
            passportCopy?.mimeType || null,
            passportPhoto?.mimeType || null,
            aufenthaltstitel?.mimeType || null
        ];

        console.log('Inserting into database...');
        const result = await pool.query(query, values);

        console.log('Database insert successful, ID:', result.rows[0].id);

        // Log registration details for monitoring
        console.log('Registration Summary:');
        console.log('- ID:', result.rows[0].id);
        console.log('- Name:', `${formData.fields.vorname} ${formData.fields.nachname}`);
        console.log('- Email:', formData.fields.email);
        console.log('- Nationality:', formData.fields.nationalitaet);
        console.log('- Passport Type:', formData.fields.passart);
        console.log('- Nusuk Registered:', formData.fields.nusuk_registriert);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                id: result.rows[0].id,
                message: 'Hajj registration submitted successfully!',
                details: {
                    name: `${formData.fields.vorname} ${formData.fields.nachname}`,
                    email: formData.fields.email,
                    passportType: formData.fields.passart,
                    filesUploaded: Object.keys(formData.files).length
                }
            }),
        };

    } catch (error) {
        console.error('Hajj registration error:', error);
        console.error('Error stack:', error.stack);

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Failed to process Hajj registration',
                details: error.message
            }),
        };
    }
};

// Enhanced multipart form parser with file type detection
function parseMultipartData(event) {
    return new Promise((resolve, reject) => {
        const fields = {};
        const files = {};

        try {
            const bb = Busboy({
                headers: {
                    'content-type': event.headers['content-type']
                },
                limits: {
                    fileSize: 10 * 1024 * 1024, // 10MB limit per file
                    files: 5, // Max 5 files
                    fields: 50 // Max 50 form fields
                }
            });

            // Handle form fields
            bb.on('field', (fieldname, val) => {
                console.log('Field received:', fieldname, '=', val.substring(0, 100) + (val.length > 100 ? '...' : ''));
                fields[fieldname] = val;
            });

            // Handle file uploads
            bb.on('file', (fieldname, file, info) => {
                console.log('File upload started:', fieldname, '- Filename:', info.filename, '- MIME:', info.mimeType);

                const chunks = [];

                file.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                file.on('end', () => {
                    const fileBuffer = Buffer.concat(chunks);
                    files[fieldname] = {
                        filename: info.filename,
                        encoding: info.encoding,
                        mimeType: info.mimeType,
                        data: fileBuffer
                    };
                    console.log(`File processed: ${fieldname} - ${info.filename} (${fileBuffer.length} bytes, ${info.mimeType})`);
                });

                file.on('error', (error) => {
                    console.error(`File upload error for ${fieldname}:`, error);
                    reject(error);
                });
            });

            // Handle completion
            bb.on('finish', () => {
                console.log('Multipart parsing completed');
                console.log('Fields received:', Object.keys(fields).length);
                console.log('Files received:', Object.keys(files).length);
                resolve({ fields, files });
            });

            // Handle errors
            bb.on('error', (error) => {
                console.error('Busboy parsing error:', error);
                reject(error);
            });

            // Parse the request body
            const bodyBuffer = Buffer.from(event.body, 'base64');
            console.log('Parsing multipart data, body size:', bodyBuffer.length, 'bytes');

            bb.end(bodyBuffer);

        } catch (error) {
            console.error('Multipart setup error:', error);
            reject(error);
        }
    });
}