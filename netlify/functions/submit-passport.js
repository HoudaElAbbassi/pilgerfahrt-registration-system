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

// ===== DATEI 2: package.json =====
{
    "name": "netlify-passport-form",
    "version": "1.0.0",
    "description": "Passport registration form with database storage",
    "main": "index.js",
    "scripts": {
    "build": "echo 'No build step required'",
        "dev": "netlify dev"
},
    "dependencies": {
    "pg": "^8.11.3"
},
    "devDependencies": {
    "netlify-cli": "^17.0.0"
}
}

// ===== DATEI 3: netlify.toml =====
[build]
functions = "netlify/functions"
publish = "."

    [functions]
node_bundler = "esbuild"

    [[headers]]
for = "/api/*"
    [headers.values]
    Access-Control-Allow-Origin = "*"
Access-Control-Allow-Headers = "Content-Type"
Access-Control-Allow-Methods = "GET, POST, OPTIONS"

// ===== DATEI 4: database_schema.sql =====
-- Neon Database Schema
-- Führe dieses SQL in deiner Neon Database aus

CREATE TABLE IF NOT EXISTS passport_registrations (
    id SERIAL PRIMARY KEY,
    vorname VARCHAR(100) NOT NULL,
    nachname VARCHAR(100) NOT NULL,
    telefon VARCHAR(20) NOT NULL,
    passnummer VARCHAR(50) NOT NULL,
    gueltigkeit DATE NOT NULL,
    ausstellungsort VARCHAR(100) NOT NULL,
    passport_image TEXT, -- Base64 encoded image
document_image TEXT, -- Base64 encoded image
passport_image_filename VARCHAR(255),
    document_image_filename VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index für bessere Performance
CREATE INDEX IF NOT EXISTS idx_passport_registrations_created_at
ON passport_registrations(created_at);

CREATE INDEX IF NOT EXISTS idx_passport_registrations_passnummer
ON passport_registrations(passnummer);

-- Optional: Trigger für updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = CURRENT_TIMESTAMP;
RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_passport_registrations_updated_at
BEFORE UPDATE ON passport_registrations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

// ===== DATEI 5: .env.example =====
# Kopiere diese Datei zu .env und fülle deine Neon Database URL ein
NEON_DATABASE_URL=postgresql://username:password@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require

// ===== DATEI 6: Aktualisiertes HTML (nur Form-Teil) =====
// Ersetze das <script> Tag im HTML mit diesem:

<script>
    // Image preview functionality (bleibt gleich)
    function setupImagePreview(inputId, previewId, imgId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const img = document.getElementById(imgId);

    input.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
    img.src = e.target.result;
    preview.style.display = 'block';
};
    reader.readAsDataURL(file);
}
});
}

    setupImagePreview('passport-image', 'passport-preview', 'passport-img');
    setupImagePreview('document-image', 'document-preview', 'document-img');

    // Form submission handling - UPDATED für Database
    document.getElementById('passportForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const loading = document.getElementById('loading');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');

    successMessage.style.display = 'none';
    errorMessage.style.display = 'none';
    loading.style.display = 'block';

    // Create FormData object
    const formData = new FormData(this);

    // Submit to Netlify Function (nicht mehr direkt an Netlify Forms)
    fetch('/.netlify/functions/submit-passport', {
    method: 'POST',
    body: formData
})
    .then(response => response.json())
    .then(data => {
    loading.style.display = 'none';
    if (data.success) {
    successMessage.innerHTML = `✅ ${data.message} (ID: ${data.id})`;
    successMessage.style.display = 'block';
    this.reset();
    document.getElementById('passport-preview').style.display = 'none';
    document.getElementById('document-preview').style.display = 'none';
} else {
    throw new Error(data.error || 'Unbekannter Fehler');
}
})
    .catch(error => {
    loading.style.display = 'none';
    errorMessage.innerHTML = `❌ ${error.message}`;
    errorMessage.style.display = 'block';
    console.error('Error:', error);
});
});

    // Phone number formatting (bleibt gleich)
    document.getElementById('telefon').addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.startsWith('49')) {
    value = '+' + value;
} else if (value.startsWith('0')) {
    value = '+49' + value.substring(1);
}
    e.target.value = value;
});

    // Passport number formatting (bleibt gleich)
    document.getElementById('passnummer').addEventListener('input', function(e) {
    e.target.value = e.target.value.toUpperCase();
});
</script>