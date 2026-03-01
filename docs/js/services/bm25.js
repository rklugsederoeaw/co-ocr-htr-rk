/**
 * BM25 Service
 *
 * Main-thread service that manages the BM25 Web Worker
 * and provides a Promise-based API for index building and search.
 *
 * Loads all active reference collections into the worker,
 * builds a MiniSearch index, and supports single + batch queries.
 */

import { referenceService } from './reference.js';

class BM25Service {
    constructor() {
        this._worker = null;
        this._ready = false;
        this._building = false;
        this._pendingCallbacks = new Map();
        this._callbackId = 0;
        this._onProgress = null;
    }

    /**
     * Whether the BM25 index is built and ready for search
     */
    isReady() {
        return this._ready;
    }

    /**
     * Whether the index is currently being built
     */
    isBuilding() {
        return this._building;
    }

    /**
     * Build the BM25 index from all active reference collections.
     * Loads entries from IndexedDB, sends them to the Worker for indexing.
     * @param {function(number, string): void} onProgress - Progress callback (pct, phase)
     * @returns {Promise<{count: number, duration: number}|undefined>}
     */
    async buildIndex(onProgress = null) {
        if (this._building) return;
        this._building = true;
        this._ready = false;
        this._onProgress = onProgress;

        // Get active collections
        const collections = await referenceService.getActiveCollections();
        if (collections.length === 0) {
            this._building = false;
            return;
        }

        // Load all entries from active collections
        const allEntries = [];
        for (const collection of collections) {
            await referenceService.loadEntries(collection.id, (chunk) => {
                allEntries.push(...chunk);
            });
        }

        if (allEntries.length === 0) {
            this._building = false;
            return;
        }

        // Create Worker if needed
        if (!this._worker) {
            this._worker = new Worker(
                new URL('../workers/bm25-worker.js', import.meta.url),
                { type: 'module' }
            );
            this._worker.onmessage = (e) => this._handleMessage(e.data);
            this._worker.onerror = (e) => {
                console.error('[BM25] Worker error:', e.message);
                this._building = false;
            };
        }

        // Build index in worker
        return new Promise((resolve, reject) => {
            this._pendingCallbacks.set('build', { resolve, reject });
            this._worker.postMessage({ type: 'build', entries: allEntries });
        });
    }

    /**
     * Search the index for a single query
     * @param {string} query - Search query
     * @param {number} topK - Max results to return
     * @returns {Promise<Array>} Search hits
     */
    async search(query, topK = 10) {
        if (!this._ready || !this._worker) return [];

        const id = ++this._callbackId;
        return new Promise((resolve) => {
            this._pendingCallbacks.set(`search_${id}`, { resolve });
            this._worker.postMessage({ type: 'search', query, topK, _id: id });
        });
    }

    /**
     * Search the index for multiple queries at once
     * @param {Array<string>} queries - Search queries
     * @param {number} topK - Max results per query
     * @returns {Promise<Object>} Map of query -> hits
     */
    async searchMultiple(queries, topK = 5) {
        if (!this._ready || !this._worker) return {};

        const id = ++this._callbackId;
        return new Promise((resolve) => {
            this._pendingCallbacks.set(`searchMultiple_${id}`, { resolve });
            this._worker.postMessage({ type: 'searchMultiple', queries, topK, _id: id });
        });
    }

    /**
     * Tear down the worker and reset state
     */
    dispose() {
        if (this._worker) {
            this._worker.postMessage({ type: 'clear' });
            this._worker.terminate();
            this._worker = null;
        }
        this._ready = false;
        this._building = false;
        this._pendingCallbacks.clear();
    }

    /**
     * Handle messages from the Worker
     */
    _handleMessage(data) {
        switch (data.type) {
            case 'progress':
                if (this._onProgress) this._onProgress(data.pct, data.phase);
                break;

            case 'ready':
                this._ready = true;
                this._building = false;
                this._onProgress = null;
                {
                    const buildCb = this._pendingCallbacks.get('build');
                    if (buildCb) {
                        buildCb.resolve({ count: data.count, duration: data.duration });
                        this._pendingCallbacks.delete('build');
                    }
                }
                break;

            case 'results':
                // Resolve the first pending search callback
                for (const [key, cb] of this._pendingCallbacks) {
                    if (key.startsWith('search_')) {
                        cb.resolve(data.hits);
                        this._pendingCallbacks.delete(key);
                        break;
                    }
                }
                break;

            case 'multiResults':
                for (const [key, cb] of this._pendingCallbacks) {
                    if (key.startsWith('searchMultiple_')) {
                        cb.resolve(data.results);
                        this._pendingCallbacks.delete(key);
                        break;
                    }
                }
                break;

            case 'error':
                console.error('[BM25] Worker error:', data.message);
                if (this._building) {
                    const buildCb = this._pendingCallbacks.get('build');
                    if (buildCb) {
                        buildCb.reject(new Error(data.message));
                        this._pendingCallbacks.delete('build');
                    }
                    this._building = false;
                }
                break;
        }
    }
}

export const bm25Service = new BM25Service();
export { BM25Service };
