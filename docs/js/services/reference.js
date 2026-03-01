/**
 * Reference Service
 *
 * Manages reference data collections (dictionaries, glossaries, etc.)
 * for BM25 retrieval-augmented validation.
 *
 * Supports import from JSON, CSV, TSV files.
 * Wraps storage CRUD with caching and normalization.
 */

import { storage } from './storage.js';

class ReferenceService {
    constructor() {
        this._collections = null; // cached list
    }

    /**
     * Import reference data from a File object (JSON, CSV, TSV)
     * @param {File} file - File to import
     * @param {object} metadata - Optional metadata overrides { id, name, type, language }
     * @returns {Promise<object>} Created collection metadata
     */
    async importFromFile(file, metadata = {}) {
        const text = await file.text();
        const ext = file.name.split('.').pop().toLowerCase();

        let entries;
        if (ext === 'json') {
            entries = this._parseJSON(text);
        } else if (ext === 'csv') {
            entries = this._parseCSV(text, ',');
        } else if (ext === 'tsv' || ext === 'txt') {
            entries = this._parseCSV(text, '\t');
        } else {
            throw new Error(`Unsupported format: .${ext}`);
        }

        // Generate collection ID
        const id = metadata.id || `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Normalize entries -- attach collectionId
        const normalized = entries.map(e => ({
            collectionId: id,
            term: e.term || '',
            definition: e.definition || '',
            context: e.context || '',
            source: e.source || metadata.name || file.name
        }));

        // Save collection metadata
        const collection = {
            id,
            name: metadata.name || file.name.replace(/\.[^.]+$/, ''),
            type: metadata.type || 'dictionary',
            language: metadata.language || '',
            entryCount: normalized.length,
            importFormat: ext,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            active: true
        };

        await storage.saveReferenceCollection(collection);
        await storage.saveReferenceEntries(id, normalized);

        this._collections = null; // invalidate cache
        return collection;
    }

    /**
     * Parse JSON reference data.
     * Accepts array of entries or object with entries/data key.
     * Flexible field mapping for common schemas.
     */
    _parseJSON(text) {
        const data = JSON.parse(text);
        const arr = Array.isArray(data) ? data : (data.entries || data.data || []);
        return arr.map(e => ({
            term: e.term || e.headword || e.word || e.key || '',
            definition: e.definition || e.meaning || e.value || e.desc || '',
            context: e.context || e.usage || e.example || '',
            source: e.source || ''
        }));
    }

    /**
     * Parse CSV/TSV reference data.
     * Auto-detects column mapping from header row.
     * Falls back to first column = term, second = definition.
     */
    _parseCSV(text, delimiter) {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return [];

        const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());
        const termIdx = headers.findIndex(h => ['term', 'headword', 'word', 'key'].includes(h));
        const defIdx = headers.findIndex(h => ['definition', 'meaning', 'value', 'desc'].includes(h));
        const ctxIdx = headers.findIndex(h => ['context', 'usage', 'example'].includes(h));
        const srcIdx = headers.findIndex(h => ['source', 'src', 'origin'].includes(h));

        // Fallback: first column = term, second = definition
        const tIdx = termIdx >= 0 ? termIdx : 0;
        const dIdx = defIdx >= 0 ? defIdx : (headers.length > 1 ? 1 : -1);

        return lines.slice(1).map(line => {
            const cols = line.split(delimiter);
            return {
                term: (cols[tIdx] || '').trim(),
                definition: dIdx >= 0 ? (cols[dIdx] || '').trim() : '',
                context: ctxIdx >= 0 ? (cols[ctxIdx] || '').trim() : '',
                source: srcIdx >= 0 ? (cols[srcIdx] || '').trim() : ''
            };
        }).filter(e => e.term); // skip empty terms
    }

    /**
     * List all reference collections (cached)
     * @returns {Promise<Array>}
     */
    async listCollections() {
        if (!this._collections) {
            this._collections = await storage.listReferenceCollections();
        }
        return this._collections;
    }

    /**
     * Get only active (enabled) collections
     * @returns {Promise<Array>}
     */
    async getActiveCollections() {
        const all = await this.listCollections();
        return all.filter(c => c.active);
    }

    /**
     * Toggle collection active state
     * @param {string} id
     * @param {boolean} active
     */
    async toggleCollection(id, active) {
        const collection = await storage.getReferenceCollection(id);
        if (!collection) return;
        collection.active = active;
        collection.updatedAt = new Date().toISOString();
        await storage.saveReferenceCollection(collection);
        this._collections = null;
    }

    /**
     * Delete a collection and all its entries
     * @param {string} id
     */
    async deleteCollection(id) {
        await storage.deleteReferenceCollection(id);
        this._collections = null;
    }

    /**
     * Load entries for a collection via chunked cursor
     * @param {string} collectionId
     * @param {function(Array): void} onChunk
     * @returns {Promise<number>} Total entries loaded
     */
    async loadEntries(collectionId, onChunk) {
        return storage.loadReferenceEntries(collectionId, onChunk);
    }
}

export const referenceService = new ReferenceService();
export { ReferenceService };
