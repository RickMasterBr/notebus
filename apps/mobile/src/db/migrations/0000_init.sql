CREATE TABLE `dataset` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`network_id` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`imported_at` integer NOT NULL,
	`checksum` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `date_override` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`network_id` text NOT NULL,
	`date` text NOT NULL,
	`day_type_id` text NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `date_override_official_key_unique` ON `date_override` (`official_key`);--> statement-breakpoint
CREATE TABLE `day_type` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`network_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_type_official_key_unique` ON `day_type` (`official_key`);--> statement-breakpoint
CREATE TABLE `frequency` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`pattern_id` text NOT NULL,
	`ref_pattern_stop_id` text NOT NULL,
	`from_minute` integer NOT NULL,
	`to_minute` integer NOT NULL,
	`headway_minutes` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `frequency_official_key_unique` ON `frequency` (`official_key`);--> statement-breakpoint
CREATE TABLE `frequency_day_type` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`frequency_id` text NOT NULL,
	`day_type_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `frequency_day_type_official_key_unique` ON `frequency_day_type` (`official_key`);--> statement-breakpoint
CREATE TABLE `holiday` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`network_id` text NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`scope` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holiday_official_key_unique` ON `holiday` (`official_key`);--> statement-breakpoint
CREATE TABLE `line` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`network_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `line_official_key_unique` ON `line` (`official_key`);--> statement-breakpoint
CREATE TABLE `network` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`name` text NOT NULL,
	`timezone` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `network_official_key_unique` ON `network` (`official_key`);--> statement-breakpoint
CREATE TABLE `observation` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`stop_id` text NOT NULL,
	`line_id` text NOT NULL,
	`observed_at` integer NOT NULL,
	`observed_end_at` integer,
	`kind` text NOT NULL,
	`mode` text NOT NULL,
	`ride_id` text,
	`note` text,
	`recorded_at` integer NOT NULL,
	`gps_lat` real,
	`gps_lon` real,
	`gps_accuracy_m` real,
	`service_date` text,
	`service_minute` integer,
	`pattern_stop_id` text,
	`trip_id` text,
	`match_status` text,
	`deviation_min` real,
	`match_rule_version` integer,
	`review_dismissed_at` integer
);
--> statement-breakpoint
CREATE TABLE `option` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`route_id` text NOT NULL,
	`kind` text NOT NULL,
	`board_pattern_stop_id` text,
	`alight_pattern_stop_id` text,
	`walk_minutes` integer,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pattern` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`line_id` text NOT NULL,
	`label` text NOT NULL,
	`is_circular` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pattern_official_key_unique` ON `pattern` (`official_key`);--> statement-breakpoint
CREATE TABLE `pattern_stop` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`pattern_id` text NOT NULL,
	`position` integer NOT NULL,
	`stop_id` text NOT NULL,
	`is_timepoint` integer DEFAULT false NOT NULL,
	`timepoint_label` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pattern_stop_official_key_unique` ON `pattern_stop` (`official_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `pattern_stop_pattern_position` ON `pattern_stop` (`pattern_id`,`position`);--> statement-breakpoint
CREATE TABLE `place` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`lat` real,
	`lon` real,
	`is_shortcut` integer DEFAULT false NOT NULL,
	`shortcut_order` integer
);
--> statement-breakpoint
CREATE TABLE `ride` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`boarding_observation_id` text NOT NULL,
	`alighting_observation_id` text,
	`trip_id` text,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `route` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`origin_place_id` text NOT NULL,
	`destination_place_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `season` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`network_id` text NOT NULL,
	`name` text NOT NULL,
	`start_md` text NOT NULL,
	`end_md` text NOT NULL,
	`mode` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `season_official_key_unique` ON `season` (`official_key`);--> statement-breakpoint
CREATE TABLE `setting` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `setting_key_unique` ON `setting` (`key`);--> statement-breakpoint
CREATE TABLE `stop` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`network_id` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`external_id` text,
	`lat` real,
	`lon` real,
	`note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stop_official_key_unique` ON `stop` (`official_key`);--> statement-breakpoint
CREATE TABLE `stop_time` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`trip_id` text NOT NULL,
	`pattern_stop_id` text NOT NULL,
	`service_minute` integer NOT NULL,
	`origin` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stop_time_official_key_unique` ON `stop_time` (`official_key`);--> statement-breakpoint
CREATE TABLE `timetable` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`pattern_id` text NOT NULL,
	`dataset_id` text,
	`valid_from` text NOT NULL,
	`valid_to` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timetable_official_key_unique` ON `timetable` (`official_key`);--> statement-breakpoint
CREATE TABLE `trip` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`timetable_id` text NOT NULL,
	`first_position` integer NOT NULL,
	`last_position` integer NOT NULL,
	`season_id` text,
	`frequency_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_official_key_unique` ON `trip` (`official_key`);--> statement-breakpoint
CREATE TABLE `trip_day_type` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`official_key` text,
	`trip_id` text NOT NULL,
	`day_type_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_day_type_official_key_unique` ON `trip_day_type` (`official_key`);--> statement-breakpoint
CREATE TABLE `walk_time` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`source` text NOT NULL,
	`stop_id` text NOT NULL,
	`place_id` text NOT NULL,
	`minutes_min` integer NOT NULL,
	`minutes_max` integer,
	`origin` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `walk_time_stop_place` ON `walk_time` (`stop_id`,`place_id`);