// Idempotent, additive schema upgrade. Never deletes OTPs or account records.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
async function main() {
  const envArg = process.argv.find(arg => arg.startsWith('--env='));
  const env = { ...dotenv.parse(fs.readFileSync(envArg ? envArg.slice(6) : '.env')), ...process.env };
  const connection = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_DATABASE || env.DB_NAME, connectTimeout: 10000 });
  try {
    await connection.query('SET SESSION lock_wait_timeout = 10');
    const [columns] = await connection.query("SELECT TABLE_NAME,COLUMN_NAME,CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('users','otp_tokens')");
    if (!columns.some(row => row.TABLE_NAME === 'users') || !columns.some(row => row.TABLE_NAME === 'otp_tokens')) throw new Error('Expected users/otp_tokens tables are missing');
    const [indexes] = await connection.query("SELECT INDEX_NAME,NON_UNIQUE,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS fields FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='otp_tokens' GROUP BY INDEX_NAME,NON_UNIQUE");
    const plan = [];
    if (!columns.some(row => row.TABLE_NAME === 'users' && row.COLUMN_NAME === 'tokenVersion')) plan.push('ALTER TABLE users ADD COLUMN tokenVersion INT NOT NULL DEFAULT 0');
    const otp = columns.find(row => row.TABLE_NAME === 'otp_tokens' && row.COLUMN_NAME === 'otp');
    if (!otp) throw new Error('OTP column is missing');
    if (Number(otp.CHARACTER_MAXIMUM_LENGTH) < 64) plan.push('ALTER TABLE otp_tokens MODIFY COLUMN otp VARCHAR(64) NOT NULL');
    if (!indexes.some(row => Number(row.NON_UNIQUE) === 0 && row.fields.split(',').sort().join(',') === 'email,purpose')) {
      const [duplicates] = await connection.query('SELECT COUNT(*) AS count FROM (SELECT 1 FROM otp_tokens GROUP BY email,purpose HAVING COUNT(*)>1) AS duplicate_groups');
      if (Number(duplicates[0].count)) throw new Error('Duplicate OTP groups need manual review; no data was deleted');
      plan.push('ALTER TABLE otp_tokens ADD UNIQUE INDEX UQ_otp_email_purpose (email,purpose), ALGORITHM=INPLACE, LOCK=NONE');
    }
    if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ ready: plan.length === 0, plan, applied: false })); return; }
    if (!plan.length) { console.log(JSON.stringify({ ready: true, applied: false, reason: 'Already up to date' })); return; }
    const backupDirectory = path.resolve('deploy/backups'); fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    const backup = { createdAt: new Date().toISOString(), tables: {}, plan, rollbackNotes: 'These changes are additive. Review schema before manually dropping new index/column; do not blindly replay CREATE TABLE.' };
    for (const table of ['users', 'otp_tokens']) { const [schema] = await connection.query(`SHOW CREATE TABLE \`${table}\``); backup.tables[table] = schema[0]['Create Table']; }
    const backupPath = path.join(backupDirectory, `security-schema-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), { flag: 'wx', mode: 0o600 });
    for (const statement of plan) await connection.query(statement);
    console.log(JSON.stringify({ ready: true, applied: true, statements: plan.length, schemaBackup: backupPath, recordsDeleted: 0 }));
  } finally { await connection.end(); }
}
main().catch(error => { console.error(JSON.stringify({ ready: false, code: error.code || 'PREFLIGHT_FAILED', message: error.code ? 'Database operation failed; inspect server logs without exposing credentials' : error.message })); process.exitCode = 1; });
