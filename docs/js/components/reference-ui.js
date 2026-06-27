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
            // Index status + test search
            const ready = bm25Service.isReady();
            const statusText = bm25Service.isBuilding()
                ? 'Index: building...'
                : ready
                    ? `Index: ${bm25Service.indexedCount().toLocaleString()} entries ready`
                    : 'Index: not built -- click "Build Index"';
            html += `
                <div style="padding: 0 var(--space-2) var(--space-2);">
                    <div class="text-xs text-secondary" id="refIndexStatus" style="margin-bottom: var(--space-1);">${escapeHtml(statusText)}</div>
                    <div style="display: flex; gap: var(--space-1);">
                        <input type="text" id="refSearchInput" class="input input-sm" placeholder="Test search the index..." ${ready ? '' : 'disabled'} style="flex: 1; font-size: var(--text-xs);">
                        <button class="btn btn-sm btn-outline" id="refSearchBtn" ${ready ? '' : 'disabled'}>Search</button>
                    </div>
                    <div id="refSearchResults" class="text-xs" style="margin-top: var(--space-1);"></div>
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
                    // Capture these BEFORE awaiting: after an await, the event has
                    // finished dispatching and e.currentTarget is null.
                    const id = e.currentTarget.dataset.id;
                    const row = e.currentTarget.closest('.reference-item');
                    // Use the app's own confirm dialog, not window.confirm: native
                    // dialogs get suppressed by the browser after repeated use, which
                    // silently makes deletion a no-op.
                    const confirmed = await dialogManager.showConfirm(
                        'Delete reference collection?',
                        'This removes the collection and all its entries.',
                        'Delete', 'Cancel', { icon: 'warning' }
                    );
                    if (!confirmed) return;
                    // Remove from the list immediately. Cleaning up the entries of
                    // a large collection can take a while, but the collection
                    // record is deleted first, so the UI stays consistent while the
                    // entry cleanup finishes in the background.
                    row?.remove();
                    bm25Service.dispose();
                    try {
                        await referenceService.deleteCollection(id);
                    } catch (error) {
                        dialogManager.showToast(`Delete failed: ${error.message}`, 'error');
                        await this.render(); // restore the list if deletion failed
                    }
                });
            });

            // Test search
            const searchBtn = getById('refSearchBtn');
            const searchInput = getById('refSearchInput');
            if (searchBtn && searchInput) {
                const run = () => this._handleSearch(searchInput.value);
                searchBtn.addEventListener('click', run);
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') run();
                });
            }
        }
    }

    /**
     * Run a test search against the live BM25 index and render the hits.
     * @param {string} query
     */
    async _handleSearch(query) {
        const resultsEl = getById('refSearchResults');
        if (!resultsEl) return;
        const q = (query || '').trim();
        if (!q) { resultsEl.innerHTML = ''; return; }
        if (!bm25Service.isReady()) {
            resultsEl.innerHTML = '<span class="text-secondary">Build the index first.</span>';
            return;
        }
        resultsEl.innerHTML = '<span class="text-secondary">Searching...</span>';
        try {
            const hits = await bm25Service.search(q, 10);
            if (!hits.length) {
                resultsEl.innerHTML = '<span class="text-secondary">No matches.</span>';
                return;
            }
            const rows = hits.map((h, i) => {
                const term = escapeHtml(h.term || '');
                const def = escapeHtml(h.definition || '');
                const score = typeof h.score === 'number' ? h.score.toFixed(1) : '';
                return `<div style="padding: 2px 0; border-bottom: 1px solid var(--border-color);">
                    <strong>${i + 1}.</strong> ${term}${def ? ' &mdash; ' + def : ''} <span class="text-secondary">(${score})</span>
                </div>`;
            }).join('');
            resultsEl.innerHTML =
                `<div class="text-secondary" style="margin-bottom: var(--space-1);">${hits.length} hit(s):</div>${rows}`;
        } catch (error) {
            resultsEl.innerHTML = `<span style="color: var(--color-error);">Search failed: ${escapeHtml(error.message)}</span>`;
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
                // Parse first to discover the available fields, then let the user
                // map which one is indexed vs. shown as a label.
                const { columns } = await referenceService.parseFile(file);
                const defaults = this._guessFieldDefaults(columns);
                const mapping = await dialogManager.showFieldMapping(file.name, columns, defaults);
                if (!mapping) return; // cancelled

                // Re-parse on import (cheap relative to the modal interaction) and
                // map with the chosen fields.
                const { records } = await referenceService.parseFile(file);
                const collection = await referenceService.importRecords(records, mapping, file.name);
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
     * Pre-select sensible default fields for the import mapping dialog.
     * @param {string[]} columns
     * @returns {{text: string, label: string}}
     */
    _guessFieldDefaults(columns) {
        const lower = columns.map(c => c.toLowerCase());
        const find = (patterns) => {
            for (const p of patterns) {
                const i = lower.findIndex(c => p.test(c));
                if (i >= 0) return columns[i];
            }
            return '';
        };
        const text = find([/^(full_?text|text|content|body)$/, /^(term|headword|word|incipit)$/, /text|content/])
            || columns[0] || '';
        const label = find([/^(label|name|title)$/, /^(.*_)?id$/, /^(source|key|ref)$/]);
        return { text, label: label === text ? '' : label };
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
            // Re-render so the index status line and the test-search field
            // reflect the new ready state.
            await this.render();
        }
    }
}

export const referenceUI = new ReferenceUI();
