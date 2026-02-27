/**
 * Thinking Panel Component
 *
 * Displays the LLM's thinking/reasoning process in real-time during
 * transcription, validation, and description operations.
 *
 * Event flow:
 *   thinkingStart  --> show panel, set header, clear content
 *   thinkingChunk  --> append text, auto-scroll
 *   thinkingComplete --> show duration, change status
 *   thinkingError  --> show error status
 *   documentLoaded / pageChanged --> reset panel
 */

import { appState } from '../state.js';
import { FEATURE_FLAGS } from '../utils/constants.js';

class ThinkingPanel {
    constructor() {
        this._initialized = false;
        this._section = null;
        this._content = null;
        this._header = null;
        this._icon = null;
        this._collapseBtn = null;
        this._userScrolledUp = false;
        // Accumulator for thinking analysis
        this._accumulatedText = '';
        this._captureMetadata = {};
        this._lastDuration = 0;
    }

    init() {
        if (this._initialized) return;
        this._initialized = true;

        if (!FEATURE_FLAGS.thinkingPanel) return;

        this._section = document.getElementById('thinkingSection');
        this._content = document.getElementById('thinkingContent');
        this._header = document.getElementById('thinkingHeader');
        this._icon = document.getElementById('thinkingIcon');
        this._collapseBtn = document.getElementById('thinkingCollapseBtn');

        if (!this._section || !this._content) {
            console.warn('[ThinkingPanel] DOM elements not found');
            return;
        }

        this._bindEvents();
    }

    _bindEvents() {
        // Thinking lifecycle events
        appState.addEventListener('thinkingStart', (e) => this._onStart(e.detail));
        appState.addEventListener('thinkingChunk', (e) => this._onChunk(e.detail));
        appState.addEventListener('thinkingComplete', (e) => this._onComplete(e.detail));
        appState.addEventListener('thinkingError', (e) => this._onError(e.detail));

        // Reset on document/page change
        appState.addEventListener('documentLoaded', () => this._reset());
        appState.addEventListener('pageChanged', () => this._reset());

        // Collapse/expand toggle
        if (this._collapseBtn) {
            this._collapseBtn.addEventListener('click', () => this._toggleCollapse());
        }

        // Track user scroll to disable auto-scroll when user scrolls up
        if (this._content) {
            this._content.addEventListener('scroll', () => {
                const { scrollTop, scrollHeight, clientHeight } = this._content;
                // User is "scrolled up" if more than 20px from bottom
                this._userScrolledUp = (scrollHeight - scrollTop - clientHeight) > 20;
            });
        }
    }

    /**
     * Handle thinkingStart -- show panel, set header, clear content
     */
    _onStart(detail) {
        if (!this._section) return;

        // Reset accumulator for new operation
        this._accumulatedText = '';
        this._captureMetadata = {
            operation: detail.operation,
            provider: detail.provider,
            model: detail.model
        };
        this._lastDuration = 0;

        // Hide analyze button for fresh operation
        const analyzeBtn = document.getElementById('thinkingAnalyzeBtn');
        if (analyzeBtn) analyzeBtn.hidden = true;

        const operationLabels = {
            transcription: 'Transcription',
            validation: 'LLM Review',
            description: 'Description'
        };

        const label = operationLabels[detail.operation] || detail.operation || 'LLM';

        if (this._header) {
            this._header.textContent = `${label} -- LLM Thinking`;
        }

        if (this._content) {
            this._content.textContent = '';
        }

        this._userScrolledUp = false;
        this._section.hidden = false;
        this._section.classList.remove('thinking-complete', 'thinking-error', 'thinking-collapsed');
        this._section.classList.add('thinking-active');
    }

    /**
     * Handle thinkingChunk -- append text, auto-scroll
     */
    _onChunk(detail) {
        if (!this._content || !detail.text) return;

        // Accumulate for analysis
        this._accumulatedText += detail.text;

        // Use textContent += for XSS safety
        this._content.textContent += detail.text;

        // Auto-scroll unless user scrolled up
        if (!this._userScrolledUp) {
            this._content.scrollTop = this._content.scrollHeight;
        }
    }

    /**
     * Handle thinkingComplete -- update status, show duration
     */
    _onComplete(detail) {
        if (!this._section) return;

        this._lastDuration = detail.duration || 0;

        this._section.classList.remove('thinking-active');
        this._section.classList.add('thinking-complete');

        // Show duration in header
        if (this._header && detail.duration) {
            const seconds = (detail.duration / 1000).toFixed(1);
            this._header.textContent += ` (${seconds}s)`;
        }

        // Show analyze button if we have accumulated thinking text
        const analyzeBtn = document.getElementById('thinkingAnalyzeBtn');
        if (analyzeBtn && this._accumulatedText.length > 0) {
            analyzeBtn.hidden = false;
        }
    }

    /**
     * Handle thinkingError -- show error status
     */
    _onError(detail) {
        if (!this._section) return;

        this._section.classList.remove('thinking-active');
        this._section.classList.add('thinking-error');

        if (this._header) {
            const msg = detail.message || 'Stream error';
            this._header.textContent += ` -- ${msg}`;
        }
    }

    /**
     * Toggle collapsed state
     */
    _toggleCollapse() {
        if (!this._section) return;
        this._section.classList.toggle('thinking-collapsed');
    }

    /**
     * Reset panel -- hide and clear content
     */
    _reset() {
        if (!this._section) return;

        this._section.hidden = true;
        this._section.classList.remove('thinking-active', 'thinking-complete', 'thinking-error', 'thinking-collapsed');

        if (this._content) {
            this._content.textContent = '';
        }
        if (this._header) {
            this._header.textContent = 'LLM Thinking';
        }

        this._userScrolledUp = false;
        this._accumulatedText = '';
        this._captureMetadata = {};
        this._lastDuration = 0;

        const analyzeBtn = document.getElementById('thinkingAnalyzeBtn');
        if (analyzeBtn) analyzeBtn.hidden = true;
    }

    // Getters for thinking analysis
    getAccumulatedThinking() { return this._accumulatedText; }
    getCaptureMetadata() { return this._captureMetadata || {}; }
    getLastDuration() { return this._lastDuration; }
}

// Export singleton
export const thinkingPanel = new ThinkingPanel();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => thinkingPanel.init());
} else {
    thinkingPanel.init();
}
