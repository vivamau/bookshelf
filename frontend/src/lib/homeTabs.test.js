import test from 'node:test';
import assert from 'node:assert/strict';
import { getHomeTabsForRole } from './homeTabs.js';

test('Audiobooks is selectable for every application role', () => {
  for (const role of ['guest', 'reader', 'librarian']) {
    const audiobookTab = getHomeTabsForRole(role).find((tab) => tab.id === 'Audiobooks');

    assert.ok(audiobookTab, `Audiobooks should be visible to ${role}`);
    assert.equal(audiobookTab.selectable, true);
    assert.equal(audiobookTab.audience, 'all');
  }
});
