import { describe, expect, it } from 'vitest';
import { cleanKey } from './settings';

describe('pasted eBird key', () => {
  it('drops spaces, line breaks, invisible characters, quotes and a label', () => {
    expect(cleanKey('  abc123def456\n')).toBe('abc123def456');
    expect(cleanKey('\u200Babc123def456\uFEFF')).toBe('abc123def456');
    expect(cleanKey('\u201Cabc123def456\u201D')).toBe('abc123def456');
    expect(cleanKey('Key: abc123def456')).toBe('abc123def456');
    expect(cleanKey('abc 123 def 456')).toBe('abc123def456');
  });
});
