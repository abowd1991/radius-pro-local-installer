-- Plans are the authoritative concurrency policy for generated cards.
UPDATE radius_cards c
INNER JOIN plans p ON p.id = c.planId
SET c.simultaneousUse = COALESCE(p.simultaneousUse, 1);

--> statement-breakpoint

UPDATE radcheck rc
INNER JOIN radius_cards c ON c.username = rc.username
SET rc.value = CAST(COALESCE(c.simultaneousUse, 1) AS CHAR)
WHERE rc.attribute = 'Simultaneous-Use';

--> statement-breakpoint

UPDATE radreply rr
INNER JOIN radius_cards c ON c.username = rr.username
SET rr.value = CAST(COALESCE(c.simultaneousUse, 1) AS CHAR)
WHERE rr.attribute = 'Port-Limit';
