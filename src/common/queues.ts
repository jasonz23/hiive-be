/** Central registry of BullMQ queue + job names (used by producers and workers). */

export const QUEUE_FILES = 'files';
export const QUEUE_AGENTS = 'agents';
export const QUEUE_MONITORING = 'monitoring';

export const JOB_PROCESS_FILE = 'processUploadedFile';
export const JOB_MONITOR_POST = 'monitorPostPerformance';
export const JOB_MONITOR_CAMPAIGN = 'monitorCampaignPerformance';
export const JOB_RUN_SIMULATION = 'runSocialSimulation';
export const JOB_RUN_REPLICATION = 'runReplicationAgent';
export const JOB_RUN_VIRAL = 'runViralOpportunityAgent';
export const JOB_WEEKLY_REPORT = 'generateWeeklyReport';
