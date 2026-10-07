CREATE TABLE `alarm_event` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`alarm_id` text NOT NULL,
	`planned_at` integer NOT NULL,
	`service_date` text NOT NULL,
	`trip_id` text,
	`state` text NOT NULL,
	`skip_reason` text,
	`acted_at` integer,
	`snoozed_to` integer
);
--> statement-breakpoint
CREATE TABLE `departure_alarm` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`option_id` text NOT NULL,
	`anchor_trip_id` text NOT NULL,
	`anchor_base_minute` integer NOT NULL,
	`weekdays` text DEFAULT '[]' NOT NULL,
	`once_date` text,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`enabled` integer NOT NULL
);
