ALTER TABLE permission_plans
  ADD COLUMN IF NOT EXISTS allowedMenuItems JSON NULL;

CREATE TABLE IF NOT EXISTS user_menu_item_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  menuPath VARCHAR(255) NOT NULL,
  isGranted BOOLEAN NOT NULL,
  createdBy INT NOT NULL,
  reason TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY user_menu_item_override_unique (userId, menuPath),
  KEY user_menu_item_override_user_idx (userId)
);
