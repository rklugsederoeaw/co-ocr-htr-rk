# BM25 Retrieval for LLM Review

> Client-side RAG pipeline for enriching LLM-based OCR/HTR validation with external reference data.

## Motivation

The LLM Review (validation) currently operates without access to external reference knowledge. For historical documents, domain-specific dictionaries, glossaries, and abbreviation tables significantly improve validation quality. By retrieving relevant entries via BM25 and injecting them into the LLM prompt, the model can cross-reference uncertain readings against authoritative sources -- all without a server backend.

## Requirements

| Requirement | Detail |
|-------------|--------|
| Data types | Flexible: dictionaries, glossaries, abbreviation tables, text corpora |
| Integration point | LLM Review (Validation) -- prompt enrichment before LLM call |
| Dataset size | Up to 500K entries per collection |
| Backend | None -- fully client-side (browser) |
| Build step | None -- vendored ESM modules, no bundler |
| Persistence | IndexedDB (fits existing storage architecture) |

## Architecture Overview

```
Upload Reference Data (JSON/CSV/TSV)
         |
         v
   +---------------+     IndexedDB
   | reference.js   | --> Persistent storage
   |  (Service)     |     (Collections + Entries)
   +-------+-------+
           | on demand
           v
   +---------------+     Web Worker
   | bm25-worker   | --> Index build off main thread
   |  (Worker)     |     (~40-60MB for 500K entries)
   +-------+-------+
           |
           v
   Validation Trigger
           |
           v
   +-------------------------------+
   | 1. Tokenize transcription     |
   | 2. Extract query terms        |
   |    (all / flagged-only)       |
   | 3. BM25 query -> top-K hits   |
   | 4. Format hits as context     |
   +---------------+---------------+
                   |
                   v
   +-------------------------------+
   | LLM Review Prompt:            |
   |                               |
   | [Document Context]            |
   | [BM25 Reference Entries] <--- |  NEW
   | [Transcription Text]          |
   | [Validation Instructions]     |
   +-------------------------------+
```

## Components

### 1. BM25 Library: MiniSearch (vendored)

**Decision**: Use [MiniSearch](https://github.com/lucaong/minisearch) as vendored ESM file.

| Property | Value |
|----------|-------|
| Size | ~8KB gzipped |
| Algorithm | BM25+ (improved BM25 for short documents) |
| Dependencies | Zero |
| Module format | ESM (native import) |
| Features | Fuzzy search, prefix search, field weighting, auto-suggest |
| Tested scale | 500K+ documents in browser |

**Location**: `docs/js/vendor/minisearch.js`

**Why not custom BM25?** Historical texts require fuzzy matching (variant spellings), Unicode normalization, and prefix search. Reimplementing these correctly is error-prone and unnecessary when a well-tested 8KB library exists.

**Why not sql.js/SQLite WASM?** FTS5 with BM25 is more powerful but adds ~1MB WASM binary. Overkill for the current scope. Can be reconsidered if full-text search requirements grow.

### 2. Reference Data Service

**File**: `docs/js/services/reference.js`

**Responsibilities**:
- CRUD operations for reference collections
- Import from JSON, CSV, TSV formats
- IndexedDB persistence via storage service
- Collection activation/deactivation
- Entry normalization (lowercase, Unicode NFKD)

**Data Model**:

```javascript
// Collection metadata (stored in IndexedDB "referenceCollections" store)
{
    id: 'medieval-latin-dict',          // auto-generated or user-defined
    name: 'Mittellateinisches Worterbuch',
    type: 'dictionary',                 // dictionary | glossary | abbreviation | corpus
    language: 'la',                     // ISO 639-1
    entryCount: 127000,
    fieldMapping: {                     // maps import columns to schema
        term: 'headword',
        definition: 'meaning',
        context: 'usage'
    },
    importFormat: 'csv',
    createdAt: '2026-02-28T10:00:00Z',
    updatedAt: '2026-02-28T10:00:00Z',
    active: true                        // included in BM25 queries?
}

// Entry (stored in IndexedDB "referenceEntries" store, indexed by collectionId)
{
    id: 1,                              // auto-increment
    collectionId: 'medieval-latin-dict',
    term: 'abbatia',                    // primary search field (boosted)
    definition: 'Abtei, Kloster',       // secondary search field
    context: 'abbatia regularis',       // optional context/usage
    source: 'MLW',                      // attribution
    metadata: {}                        // extensible
}
```

**Import formats**:

| Format | Structure | Example |
|--------|-----------|---------|
| JSON | `[{ term, definition, context?, source? }]` | Dictionary exports |
| CSV/TSV | Header row + data rows, field mapping via UI | Spreadsheet exports |
| Plain text | One entry per line, `term<tab>definition` | Simple word lists |

### 3. Web Worker for BM25 Index

**File**: `docs/js/workers/bm25-worker.js`

**Why a Worker?** Building a BM25 index for 500K entries takes 2-5 seconds. Running this on the main thread would freeze the UI. The Worker builds the index off-thread and responds to search queries via `postMessage`.

**Protocol**:

```javascript
// Main thread -> Worker
{ type: 'build', entries: [...], config: { fields, boosts, fuzzy } }
{ type: 'search', query: 'abbatia', topK: 10, options: { fuzzy: 0.2 } }
{ type: 'searchMultiple', queries: ['abbatia', 'dns'], topK: 5 }
{ type: 'clear' }

// Worker -> Main thread
{ type: 'progress', pct: 0.45, phase: 'indexing' }
{ type: 'ready', count: 127000, duration: 2340 }
{ type: 'results', query: 'abbatia', hits: [...] }
{ type: 'multiResults', results: { 'abbatia': [...], 'dns': [...] } }
{ type: 'error', message: '...' }
```

**Index build strategy**:
- Entries loaded from IndexedDB in chunks (5000 per batch)
- Each chunk added to MiniSearch index
- Progress reported after each chunk
- Index ready message sent when complete

**Search configuration**:

```javascript
const index = new MiniSearch({
    fields: ['term', 'definition', 'context'],
    storeFields: ['term', 'definition', 'source', 'collectionId'],
    searchOptions: {
        boost: { term: 3, definition: 1, context: 0.5 },
        fuzzy: 0.2,          // edit distance tolerance (important for historical variants)
        prefix: true,         // prefix matching
        combineWith: 'OR'
    }
});
```

### 4. Validation Pipeline Integration

**Modified files**:
- `docs/js/services/validation.js` -- BM25 retrieval before LLM call
- `docs/js/services/llm.js` -- extended prompt construction

**Integration point**: Before `validateWithLLM()` and `validateWithPostprocessing()` call the LLM.

**Query term extraction** -- two strategies:

| Strategy | When | Description |
|----------|------|-------------|
| Targeted | Default | Extract words flagged by deterministic rules (uncertain markers, OCR artifacts) + words from lines with low confidence |
| Broad | Configurable | All unique words from transcription (better recall, more API context used) |

**Flow**:

```javascript
// In validation.js, before LLM call
async _retrieveReferenceContext(text, ruleResults) {
    if (!this.bm25Service?.isReady()) return '';

    // 1. Extract query terms
    const terms = this._extractQueryTerms(text, ruleResults);
    if (terms.length === 0) return '';

    // 2. BM25 search (batched, via Worker)
    const results = await this.bm25Service.searchMultiple(terms, { topK: 5 });

    // 3. Deduplicate and rank hits
    const uniqueHits = this._deduplicateHits(results);

    // 4. Format as prompt context (max ~2000 tokens)
    return this._formatReferenceContext(uniqueHits, { maxEntries: 30 });
}
```

**Token budget**: Reference context should not exceed ~2000 tokens to avoid crowding out the transcription and instructions. With 30 entries at ~50 tokens each, this stays within budget.

### 5. Prompt Format

The BM25 hits are injected as a structured context block between the document context and the transcription text:

```
## Reference Data

The following entries from historical reference works may be relevant.
Use them to verify uncertain readings where applicable.
Do not assume every word must match a reference entry.

Source: Mittellateinisches Worterbuch
- "abbatia" -> Abtei, Kloster
- "advocatus" -> Vogt, Schirmherr
- "ecclesia" -> Kirche, Gemeinde

Source: Cappelli Abbreviations
- "dns" -> dominus [abbreviation]
- "epi" -> episcopi [abbreviation]
- "nr" -> noster [abbreviation]

---
```

**Key prompt design decisions**:
- Group by source for clarity
- Explicit instruction to not force-match (avoid false corrections)
- Arrow notation (`->`) for term-definition pairs
- Abbreviation type marked explicitly

### 6. Storage Extension

**Modified file**: `docs/js/services/storage.js`

Two new IndexedDB object stores in the existing database:

```javascript
// Add to database schema (version bump required)
referenceCollections: {
    keyPath: 'id',
    indexes: ['type', 'language', 'active']
}

referenceEntries: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
        { name: 'collectionId', keyPath: 'collectionId' },
        { name: 'term', keyPath: 'term' }
    ]
}
```

**Chunked loading**: For 500K entries, loading all at once would spike memory. Load in 10K chunks with cursor-based iteration:

```javascript
async loadEntriesByCollection(collectionId, onChunk) {
    const tx = db.transaction('referenceEntries', 'readonly');
    const index = tx.store.index('collectionId');
    const range = IDBKeyRange.only(collectionId);
    let cursor = await index.openCursor(range);
    let chunk = [];
    while (cursor) {
        chunk.push(cursor.value);
        if (chunk.length >= 10000) {
            await onChunk(chunk);
            chunk = [];
        }
        cursor = await cursor.continue();
    }
    if (chunk.length > 0) await onChunk(chunk);
}
```

### 7. UI Extension

**Modified file**: `docs/js/components/dialogs.js` or new `docs/js/components/reference.js`

Minimal UI additions:

1. **Reference Data section** in settings/context panel:
   - Upload button (JSON/CSV/TSV)
   - List of loaded collections with toggle (active/inactive)
   - Entry count and status per collection
   - Delete collection button

2. **Validation dialog** extension:
   - Checkbox: "Include reference data" (only shown when collections exist)
   - Retrieval strategy toggle: targeted vs. broad

3. **Validation results** display:
   - Optional indicator showing which suggestions were informed by reference data
   - Collapsible section showing retrieved reference entries

## Memory Budget

| Dataset | Raw Text | BM25 Index (RAM) | Index Build Time | Feasibility |
|---------|----------|-------------------|-----------------|-------------|
| 5K entries | ~1 MB | ~0.5 MB | <100ms | Trivial |
| 50K entries | ~10 MB | ~5 MB | ~500ms | No issues |
| 200K entries | ~40 MB | ~20 MB | ~1.5s | Fine with Worker |
| 500K entries | ~100 MB | ~40-60 MB | 2-5s | Feasible with Worker |

**Mitigation for very large datasets**:
- Only build index for active collections
- Lazy loading: build index on first validation, not on page load
- Index disposal: release Worker and memory when not in use
- Future option: serialize MiniSearch index to IndexedDB for instant reload

## Implementation Order

### Phase 1: Core Infrastructure
1. Vendor MiniSearch ESM build into `docs/js/vendor/minisearch.js`
2. Extend `storage.js` with `referenceCollections` and `referenceEntries` stores
3. Create `docs/js/services/reference.js` (collection CRUD, import, IndexedDB I/O)
4. Create `docs/js/workers/bm25-worker.js` (index build + search)

### Phase 2: Validation Integration
5. Add BM25 retrieval logic to `validation.js` (query extraction, result formatting)
6. Extend prompt construction in `llm.js` or `validation.js` to include reference context
7. Add reference context toggle to validation dialog

### Phase 3: UI and Polish
8. Add reference data management UI (upload, list, toggle, delete)
9. Show retrieval metadata in validation results
10. Add progress indicator for index building

### Phase 4: Testing
11. Unit tests for reference service (import, CRUD, search)
12. Unit tests for BM25 Worker (index build, search accuracy)
13. Integration tests for validation pipeline with reference data
14. Performance tests with 100K+ entries

## File Summary

| File | Type | Description |
|------|------|-------------|
| `docs/js/vendor/minisearch.js` | New (vendored) | MiniSearch BM25+ library, ESM build |
| `docs/js/services/reference.js` | New | Reference collection management, IndexedDB I/O, import |
| `docs/js/workers/bm25-worker.js` | New | Web Worker for off-thread BM25 index + search |
| `docs/js/services/storage.js` | Modified | New object stores for collections and entries |
| `docs/js/services/validation.js` | Modified | BM25 retrieval before LLM call, prompt enrichment |
| `docs/js/components/validation.js` | Modified | UI toggle for reference data in validation dialog |
| `docs/js/components/dialogs.js` | Modified | Reference data management UI |
| `knowledge/BM25-RETRIEVAL.md` | New | This document |

## Open Questions

1. **Import format priority**: Which format will reference data most commonly arrive in? (affects import UX priority)
2. **Fuzzy threshold**: How aggressive should fuzzy matching be for historical spelling variants? (MiniSearch `fuzzy: 0.2` is conservative; may need `0.3-0.4` for medieval texts)
3. **Multi-language**: Should BM25 tokenization be language-aware? (e.g., Latin vs. German stemming)
4. **Index persistence**: Should the built BM25 index be serialized to IndexedDB for instant reload, or is rebuilding from entries fast enough?
5. **Retrieval feedback**: Should users see which reference entries were retrieved and influence which ones are sent to the LLM?

## Alternatives Considered

| Alternative | Pros | Cons | Verdict |
|-------------|------|------|---------|
| SQLite WASM (sql.js) + FTS5 | Full SQL, built-in BM25, robust | ~1MB WASM binary, complex setup | Overkill for current scope |
| TF-IDF (custom) | Simpler than BM25 | Worse ranking quality, no fuzzy | Inferior to BM25+ |
| Vector embeddings (client-side) | Semantic search | Large model (~50MB), slow inference | Not practical client-side at scale |
| Server-side Elasticsearch | Best search quality | Requires backend server | Violates constraint |
| Lunr.js | Popular, client-side | No BM25, larger than MiniSearch, less maintained | MiniSearch is better fit |
