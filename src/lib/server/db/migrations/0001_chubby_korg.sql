DROP INDEX `idx_tasks_due_date`;--> statement-breakpoint
DROP INDEX `idx_tasks_due_priority`;--> statement-breakpoint
CREATE INDEX `idx_tasks_priority_due` ON `tasks` ("priority" desc,"due_date" asc);--> statement-breakpoint
CREATE INDEX `idx_tasks_due_priority` ON `tasks` ("due_date" asc,"priority" desc);