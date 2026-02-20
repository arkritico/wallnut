-- Rename CYPE tables to generic pricing nomenclature
-- This migration handles existing deployments that used the old names

-- Rename tables (IF EXISTS to handle fresh installs where new names already exist)
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'cype_prices') THEN
    ALTER TABLE cype_prices RENAME TO pricing_items;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'cype_price_components') THEN
    ALTER TABLE cype_price_components RENAME TO pricing_components;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'cype_price_history') THEN
    ALTER TABLE cype_price_history RENAME TO pricing_history;
  END IF;
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'cype_scraping_jobs') THEN
    ALTER TABLE cype_scraping_jobs RENAME TO pricing_scraping_jobs;
  END IF;
END $$;

-- Drop old view and recreate with new name
DROP VIEW IF EXISTS cype_prices_with_breakdown;
CREATE OR REPLACE VIEW pricing_items_with_breakdown AS
SELECT
  p.id, p.code, p.description, p.category, p.unit, p.total_cost,
  p.region, p.scraped_at, p.version,
  json_agg(
    json_build_object(
      'code', c.component_code, 'type', c.component_type,
      'description', c.description, 'quantity', c.quantity,
      'unit', c.unit, 'unit_price', c.unit_price, 'total', c.total
    )
  ) FILTER (WHERE c.id IS NOT NULL) as components
FROM pricing_items p
LEFT JOIN pricing_components c ON p.id = c.price_id
GROUP BY p.id, p.code, p.description, p.category, p.unit, p.total_cost, p.region, p.scraped_at, p.version;

-- Rename function
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_proc WHERE proname = 'update_cype_price_with_history') THEN
    ALTER FUNCTION update_cype_price_with_history(VARCHAR, DECIMAL, INTEGER) RENAME TO update_price_with_history;
  END IF;
END $$;

-- Rename indexes (IF EXISTS)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cype_prices_code') THEN
    ALTER INDEX idx_cype_prices_code RENAME TO idx_pricing_items_code;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cype_prices_category') THEN
    ALTER INDEX idx_cype_prices_category RENAME TO idx_pricing_items_category;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cype_prices_region') THEN
    ALTER INDEX idx_cype_prices_region RENAME TO idx_pricing_items_region;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cype_price_components_price_id') THEN
    ALTER INDEX idx_cype_price_components_price_id RENAME TO idx_pricing_components_price_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cype_price_components_type') THEN
    ALTER INDEX idx_cype_price_components_type RENAME TO idx_pricing_components_type;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cype_price_history_code') THEN
    ALTER INDEX idx_cype_price_history_code RENAME TO idx_pricing_history_code;
  END IF;
END $$;

-- Update table comments
COMMENT ON TABLE pricing_items IS 'Construction prices from geradordeprecos.info';
COMMENT ON TABLE pricing_components IS 'Detailed breakdown of each price (materials, labor, equipment)';
COMMENT ON TABLE pricing_history IS 'Historical price changes for tracking inflation/trends';
COMMENT ON TABLE pricing_scraping_jobs IS 'Log of all scraping operations';
