ALTER TABLE `management_vpn_sessions` DROP INDEX `management_vpn_virtual_target_uniq`;
CREATE INDEX `management_vpn_virtual_target_idx` ON `management_vpn_sessions` (`nasId`,`virtualTargetIp`);
