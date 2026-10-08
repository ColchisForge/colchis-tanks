import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, Settings } from '../src/game/Settings';
import { MemoryStorage } from './helpers';

describe('settings', () => {
  it('starts with defaults', () => {
    expect(new Settings(new MemoryStorage()).all()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists changes across sessions', () => {
    const storage = new MemoryStorage();
    const first = new Settings(storage);
    first.toggle('sound');
    first.set('screenShake', false);

    const second = new Settings(storage);
    expect(second.get('sound')).toBe(false);
    expect(second.get('screenShake')).toBe(false);
    expect(second.get('music')).toBe(true);
  });

  it('ignores corrupt or foreign stored data', () => {
    const storage = new MemoryStorage();
    storage.setItem('colchis-tanks:settings', '{"sound": "loud", "music": false, "extra": 1');
    expect(new Settings(storage).all()).toEqual(DEFAULT_SETTINGS);
    storage.setItem('colchis-tanks:settings', '{"sound": "loud", "music": false}');
    expect(new Settings(storage).all()).toEqual({ ...DEFAULT_SETTINGS, music: false });
  });

  it('works without storage', () => {
    const settings = new Settings(null);
    settings.toggle('music');
    expect(settings.get('music')).toBe(false);
  });

  it('keeps the best score only', () => {
    const storage = new MemoryStorage();
    const settings = new Settings(storage);
    expect(settings.submitScore(900)).toBe(true);
    expect(settings.submitScore(400)).toBe(false);
    expect(new Settings(storage).highScore).toBe(900);
  });

  it('notifies subscribers', () => {
    const settings = new Settings(new MemoryStorage());
    const seen: boolean[] = [];
    settings.subscribe((values) => seen.push(values.scanlines));
    settings.toggle('scanlines');
    expect(seen).toEqual([true, false]);
  });
});
