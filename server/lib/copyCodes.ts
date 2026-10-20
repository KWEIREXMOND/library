import { get, scalar } from '../db.js';

/**
 * Allocate a unique barcode + accession number for a new physical copy.
 * Call inside a transaction to avoid races.
 */
export async function nextCopyCodes(prefix = 'ADT', year = String(new Date().getFullYear())) {
  let n = await scalar<number>('SELECT COALESCE(MAX(id), 0) FROM copies') + 1;
  for (let i = 0; i < 5000; i++) {
    const barcode = `${prefix}-${String(100000 + n + i)}`;
    if (!await get('SELECT id FROM copies WHERE barcode = ?', [barcode])) {
      let accession = `ACC-${year}-${String(n + i).padStart(4, '0')}`;
      if (await get('SELECT id FROM copies WHERE accession_no = ?', [accession])) {
        accession = `ACC-${year}-${String(n + i).padStart(4, '0')}-${Math.floor(Math.random() * 90 + 10)}`;
      }
      return { barcode, accession };
    }
  }
  throw new Error('Could not allocate a unique barcode — please try again.');
}
