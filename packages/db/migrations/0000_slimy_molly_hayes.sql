CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text,
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_tenant_created_idx` ON `audit_logs` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_account_user_id_idx` ON `auth_account` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_session_token_unique` ON `auth_session` (`token`);--> statement-breakpoint
CREATE INDEX `auth_session_user_id_idx` ON `auth_session` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_user_email_unique` ON `auth_user` (`email`);--> statement-breakpoint
CREATE TABLE `auth_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verification_identifier_idx` ON `auth_verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `couple_accesses` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`token` text NOT NULL,
	`passcode_hash` text NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`terms_agreed_at` integer,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `couple_accesses_token_unique` ON `couple_accesses` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `couple_accesses_active_tenant_idx` ON `couple_accesses` (`tenant_id`) WHERE "couple_accesses"."revoked_at" IS NULL;--> statement-breakpoint
CREATE TABLE `course_menu_images` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_menu_images_tenant_sort_idx` ON `course_menu_images` (`tenant_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`nickname` text,
	`nickname_key` text,
	`terms_agreed_at` integer,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guests_tenant_nickname_key_idx` ON `guests` (`tenant_id`,`nickname_key`);--> statement-breakpoint
CREATE TABLE `join_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `join_tokens_token_unique` ON `join_tokens` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `join_tokens_active_tenant_idx` ON `join_tokens` (`tenant_id`) WHERE "join_tokens"."revoked_at" IS NULL;--> statement-breakpoint
CREATE TABLE `likes` (
	`photo_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`photo_id`, `guest_id`),
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `likes_guest_photo_idx` ON `likes` (`guest_id`,`photo_id`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`original_key` text NOT NULL,
	`display_key` text NOT NULL,
	`thumb_key` text NOT NULL,
	`original_content_type` text NOT NULL,
	`stored_size_bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_timeline_idx` ON `photos` (`tenant_id`,"created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX `photos_ranking_idx` ON `photos` (`tenant_id`,"like_count" DESC,"created_at" ASC);--> statement-breakpoint
CREATE INDEX `photos_guest_idx` ON `photos` (`guest_id`,"created_at" DESC);--> statement-breakpoint
CREATE TABLE `seating_charts` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`event_date` text NOT NULL,
	`suspended` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`data_deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `tenants_event_date_idx` ON `tenants` (`event_date`);--> statement-breakpoint
CREATE TABLE `visitor_sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`kind` text NOT NULL,
	`guest_id` text,
	`couple_access_id` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`couple_access_id`) REFERENCES `couple_accesses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "visitor_sessions_kind_check" CHECK("visitor_sessions"."kind" IN ('guest', 'couple'))
);
--> statement-breakpoint
CREATE INDEX `visitor_sessions_couple_access_idx` ON `visitor_sessions` (`couple_access_id`);