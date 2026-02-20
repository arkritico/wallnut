-- Pricing Database Schema
-- Stores construction prices from geradordeprecos.info

-- Main prices table
CREATE TABLE IF NOT EXISTS pricing_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE, -- NAF010, EEI015, etc.
  description TEXT NOT NULL,
  category VARCHAR(200) NOT NULL, -- Isolamentos Térmicos, etc.
  unit VARCHAR(10) NOT NULL, -- m2, m, Ud, kg
  total_cost DECIMAL(10,2) NOT NULL,
  is_rehab BOOLEAN DEFAULT false,
  region VARCHAR(50) DEFAULT 'Lisboa', -- Lisboa, Porto, etc.

  -- Metadata
  url TEXT,
  source VARCHAR(100) DEFAULT 'geradordeprecos.info',
  scraped_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 1,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Breakdown components table
CREATE TABLE IF NOT EXISTS pricing_components (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  price_id UUID REFERENCES pricing_items(id) ON DELETE CASCADE,

  component_code VARCHAR(50) NOT NULL, -- mt16aaa040b, mo054
  component_type VARCHAR(20) NOT NULL, -- material, labor, equipment
  description TEXT NOT NULL,

  quantity DECIMAL(10,3) NOT NULL,
  unit VARCHAR(10) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Price history (track changes over time)
CREATE TABLE IF NOT EXISTS pricing_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  price_code VARCHAR(20) NOT NULL,

  old_total_cost DECIMAL(10,2),
  new_total_cost DECIMAL(10,2),
  change_percent DECIMAL(5,2),

  changed_at TIMESTAMP DEFAULT NOW(),
  version INTEGER NOT NULL
);

-- Scraping jobs log
CREATE TABLE IF NOT EXISTS pricing_scraping_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  status VARCHAR(20) NOT NULL, -- running, completed, failed
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  total_items INTEGER DEFAULT 0,
  total_components INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,

  triggered_by VARCHAR(50), -- 'manual', 'cron', 'github-action'
  vpn_used BOOLEAN DEFAULT false,

  logs JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_pricing_items_code ON pricing_items(code);
CREATE INDEX idx_pricing_items_category ON pricing_items(category);
CREATE INDEX idx_pricing_items_region ON pricing_items(region);
CREATE INDEX idx_pricing_components_price_id ON pricing_components(price_id);
CREATE INDEX idx_pricing_components_type ON pricing_components(component_type);
CREATE INDEX idx_pricing_history_code ON pricing_history(price_code);

-- RLS Policies (Read: public, Write: authenticated only)
ALTER TABLE pricing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_scraping_jobs ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access" ON pricing_items FOR SELECT USING (true);
CREATE POLICY "Allow public read components" ON pricing_components FOR SELECT USING (true);
CREATE POLICY "Allow public read history" ON pricing_history FOR SELECT USING (true);

-- Only authenticated users can insert/update
CREATE POLICY "Allow authenticated insert" ON pricing_items FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update" ON pricing_items FOR UPDATE USING (auth.role() = 'authenticated');

-- View for easy querying with components
CREATE OR REPLACE VIEW pricing_items_with_breakdown AS
SELECT
  p.id,
  p.code,
  p.description,
  p.category,
  p.unit,
  p.total_cost,
  p.region,
  p.scraped_at,
  p.version,
  json_agg(
    json_build_object(
      'code', c.component_code,
      'type', c.component_type,
      'description', c.description,
      'quantity', c.quantity,
      'unit', c.unit,
      'unit_price', c.unit_price,
      'total', c.total
    )
  ) FILTER (WHERE c.id IS NOT NULL) as components
FROM pricing_items p
LEFT JOIN pricing_components c ON p.id = c.price_id
GROUP BY p.id, p.code, p.description, p.category, p.unit, p.total_cost, p.region, p.scraped_at, p.version;

-- Function to update price and track history
CREATE OR REPLACE FUNCTION update_price_with_history(
  p_code VARCHAR(20),
  p_new_cost DECIMAL(10,2),
  p_version INTEGER
) RETURNS VOID AS $$
DECLARE
  v_old_cost DECIMAL(10,2);
  v_change_percent DECIMAL(5,2);
BEGIN
  -- Get old cost
  SELECT total_cost INTO v_old_cost FROM pricing_items WHERE code = p_code;

  -- Calculate change
  IF v_old_cost IS NOT NULL AND v_old_cost > 0 THEN
    v_change_percent := ((p_new_cost - v_old_cost) / v_old_cost) * 100;

    -- Insert into history
    INSERT INTO pricing_history (price_code, old_total_cost, new_total_cost, change_percent, version)
    VALUES (p_code, v_old_cost, p_new_cost, v_change_percent, p_version);
  END IF;

  -- Update price
  UPDATE pricing_items
  SET total_cost = p_new_cost,
      version = p_version,
      updated_at = NOW()
  WHERE code = p_code;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE pricing_items IS 'Construction prices from geradordeprecos.info';
COMMENT ON TABLE pricing_components IS 'Detailed breakdown of each price (materials, labor, equipment)';
COMMENT ON TABLE pricing_history IS 'Historical price changes for tracking inflation/trends';
COMMENT ON TABLE pricing_scraping_jobs IS 'Log of all scraping operations';
