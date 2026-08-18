CREATE TABLE `radhuntgroup` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupname` varchar(64) NOT NULL,
	`nasipaddress` varchar(15) NOT NULL,
	`nasportid` varchar(15),
	CONSTRAINT `radhuntgroup_id` PRIMARY KEY(`id`)
);
