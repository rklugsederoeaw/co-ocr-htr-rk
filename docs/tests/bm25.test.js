/**
 * Tests for BM25 Service
 *
 * Since Web Workers are not available in jsdom/Vitest,
 * we mock the Worker and test the service logic (callback routing,
 * state management, dispose behavior).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BM25Service } from '../js/services/bm25.js';

// Mock referenceService
vi.mock('../js/services/reference.js', () => ({
    referenceService: {
        getActiveCollections: vi.fn(() => Promise.resolve([
            { id: 'col-1', name: 'Test', active: true }
        ])),
        loadEntries: vi.fn((_id, onChunk) => {
            onChunk([
                { term: 'dominus', definition: 'lord', collectionId: 'col-1' },
                { term: 'ecclesia', definition: 'church', collectionId: 'col-1' }
            ]);
            return Promise.resolve(2);
        })
    }
}));

/**
 * Helper: wait for microtasks to flush so that async operations
 * (like buildIndex calling getActiveCollections/loadEntries before
 * creating the Worker) can complete.
 */
function flushMicrotasks() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

describe('BM25Service', () => {
    let service;
    let mockWorkerInstance;

    beforeEach(() => {
        service = new BM25Service();

        // Create mock worker instance that captures onmessage handler
        mockWorkerInstance = {
            postMessage: vi.fn(),
            terminate: vi.fn(),
            onmessage: null,
            onerror: null
        };

        // Mock Worker constructor
        vi.stubGlobal('Worker', vi.fn(() => mockWorkerInstance));
    });

    /**
     * Helper: trigger a message on the mock worker
     */
    function simulateWorkerMessage(data) {
        if (mockWorkerInstance.onmessage) {
            mockWorkerInstance.onmessage({ data });
        }
    }

    describe('State Management', () => {
        it('should start with not ready and not building', () => {
            expect(service.isReady()).toBe(false);
            expect(service.isBuilding()).toBe(false);
        });

        it('should set building state during buildIndex', async () => {
            const buildPromise = service.buildIndex();
            // Wait for async operations (getActiveCollections, loadEntries) to complete
            await flushMicrotasks();

            expect(service.isBuilding()).toBe(true);
            expect(service.isReady()).toBe(false);

            // Simulate worker ready response
            simulateWorkerMessage({ type: 'ready', count: 2, duration: 50 });

            const result = await buildPromise;
            expect(result).toEqual({ count: 2, duration: 50 });
            expect(service.isReady()).toBe(true);
            expect(service.isBuilding()).toBe(false);
        });

        it('should not start second build while building', async () => {
            service.buildIndex();
            // Building state is set synchronously at the start
            expect(service.isBuilding()).toBe(true);

            const second = await service.buildIndex();
            // Second call returns early with undefined result
            expect(second).toBeUndefined();
            // Worker constructor should only be called once (from first build)
            // The second call exits before creating a Worker
        });
    });

    describe('Worker Communication', () => {
        it('should send build message to worker with entries', async () => {
            service.buildIndex();
            await flushMicrotasks();

            expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'build',
                    entries: expect.arrayContaining([
                        expect.objectContaining({ term: 'dominus' })
                    ])
                })
            );
        });

        it('should create worker with module type', async () => {
            service.buildIndex();
            await flushMicrotasks();

            expect(Worker).toHaveBeenCalledWith(
                expect.any(URL),
                expect.objectContaining({ type: 'module' })
            );
        });
    });

    describe('Search', () => {
        it('should return empty array when not ready', async () => {
            const results = await service.search('dominus');
            expect(results).toEqual([]);
        });

        it('should return empty object for searchMultiple when not ready', async () => {
            const results = await service.searchMultiple(['dominus', 'ecclesia']);
            expect(results).toEqual({});
        });

        it('should resolve search after worker responds', async () => {
            // Build index first
            const buildPromise = service.buildIndex();
            await flushMicrotasks();
            simulateWorkerMessage({ type: 'ready', count: 2, duration: 10 });
            await buildPromise;

            // Start search
            const searchPromise = service.search('dominus', 5);

            // Simulate worker results
            simulateWorkerMessage({
                type: 'results',
                query: 'dominus',
                hits: [{ term: 'dominus', definition: 'lord', score: 5.2 }]
            });

            const results = await searchPromise;
            expect(results).toHaveLength(1);
            expect(results[0].term).toBe('dominus');
        });

        it('should resolve searchMultiple after worker responds', async () => {
            // Build index first
            const buildPromise = service.buildIndex();
            await flushMicrotasks();
            simulateWorkerMessage({ type: 'ready', count: 2, duration: 10 });
            await buildPromise;

            // Search multiple
            const searchPromise = service.searchMultiple(['dominus', 'ecclesia'], 3);

            // Simulate worker results
            simulateWorkerMessage({
                type: 'multiResults',
                results: {
                    dominus: [{ term: 'dominus', definition: 'lord', score: 5 }],
                    ecclesia: [{ term: 'ecclesia', definition: 'church', score: 4 }]
                }
            });

            const results = await searchPromise;
            expect(Object.keys(results)).toHaveLength(2);
            expect(results.dominus[0].term).toBe('dominus');
        });
    });

    describe('Progress Callback', () => {
        it('should forward progress events to callback', async () => {
            const progressFn = vi.fn();
            service.buildIndex(progressFn);
            await flushMicrotasks();

            // Simulate progress
            simulateWorkerMessage({ type: 'progress', pct: 0.5, phase: 'indexing' });

            expect(progressFn).toHaveBeenCalledWith(0.5, 'indexing');
        });
    });

    describe('Error Handling', () => {
        it('should reject build on worker error during build', async () => {
            const buildPromise = service.buildIndex();
            await flushMicrotasks();

            // Simulate error
            simulateWorkerMessage({ type: 'error', message: 'Out of memory' });

            await expect(buildPromise).rejects.toThrow('Out of memory');
            expect(service.isBuilding()).toBe(false);
        });
    });

    describe('Dispose', () => {
        it('should terminate worker and reset state', async () => {
            // Build first
            const buildPromise = service.buildIndex();
            await flushMicrotasks();
            simulateWorkerMessage({ type: 'ready', count: 2, duration: 10 });
            await buildPromise;

            expect(service.isReady()).toBe(true);

            service.dispose();

            expect(service.isReady()).toBe(false);
            expect(service.isBuilding()).toBe(false);
            expect(mockWorkerInstance.terminate).toHaveBeenCalled();
        });

        it('should handle dispose when no worker exists', () => {
            // Should not throw
            service.dispose();
            expect(service.isReady()).toBe(false);
        });
    });
});
