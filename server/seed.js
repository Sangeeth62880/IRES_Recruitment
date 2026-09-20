const db = require('./db');

// Sample realistic dummy registration data for SpaceUp Vol 8
const dummy = [
  { name: 'Adithya K', email: 'adithya@cusat.ac.in', phone: '9876543210', institution: 'CUSAT', utr: '123456789012', fee_tier: 'early_bird', verified: 1, screenshot: null },
  { name: 'Riya Sen', email: 'riya.sen@iitb.ac.in', phone: '9876543211', institution: 'IIT Bombay', utr: '987654321098', fee_tier: 'regular', verified: 0, screenshot: null },
  { name: 'Muhammed Shafi', email: 'shafi@nitc.ac.in', phone: '9876543212', institution: 'NIT Calicut', utr: '456789123456', fee_tier: 'early_bird', verified: 0, screenshot: null },
  { name: 'Anjali Nair', email: 'anjali@cusat.ac.in', phone: '9876543213', institution: 'CUSAT', utr: '789123456789', fee_tier: 'regular', verified: 1, screenshot: null },
  { name: 'Devika P', email: 'devika@cet.ac.in', phone: '9876543214', institution: 'CET Trivandrum', utr: '111222333444', fee_tier: 'early_bird', verified: 0, screenshot: null },
  { name: 'Sanjay Kumar', email: 'sanjay@isro.gov.in', phone: '9876543215', institution: 'ISRO', utr: '555666777888', fee_tier: 'regular', verified: 1, screenshot: null }
];

// Clean existing data and seed
try {
  db.prepare('DELETE FROM registrations').run();
  console.log('Cleared existing registrations.');

  const insert = db.prepare(`
    INSERT INTO registrations (name, email, phone, institution, utr_number, fee_tier, screenshot_path, verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const row of dummy) {
      insert.run(row.name, row.email, row.phone, row.institution, row.utr, row.fee_tier, row.screenshot, row.verified);
    }
  })();

  console.log('Seeded 6 dummy registrations successfully!');
} catch (err) {
  console.error('Failed to seed database:', err);
}
