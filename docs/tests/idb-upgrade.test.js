/**
 * IndexedDB Schema Upgrade Tests
 *
 * Verifies that the database schema migration from v1 to v3 works correctly,
 * preserving existing data while adding new object stores for BM25 reference data.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDB_NAME, IDB_STORES, IDB_VERSION } from '../js/utils/constants.js';

// We need fresh IndexedDB state for each test
const deleteDB = () => new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(IDB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
});

/**
 * Create a v1 database with only the original 4 stores,
 * simulating a user who has the app before the BM25 upgrade.
 */
const createV1Database = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (event) => {
        const db = event.target.result;

        const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
        projectStore.createIndex('name', 'name', { unique: false });
        projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });

        db.createObjectStore('sessions', { keyPath: 'projectId' });

        const imageStore = db.createObjectStore('images', { keyPath: 'id' });
        imageStore.createIndex('projectId', 'projectId', { unique: false });

        db.createObjectStore('apiKeys', { keyPath: 'provider' });
    };
    req.onsuccess = (event) => resolve(event.target.result);
    req.onerror = () => reject(req.error);
});

/**
 * Insert test data into v1 database to verify it survives the upgrade.
 */
const seedV1Data = async (db) => {
    // Add a project
    await new Promise((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').put({
            id: 'test-project-1',
            name: 'My Historical Document',
            createdAt: '2026-01-15T10:00:00Z',
            updatedAt: '2026-02-28T14:30:00Z'
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });

    // Add an API key
    await new Promise((resolve, reject) => {
        const tx = db.transaction('apiKeys', 'readwrite');
        tx.objectStore('apiKeys').put({
            provider: 'gemini',
            apiKey: 'test-key-gemini',
            savedAt: '2026-02-28T10:00:00Z'
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });

    // Add a session
    await new Promise((resolve, reject) => {
        const tx = db.transaction('sessions', 'readwrite');
        tx.objectStore('sessions').put({
            projectId: 'test-project-1',
            transcription: { raw: 'dominus noster', segments: [] },
            savedAt: '2026-02-28T14:30:00Z'
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

/**
 * Open the database at the current version (v3) using the same upgrade
 * logic as storage.js, to simulate what happens when a user opens the app
 * after the BM25 update.
 */
const openAtCurrentVersion = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);

    req.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Replicate the exact upgrade logic from storage.js
        if (!db.objectStoreNames.contains(IDB_STORES.PROJECTS)) {
            const projectStore = db.createObjectStore(IDB_STORES.PROJECTS, { keyPath: 'id' });
            projectStore.createIndex('name', 'name', { unique: false });
            projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(IDB_STORES.SESSIONS)) {
            db.createObjectStore(IDB_STORES.SESSIONS, { keyPath: 'projectId' });
        }

        if (!db.objectStoreNames.contains(IDB_STORES.IMAGES)) {
            const imageStore = db.createObjectStore(IDB_STORES.IMAGES, { keyPath: 'id' });
            imageStore.createIndex('projectId', 'projectId', { unique: false });
        }

        if (!db.objectStoreNames.contains(IDB_STORES.API_KEYS)) {
            db.createObjectStore(IDB_STORES.API_KEYS, { keyPath: 'provider' });
        }

        if (!db.objectStoreNames.contains(IDB_STORES.PROMPTS)) {
            const promptStore = db.createObjectStore(IDB_STORES.PROMPTS, { keyPath: 'id' });
            promptStore.createIndex('category', 'category', { unique: false });
            promptStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(IDB_STORES.REFERENCE_COLLECTIONS)) {
            const refCollStore = db.createObjectStore(IDB_STORES.REFERENCE_COLLECTIONS, { keyPath: 'id' });
            refCollStore.createIndex('type', 'type', { unique: false });
            refCollStore.createIndex('language', 'language', { unique: false });
            refCollStore.createIndex('active', 'active', { unique: false });
        }

        if (!db.objectStoreNames.contains(IDB_STORES.REFERENCE_ENTRIES)) {
            const refEntryStore = db.createObjectStore(IDB_STORES.REFERENCE_ENTRIES, { autoIncrement: true });
            refEntryStore.createIndex('collectionId', 'collectionId', { unique: false });
            refEntryStore.createIndex('term', 'term', { unique: false });
        }
    };

    req.onsuccess = (event) => resolve(event.target.result);
    req.onerror = () => reject(req.error);
});

describe('IndexedDB Schema Upgrade', () => {
    beforeEach(async () => {
        await deleteDB();
    });

    afterEach(async () => {
        await deleteDB();
    });

    describe('v1 to v3 upgrade', () => {
        it('should add new object stores while preserving existing ones', async () => {
            // 1. Create v1 database
            const v1db = await createV1Database();
            expect(v1db.version).toBe(1);
            expect([...v1db.objectStoreNames].sort()).toEqual(
                ['apiKeys', 'images', 'projects', 'sessions']
            );
            v1db.close();

            // 2. Open at current version (triggers upgrade)
            const v3db = await openAtCurrentVersion();
            expect(v3db.version).toBe(IDB_VERSION);

            // 3. Verify all stores exist
            const storeNames = [...v3db.objectStoreNames].sort();
            expect(storeNames).toContain('projects');
            expect(storeNames).toContain('sessions');
            expect(storeNames).toContain('images');
            expect(storeNames).toContain('apiKeys');
            expect(storeNames).toContain('prompts');
            expect(storeNames).toContain('referenceCollections');
            expect(storeNames).toContain('referenceEntries');
            expect(storeNames).toHaveLength(7);

            v3db.close();
        });

        it('should preserve existing project data after upgrade', async () => {
            // 1. Create v1 database with test data
            const v1db = await createV1Database();
            await seedV1Data(v1db);
            v1db.close();

            // 2. Open at current version (triggers upgrade)
            const v3db = await openAtCurrentVersion();

            // 3. Verify project data survived
            const project = await new Promise((resolve, reject) => {
                const tx = v3db.transaction('projects', 'readonly');
                const req = tx.objectStore('projects').get('test-project-1');
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });

            expect(project).toBeDefined();
            expect(project.id).toBe('test-project-1');
            expect(project.name).toBe('My Historical Document');
            expect(project.updatedAt).toBe('2026-02-28T14:30:00Z');

            v3db.close();
        });

        it('should preserve existing API keys after upgrade', async () => {
            const v1db = await createV1Database();
            await seedV1Data(v1db);
            v1db.close();

            const v3db = await openAtCurrentVersion();

            const apiKey = await new Promise((resolve, reject) => {
                const tx = v3db.transaction('apiKeys', 'readonly');
                const req = tx.objectStore('apiKeys').get('gemini');
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });

            expect(apiKey).toBeDefined();
            expect(apiKey.provider).toBe('gemini');
            expect(apiKey.apiKey).toBe('test-key-gemini');

            v3db.close();
        });

        it('should preserve existing session data after upgrade', async () => {
            const v1db = await createV1Database();
            await seedV1Data(v1db);
            v1db.close();

            const v3db = await openAtCurrentVersion();

            const session = await new Promise((resolve, reject) => {
                const tx = v3db.transaction('sessions', 'readonly');
                const req = tx.objectStore('sessions').get('test-project-1');
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });

            expect(session).toBeDefined();
            expect(session.projectId).toBe('test-project-1');
            expect(session.transcription.raw).toBe('dominus noster');

            v3db.close();
        });

        it('should create empty reference stores ready for use', async () => {
            const v1db = await createV1Database();
            v1db.close();

            const v3db = await openAtCurrentVersion();

            // Verify referenceCollections is empty and usable
            const collections = await new Promise((resolve, reject) => {
                const tx = v3db.transaction('referenceCollections', 'readonly');
                const req = tx.objectStore('referenceCollections').getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            expect(collections).toEqual([]);

            // Verify referenceEntries is empty and usable
            const entries = await new Promise((resolve, reject) => {
                const tx = v3db.transaction('referenceEntries', 'readonly');
                const req = tx.objectStore('referenceEntries').getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            expect(entries).toEqual([]);

            v3db.close();
        });

        it('should allow writing to new reference stores after upgrade', async () => {
            const v1db = await createV1Database();
            v1db.close();

            const v3db = await openAtCurrentVersion();

            // Write a reference collection
            await new Promise((resolve, reject) => {
                const tx = v3db.transaction('referenceCollections', 'readwrite');
                tx.objectStore('referenceCollections').put({
                    id: 'latin-dict',
                    name: 'Latin Dictionary',
                    type: 'dictionary',
                    language: 'la',
                    entryCount: 2,
                    active: true
                });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });

            // Write reference entries
            await new Promise((resolve, reject) => {
                const tx = v3db.transaction('referenceEntries', 'readwrite');
                const store = tx.objectStore('referenceEntries');
                store.put({ collectionId: 'latin-dict', term: 'abbatia', definition: 'Abtei' });
                store.put({ collectionId: 'latin-dict', term: 'advocatus', definition: 'Vogt' });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });

            // Read back and verify
            const entries = await new Promise((resolve, reject) => {
                const tx = v3db.transaction('referenceEntries', 'readonly');
                const req = tx.objectStore('referenceEntries').getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });

            expect(entries).toHaveLength(2);
            expect(entries[0].term).toBe('abbatia');
            expect(entries[1].term).toBe('advocatus');

            v3db.close();
        });

        it('should have correct indexes on referenceCollections', async () => {
            const v1db = await createV1Database();
            v1db.close();

            const v3db = await openAtCurrentVersion();

            const tx = v3db.transaction('referenceCollections', 'readonly');
            const store = tx.objectStore('referenceCollections');
            const indexNames = [...store.indexNames].sort();

            expect(indexNames).toContain('type');
            expect(indexNames).toContain('language');
            expect(indexNames).toContain('active');

            v3db.close();
        });

        it('should have correct indexes on referenceEntries', async () => {
            const v1db = await createV1Database();
            v1db.close();

            const v3db = await openAtCurrentVersion();

            const tx = v3db.transaction('referenceEntries', 'readonly');
            const store = tx.objectStore('referenceEntries');
            const indexNames = [...store.indexNames].sort();

            expect(indexNames).toContain('collectionId');
            expect(indexNames).toContain('term');

            v3db.close();
        });

        it('should support querying referenceEntries by collectionId index', async () => {
            const v1db = await createV1Database();
            v1db.close();

            const v3db = await openAtCurrentVersion();

            // Insert entries for two different collections
            await new Promise((resolve, reject) => {
                const tx = v3db.transaction('referenceEntries', 'readwrite');
                const store = tx.objectStore('referenceEntries');
                store.put({ collectionId: 'dict-a', term: 'word1', definition: 'def1' });
                store.put({ collectionId: 'dict-a', term: 'word2', definition: 'def2' });
                store.put({ collectionId: 'dict-b', term: 'word3', definition: 'def3' });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });

            // Query only dict-a entries via index
            const dictAEntries = await new Promise((resolve, reject) => {
                const tx = v3db.transaction('referenceEntries', 'readonly');
                const index = tx.objectStore('referenceEntries').index('collectionId');
                const req = index.getAll('dict-a');
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });

            expect(dictAEntries).toHaveLength(2);
            expect(dictAEntries.every(e => e.collectionId === 'dict-a')).toBe(true);

            v3db.close();
        });
    });

    describe('Fresh install (no prior database)', () => {
        it('should create all 7 stores on fresh install', async () => {
            const db = await openAtCurrentVersion();
            expect(db.version).toBe(IDB_VERSION);

            const storeNames = [...db.objectStoreNames].sort();
            expect(storeNames).toEqual([
                'apiKeys',
                'images',
                'projects',
                'prompts',
                'referenceCollections',
                'referenceEntries',
                'sessions'
            ]);

            db.close();
        });
    });

    describe('IDB_VERSION constant', () => {
        it('should be 3 for the BM25 release', () => {
            expect(IDB_VERSION).toBe(3);
        });

        it('should have all required store names in IDB_STORES', () => {
            expect(IDB_STORES.PROJECTS).toBe('projects');
            expect(IDB_STORES.SESSIONS).toBe('sessions');
            expect(IDB_STORES.IMAGES).toBe('images');
            expect(IDB_STORES.API_KEYS).toBe('apiKeys');
            expect(IDB_STORES.PROMPTS).toBe('prompts');
            expect(IDB_STORES.REFERENCE_COLLECTIONS).toBe('referenceCollections');
            expect(IDB_STORES.REFERENCE_ENTRIES).toBe('referenceEntries');
        });
    });
});
