import { describe, expect, it } from 'vitest';
import demoProvider from './demoProvider.js';

describe('CP Plus demo XVR provider', () => {
  it('returns a clearly simulated four-channel recorder with all requested sections', () => {
    const device = demoProvider.get('DEMO-CPPLUS-001');
    expect(device.name).toBe('CP Plus Demo XVR');
    expect(device.dataSource).toBe('demo');
    expect(device.connection).toMatch(/Demo \/ Simulation/);
    expect(device.channels).toHaveLength(4);
    for (const section of ['overview', 'health', 'channels', 'storage', 'events', 'network', 'ptz', 'capabilities']) {
      expect(device[section]).toBeDefined();
    }
  });

  it('does not report a simulated reconnect as a real camera connection', () => {
    expect(demoProvider.get('unknown')).toBeNull();
    expect(demoProvider.getSection('DEMO-CPPLUS-001', 'storage').dataSource).toBe('demo');
  });
});
