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

