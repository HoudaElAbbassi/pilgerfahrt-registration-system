-- UPDATED Hajj Database Schema für Neon Database
-- Führe dieses SQL in deiner Neon Database aus

-- SCHRITT 1: Entferne alte Tabelle (falls vorhanden)
DROP TABLE IF EXISTS passport_registrations CASCADE;

-- SCHRITT 2: Erstelle neue Hajj Registrations Tabelle
CREATE TABLE IF NOT EXISTS hajj_registrations (
    id SERIAL PRIMARY KEY,
    
    -- Personal Information
    vorname VARCHAR(100) NOT NULL,
    nachname VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    telefon VARCHAR(20) NOT NULL,
    geburtsdatum DATE NOT NULL,
    nationalitaet VARCHAR(100) NOT NULL,
    
    -- Passport Information
    passart VARCHAR(50) NOT NULL, -- 'europaeisch', 'blau', 'auslaendisch'
    passnummer VARCHAR(50) NOT NULL,
    passgueltigkeit DATE NOT NULL,
    
    -- Nusuk Registration
    nusuk_registriert VARCHAR(10) NOT NULL, -- 'ja' or 'nein'
    
    -- Document Images (Base64 encoded)
    passport_copy TEXT, -- Base64 encoded passport copy
    passport_photo TEXT, -- Base64 encoded passport photo
    aufenthaltstitel_image TEXT, -- Base64 encoded Aufenthaltstitel (only for 'auslaendisch')
    
    -- File Metadata
    passport_copy_filename VARCHAR(255),
    passport_photo_filename VARCHAR(255),
    aufenthaltstitel_filename VARCHAR(255),
    
    -- MIME Types
    passport_copy_mimetype VARCHAR(100),
    passport_photo_mimetype VARCHAR(100),
    aufenthaltstitel_mimetype VARCHAR(100),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SCHRITT 3: Indexes für bessere Performance
CREATE INDEX IF NOT EXISTS idx_hajj_registrations_created_at
    ON hajj_registrations(created_at);

CREATE INDEX IF NOT EXISTS idx_hajj_registrations_email
    ON hajj_registrations(email);

CREATE INDEX IF NOT EXISTS idx_hajj_registrations_passnummer
    ON hajj_registrations(passnummer);

CREATE INDEX IF NOT EXISTS idx_hajj_registrations_passart
    ON hajj_registrations(passart);

CREATE INDEX IF NOT EXISTS idx_hajj_registrations_nationalitaet
    ON hajj_registrations(nationalitaet);

-- SCHRITT 4: Trigger function für updated_at
CREATE OR REPLACE FUNCTION update_hajj_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- SCHRITT 5: Trigger für updated_at
CREATE OR REPLACE TRIGGER update_hajj_registrations_updated_at
    BEFORE UPDATE ON hajj_registrations
    FOR EACH ROW EXECUTE FUNCTION update_hajj_updated_at_column();

-- SCHRITT 6: Optional - View für bessere Übersicht
CREATE OR REPLACE VIEW hajj_registrations_summary AS
SELECT 
    id,
    CONCAT(vorname, ' ', nachname) as full_name,
    email,
    telefon,
    nationalitaet,
    passart,
    passnummer,
    passgueltigkeit,
    nusuk_registriert,
    CASE 
        WHEN passport_copy IS NOT NULL THEN 'Yes' 
        ELSE 'No' 
    END as has_passport_copy,
    CASE 
        WHEN passport_photo IS NOT NULL THEN 'Yes' 
        ELSE 'No' 
    END as has_passport_photo,
    CASE 
        WHEN aufenthaltstitel_image IS NOT NULL THEN 'Yes' 
        ELSE 'No' 
    END as has_aufenthaltstitel,
    DATE(created_at) as registration_date,
    created_at
FROM hajj_registrations
ORDER BY created_at DESC;

-- SCHRITT 7: Optional - Statistiken View
CREATE OR REPLACE VIEW hajj_statistics AS
SELECT 
    COUNT(*) as total_registrations,
    COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as today_registrations,
    COUNT(*) FILTER (WHERE passart = 'europaeisch') as european_passports,
    COUNT(*) FILTER (WHERE passart = 'blau') as blue_documents,
    COUNT(*) FILTER (WHERE passart = 'auslaendisch') as foreign_passports,
    COUNT(*) FILTER (WHERE nusuk_registriert = 'ja') as nusuk_registered,
    COUNT(*) FILTER (WHERE passport_copy IS NOT NULL) as with_passport_copy,
    COUNT(*) FILTER (WHERE passport_photo IS NOT NULL) as with_passport_photo,
    COUNT(*) FILTER (WHERE aufenthaltstitel_image IS NOT NULL) as with_aufenthaltstitel
FROM hajj_registrations;

-- ERFOLG! Tabelle ist bereit für Hajj-Registrierungen
SELECT 'Hajj registrations table created successfully!' as status;
