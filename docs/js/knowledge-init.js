/**
 * Knowledge Base - Document Loader
 * Fetches and renders Markdown files from knowledge/ directory.
 *
 * Security note: Markdown is fetched same-origin from knowledge/*.md and
 * rendered via marked.parse() into innerHTML. CSP script-src 'self'
 * prevents any injected <script> tags from executing.
 */
(function() {
    'use strict';

    // Elements
    const docList = document.getElementById('docList');
    const welcomeState = document.getElementById('welcomeState');
    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const errorMessage = document.getElementById('errorMessage');
    const markdownContent = document.getElementById('markdownContent');

    // State
    let currentDoc = null;

    // Configure marked
    marked.setOptions({
        gfm: true,
        breaks: false,
        headerIds: true,
        mangle: false
    });

    /**
     * Show a specific state, hide others
     */
    function showState(state) {
        welcomeState.hidden = state !== 'welcome';
        loadingState.hidden = state !== 'loading';
        errorState.hidden = state !== 'error';
        markdownContent.hidden = state !== 'content';
    }

    /**
     * Update active state in navigation
     */
    function updateActiveNav(docName) {
        docList.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.doc === docName);
        });
    }

    /**
     * Load and render a markdown document
     */
    async function loadDocument(docName) {
        if (currentDoc === docName) return;

        currentDoc = docName;
        updateActiveNav(docName);
        showState('loading');

        // Update URL hash
        history.replaceState(null, '', `#${docName}`);

        try {
            // Fetch markdown file
            const response = await fetch(`knowledge/${docName}.md`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            let markdown = await response.text();

            // Remove YAML frontmatter (---...---)
            markdown = markdown.replace(/^---[\s\S]*?---\n*/m, '');

            // Render markdown to HTML
            // CSP script-src 'self' blocks any injected script execution
            const html = marked.parse(markdown);

            // Insert into content area
            markdownContent.innerHTML = html;

            // Scroll to top
            markdownContent.scrollTop = 0;

            showState('content');

        } catch (error) {
            console.error('[Knowledge] Failed to load document:', error);
            errorMessage.textContent = error.message;
            showState('error');
        }
    }

    /**
     * Initialize event listeners
     */
    function init() {
        // Click handler for document links
        docList.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            if (navItem) {
                e.preventDefault();
                loadDocument(navItem.dataset.doc);
            }
        });

        // Check URL hash on load
        const hash = window.location.hash.slice(1);
        if (hash) {
            loadDocument(hash);
        }

        // Handle back/forward navigation
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.slice(1);
            if (hash) {
                loadDocument(hash);
            } else {
                currentDoc = null;
                updateActiveNav(null);
                showState('welcome');
            }
        });

        console.log('[Knowledge] Initialized');
    }

    // Start
    init();

    // Show overview by default (no auto-load)
    // Documents load on click or via URL hash
})();
