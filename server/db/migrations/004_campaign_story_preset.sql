INSERT INTO dimension_presets (slug, name, width, height, channel)
VALUES
  ('site-mobile-banner', 'Banner site mobile', 430, 600, 'site'),
  ('instagram-story-campaign', 'Story Instagram Campanha', 1080, 1920, 'instagram')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  channel = EXCLUDED.channel;
