/**
 * Route53 Zone Creation Tracker
 *
 * Tracks when Route53 zones are created to implement age checks.
 * Stores creation timestamps in .deploy-kit/zone-tracker.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface ZoneTracking {
  zoneId: string;
  domain: string;
  createdAt: string; // ISO timestamp
  projectName: string;
}

interface ZoneTrackerState {
  zones: Record<string, ZoneTracking>; // Key: domain
}

/**
 * Get path to zone tracker state file
 */
function getTrackerPath(projectRoot: string): string {
  return join(projectRoot, '.deploy-kit', 'zone-tracker.json');
}

/**
 * Load zone tracker state
 */
function loadState(projectRoot: string): ZoneTrackerState {
  const trackerPath = getTrackerPath(projectRoot);

  if (!existsSync(trackerPath)) {
    return { zones: {} };
  }

  try {
    const content = readFileSync(trackerPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { zones: {} };
  }
}

/**
 * Save zone tracker state
 */
function saveState(projectRoot: string, state: ZoneTrackerState): void {
  const trackerPath = getTrackerPath(projectRoot);
  const dir = join(projectRoot, '.deploy-kit');

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(trackerPath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Track a newly created Route53 zone
 *
 * @param projectRoot - Project root directory
 * @param domain - Domain name
 * @param zoneId - Route53 zone ID
 * @param projectName - Project name
 */
export function trackZoneCreation(
  projectRoot: string,
  domain: string,
  zoneId: string,
  projectName: string
): void {
  const state = loadState(projectRoot);

  state.zones[domain] = {
    zoneId,
    domain,
    createdAt: new Date().toISOString(),
    projectName,
  };

  saveState(projectRoot, state);
}

/**
 * Get zone creation time
 *
 * @param projectRoot - Project root directory
 * @param domain - Domain name
 * @returns Creation date or null if not tracked
 */
export function getZoneCreationTime(projectRoot: string, domain: string): Date | null {
  const state = loadState(projectRoot);
  const tracking = state.zones[domain];

  if (!tracking) {
    return null;
  }

  return new Date(tracking.createdAt);
}

/**
 * Check if zone was created recently (< specified minutes)
 *
 * @param projectRoot - Project root directory
 * @param domain - Domain name
 * @param thresholdMinutes - Age threshold in minutes (default: 5)
 * @returns true if zone is new, false if old or not tracked
 */
export function isZoneRecent(
  projectRoot: string,
  domain: string,
  thresholdMinutes: number = 5
): boolean {
  const createdAt = getZoneCreationTime(projectRoot, domain);

  if (!createdAt) {
    return false; // Not tracked = assume old
  }

  const ageMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);
  return ageMinutes < thresholdMinutes;
}

/**
 * Get zone age in minutes
 *
 * @param projectRoot - Project root directory
 * @param domain - Domain name
 * @returns Age in minutes or null if not tracked
 */
export function getZoneAgeMinutes(projectRoot: string, domain: string): number | null {
  const createdAt = getZoneCreationTime(projectRoot, domain);

  if (!createdAt) {
    return null;
  }

  return (Date.now() - createdAt.getTime()) / (1000 * 60);
}

/**
 * Clear zone tracking (for cleanup)
 *
 * @param projectRoot - Project root directory
 * @param domain - Domain name
 */
export function clearZoneTracking(projectRoot: string, domain: string): void {
  const state = loadState(projectRoot);
  delete state.zones[domain];
  saveState(projectRoot, state);
}
