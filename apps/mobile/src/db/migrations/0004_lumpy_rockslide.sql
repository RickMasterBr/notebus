CREATE TABLE `trip_date` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`trip_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_date_official_key_unique` ON `trip_date` (`official_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `trip_date_trip_date` ON `trip_date` (`trip_id`,`date`);