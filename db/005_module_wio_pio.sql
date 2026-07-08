-- =====================================================================
-- 005 — WIO/PIO HUB (S4) MODULE SEEDS
-- Modules own their configuration (docs/foundation.md). No DDL here —
-- the module runs entirely on foundation structures.
-- =====================================================================

INSERT INTO portal.app_config (key, value, category, description) VALUES
  ('wio.departments',
   '["ARCH", "3D", "INTERIOR", "FFE", "DRAFTING", "STAGING", "SITE", "FACTORY"]',
   'delivery',
   'Brief §30: the departments that receive WIOs. Values are Department Master codes — routing is still FK-enforced against public.departments.'),
  ('pio.factory_days', '45', 'delivery',
   'Brief §29: the factory clock — days from PIO initiation to target completion.')
ON CONFLICT (key) DO NOTHING;
