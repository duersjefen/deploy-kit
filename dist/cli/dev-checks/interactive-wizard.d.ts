/**
 * Interactive Wizard
 * Guides users through dev environment setup (DEP-5)
 */
import type { ProjectConfig } from '../../types.js';
export interface WizardResult {
    proceed: boolean;
    stage?: string;
    port?: number;
    profile?: string;
}
export declare class InteractiveWizard {
    private projectRoot;
    private config;
    constructor(projectRoot: string, config: ProjectConfig | null);
    /**
     * Run the interactive wizard
     * Returns user's choices or null if cancelled
     */
    run(): Promise<WizardResult | null>;
    /**
     * Step 1: Select stage
     */
    private selectStage;
    /**
     * Step 2: Show git changes (if any)
     */
    private showGitChanges;
    /**
     * Step 3: Select output profile
     */
    private selectOutputProfile;
    /**
     * Step 4: Select port
     */
    private selectPort;
    /**
     * Step 5: Confirm AWS profile
     */
    private confirmAwsProfile;
    /**
     * Step 6: Final confirmation
     */
    private finalConfirmation;
}
//# sourceMappingURL=interactive-wizard.d.ts.map