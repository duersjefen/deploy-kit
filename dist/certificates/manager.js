/**
 * Certificate Manager - Main orchestration for SSL certificate lifecycle
 * Handles creation, validation, and injection into deployment config
 */
import ora from 'ora';
import * as readline from 'readline';
import * as acm from './aws-acm.js';
import * as dns from './dns-validation.js';
import * as configInjector from './config-injector.js';
/**
 * Ensure SSL certificate exists for domain, create if needed
 *
 * Main entry point for certificate management. Workflow:
 * 1. Check if certificate exists in sst.config.ts
 * 2. If not, search for existing validated certificate in AWS ACM
 * 3. If not found, create new certificate and handle DNS validation
 * 4. Wait for certificate issuance
 * 5. Inject certificate ARN into sst.config.ts
 */
/**
 * @param domain - Full domain name (e.g., staging.example.com)
 * @param stage - Deployment stage (staging, production)
 * @param projectRoot - Project root directory path
 * @param awsProfile - Optional AWS profile name for authentication
 * @returns Promise resolving to certificate ARN string
 *
 * @throws {Error} If certificate creation or validation fails
 *
 * @example
 * ```typescript
 * const arn = await ensureCertificateExists(
 *   'staging.example.com',
 *   'staging',
 *   '/path/to/project'
 * );
 * console.log(`Certificate ready: ${arn}`);
 * ```
 */
export async function ensureCertificateExists(domain, stage, projectRoot, awsProfile) {
    const spinner = ora();
    try {
        // Step 1: Check if certificate already exists in config
        console.log(`\n🔐 Checking certificate for ${domain}...`);
        const existingArn = configInjector.extractCertificateArnFromConfig(projectRoot, stage);
        if (existingArn && configInjector.validateCertificateArn(existingArn)) {
            spinner.succeed(`✅ Certificate already configured: ${existingArn}`);
            return existingArn;
        }
        // Step 2: Check if certificate exists in AWS
        spinner.start('Searching for existing certificate in AWS...');
        const existingCert = await acm.findCertificateByDomain(domain, awsProfile);
        if (existingCert) {
            spinner.succeed(`✅ Found existing certificate: ${existingCert.arn}`);
            // Inject into config
            spinner.start('Updating sst.config.ts...');
            configInjector.injectCertificateArnIntoConfig(projectRoot, stage, existingCert.arn, domain);
            spinner.succeed(`✅ Certificate configured in sst.config.ts`);
            return existingCert.arn;
        }
        // Step 3: Create new certificate
        spinner.start(`Creating new certificate for ${domain}...`);
        const newCert = await acm.createCertificate(domain, awsProfile);
        spinner.succeed(`✅ Certificate created: ${newCert.arn}`);
        // Step 4: Handle DNS validation
        if (newCert.validationRecords.length > 0) {
            const validationRecord = newCert.validationRecords[0];
            // Show user the validation record
            dns.showValidationInstructions(validationRecord, domain);
            // Wait for user input
            await waitForUserInput('Press ENTER once you have added the CNAME record to your DNS provider...');
            // Wait for DNS propagation
            spinner.start('Waiting for DNS propagation (this may take 1-2 minutes)...');
            const propagated = await dns.waitForDNSPropagation(validationRecord.name, validationRecord.value, 300);
            if (!propagated) {
                spinner.warn('⚠️  DNS propagation verification inconclusive, proceeding anyway...');
            }
            else {
                spinner.succeed('✅ DNS record verified');
            }
        }
        // Step 5: Wait for certificate issuance
        spinner.start('Waiting for certificate to be issued (this may take 1-5 minutes)...');
        const issued = await acm.waitForCertificateIssuance(newCert.arn, 600, awsProfile);
        if (!issued) {
            spinner.warn('⚠️  Certificate validation timed out, but may still be issued. You can proceed.');
        }
        else {
            spinner.succeed('✅ Certificate issued successfully');
        }
        // Step 6: Inject into config
        spinner.start('Updating sst.config.ts...');
        configInjector.injectCertificateArnIntoConfig(projectRoot, stage, newCert.arn, domain);
        spinner.succeed(`✅ Certificate configured in sst.config.ts`);
        console.log(`
✅ Certificate Setup Complete!

Domain: ${domain}
ARN: ${newCert.arn}
Status: Ready for deployment

The certificate will be used for all future deployments to ${stage}.
`);
        return newCert.arn;
    }
    catch (error) {
        spinner.fail(`Failed to setup certificate: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
/**
 * Show certificate status for all stages
 */
export async function showCertificateStatus(projectRoot, awsProfile) {
    const spinner = ora();
    try {
        console.log('\n📊 Certificate Status\n');
        const stages = ['staging', 'production'];
        for (const stage of stages) {
            console.log(`\nStage: ${stage}`);
            // Get certificate from config
            const configArn = configInjector.extractCertificateArnFromConfig(projectRoot, stage);
            if (configArn) {
                spinner.start('Fetching certificate details from AWS...');
                const details = await acm.describeCertificate(configArn, awsProfile);
                spinner.succeed(`✅ Certificate configured`);
                console.log(`  ARN: ${configArn}`);
                console.log(`  Domain: ${details.DomainName}`);
                console.log(`  Status: ${details.Status}`);
                console.log(`  Created: ${new Date(details.CreatedAt).toLocaleString()}`);
            }
            else {
                console.log(`  ⚠️  No certificate configured`);
            }
        }
        console.log('\n');
    }
    catch (error) {
        console.error(`Failed to fetch certificate status: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * List all available certificates in AWS
 */
export async function listAvailableCertificates(awsProfile) {
    const spinner = ora();
    try {
        spinner.start('Fetching certificates from AWS...');
        const certs = await acm.listCertificatesForStage('staging', awsProfile);
        spinner.succeed(`Found ${certs.length} certificate(s)`);
        if (certs.length === 0) {
            console.log('\nNo certificates found in AWS.');
            return;
        }
        console.log('\n📋 Available Certificates:\n');
        for (const cert of certs) {
            console.log(`Domain: ${cert.domain}`);
            console.log(`ARN: ${cert.arn}`);
            console.log(`Status: ${cert.status}`);
            console.log(`Created: ${new Date(cert.createdAt).toLocaleString()}`);
            console.log('');
        }
    }
    catch (error) {
        console.error(`Failed to list certificates: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Setup SSL certificates for both staging and production stages
 *
 * Interactive wizard that:
 * 1. Prompts user to start
 * 2. Sets up staging certificate with DNS validation
 * 3. Waits for user confirmation
 * 4. Sets up production certificate with DNS validation
 * 5. Confirms completion
 */
/**
 * @param stagingDomain - Staging domain (e.g., staging.example.com)
 * @param productionDomain - Production domain (e.g., example.com)
 * @param projectRoot - Project root directory path
 * @param awsProfile - Optional AWS profile for authentication
 * @returns Promise that resolves when setup completes
 *
 * @throws {Error} If certificate creation fails
 *
 * @example
 * ```typescript
 * await setupProjectCertificates(
 *   'staging.myapp.com',
 *   'myapp.com',
 *   '/path/to/project'
 * );
 * ```
 */
export async function setupProjectCertificates(stagingDomain, productionDomain, projectRoot, awsProfile) {
    console.log(`
🔐 Setting up project certificates

This wizard will create SSL certificates for your project.
You will need to add DNS validation records to your domain registrar.

Staging Domain: ${stagingDomain}
Production Domain: ${productionDomain}
`);
    await waitForUserInput('Press ENTER to begin...');
    // Setup staging
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Setting up STAGING certificate');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    try {
        await ensureCertificateExists(stagingDomain, 'staging', projectRoot, awsProfile);
    }
    catch (error) {
        console.error(`Failed to setup staging certificate: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    await waitForUserInput('\nPress ENTER to setup production certificate...');
    // Setup production
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Setting up PRODUCTION certificate');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    try {
        await ensureCertificateExists(productionDomain, 'production', projectRoot, awsProfile);
    }
    catch (error) {
        console.error(`Failed to setup production certificate: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    console.log(`
✅ All certificates configured!

Your project is now ready for secure deployments.
`);
}
/**
 * Wait for user input (helper for interactive flows)
 */
async function waitForUserInput(prompt) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(prompt + ' ', () => {
            rl.close();
            resolve();
        });
    });
}
