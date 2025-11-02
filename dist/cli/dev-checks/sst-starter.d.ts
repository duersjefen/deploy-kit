/**
 * SST Dev Server Starter
 * Handles spawning and managing the SST dev process
 */
import type { ProjectConfig } from '../../types.js';
export interface DevOptions {
    skipChecks?: boolean;
    port?: number;
    verbose?: boolean;
    quiet?: boolean;
}
/**
 * Start SST dev server with proper environment and error handling
 */
export declare function startSstDev(projectRoot: string, config: ProjectConfig | null, options: DevOptions): Promise<void>;
//# sourceMappingURL=sst-starter.d.ts.map