ALTER TABLE `photos` ADD `upload_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `photos_upload_key_idx` ON `photos` (`guest_id`,`upload_key`);