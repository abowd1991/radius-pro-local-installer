ALTER TABLE `port_forwardings`
  ADD COLUMN `accessMode` enum('restricted','public') NOT NULL DEFAULT 'restricted' AFTER `protocol`;
