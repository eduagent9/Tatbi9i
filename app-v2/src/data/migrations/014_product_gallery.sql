CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_data_uri TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_product_images_product_position
  ON product_images(product_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_one_primary
  ON product_images(product_id) WHERE is_primary = 1;
INSERT INTO product_images (id, product_id, image_data_uri, position, is_primary, created_at)
SELECT 'legacy-image-' || id, id, image_data_uri, 0, 1, COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
FROM products WHERE image_data_uri IS NOT NULL AND length(image_data_uri) > 0
AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = products.id);
