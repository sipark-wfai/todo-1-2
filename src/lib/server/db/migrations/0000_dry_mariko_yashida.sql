CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "tags_name_len" CHECK(length(trim("tags"."name")) between 1 and 30)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tags_name_nocase` ON `tags` (lower("name"));--> statement-breakpoint
CREATE TABLE `task_tags` (
	`task_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`task_id`, `tag_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_task_tags_tag_id` ON `task_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`completed_at` integer,
	`due_date` integer,
	`priority` integer DEFAULT 2 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "tasks_title_len" CHECK(length(trim("tasks"."title")) between 1 and 200),
	CONSTRAINT "tasks_description_len" CHECK("tasks"."description" is null or length("tasks"."description") <= 2000),
	CONSTRAINT "tasks_priority_range" CHECK("tasks"."priority" in (1, 2, 3))
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_completed_at` ON `tasks` (`completed_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_due_date` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `idx_tasks_due_priority` ON `tasks` (`due_date`,`priority`);