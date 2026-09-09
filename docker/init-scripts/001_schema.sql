-- Rental inventory units (desktops and laptops)
CREATE TABLE units (
  id SERIAL PRIMARY KEY,
  type VARCHAR(10) NOT NULL CHECK (type IN ('desktop', 'laptop')),
  label VARCHAR(100) NOT NULL,
  specs JSONB NOT NULL DEFAULT '{}',
  serial_number VARCHAR(100),
  accessories TEXT,
  estimate_value NUMERIC(10, 2),
  manual_status VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (manual_status IN ('none', 'in_repair', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reusable customer profiles
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30),
  address VARCHAR(255),
  email VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_name ON customers (full_name);
CREATE INDEX idx_customers_phone ON customers (phone);

-- Rental transactions: one unit, one customer, one period
CREATE TABLE rentals (
  id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units (id),
  customer_id INTEGER NOT NULL REFERENCES customers (id),
  start_date DATE NOT NULL,
  due_date DATE NOT NULL,
  returned_at TIMESTAMPTZ,
  rental_fee NUMERIC(10, 2),
  fee_frequency VARCHAR(10) CHECK (fee_frequency IN ('day', 'week', 'month')),
  -- Actual amount agreed with the customer, when it differs from
  -- rental_fee x period (e.g. a manual discount). NULL means "no override,
  -- use the rate as-is".
  final_fee NUMERIC(10, 2),
  security_bond NUMERIC(10, 2),
  accessories_included TEXT,
  notes TEXT,
  -- Set once an overdue notification has been pushed to the portal for
  -- this rental, so the background check doesn't re-notify every cycle.
  -- Reset to NULL whenever due_date changes, so a new due date can trigger
  -- its own notification later if it too passes unreturned.
  late_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rentals_unit ON rentals (unit_id);
CREATE INDEX idx_rentals_customer ON rentals (customer_id);
-- Fast lookup of the open rental (if any) for a unit
CREATE INDEX idx_rentals_open ON rentals (unit_id) WHERE returned_at IS NULL;

-- Condition photos captured at checkout and return
CREATE TABLE rental_photos (
  id SERIAL PRIMARY KEY,
  rental_id INTEGER NOT NULL REFERENCES rentals (id) ON DELETE CASCADE,
  stage VARCHAR(10) NOT NULL CHECK (stage IN ('checkout', 'return')),
  file_path VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rental_photos_rental ON rental_photos (rental_id);
