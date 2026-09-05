# Luxtronic Rental Tracker

## Project Summary

A LAN web app for Luxtronic's shop to track PC/laptop rentals — inventory, customers, checkout/return, overdue flagging — and print a pre-filled Rental Agreement contract instead of hand-typing one for every customer.

## Technologies Used

* **Frontend**: HTML, CSS, JavaScript (no build step)
* **Backend**: Node.js, Express.js
* **Database**: PostgreSQL
* **Other**: RESTful API, multer for condition-photo uploads

## Prerequisites

Before you begin, ensure you have the following installed:

* [Node.js](https://nodejs.org/) (v18.x or higher)
* [PostgreSQL](https://www.postgresql.org/) (v14.x or higher) or [Docker](https://www.docker.com/products/docker-desktop/) (recommended)

## Installation & Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

Start the PostgreSQL container:

```bash
cd docker
docker compose up -d
```

This also runs the schema and seed scripts in `docker/init-scripts/` automatically on first start, giving you two placeholder units (one desktop, one laptop) to try the app with.

You can connect with a database GUI (VS Code PostgreSQL extension, pgAdmin, TablePlus, etc.) using:

- Host: `localhost` or `127.0.0.1`
- Port: `5434`
- Username: `luxtronic_user`
- Password: `luxtronic_password`
- Database: `luxtronic_rental_db`

> **Note:** the compose file sets an explicit project `name` and a uniquely-named volume on purpose — do not remove them. Several other Luxtronic repos keep `docker-compose.yml` in a folder also named `docker` with no project name set, which makes Docker Compose default them all to the same shared volume unless each one is named distinctly.

### 3. Configure environment variables

```bash
cp .env.example .env
```

The defaults in `.env.example` already match the Docker setup above (DB port `5434`, etc.) and include the business details (name, ABN, address, phone, email) that get printed on the Lessor side of the rental agreement — update those if they ever change.

### 4. Start the application

Development mode (auto-restart on file changes):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

The app will be available at `http://localhost:3002` (or whatever `PORT` is set to in `.env`), and the console will log "✅ Database connection successful" once it can reach PostgreSQL.

## Project Structure

```
Luxtronic-Rental-NEO/
├── public/            # Static frontend assets (css, js, images)
├── views/             # HTML pages
├── src/
│   ├── routes/        # API routes (units, customers, rentals)
│   ├── utils/         # Shared helpers (e.g. unit status computation)
│   └── db.js          # PostgreSQL connection pool
├── docker/            # Docker Compose config & DB init scripts
├── uploads/           # Condition photos uploaded at checkout/return
├── ecosystem.config.cjs  # pm2 process config for deployment
└── app.js             # Main application file
```

## Features

* Inventory of desktop and laptop rental units, with flexible per-type specs
* Live unit status (Available / Rented Out / Overdue / In Repair / Retired) — double-booking a unit is blocked
* Reusable customer profiles, searchable by name or phone, with rental history
* Checkout flow with condition photos, return flow with condition photos and an overdue flag
* Dashboard showing what's currently out and anything overdue
* One-click print of a pre-filled Rental Agreement matching Luxtronic's contract, ready for the customer to sign on paper

## Deployment

This app is intended to run on the shop's LAN server under pm2 (`ecosystem.config.cjs`), updated the same way as Luxtronic's other in-house tools (git pull + `pm2 restart luxtronic-rental`).
