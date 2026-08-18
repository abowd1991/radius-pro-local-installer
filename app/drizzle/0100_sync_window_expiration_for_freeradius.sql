-- FreeRADIUS parses Expiration using the VPS local process timezone.
-- Keep every started card's RADIUS expiration aligned with its V2 window.
UPDATE radcheck rc
INNER JOIN radius_cards c ON c.username = rc.username
SET rc.value = DATE_FORMAT(c.windowEndTime, '%b %d %Y %H:%i:%s')
WHERE rc.attribute = 'Expiration'
  AND c.windowEndTime IS NOT NULL
  AND c.status IN ('active', 'unused');
