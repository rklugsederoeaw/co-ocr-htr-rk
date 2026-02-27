/**
 * Project IO Service
 *
 * Export and import .coocr project archives (ZIP-based via JSZip).
 * Includes optional AES-GCM encryption for API keys using Web Crypto API.
 */

import { storage } from './storage.js';
import { llmService } from './llm.js';
import { appState } from '../state.js';
import {
    COOCR_FORMAT_VERSION,
    COOCR_FILE_EXTENSION,
    COOCR_MIME_TYPE,
    PBKDF2_ITERATIONS,
    URL_REVOKE_DELAY
} from '../utils/constants.js';

const JSZIP_SRC = 'vendor/jszip.min.js';
const MAX_ARCHIVE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_IMAGES_PER_ARCHIVE = 200;
const MAX_ENTRY_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const VALIDATION_KEY_SUFFIX = '_validation';

class ProjectIOService {

    // ========================================================================
    // JSZip loader (reuses pattern from export.js)
    // ========================================================================

    async _ensureJSZip() {
        if (window.JSZip) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = JSZIP_SRC;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load JSZip'));
            document.head.appendChild(script);
        });
    }

    // ========================================================================
    // Export
    // ========================================================================

    /**
     * Export a project as .coocr archive.
     * @param {string} projectId
     * @param {object} options
     * @param {boolean} [options.includeApiKeys=false]
     * @param {string|null} [options.password=null]  Required when includeApiKeys is true
     * @returns {Promise<{filename: string}>}
     */
    async exportProject(projectId, options = {}) {
        const { includeApiKeys = false, password = null } = options;

        await this._ensureJSZip();

        // Gather data from IndexedDB
        const project = await storage.getProject(projectId);
        if (!project) throw new Error(`Project not found: ${projectId}`);

        const session = await storage.loadSession(projectId);
        const images = await storage.loadAllImages(projectId);

        // Gather LLM settings
        const settings = this._gatherSettings();

        // Build ZIP
        const zip = new window.JSZip();

        // project.json
        const projectData = {
            id: project.id,
            name: project.name,
            filename: project.filename,
            pageCount: project.pageCount,
            hasTranscription: project.hasTranscription,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt
        };
        const projectJson = JSON.stringify(projectData, null, 2);
        zip.file('project.json', projectJson);

        // session.json
        const sessionData = session ? { ...session } : {};
        delete sessionData.projectId; // redundant
        delete sessionData.savedAt;   // will be reset on import
        const sessionJson = JSON.stringify(sessionData, null, 2);
        zip.file('session.json', sessionJson);

        // settings.json
        const settingsJson = JSON.stringify(settings, null, 2);
        zip.file('settings.json', settingsJson);

        const checksums = {
            'project.json': await this._sha256(projectJson),
            'session.json': await this._sha256(sessionJson),
            'settings.json': await this._sha256(settingsJson)
        };

        // images/
        const imgFolder = zip.folder('images');
        for (const [pageId, dataUrl] of Object.entries(images)) {
            const imagePath = `images/${pageId}.b64`;
            imgFolder.file(`${pageId}.b64`, dataUrl);
            checksums[imagePath] = await this._sha256(dataUrl);
        }

        // Optional encrypted API keys
        if (includeApiKeys && password) {
            const allKeys = await storage.loadAllApiKeys();
            if (Object.keys(allKeys).length > 0) {
                const encrypted = await encryptKeys(allKeys, password);
                zip.file('keys.enc', encrypted);
                checksums['keys.enc'] = await this._sha256(encrypted);
            }
        }

        // manifest.json (includes legacy session checksum + extended checksums)
        const manifest = {
            formatVersion: COOCR_FORMAT_VERSION,
            exportDate: new Date().toISOString(),
            appVersion: 'coOCR/HTR',
            checksum: checksums['session.json'],
            checksums
        };
        zip.file('manifest.json', JSON.stringify(manifest, null, 2));

        // Generate and download
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        const safeName = (project.name || 'project').replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${safeName}${COOCR_FILE_EXTENSION}`;
        this._downloadBlob(blob, filename, COOCR_MIME_TYPE);

        return { filename };
    }

    // ========================================================================
    // Import
    // ========================================================================

    /**
     * Import a .coocr archive.
     * @param {File} file
     * @param {object} callbacks  UI callbacks for conflict resolution and password prompts
     * @param {function} callbacks.onConflict  Called with (existing, incoming) project data.
     *   Must return 'replace' | 'rename' | 'cancel'.
     * @param {function} callbacks.onPasswordNeeded  Called when keys.enc exists.
     *   Must return password string or null to skip.
     * @returns {Promise<{projectId: string, projectName: string}|null>}  null when cancelled
     */
    async importProject(file, callbacks = {}) {
        await this._ensureJSZip();
        this._validateArchiveSize(file);

        const zip = await window.JSZip.loadAsync(file);
        const imageEntries = this._collectImageEntries(zip);
        this._validateImageEntryCount(imageEntries.length);

        let importedProjectId = null;
        let replacedProjectId = null;

        try {
            // Validate manifest
            const manifestRaw = await this._readZipFile(zip, 'manifest.json');
            if (!manifestRaw) throw new Error('Invalid .coocr file: missing manifest.json');
            const manifest = JSON.parse(manifestRaw);

            if (!manifest.formatVersion) {
                throw new Error('Invalid .coocr file: no format version');
            }
            // Forward-compatible: we only reject if major version differs
            const majorVersion = manifest.formatVersion.split('.')[0];
            if (majorVersion !== COOCR_FORMAT_VERSION.split('.')[0]) {
                throw new Error(`Unsupported format version: ${manifest.formatVersion} (expected ${COOCR_FORMAT_VERSION})`);
            }

            // Read core files
            const projectRaw = await this._readZipFile(zip, 'project.json');
            if (!projectRaw) throw new Error('Invalid .coocr file: missing project.json');
            const projectData = JSON.parse(projectRaw);

            const sessionRaw = await this._readZipFile(zip, 'session.json');
            const sessionData = sessionRaw ? JSON.parse(sessionRaw) : {};

            const settingsRaw = await this._readZipFile(zip, 'settings.json');
            const settingsData = settingsRaw ? JSON.parse(settingsRaw) : {};
            await this._verifyArchiveIntegrity({
                manifest,
                zip,
                projectRaw,
                sessionRaw,
                settingsRaw
            });

            // Conflict detection
            const existingProjects = await storage.listProjects();
            const conflict = existingProjects.find(p => p.name === projectData.name);

            let resolution = 'create'; // default: no conflict
            if (conflict) {
                if (callbacks.onConflict) {
                    resolution = await callbacks.onConflict(conflict, projectData);
                } else {
                    resolution = 'rename'; // fallback
                }

                if (resolution === 'cancel') return null;

                if (resolution === 'replace') {
                    replacedProjectId = conflict.id;
                } else if (resolution === 'rename') {
                    projectData.name = this._deduplicateName(projectData.name, existingProjects);
                }
            }

            importedProjectId = this._generateId();

            // Save project
            await storage.createProject({
                id: importedProjectId,
                name: projectData.name,
                filename: projectData.filename,
                pageCount: projectData.pageCount || 0,
                hasTranscription: projectData.hasTranscription || false,
                createdAt: projectData.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            // Save session
            if (sessionRaw) {
                await storage.saveSession(importedProjectId, sessionData);
            }

            // Save images
            for (const entry of imageEntries) {
                const estimatedSize = this._estimateZipEntrySize(entry);
                if (estimatedSize !== null && estimatedSize > MAX_ENTRY_SIZE_BYTES) {
                    throw new Error(`Import aborted: image entry "${entry.name}" exceeds ${Math.round(MAX_ENTRY_SIZE_BYTES / 1024 / 1024)}MB`);
                }

                const pageId = entry.name.replace(/^images\//, '').replace(/\.b64$/, '');
                const dataUrl = await entry.async('string');
                if (this._getByteLength(dataUrl) > MAX_ENTRY_SIZE_BYTES) {
                    throw new Error(`Import aborted: image entry "${entry.name}" exceeds ${Math.round(MAX_ENTRY_SIZE_BYTES / 1024 / 1024)}MB`);
                }
                await storage.saveImage(importedProjectId, pageId, dataUrl);
            }

            // Restore LLM settings
            this._restoreSettings(settingsData);

            // Handle encrypted API keys
            const hasKeysEnc = zip.file('keys.enc') !== null;
            if (hasKeysEnc && callbacks.onPasswordNeeded) {
                const password = await callbacks.onPasswordNeeded();
                if (password) {
                    try {
                        const encryptedData = await this._readZipFile(zip, 'keys.enc');
                        const keys = await decryptKeys(encryptedData, password);
                        await this._restoreImportedApiKeys(keys);
                    } catch (err) {
                        console.error('[ProjectIO] Key decryption failed:', err);
                        // Let caller know decryption failed (non-fatal)
                        throw new Error('API key decryption failed. Wrong password? Keys were not restored.', { cause: err });
                    }
                }
            }

            // Perform replacement only after successful import staging
            if (replacedProjectId) {
                await storage.deleteProject(replacedProjectId);
            }

            // Activate the imported project
            storage.setActiveProjectId(importedProjectId);
            await appState.restoreSession(importedProjectId);

            return { projectId: importedProjectId, projectName: projectData.name };
        } catch (error) {
            if (importedProjectId) {
                await this._rollbackImportedProject(importedProjectId);
            }
            throw error;
        }
    }

    // ========================================================================
    // Settings gather / restore
    // ========================================================================

    _gatherSettings() {
        const settings = {};

        // Active provider & model
        settings.activeProvider = llmService.activeProvider;
        settings.activeModel = llmService.activeModel;

        // Per-provider models & endpoints
        settings.providers = {};
        for (const [id, cfg] of Object.entries(llmService.providers)) {
            settings.providers[id] = {};
            if (cfg.activeModel) settings.providers[id].activeModel = cfg.activeModel;
            if (cfg.endpoint) settings.providers[id].endpoint = cfg.endpoint;
        }

        // Custom prompts from localStorage
        settings.descriptionPrompt = storage.loadDescriptionPrompt() || undefined;
        settings.validationPrompt = storage.loadValidationPrompt() || undefined;

        // Validation provider config
        const valConfig = storage.loadSettings();
        if (valConfig.validationProvider) {
            settings.validationProvider = valConfig.validationProvider;
            settings.validationModel = valConfig.validationModel || undefined;
        }

        return settings;
    }

    _restoreSettings(settings) {
        if (!settings || typeof settings !== 'object') return;

        // Restore provider & model
        if (settings.activeProvider && llmService.providers[settings.activeProvider]) {
            llmService.setProvider(settings.activeProvider);
        }
        if (settings.activeModel) {
            llmService.setModel(settings.activeModel);
        }

        // Per-provider settings
        if (settings.providers) {
            for (const [id, cfg] of Object.entries(settings.providers)) {
                if (!llmService.providers[id]) continue;
                if (cfg.activeModel) {
                    llmService.setModel(id, cfg.activeModel);
                }
                if (cfg.endpoint) {
                    llmService.setEndpoint(id, cfg.endpoint);
                }
            }
        }

        // Custom prompts
        if (settings.descriptionPrompt) {
            storage.saveDescriptionPrompt(settings.descriptionPrompt);
        }
        if (settings.validationPrompt) {
            storage.saveValidationPrompt(settings.validationPrompt);
        }

        // Validation provider
        if (settings.validationProvider) {
            storage.saveValidationProviderConfig(
                settings.validationProvider,
                settings.validationModel || null
            );
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    async _readZipFile(zip, path) {
        const entry = zip.file(path);
        if (!entry) return null;
        const estimatedSize = this._estimateZipEntrySize(entry);
        if (estimatedSize !== null && estimatedSize > MAX_ENTRY_SIZE_BYTES) {
            throw new Error(`Import aborted: entry "${path}" exceeds ${Math.round(MAX_ENTRY_SIZE_BYTES / 1024 / 1024)}MB`);
        }
        const content = await entry.async('string');
        if (this._getByteLength(content) > MAX_ENTRY_SIZE_BYTES) {
            throw new Error(`Import aborted: entry "${path}" exceeds ${Math.round(MAX_ENTRY_SIZE_BYTES / 1024 / 1024)}MB`);
        }
        return content;
    }

    async _sha256(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    _downloadBlob(blob, filename, mimeType) {
        const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY);
    }

    _generateId() {
        return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    _deduplicateName(name, existingProjects) {
        const existingNames = new Set(existingProjects.map(p => p.name));
        let candidate = `${name} (imported)`;
        let counter = 2;
        while (existingNames.has(candidate)) {
            candidate = `${name} (imported ${counter})`;
            counter++;
        }
        return candidate;
    }

    _validateArchiveSize(file) {
        if (file?.size && file.size > MAX_ARCHIVE_SIZE_BYTES) {
            throw new Error(`Import aborted: archive exceeds ${Math.round(MAX_ARCHIVE_SIZE_BYTES / 1024 / 1024)}MB`);
        }
    }

    _collectImageEntries(zip) {
        const imageFiles = [];
        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir && relativePath.startsWith('images/') && relativePath.endsWith('.b64')) {
                imageFiles.push(zipEntry);
            }
        });
        return imageFiles;
    }

    _validateImageEntryCount(count) {
        if (count > MAX_IMAGES_PER_ARCHIVE) {
            throw new Error(`Import aborted: archive contains too many images (${count} > ${MAX_IMAGES_PER_ARCHIVE})`);
        }
    }

    _estimateZipEntrySize(entry) {
        const size =
            entry?._data?.uncompressedSize ??
            entry?._data?.compressedSize ??
            entry?._data?.length ??
            null;
        return Number.isFinite(size) ? Number(size) : null;
    }

    _getByteLength(text) {
        return new TextEncoder().encode(String(text || '')).length;
    }

    async _verifyArchiveIntegrity({ manifest, zip, projectRaw, sessionRaw, settingsRaw }) {
        const checksums = manifest?.checksums;

        // New format: verify all listed checksums.
        if (checksums && typeof checksums === 'object' && Object.keys(checksums).length > 0) {
            for (const [path, expectedChecksum] of Object.entries(checksums)) {
                if (!expectedChecksum) continue;

                const content = path === 'project.json'
                    ? projectRaw
                    : path === 'session.json'
                        ? sessionRaw
                        : path === 'settings.json'
                            ? settingsRaw
                            : await this._readZipFile(zip, path);

                if (content === null) {
                    throw new Error(`Archive integrity check failed: missing ${path}`);
                }

                const actualChecksum = await this._sha256(content);
                if (actualChecksum !== expectedChecksum) {
                    throw new Error(`Archive integrity check failed: ${path} is corrupted`);
                }
            }
            return;
        }

        // Legacy format (v1.0): only session checksum available.
        if (manifest?.checksum && sessionRaw) {
            const actualChecksum = await this._sha256(sessionRaw);
            if (actualChecksum !== manifest.checksum) {
                throw new Error('Archive integrity check failed: session data corrupted');
            }
        }
    }

    async _restoreImportedApiKeys(keys) {
        if (!keys || typeof keys !== 'object') return;

        for (const [providerKey, apiKey] of Object.entries(keys)) {
            if (!apiKey || typeof apiKey !== 'string') continue;

            if (providerKey.endsWith(VALIDATION_KEY_SUFFIX)) {
                const provider = providerKey.slice(0, -VALIDATION_KEY_SUFFIX.length);
                if (!llmService.providers?.[provider]) {
                    console.warn(`[ProjectIO] Skipping unknown validation key provider: ${provider}`);
                    continue;
                }
                await storage.saveApiKey(provider, apiKey, true);
                llmService.setValidationApiKey(provider, apiKey);
                continue;
            }

            if (!llmService.providers?.[providerKey]) {
                console.warn(`[ProjectIO] Skipping unknown key provider: ${providerKey}`);
                continue;
            }
            await storage.saveApiKey(providerKey, apiKey, false);
            llmService.setApiKey(providerKey, apiKey);
        }
    }

    async _rollbackImportedProject(projectId) {
        try {
            await storage.clearSession(projectId);
        } catch (error) {
            console.warn(`[ProjectIO] Rollback: clearSession failed for ${projectId}`, error);
        }
        try {
            await storage.deleteImages(projectId);
        } catch (error) {
            console.warn(`[ProjectIO] Rollback: deleteImages failed for ${projectId}`, error);
        }
        try {
            await storage.deleteProject(projectId);
        } catch (error) {
            console.warn(`[ProjectIO] Rollback: deleteProject failed for ${projectId}`, error);
        }

        if (storage.getActiveProjectId?.() === projectId) {
            storage.clearActiveProjectId();
        }
    }
}

// ============================================================================
// Crypto helpers (Web Crypto API -- no dependencies)
// ============================================================================

/**
 * Derive an AES-GCM key from a password using PBKDF2.
 * @param {string} password
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt API keys object with a password.
 * Output: Base64 string containing salt (16 bytes) + IV (12 bytes) + ciphertext.
 * @param {object} keysObject
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function encryptKeys(keysObject, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);

    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(keysObject));

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plaintext
    );

    // Concatenate: salt + iv + ciphertext
    const result = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(ciphertext), salt.length + iv.length);

    // Encode as base64
    return btoa(String.fromCharCode(...result));
}

/**
 * Decrypt API keys from an encrypted Base64 string.
 * @param {string} encryptedBase64
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function decryptKeys(encryptedBase64, password) {
    const raw = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

    const salt = raw.slice(0, 16);
    const iv = raw.slice(16, 28);
    const ciphertext = raw.slice(28);

    const key = await deriveKey(password, salt);

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(plaintext));
}

// Export singleton
export const projectIOService = new ProjectIOService();
