ALTER TABLE `vpn_session_lifecycles`
  MODIFY COLUMN `closeReason` enum('normal','manual','disabled','lost_carrier','reprovisioned','unknown');
