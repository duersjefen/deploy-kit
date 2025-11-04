/**
 * Default maintenance page template
 *
 * A professional, animated page shown during deployments
 * when --with-maintenance-mode flag is used
 */

export interface MaintenancePageOptions {
  title?: string;
  message?: string;
  estimatedDuration?: number; // seconds
  refreshInterval?: number; // seconds
  primaryColor?: string;
  backgroundColor?: string;
}

/**
 * Generate maintenance page HTML
 */
export function generateMaintenancePage(options: MaintenancePageOptions = {}): string {
  const {
    title = 'We\'re Updating!',
    message = 'We\'re deploying some updates to improve your experience. We\'ll be back in a moment.',
    estimatedDuration = 60,
    refreshInterval = 10,
    primaryColor = '#3b82f6',
    backgroundColor = '#ffffff',
  } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="${refreshInterval}">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: ${backgroundColor};
      color: #1f2937;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 600px;
      text-align: center;
    }

    .icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 32px;
      position: relative;
    }

    .icon svg {
      width: 100%;
      height: 100%;
      animation: rotate 2s linear infinite;
    }

    @keyframes rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 16px;
      color: #111827;
    }

    p {
      font-size: 18px;
      line-height: 1.6;
      color: #6b7280;
      margin-bottom: 32px;
    }

    .progress {
      width: 100%;
      height: 4px;
      background: #e5e7eb;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 16px;
    }

    .progress-bar {
      height: 100%;
      background: ${primaryColor};
      width: 0%;
      animation: progress ${estimatedDuration}s linear forwards;
    }

    @keyframes progress {
      to { width: 100%; }
    }

    .eta {
      font-size: 14px;
      color: #9ca3af;
    }

    .eta strong {
      color: #6b7280;
    }

    @media (max-width: 640px) {
      h1 {
        font-size: 24px;
      }

      p {
        font-size: 16px;
      }

      .icon {
        width: 60px;
        height: 60px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="${primaryColor}" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </div>

    <h1>${title}</h1>
    <p>${message}</p>

    <div class="progress">
      <div class="progress-bar"></div>
    </div>

    <p class="eta">
      Estimated time: <strong>~${estimatedDuration} seconds</strong>
    </p>
  </div>

  <script>
    // Auto-refresh when complete
    setTimeout(() => {
      window.location.reload();
    }, ${estimatedDuration * 1000});
  </script>
</body>
</html>`;
}

/**
 * Default maintenance page (uses default options)
 */
export const DEFAULT_MAINTENANCE_PAGE = generateMaintenancePage();
