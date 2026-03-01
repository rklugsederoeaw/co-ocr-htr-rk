/**
 * Reference Data Management UI Component
 *
 * Provides a collapsible panel for managing reference data collections:
 * - Import from JSON, CSV, TSV files
 * - Toggle collections on/off
 * - Delete collections
 * - Build BM25 search index
 */

import { referenceService } from '../services/reference.js';
import { bm25Service } from '../services/bm25.js';
import { dialogManager } from './dialogs.js';
import { getById } from '../utils/dom.js';
import { escapeHtml } from '../utils/textFormatting.js';

class ReferenceUI {
    constructor() {
        this._container = null;
    }

    /**
     * Initialize the reference data panel.
     * Finds the DOM container and renders the initial state.
     */
    init() {
        this._container = getById('referenceDataPanel');
        if (!this._container) return;
        this.render();
    }

    /**
     * Render the reference data panel content
     */
    async render() {
        if (!this._container) return;

        const collections = await referenceService.listCollections();

        if (collections.length === 0) {
            this._container.innerHTML = `
                <div class="reference-empty" style="padding: var(--space-2);">
                    <p class="text-secondary text-xs">No reference data loaded.</p>
                    <button class="btn btn-sm btn-outline" id="btnImportReference">
                        Import Reference Data
                    </button>
                </div>
            `;
        } else {
            let html = '<div class="reference-list">';
            for (const col of collections) {
                html += `
                    <div class="reference-item" style="padding: var(--space-1) var(--space-2); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: var(--space-2);">
                        <label class="checkbox-label" style="flex: 1; margin: 0; display: flex; align-items: center; gap: var(--space-1);">
                            <input type="checkbox" class="ref-toggle" data-id="${escapeHtml(col.id)}" ${col.active ? 'checked' : ''}>
                            <span>${escapeHtml(col.name)}</span>
                            <span class="text-secondary text-xs">(${col.entryCount} entries)</span>
                        </label>
                        <button class="btn-icon ref-delete" data-id="${escapeHtml(col.id)}" title="Delete collection" style="color: var(--color-error); cursor: pointer; background: none; border: none; font-size: 1.2em; line-height: 1;">&times;</button>
                    </div>
                `;
            }
            html += '</div>';
            html += `
                <div style="padding: var(--space-1) var(--space-2); display: flex; gap: var(--space-1);">
                    <button class="btn btn-sm btn-outline" id="btnImportReference">Import</button>
                    <button class="btn btn-sm btn-outline" id="btnBuildIndex">Build Index</button>
                </div>
            `;
            this._container.innerHTML = html;
        }

        this._bindEvents();
    }

    /**
     * Bind event handlers to rendered elements
     */
    _bindEvents() {
        // Import button
        const importBtn = getById('btnImportReference');
        if (importBtn) {
            importBtn.addEventListener('click', () => this._handleImport());
        }

        // Build index button
        const buildBtn = getById('btnBuildIndex');
        if (buildBtn) {
            buildBtn.addEventListener('click', () => this._handleBuildIndex());
        }

        // Toggle checkboxes
        if (this._container) {
            this._container.querySelectorAll('.ref-toggle').forEach(cb => {
                cb.addEventListener('change', async (e) => {
                    await referenceService.toggleCollection(e.target.dataset.id, e.target.checked);
                    // Dispose index when collections change
                    bm25Service.dispose();
                });
            });

            // Delete buttons
            this._container.querySelectorAll('.ref-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    if (window.confirm('Delete this reference collection?')) { // eslint-disable-line no-alert
                        await referenceService.deleteCollection(id);
                        bm25Service.dispose();
                        this.render();
                    }
                });
            });
        }
    }

    /**
     * Handle import button click -- open file picker
     */
    async _handleImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.csv,.tsv,.txt';
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const collection = await referenceService.importFromFile(file);
                dialogManager.showToast(
                    `Imported ${collection.entryCount} entries from "${collection.name}"`,
                    'success'
                );
                bm25Service.dispose(); // invalidate index
                this.render();
            } catch (error) {
                dialogManager.showToast(`Import failed: ${error.message}`, 'error');
            }
        });
        input.click();
    }

    /**
     * Handle build index button click
     */
    async _handleBuildIndex() {
        const buildBtn = getById('btnBuildIndex');
        if (buildBtn) {
            buildBtn.disabled = true;
            buildBtn.textContent = 'Building...';
        }

        try {
            const result = await bm25Service.buildIndex((pct) => {
                if (buildBtn) buildBtn.textContent = `Building ${Math.round(pct * 100)}%...`;
            });
            if (result) {
                dialogManager.showToast(
                    `Index built: ${result.count} entries in ${result.duration}ms`,
                    'success'
                );
            }
        } catch (error) {
            dialogManager.showToast(`Index build failed: ${error.message}`, 'error');
        } finally {
            if (buildBtn) {
                buildBtn.disabled = false;
                buildBtn.textContent = 'Build Index';
            }
        }
    }
}

export const referenceUI = new ReferenceUI();
