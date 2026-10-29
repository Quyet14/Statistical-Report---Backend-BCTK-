-- Run once against an EXISTING database, after backup and with app workers stopped.
-- MySQL DDL commits implicitly; test on a restored copy first.
-- Existing sessions and pending OTPs are intentionally invalidated by this release.
ALTER TABLE users ADD COLUMN tokenVersion INT NOT NULL DEFAULT 0;
ALTER TABLE otp_tokens MODIFY COLUMN otp VARCHAR(64) NOT NULL;
DELETE FROM otp_tokens;
CREATE UNIQUE INDEX UQ_otp_email_purpose ON otp_tokens (email, purpose);
