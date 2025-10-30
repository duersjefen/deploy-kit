/**
 * Config Injector - Updates sst.config.ts with certificate ARN
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface CertificateConfig {
  domain: string;
  arn: string;
}

/**
 * Update sst.config.ts to use fixed SSL certificate
 * Injects the certificate ARN into the domain configuration
 */
export function injectCertificateArnIntoConfig(
  projectRoot: string,
  stage: string,
  certificateArn: string,
  domain: string,
): void {
  const configPath = join(projectRoot, 'sst.config.ts');

  try {
    let content = readFileSync(configPath, 'utf-8');

    // Find the domain configuration for this stage
    // Pattern: domain: $app.stage === "staging" ? { name: "staging.gabs-massage.de", dns: sst.aws.dns() } : undefined

    // Create the pattern to match
    const domainRegex = new RegExp(
      `(domain:\\s*\\$app\\.stage\\s*===\\s*["']${stage}["']\\s*\\?\\s*\\{\\s*name:\\s*["']${domain}["']([^}]*?)})\\s*:`,
      'g'
    );

    // Check if certificate is already in config
    if (content.includes(`cert:\\s*["']${certificateArn}["']`) ||
        content.includes(`cert: "${certificateArn}"`)) {
      console.log('✅ Certificate ARN already in config');
      return;
    }

    // Try to inject certificate ARN into the domain configuration
    // Look for the specific stage domain config
    const stagePattern = new RegExp(
      `(domain:\\s*\\$app\\.stage\\s*===\\s*["']${stage}["']\\s*\\?\\s*\\{[^}]*?name:\\s*["']${domain}["'][^}]*)`,
      'g'
    );

    const updated = content.replace(stagePattern, (match) => {
      // Check if cert already exists in this config
      if (match.includes('cert:')) {
        // Update existing cert
        return match.replace(/cert:\s*["'].*?["']/, `cert: "${certificateArn}"`);
      } else {
        // Add cert after dns configuration
        return match.replace(/(dns:\s*sst\.aws\.dns\(\))/, `$1,\n    cert: "${certificateArn}"`);
      }
    });

    if (updated !== content) {
      writeFileSync(configPath, updated, 'utf-8');
      console.log(`✅ Certificate ARN injected into sst.config.ts for ${stage}`);
    } else {
      // Fallback: try simpler injection approach
      fallbackInjectCertificate(configPath, stage, domain, certificateArn);
    }
  } catch (error) {
    throw new Error(
      `Failed to inject certificate ARN into sst.config.ts: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Fallback injection method - more conservative approach
 */
function fallbackInjectCertificate(
  configPath: string,
  stage: string,
  domain: string,
  certificateArn: string,
): void {
  let content = readFileSync(configPath, 'utf-8');

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
          if (currentLine[k] === '{') braceCount++;
          if (currentLine[k] === '}') {
            braceCount--;
            if (braceCount === 0) {
              endIdx = j;
              break;
            }
          }
        }
        if (endIdx !== -1) break;
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
  } else {
    console.warn(`⚠️  Could not auto-inject certificate ARN. Please add manually:`);
    console.warn(`    cert: "${certificateArn}"`);
  }
}

/**
 * Extract certificate ARN from sst.config.ts for a given stage
 */
export function extractCertificateArnFromConfig(
  projectRoot: string,
  stage: string,
): string | null {
  try {
    const configPath = join(projectRoot, 'sst.config.ts');
    const content = readFileSync(configPath, 'utf-8');

    // Look for cert configuration in this stage's domain block
    // Pattern: cert: "arn:aws:acm:..."
    const certMatch = content.match(/cert:\s*["'](arn:aws:acm:[^"']+)["']/);

    if (certMatch) {
      return certMatch[1];
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Verify certificate ARN is valid format
 */
export function validateCertificateArn(arn: string): boolean {
  return arn.startsWith('arn:aws:acm:') && arn.includes(':certificate/');
}
