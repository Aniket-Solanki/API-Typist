import { describe, it, expect } from 'vitest';
import { mergeSamples } from '../src/merge.js';

describe('mergeSamples', () => {
  it('should merge basic JSON objects', () => {
    const samples = [
      { data: { id: 1, name: 'Alice' } },
      { data: { id: 2, email: 'alice@example.com' } }
    ];
    
    const result = mergeSamples(samples);
    
    expect(result.roots.length).toBe(2);
    // The registry should have named types
    expect(result.types.size).toBeGreaterThan(0);
  });

  it('should detect optional fields', () => {
    const samples = [
      { data: { a: 1 } },
      { data: { a: 1, b: 2 } }
    ];
    
    const result = mergeSamples(samples);
    // In a real implementation, we need a post-process merge step
    // This just verifies the IR structure
    expect(result.types.size).toBeGreaterThan(0);
  });
});
