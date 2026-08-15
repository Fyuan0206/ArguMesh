ALTER TABLE `papers` ADD `owner_id` text DEFAULT 'chen-fuyuan' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `owner_id` text DEFAULT 'chen-fuyuan' NOT NULL;--> statement-breakpoint
UPDATE `projects`
SET `owner_id` = 'legacy-test'
WHERE `id` IN (
  'occluded-pose',
  'test-proj-1',
  'test-proj-2',
  'test-proj-3',
  'proj-hidden',
  'proj-detail',
  'proj-patch',
  'proj-empty',
  'proj-archive',
  'papers-proj',
  'ids-proj',
  'patch-proj',
  'patch-empty-proj',
  'too-many',
  'arch-proj',
  'link-proj'
);--> statement-breakpoint
UPDATE `papers`
SET `owner_id` = 'legacy-test'
WHERE `id` IN (
  SELECT `project_papers`.`paper_id`
  FROM `project_papers`
  INNER JOIN `projects` ON `projects`.`id` = `project_papers`.`project_id`
  WHERE `projects`.`owner_id` = 'legacy-test'
)
AND `id` NOT IN (
  SELECT `project_papers`.`paper_id`
  FROM `project_papers`
  INNER JOIN `projects` ON `projects`.`id` = `project_papers`.`project_id`
  WHERE `projects`.`owner_id` = 'chen-fuyuan'
);
