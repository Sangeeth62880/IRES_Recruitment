const db = require('./db');

// Sample realistic dummy registration data
const dummy = [
  { name: 'Adithya K', department: 'CSE', year: '3rd Year', utr: '123456789012', verified: 1, screenshot: null },
  { name: 'Riya Sen', department: 'ECE', year: '2nd Year', utr: '987654321098', verified: 0, screenshot: null },
  { name: 'Muhammed Shafi', department: 'ME', year: '1st Year', utr: '456789123456', verified: 0, screenshot: null },
  { name: 'Anjali Nair', department: 'CSE', year: '4th Year', utr: '789123456789', verified: 1, screenshot: null },
  { name: 'Devika P', department: 'S&H', year: '1st Year', utr: '111222333444', verified: 0, screenshot: null },
  { name: 'Sanjay Kumar', department: 'EEE', year: '3rd Year', utr: '555666777888', verified: 1, screenshot: null }
];

// Clean existing data and seed
try {
  db.prepare('DELETE FROM registrations').run();
  console.log('Cleared existing registrations.');

  const insert = db.prepare(`
    INSERT INTO registrations (name, department, year, team_selected, email, phone, utr_number, screenshot_path, verified)
    VALUES (?, ?, ?, 'General', null, null, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const row of dummy) {
      insert.run(row.name, row.department, row.year, row.utr, row.screenshot, row.verified);
    }
  })();

  console.log('Seeded 6 dummy registrations successfully!');
} catch (err) {
  console.error('Failed to seed database:', err);
}
