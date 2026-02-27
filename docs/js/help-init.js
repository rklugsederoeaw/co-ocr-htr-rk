/**
 * Help page FAQ accordion
 * Replaces inline onclick handlers for CSP compliance
 */
document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.parentElement.classList.toggle('open');
    });
});
