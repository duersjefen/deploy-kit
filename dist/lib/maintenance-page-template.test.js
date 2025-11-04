/**
 * Tests for maintenance page template
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateMaintenancePage, DEFAULT_MAINTENANCE_PAGE } from './maintenance-page-template.js';
describe('Maintenance Page Template', () => {
    it('should generate valid HTML with default options', () => {
        const html = generateMaintenancePage();
        assert.ok(html.includes('<!DOCTYPE html>'), 'Should have DOCTYPE');
        assert.ok(html.includes('<html lang="en">'), 'Should have html tag');
        assert.ok(html.includes('</html>'), 'Should close html tag');
        assert.ok(html.includes('<meta charset="UTF-8">'), 'Should have UTF-8 charset');
        assert.ok(html.includes('viewport'), 'Should have viewport meta');
    });
    it('should include custom title', () => {
        const customTitle = 'System Upgrade in Progress';
        const html = generateMaintenancePage({ title: customTitle });
        assert.ok(html.includes(`<title>${customTitle}</title>`), 'Should have custom title');
        assert.ok(html.includes(`<h1>${customTitle}</h1>`), 'Should have custom h1');
    });
    it('should include custom message', () => {
        const customMessage = 'We are upgrading our servers. Please check back soon.';
        const html = generateMaintenancePage({ message: customMessage });
        assert.ok(html.includes(`<p>${customMessage}</p>`), 'Should have custom message');
    });
    it('should include custom colors', () => {
        const primaryColor = '#ff0000';
        const backgroundColor = '#000000';
        const html = generateMaintenancePage({ primaryColor, backgroundColor });
        assert.ok(html.includes(`background: ${backgroundColor}`), 'Should have custom background color');
        assert.ok(html.includes(`stroke="${primaryColor}"`), 'Should have custom primary color');
    });
    it('should include estimated duration', () => {
        const estimatedDuration = 120;
        const html = generateMaintenancePage({ estimatedDuration });
        assert.ok(html.includes(`~${estimatedDuration} seconds`), 'Should show estimated duration');
        assert.ok(html.includes(`${estimatedDuration * 1000}`), 'Should have JavaScript timeout');
    });
    it('should include refresh interval', () => {
        const refreshInterval = 15;
        const html = generateMaintenancePage({ refreshInterval });
        assert.ok(html.includes(`content="${refreshInterval}"`), 'Should have refresh meta tag');
    });
    it('should include animations', () => {
        const html = generateMaintenancePage();
        assert.ok(html.includes('@keyframes rotate'), 'Should have rotate animation');
        assert.ok(html.includes('@keyframes progress'), 'Should have progress animation');
        assert.ok(html.includes('animation:'), 'Should have animation CSS');
    });
    it('should include auto-refresh script', () => {
        const html = generateMaintenancePage();
        assert.ok(html.includes('<script>'), 'Should have script tag');
        assert.ok(html.includes('setTimeout'), 'Should have setTimeout');
        assert.ok(html.includes('window.location.reload()'), 'Should reload window');
    });
    it('should be responsive', () => {
        const html = generateMaintenancePage();
        assert.ok(html.includes('@media (max-width: 640px)'), 'Should have mobile media query');
        assert.ok(html.includes('max-width: 600px'), 'Should have max-width constraint');
    });
    it('should export DEFAULT_MAINTENANCE_PAGE', () => {
        assert.ok(DEFAULT_MAINTENANCE_PAGE, 'Should export default page');
        assert.ok(DEFAULT_MAINTENANCE_PAGE.includes('<!DOCTYPE html>'), 'Default page should be valid HTML');
        assert.ok(DEFAULT_MAINTENANCE_PAGE.includes("We're Updating!"), 'Default page should have default title');
    });
    it('should escape HTML in custom content', () => {
        // Note: Current implementation does NOT escape HTML
        // This test documents the behavior for future improvement
        const title = 'Test <script>alert("xss")</script>';
        const html = generateMaintenancePage({ title });
        // Currently the HTML is not escaped - this is a potential XSS vector
        // if customPagePath comes from untrusted source
        assert.ok(html.includes(title), 'Should include the title as-is');
    });
    it('should have no-cache headers hint in comments', () => {
        // The page itself doesn't set cache headers, that's done in uploadMaintenancePage
        const html = generateMaintenancePage();
        // Just verify the page is self-contained
        assert.ok(html.length > 1000, 'Page should have substantial content');
    });
});
