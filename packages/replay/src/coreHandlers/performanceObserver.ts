import { logger } from '@sentry/utils';

import type { AllPerformanceEntry, ReplayContainer } from '../types';
import { dedupePerformanceEntries } from '../util/dedupePerformanceEntries';
import { getAbsoluteTime } from '../util/createPerformanceEntries';

const BAD_PERFORMANCE_ENTRY_TYPES = ['longtask', 'paint', 'event'];
const BAD_PERFORMANCE_MIN_DURATION = 1_000;
const BAD_PERFORMANCE_MAX_DURATION = 3_000;

/**
 * Sets up a PerformanceObserver to listen to all performance entry types.
 */
export function setupPerformanceObserver(replay: ReplayContainer): PerformanceObserver {
  const performanceObserverHandler = (list: PerformanceObserverEntryList): void => {
    // For whatever reason the observer was returning duplicate navigation
    // entries (the other entry types were not duplicated).
    const newPerformanceEntries = dedupePerformanceEntries(
      replay.performanceEvents,
      list.getEntries() as AllPerformanceEntry[],
    );

    newPerformanceEntries.forEach(entry => {
      if (entry.duration > BAD_PERFORMANCE_MIN_DURATION && BAD_PERFORMANCE_ENTRY_TYPES.includes(entry.entryType)) {
        badPerformanceDetected(replay, entry);
      }
    });

    replay.performanceEvents = newPerformanceEntries;
  };

  const performanceObserver = new PerformanceObserver(performanceObserverHandler);

  [
    'element',
    'event',
    'first-input',
    'largest-contentful-paint',
    'layout-shift',
    'longtask',
    'navigation',
    'paint',
    'resource',
  ].forEach(type => {
    try {
      performanceObserver.observe({
        type,
        buffered: true,
      });
    } catch {
      // This can throw if an entry type is not supported in the browser.
      // Ignore these errors.
    }
  });

  return performanceObserver;
}

// A map of a given second in the app with the longest entry duration in that second
const perfMap = new Map<number, number>();

function badPerformanceDetected(replay: ReplayContainer, entry: PerformanceEntry): void {
  const startRounded = Math.floor(entry.startTime / 1000);

  // delete old perfMap entries (30s ago)
  Array.from(perfMap.keys()).forEach(key => {
    if (key < startRounded - 30) {
      perfMap.delete(key);
    }
  });

  const prev = perfMap.get(startRounded) || 0;

  if (entry.duration > prev) {
    perfMap.set(startRounded, entry.duration);
    __DEBUG_BUILD__ &&
      logger.warn(`Bad performance detected: ${entry.entryType} at second ${startRounded} took ${entry.duration}ms`);
  }

  // If a single entry exceeds the upper limit, always disable
  if (entry.duration > BAD_PERFORMANCE_MAX_DURATION) {
    void replay.stop('bad performance: upper limit');
    return;
  }

  // If too many entries exceed the lower limit too often, disable
  // This means in 10 different seconds we had at least one slow entry
  if (perfMap.size > 10) {
    void replay.stop(`bad performance: ${perfMap.size} slow seconds`);
    return;
  }

  // If the sum of entries exceeds upper limit * 5, disable
  const totalDuration = Array.from(perfMap.values()).reduce((a, b) => a + b, 0);
  if (totalDuration > BAD_PERFORMANCE_MAX_DURATION * 5) {
    void replay.stop(`bad performance: sum of slow seconds is ${totalDuration}`);
    return;
  }
}
