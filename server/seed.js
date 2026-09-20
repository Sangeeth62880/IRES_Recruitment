/**
 * Database Seed Script — Supabase Postgres
 * Seeds sample SpaceUp Vol 8 registrations via the Supabase client.
 *
 * Usage: node seed.js
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

require('dotenv').config();
const supabase = require('./supabaseClient');

const dummy = [
  { name: 'Adithya K', email: 'adithya@cusat.ac.in', phone: '9876543210', institution: 'CUSAT', utr_number: '123456789012', fee_tier: 'early_bird', verified: true, screenshot_storage_path: null },
  { name: 'Riya Sen', email: 'riya.sen@iitb.ac.in', phone: '9876543211', institution: 'IIT Bombay', utr_number: '987654321098', fee_tier: 'regular', verified: false, screenshot_storage_path: null },
  { name: 'Muhammed Shafi', email: 'shafi@nitc.ac.in', phone: '9876543212', institution: 'NIT Calicut', utr_number: '456789123456', fee_tier: 'early_bird', verified: false, screenshot_storage_path: null },
  { name: 'Anjali Nair', email: 'anjali@cusat.ac.in', phone: '9876543213', institution: 'CUSAT', utr_number: '789123456789', fee_tier: 'regular', verified: true, screenshot_storage_path: null },
  { name: 'Devika P', email: 'devika@cet.ac.in', phone: '9876543214', institution: 'CET Trivandrum', utr_number: '111222333444', fee_tier: 'early_bird', verified: false, screenshot_storage_path: null },
  { name: 'Sanjay Kumar', email: 'sanjay@isro.gov.in', phone: '9876543215', institution: 'ISRO', utr_number: '555666777888', fee_tier: 'regular', verified: true, screenshot_storage_path: null }
];

async function seed() {
  try {
    // Clear existing registrations
    const { error: deleteError } = await supabase
      .from('registrations')
      .delete()
      .neq('id', 0); // delete all rows (neq id 0 matches everything since IDENTITY starts at 1)

    if (deleteError) throw deleteError;
    console.log('Cleared existing registrations.');

    // Insert dummy data
    const { error: insertError } = await supabase
      .from('registrations')
      .insert(dummy);

    if (insertError) throw insertError;
    console.log('Seeded 6 dummy registrations successfully!');
  } catch (err) {
    console.error('Failed to seed database:', err);
    process.exit(1);
  }
}

seed();
