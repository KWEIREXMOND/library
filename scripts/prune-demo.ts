import { pruneToDemoAccounts } from '../server/seed/prune.js';
import { all } from '../server/db.js';

// Keeps any real sign-ups alongside the four demo logins.
const extra = (process.env.KEEP_EMAILS ?? '')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);

console.log('Kept users before prune:', (await all<{ email: string; library_id: string }>(
  'SELECT email, library_id FROM users ORDER BY id'
)).length);
const kept = await pruneToDemoAccounts(extra);
console.log(`Kept ${kept} accounts.`);
console.table(await all('SELECT library_id, role, first_name, last_name, email, status FROM users ORDER BY id'));
