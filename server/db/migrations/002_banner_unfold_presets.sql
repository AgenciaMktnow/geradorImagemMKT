ALTER TABLE dimension_presets
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_kind_check;
ALTER TABLE assets
  ADD CONSTRAINT assets_kind_check CHECK (kind IN ('model', 'product', 'banner', 'generated'));

ALTER TABLE generations
  ALTER COLUMN model_asset_id DROP NOT NULL;
