import { expect, test } from 'vitest';
import { trackRoute } from '../src/lib/analytics';

test('does nothing until analytics are initialized', () => {
  expect(() => trackRoute({ kind: 'home' })).not.toThrow();
});
