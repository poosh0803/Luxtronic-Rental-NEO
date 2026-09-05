-- Demo seed data — placeholder units for the two supported equipment types.
-- Replace/extend via the Inventory page once real stock is entered.

INSERT INTO units (type, label, specs, serial_number, accessories, estimate_value)
VALUES (
  'desktop',
  'Demo Desktop 01',
  '{"cpu": "Intel i5-12600KF", "motherboard": "MSI B760M-A WiFi DDR5", "ram": "32GB DDR5", "ssd1": "1TB NVMe SSD", "ssd2": "N/A", "gpu": "RTX 4060 8GB", "psu": "650W", "case": "Mid Tower ATX"}'::jsonb,
  'DEMO-DESK-0001',
  'Power Cable',
  2100.00
);

INSERT INTO units (type, label, specs, serial_number, accessories, estimate_value)
VALUES (
  'laptop',
  'Demo Laptop 01',
  '{"brand_model": "Dell Latitude 5430", "cpu": "Intel i5-1235U", "ram": "16GB", "storage": "512GB NVMe SSD", "screen": "14 inch FHD"}'::jsonb,
  'DEMO-LAP-0001',
  'Charger',
  900.00
);
