/**
 * DNS Validation helpers for ACM certificates
 * Handles Route 53 CNAME record validation
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DNSRecord {
  name: string;
  value: string;
  type: string;
}

/**
 * Get the hosted zone ID for a domain
 */
export async function getHostedZoneId(
  domain: string,
  awsProfile?: string
): Promise<string | null> {
  try {
    const profileArg = awsProfile ? `--profile ${awsProfile}` : '';
    const command = `aws route53 list-hosted-zones-by-name ${profileArg} --output json`;

    const { stdout } = await execAsync(command);
    const result = JSON.parse(stdout);

    if (!result.HostedZones) {
      return null;
    }

    // Find matching zone (exact match or parent domain)
    for (const zone of result.HostedZones) {
      const zoneName = zone.Name.endsWith('.') ? zone.Name.slice(0, -1) : zone.Name;

      if (domain === zoneName || domain.endsWith('.' + zoneName)) {
        // Extract zone ID (format: /hostedzone/Z1234...)
        return zone.Id.split('/').pop();
      }
    }

    return null;
  } catch (error) {
    throw new Error(`Failed to get hosted zone ID for ${domain}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Add CNAME validation record to Route 53
 */
export async function addValidationRecord(
  zoneId: string,
  record: DNSRecord,
  awsProfile?: string
): Promise<boolean> {
  try {
    const profileArg = awsProfile ? `--profile ${awsProfile}` : '';

    // Build change batch JSON
    const changeBatch = {
      Changes: [
        {
          Action: 'CREATE',
          ResourceRecordSet: {
            Name: record.name,
            Type: 'CNAME',
            TTL: 300,
            ResourceRecords: [{ Value: record.value }],
          },
        },
      ],
    };

    const command = `aws route53 change-resource-record-sets \
      --hosted-zone-id ${zoneId} \
      --change-batch '${JSON.stringify(changeBatch)}' \
      ${profileArg} \
      --output json`;

    await execAsync(command);
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // If record already exists, that's OK
    if (errorMsg.includes('InvalidChangeBatch') && errorMsg.includes('already exists')) {
      return true;
    }

    throw new Error(`Failed to add validation record: ${errorMsg}`);
  }
}

/**
 * Check if DNS record has propagated
 */
export async function checkDNSPropagation(
  recordName: string,
  recordValue: string,
): Promise<boolean> {
  try {
    // Use dig to check DNS propagation
    const { stdout } = await execAsync(`dig ${recordName} CNAME +short`);

    // Check if the expected value appears in the response
    return stdout.includes(recordValue.endsWith('.') ? recordValue : recordValue + '.');
  } catch (error) {
    // If dig fails, DNS probably hasn't propagated yet
    return false;
  }
}

/**
 * Wait for DNS record to propagate
 */
export async function waitForDNSPropagation(
  recordName: string,
  recordValue: string,
  maxWaitSeconds: number = 300,
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 10000; // 10 seconds
  let attempts = 0;

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    attempts++;

    try {
      const propagated = await checkDNSPropagation(recordName, recordValue);

      if (propagated) {
        return true;
      }
    } catch (error) {
      // Ignore errors, keep trying
    }

    if (Date.now() - startTime < maxWaitSeconds * 1000) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  return false;
}

/**
 * Show validation record to user in a friendly format
 */
export function formatValidationRecord(record: DNSRecord): string {
  return `
┌─────────────────────────────────────────────────┐
│ 📋 Add this CNAME record to Route 53             │
├─────────────────────────────────────────────────┤
│                                                 │
│ Name:  ${record.name.padEnd(43, ' ')}│
│ Type:  CNAME                                    │
│ Value: ${record.value.padEnd(43, ' ')}│
│ TTL:   300                                      │
│                                                 │
└─────────────────────────────────────────────────┘`;
}

/**
 * Show validation instructions to user
 */
export function showValidationInstructions(record: DNSRecord, domain: string): void {
  console.log(`
🔐 Certificate DNS Validation Required

Before deployment can proceed, you must add a CNAME record to your DNS provider
to validate that you own the domain "${domain}".

${formatValidationRecord(record)}

📌 Steps:
1. Open your DNS provider (Route 53, Namecheap, etc.)
2. Add the CNAME record shown above
3. Wait 1-2 minutes for DNS propagation
4. Return to this terminal and press ENTER to continue

The deploy-kit will verify the DNS record automatically.
`);
}
