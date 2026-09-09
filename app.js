// app.js - Main application entry point

import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import unitRoutes from './src/routes/units.js';
import customerRoutes from './src/routes/customers.js';
import rentalRoutes from './src/routes/rentals.js';
import { checkAndNotifyLateRentals } from './src/lateNotifier.js';

const app = express();
const PORT = process.env.PORT || 3002;
const __dirname = path.resolve();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Business info used to fill the Lessor side of the printed agreement
app.get('/api/config', (req, res) => {
  res.json({
    BUSINESS_NAME: process.env.BUSINESS_NAME,
    BUSINESS_ABN: process.env.BUSINESS_ABN,
    ADDRESS: process.env.ADDRESS,
    WEBSITE: process.env.WEBSITE,
    EMAIL: process.env.EMAIL,
    PHONE: process.env.PHONE,
  });
});

app.use('/api/units', unitRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/rentals', rentalRoutes);

// Static pages
const page = (name) => (req, res) => res.sendFile(path.join(__dirname, 'views', `${name}.html`));
app.get('/', page('index'));
app.get('/inventory', page('inventory'));
app.get('/customers', page('customers'));
app.get('/new-rental', page('new-rental'));
app.get('/rental-detail', page('rental-detail'));
app.get('/unit-detail', page('unit-detail'));
app.get('/rental-history', page('rental-history'));
app.get('/print-agreement', page('print-agreement'));

app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Periodically check for rentals that just became overdue and notify the
// portal - see src/lateNotifier.js. Runs once at startup, then on an
// interval; failures are logged but never affect the app itself.
const LATE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
function runLateCheck() {
  checkAndNotifyLateRentals().catch((error) => console.error('Late rental check failed:', error));
}
runLateCheck();
setInterval(runLateCheck, LATE_CHECK_INTERVAL_MS);
