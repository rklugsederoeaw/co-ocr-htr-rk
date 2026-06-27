/**
 * BM25 Worker
 *
 * Web Worker that loads MiniSearch and provides index building + search.
 * Runs off the main thread to keep the UI responsive during indexing
 * of large reference collections (10K+ entries).
 *
 * Uses dynamic import() for the vendored ESM build of MiniSearch.
 */

let MiniSearch;
let index = null;

async function loadMiniSearch() {
    if (MiniSearch) return;
    const module = await import('../vendor/minisearch.js');
    MiniSearch = module.default;
}

self.onmessage = async ({ data }) => {
    try {
        await loadMiniSearch();

        switch (data.type) {
            case 'build': {
                index = new MiniSearch({
                    fields: data.config?.fields || ['term', 'definition', 'context'],
                    storeFields: data.config?.storeFields || ['term', 'definition', 'source', 'collectionId'],
                    searchOptions: {
                        boost: data.config?.boosts || { term: 3, definition: 1, context: 0.5 },
                        fuzzy: data.config?.fuzzy ?? 0.2,
                        prefix: true,
                        combineWith: 'OR'
                    }
                });

                const entries = data.entries;
                const chunkSize = 5000;
                const startTime = performance.now();

                for (let i = 0; i < entries.length; i += chunkSize) {
                    const chunk = entries.slice(i, i + chunkSize);
                    // MiniSearch needs unique IDs
                    const withIds = chunk.map((e, idx) => ({ ...e, id: i + idx }));
                    index.addAll(withIds);
                    self.postMessage({
                        type: 'progress',
                        pct: Math.min((i + chunkSize) / entries.length, 1),
                        phase: 'indexing'
                    });
                }

                const duration = Math.round(performance.now() - startTime);
                self.postMessage({ type: 'ready', count: entries.length, duration });
                break;
            }

            case 'search': {
                if (!index) {
                    self.postMessage({ type: 'error', message: 'Index not built' });
                    return;
                }
                const results = index.search(data.query, {
                    limit: data.topK || 10,
                    fuzzy: data.options?.fuzzy ?? 0.2,
                    prefix: data.options?.prefix ?? true
                });
                self.postMessage({ type: 'results', _id: data._id, query: data.query, hits: results });
                break;
            }

            case 'searchMultiple': {
                if (!index) {
                    self.postMessage({ type: 'error', message: 'Index not built' });
                    return;
                }
                const multiResults = {};
                for (const query of data.queries) {
                    multiResults[query] = index.search(query, {
                        limit: data.topK || 5,
                        fuzzy: data.options?.fuzzy ?? 0.2,
                        prefix: data.options?.prefix ?? true
                    });
                }
                self.postMessage({ type: 'multiResults', _id: data._id, results: multiResults });
                break;
            }

            case 'clear': {
                index = null;
                self.postMessage({ type: 'cleared' });
                break;
            }

            default:
                self.postMessage({ type: 'error', message: `Unknown message type: ${data.type}` });
        }
    } catch (error) {
        self.postMessage({ type: 'error', message: error.message });
    }
};
