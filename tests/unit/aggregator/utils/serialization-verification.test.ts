/**
 * Verification test for AggregatedData serialization
 * This test ensures that the Record-based AggregatedData type
 * can be properly serialized and deserialized for chrome.storage
 */

import { describe, it, expect } from 'vitest';
import type { AggregatedData } from '@/core/aggregator/utils/types';

describe('AggregatedData Serialization Verification', () => {
  it('should serialize and deserialize AggregatedData correctly', () => {
    // Create sample aggregated data
    const originalData: AggregatedData = {
      '2024-01-15:https://example.com': {
        openTime: 5000,
        activeTime: 3000,
        url: 'https://example.com',
        date: '2024-01-15',
        hostname: 'example.com',
        parentDomain: 'example.com',
      },
      '2024-01-15:https://test.example.com/page': {
        openTime: 2000,
        activeTime: 1500,
        url: 'https://test.example.com/page',
        date: '2024-01-15',
        hostname: 'test.example.com',
        parentDomain: 'example.com',
      },
    };

    // Serialize to JSON (simulating chrome.storage.set)
    const serialized = JSON.stringify(originalData);
    expect(serialized).not.toBe('{}'); // Should not be empty object like Map would be

    // Deserialize from JSON (simulating chrome.storage.get)
    const deserialized: AggregatedData = JSON.parse(serialized);

    // Verify all data is preserved
    expect(deserialized).toEqual(originalData);
    expect(Object.keys(deserialized)).toHaveLength(2);

    // Verify specific values
    expect(deserialized['2024-01-15:https://example.com'].openTime).toBe(5000);
    expect(deserialized['2024-01-15:https://example.com'].activeTime).toBe(3000);
    expect(deserialized['2024-01-15:https://test.example.com/page'].hostname).toBe(
      'test.example.com'
    );
  });

  it('should work with Object.values() for iteration', () => {
    const data: AggregatedData = {
      key1: {
        openTime: 1000,
        activeTime: 500,
        url: 'https://example.com',
        date: '2024-01-15',
        hostname: 'example.com',
        parentDomain: 'example.com',
      },
      key2: {
        openTime: 2000,
        activeTime: 1000,
        url: 'https://test.com',
        date: '2024-01-15',
        hostname: 'test.com',
        parentDomain: 'test.com',
      },
    };

    const values = Object.values(data);
    expect(values).toHaveLength(2);
    expect(values[0].openTime).toBe(1000);
    expect(values[1].openTime).toBe(2000);
  });

  it('should work with key existence checks', () => {
    const data: AggregatedData = {
      'existing-key': {
        openTime: 1000,
        activeTime: 500,
        url: 'https://example.com',
        date: '2024-01-15',
        hostname: 'example.com',
        parentDomain: 'example.com',
      },
    };

    expect('existing-key' in data).toBe(true);
    expect('non-existing-key' in data).toBe(false);
  });

  it('should work with property assignment', () => {
    const data: AggregatedData = {};

    data['new-key'] = {
      openTime: 1500,
      activeTime: 800,
      url: 'https://new.com',
      date: '2024-01-15',
      hostname: 'new.com',
      parentDomain: 'new.com',
    };

    expect(data['new-key'].openTime).toBe(1500);
    expect(Object.keys(data)).toHaveLength(1);
  });
});
