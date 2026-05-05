CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dimension_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  channel TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('model', 'product', 'generated')),
  original_name TEXT,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  model_asset_id UUID NOT NULL REFERENCES assets(id),
  prompt JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generation_products (
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  PRIMARY KEY (generation_id, asset_id)
);

CREATE TABLE IF NOT EXISTS generation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  preset_id UUID REFERENCES dimension_presets(id),
  asset_id UUID NOT NULL REFERENCES assets(id),
  kind TEXT NOT NULL CHECK (kind IN ('base', 'unfold')),
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('base_generation', 'unfold_generation')),
  preset_id UUID REFERENCES dimension_presets(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_user_project ON assets(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_generations_project ON generations(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);

INSERT INTO dimension_presets (slug, name, width, height, channel)
VALUES
  ('site-desktop-banner', 'Banner site desktop', 1920, 640, 'site'),
  ('site-mobile-banner', 'Banner site mobile', 1080, 1350, 'site'),
  ('instagram-story', 'Instagram story', 1080, 1920, 'instagram'),
  ('instagram-feed-square', 'Instagram feed quadrado', 1080, 1080, 'instagram'),
  ('instagram-feed-vertical', 'Instagram feed vertical', 1080, 1350, 'instagram'),
  ('google-display-faixa', 'Google display faixa', 1200, 628, 'google'),
  ('google-display-wide', 'Google display wide', 1600, 500, 'google')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  channel = EXCLUDED.channel;
