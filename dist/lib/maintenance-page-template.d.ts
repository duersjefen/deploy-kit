/**
 * Default maintenance page template
 *
 * A professional, animated page shown during deployments
 * when --with-maintenance-mode flag is used
 */
export interface MaintenancePageOptions {
    title?: string;
    message?: string;
    estimatedDuration?: number;
    refreshInterval?: number;
    primaryColor?: string;
    backgroundColor?: string;
}
/**
 * Generate maintenance page HTML
 */
export declare function generateMaintenancePage(options?: MaintenancePageOptions): string;
/**
 * Default maintenance page (uses default options)
 */
export declare const DEFAULT_MAINTENANCE_PAGE: string;
//# sourceMappingURL=maintenance-page-template.d.ts.map