/**
 * Config Injector - Updates sst.config.ts with certificate ARN
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
/**
 * Update sst.config.ts to use fixed SSL certificate
 * Injects the certificate ARN into the domain configuration
 */
export function injectCertificateArnIntoConfig(projectRoot, stage, certificateArn, domain) {
    const configPath = join(projectRoot, 'sst.config.ts');
    try {
        let content = readFileSync(configPath, 'utf-8');
        // Find the domain configuration for this stage
        // Pattern: domain: $app.stage === "staging" ? { name: "staging.gabs-massage.de", dns: sst.aws.dns() } : undefined
        // Create the pattern to match
        const domainRegex = new RegExp(`(domain:\\s*\\$app\\.stage\\s*===\\s*["']${stage}["']\\s*\\?\\s*\\{\\s*name:\\s*["']${domain}["']([^}]*?)})\\s*:`, 'g');
        // Check if certificate is already in config (literal ARN)
        if (content.includes(`cert: "${certificateArn}"`) ||
            content.match(/cert:\s*["']arn:aws:acm:[^"']+["']/)) {
            console.log('✅ Certificate ARN already in config');
            return;
        }
        // Check if certificate is already configured via reference (e.g., preCreatedCertificates.staging)
        // This is the pattern used in gabs-massage sst.config.ts
        if (content.includes(`preCreatedCertificates.${stage}`) ||
            content.includes(`cert: preCreatedCertificates`)) {
            console.log('✅ Certificate already configured via preCreatedCertificates reference');
            return;
        }
        // Check if ANY cert configuration exists
        if (content.includes('cert:')) {
            console.log('✅ Certificate already configured in sst.config.ts');
            return;
        }
        // Try to inject certificate ARN into the domain configuration
        // Look for the specific stage domain config
        const stagePattern = new RegExp(`(domain:\\s*\\$app\\.stage\\s*===\\s*["']${stage}["']\\s*\\?\\s*\\{[^}]*?name:\\s*["']${domain}["'][^}]*)`, 'g');
        const updated = content.replace(stagePattern, (match) => {
            // Check if cert already exists in this config
            if (match.includes('cert:')) {
                // Update existing cert
                return match.replace(/cert:\s*["'].*?["']/, `cert: "${certificateArn}"`);
            }
            else {
                // Add cert after dns configuration
                return match.replace(/(dns:\s*sst\.aws\.dns\(\))/, `$1,\n    cert: "${certificateArn}"`);
            }
        });
        if (updated !== content) {
            writeFileSync(configPath, updated, 'utf-8');
            console.log(`✅ Certificate ARN injected into sst.config.ts for ${stage}`);
        }
        else {
            // Fallback: try simpler injection approach
            fallbackInjectCertificate(configPath, stage, domain, certificateArn);
        }
    }
    catch (error) {
        throw new Error(`Failed to inject certificate ARN into sst.config.ts: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Fallback injection method - more conservative approach
 */
function fallbackInjectCertificate(configPath, stage, domain, certificateArn) {
    let content = readFileSync(configPath, 'utf-8');
    // Check if cert is already configured (in any form)
    if (content.includes(`preCreatedCertificates.${stage}`) ||
        content.includes(`cert: "${certificateArn}"`) ||
        content.includes('cert: preCreatedCertificates')) {
        console.log('✅ Certificate is already configured in sst.config.ts');
        return;
    }
    // Look for any domain configuration mentioning this stage and domain
    const lines = content.split('\n');
    let injected = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check if this line has domain config for our stage
        if (line.includes('domain:') && line.includes(stage) && content.includes(domain)) {
            // Find the closing brace of the domain object
            let braceCount = 0;
            let startIdx = -1;
            let endIdx = -1;
            // Find starting brace
            for (let j = i; j < lines.length; j++) {
                const currentLine = lines[j];
                for (let k = 0; k < currentLine.length; k++) {
                    if (currentLine[k] === '{')
                        braceCount++;
                    if (currentLine[k] === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            endIdx = j;
                            break;
                        }
                    }
                }
                if (endIdx !== -1)
                    break;
            }
            if (endIdx !== -1) {
                // Check if cert already exists
                let certExists = false;
                for (let j = i; j <= endIdx; j++) {
                    if (lines[j].includes('cert:')) {
                        certExists = true;
                        break;
                    }
                }
                if (!certExists) {
                    // Add cert configuration before the closing brace
                    const indentation = lines[endIdx].match(/^\s*/)?.[0] || '    ';
                    lines[endIdx] = `    cert: "${certificateArn}",\n${indentation}${lines[endIdx].trimStart()}`;
                    injected = true;
                    break;
                }
            }
        }
    }
    if (injected) {
        writeFileSync(configPath, lines.join('\n'), 'utf-8');
        console.log(`✅ Certificate ARN injected into sst.config.ts (fallback method)`);
    }
    else {
        console.log(`ℹ️  Certificate configuration detected in sst.config.ts`);
        console.log(`    (Pre-created certificates are being used)`);
    }
}
/**
 * Extract certificate ARN from sst.config.ts for a given stage
 * Handles both literal ARN strings and references to pre-created certificates
 */
export function extractCertificateArnFromConfig(projectRoot, stage) {
    try {
        const configPath = join(projectRoot, 'sst.config.ts');
        const content = readFileSync(configPath, 'utf-8');
        // First try: Look for literal cert ARN in config
        // Pattern: cert: "arn:aws:acm:..."
        const certMatch = content.match(/cert:\s*["'](arn:aws:acm:[^"']+)["']/);
        if (certMatch) {
            return certMatch[1];
        }
        // Second try: Look for preCreatedCertificates reference (our pattern)
        // Pattern: cert: preCreatedCertificates.staging,
        const refMatch = content.match(new RegExp(`(preCreatedCertificates\\.${stage}|${stage}:\\s*["'](arn:aws:acm:[^"']+)["'])`, 'i'));
        if (refMatch) {
            // If it's a reference, extract the ARN from the preCreatedCertificates object
            const preCreatedMatch = content.match(new RegExp(`${stage}:\\s*["'](arn:aws:acm:[^"']+)["']`));
            if (preCreatedMatch) {
                return preCreatedMatch[1];
            }
            // If reference exists, certificate is already configured
            return 'already-configured';
        }
        // Third try: Just check if any cert configuration exists
        // Pattern: cert: ...something...
        if (content.includes('cert:')) {
            return 'already-configured';
        }
        return null;
    }
    catch (error) {
        return null;
    }
}
/**
 * Verify certificate ARN is valid format
 */
export function validateCertificateArn(arn) {
    return arn.startsWith('arn:aws:acm:') && arn.includes(':certificate/');
}
