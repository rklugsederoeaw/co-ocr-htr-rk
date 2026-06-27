/**
 * Tests for Reference Service
 *
 * Tests import from JSON/CSV/TSV, collection CRUD, and entry normalization.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { ReferenceService } from '../js/services/reference.js';
import { StorageService } from '../js/services/storage.js'; // eslint-disable-line no-unused-vars -- used in vi.mock factory

// Mock storage module to use fresh instances per test
vi.mock('../js/services/storage.js', async () => {
    const { StorageService } = await vi.importActual('../js/services/storage.js');
    const instance = new StorageService();
    return { storage: instance, StorageService };
});

import { storage } from '../js/services/storage.js';

/**
 * Helper: create a mock file-like object that works in jsdom
 * (jsdom's File does not support .text())
 */
function makeFile(content, name) {
    const blob = new Blob([content], { type: 'text/plain' });
    blob.name = name;
    // Polyfill .text() for jsdom if needed
    if (!blob.text) {
        blob.text = () => Promise.resolve(content);
    }
    return blob;
}

describe('ReferenceService', () => {
    let service;

    beforeEach(() => {
        // Create fresh localStorage mock
        const mockLocalStorage = {
            store: {},
            getItem: vi.fn((key) => mockLocalStorage.store[key] || null),
            setItem: vi.fn((key, value) => { mockLocalStorage.store[key] = value; }),
            removeItem: vi.fn((key) => { delete mockLocalStorage.store[key]; }),
            clear: vi.fn(() => { mockLocalStorage.store = {}; }),
            key: vi.fn((index) => Object.keys(mockLocalStorage.store)[index]),
            get length() { return Object.keys(mockLocalStorage.store).length; }
        };
        vi.stubGlobal('localStorage', mockLocalStorage);

        service = new ReferenceService();
    });

    afterEach(async () => {
        if (storage._db) {
            storage._db.close();
            storage._db = null;
            storage._dbPromise = null;
        }
        await new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase('coocr-htr');
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    });

    // =========================================
    // JSON Parsing
    // =========================================

    describe('JSON Import', () => {
        it('should parse a flat JSON array of entries', () => {
            const text = JSON.stringify([
                { term: 'dominus', definition: 'lord, master' },
                { term: 'ecclesia', definition: 'church' }
            ]);
            const entries = service._parseJSON(text);
            expect(entries).toHaveLength(2);
            expect(entries[0].term).toBe('dominus');
            expect(entries[0].definition).toBe('lord, master');
            expect(entries[1].term).toBe('ecclesia');
        });

        it('should parse nested JSON with entries key', () => {
            const text = JSON.stringify({
                metadata: { title: 'Latin Glossary' },
                entries: [
                    { term: 'rex', definition: 'king' }
                ]
            });
            const entries = service._parseJSON(text);
            expect(entries).toHaveLength(1);
            expect(entries[0].term).toBe('rex');
        });

        it('should parse nested JSON with data key', () => {
            const text = JSON.stringify({
                data: [
                    { headword: 'fiat', meaning: 'let it be done' }
                ]
            });
            const entries = service._parseJSON(text);
            expect(entries).toHaveLength(1);
            expect(entries[0].term).toBe('fiat');
            expect(entries[0].definition).toBe('let it be done');
        });

        it('should handle alternative field names', () => {
            const text = JSON.stringify([
                { word: 'liber', value: 'book', usage: 'in libris', source: 'Du Cange' }
            ]);
            const entries = service._parseJSON(text);
            expect(entries[0].term).toBe('liber');
            expect(entries[0].definition).toBe('book');
            expect(entries[0].context).toBe('in libris');
            expect(entries[0].source).toBe('Du Cange');
        });

        it('should return empty array for empty data', () => {
            const entries = service._parseJSON('[]');
            expect(entries).toHaveLength(0);
        });

        it('should handle missing fields gracefully', () => {
            const text = JSON.stringify([{ term: 'test' }]);
            const entries = service._parseJSON(text);
            expect(entries[0].definition).toBe('');
            expect(entries[0].context).toBe('');
        });
    });

    // =========================================
    // CSV/TSV Parsing
    // =========================================

    describe('CSV/TSV Parsing', () => {
        it('should parse CSV with standard headers', () => {
            const text = 'term,definition\ndominus,lord\necclesia,church';
            const entries = service._parseCSV(text, ',');
            expect(entries).toHaveLength(2);
            expect(entries[0].term).toBe('dominus');
            expect(entries[0].definition).toBe('lord');
        });

        it('should parse TSV with tab delimiter', () => {
            const text = 'term\tdefinition\nrex\tking\nregina\tqueen';
            const entries = service._parseCSV(text, '\t');
            expect(entries).toHaveLength(2);
            expect(entries[0].term).toBe('rex');
            expect(entries[1].term).toBe('regina');
        });

        it('should auto-detect alternative header names', () => {
            const text = 'headword,meaning,usage\nfiat,let it be done,legal formula';
            const entries = service._parseCSV(text, ',');
            expect(entries[0].term).toBe('fiat');
            expect(entries[0].definition).toBe('let it be done');
            expect(entries[0].context).toBe('legal formula');
        });

        it('should fall back to positional columns when headers unknown', () => {
            const text = 'foo,bar\nalpha,beta\ngamma,delta';
            const entries = service._parseCSV(text, ',');
            expect(entries).toHaveLength(2);
            expect(entries[0].term).toBe('alpha');
            expect(entries[0].definition).toBe('beta');
        });

        it('should skip empty terms', () => {
            const text = 'term,definition\ndominus,lord\n,empty\necclesia,church';
            const entries = service._parseCSV(text, ',');
            expect(entries).toHaveLength(2);
            expect(entries.every(e => e.term !== '')).toBe(true);
        });

        it('should return empty array for single-line input (header only)', () => {
            const text = 'term,definition';
            const entries = service._parseCSV(text, ',');
            expect(entries).toHaveLength(0);
        });

        it('should return empty array for empty input', () => {
            const entries = service._parseCSV('', ',');
            expect(entries).toHaveLength(0);
        });
    });

    // =========================================
    // File Import (end-to-end)
    // =========================================

    describe('importFromFile', () => {
        it('should import a JSON file and create collection + entries', async () => {
            const data = JSON.stringify([
                { term: 'dominus', definition: 'lord' },
                { term: 'ecclesia', definition: 'church' }
            ]);
            const file = makeFile(data, 'glossary.json');

            const collection = await service.importFromFile(file);

            expect(collection.name).toBe('glossary');
            expect(collection.entryCount).toBe(2);
            expect(collection.active).toBe(true);
            expect(collection.importFormat).toBe('json');
            expect(collection.id).toMatch(/^ref-/);

            // Verify stored in IDB
            const stored = await storage.getReferenceCollection(collection.id);
            expect(stored).toBeDefined();
            expect(stored.name).toBe('glossary');
        });

        it('should import a CSV file', async () => {
            const csv = 'term,definition\nrex,king\nregina,queen';
            const file = makeFile(csv, 'words.csv');

            const collection = await service.importFromFile(file);

            expect(collection.entryCount).toBe(2);
            expect(collection.importFormat).toBe('csv');
        });

        it('should import a TSV file', async () => {
            const tsv = 'term\tdefinition\nfiat\tlet it be done';
            const file = makeFile(tsv, 'data.tsv');

            const collection = await service.importFromFile(file);

            expect(collection.entryCount).toBe(1);
            expect(collection.importFormat).toBe('tsv');
        });

        it('should reject unsupported file formats', async () => {
            const file = makeFile('data', 'file.xyz');
            await expect(service.importFromFile(file)).rejects.toThrow('Unsupported format');
        });

        it('should use metadata overrides', async () => {
            const data = JSON.stringify([{ term: 'test', definition: 'val' }]);
            const file = makeFile(data, 'file.json');

            const collection = await service.importFromFile(file, {
                name: 'Custom Name',
                type: 'glossary',
                language: 'la'
            });

            expect(collection.name).toBe('Custom Name');
            expect(collection.type).toBe('glossary');
            expect(collection.language).toBe('la');
        });
    });

    // =========================================
    // Collection CRUD
    // =========================================

    describe('Collection CRUD', () => {
        async function createTestCollection() {
            const data = JSON.stringify([{ term: 'test', definition: 'value' }]);
            const file = makeFile(data, 'test.json');
            return service.importFromFile(file);
        }

        it('should list all collections', async () => {
            await createTestCollection();
            await createTestCollection();

            const collections = await service.listCollections();
            expect(collections).toHaveLength(2);
        });

        it('should cache collection list', async () => {
            await createTestCollection();

            const list1 = await service.listCollections();
            const list2 = await service.listCollections();
            // Same reference = cached
            expect(list1).toBe(list2);
        });

        it('should invalidate cache on import', async () => {
            await createTestCollection();
            const list1 = await service.listCollections();

            await createTestCollection();
            const list2 = await service.listCollections();

            // Different reference after import invalidated cache
            expect(list1).not.toBe(list2);
        });

        it('should return only active collections', async () => {
            const col = await createTestCollection();
            await createTestCollection();

            // Deactivate one
            await service.toggleCollection(col.id, false);

            const active = await service.getActiveCollections();
            expect(active).toHaveLength(1);
            expect(active[0].id).not.toBe(col.id);
        });

        it('should toggle collection active state', async () => {
            const col = await createTestCollection();
            expect(col.active).toBe(true);

            await service.toggleCollection(col.id, false);
            const updated = await storage.getReferenceCollection(col.id);
            expect(updated.active).toBe(false);

            await service.toggleCollection(col.id, true);
            const reactivated = await storage.getReferenceCollection(col.id);
            expect(reactivated.active).toBe(true);
        });

        it('should delete a collection and its entries', async () => {
            const col = await createTestCollection();

            await service.deleteCollection(col.id);

            const stored = await storage.getReferenceCollection(col.id);
            expect(stored).toBeUndefined();

            const count = await storage.countReferenceEntries(col.id);
            expect(count).toBe(0);
        });
    });
});
