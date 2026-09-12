/**
 * Demo Annotation Webpage Logic for Rooya AI Workspace
 * Increments page submit and skip counts for visual validation.
 */

document.addEventListener('DOMContentLoaded', () => {
  const submitBtn = document.getElementById('submit-btn');
  const skipBtn = document.getElementById('skip-btn');
  const submitCntEl = document.getElementById('page-submits-cnt');
  const skipCntEl = document.getElementById('page-skips-cnt');

  let submitsCount = 0;
  let skipsCount = 0;

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      submitsCount++;
      if (submitCntEl) submitCntEl.textContent = submitsCount;
      console.log(`[Rooya Demo Webpage] Submit clicked. Total Page Submits: ${submitsCount}`);
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      skipsCount++;
      if (skipCntEl) skipCntEl.textContent = skipsCount;
      console.log(`[Rooya Demo Webpage] Skip clicked. Total Page Skips: ${skipsCount}`);
    });
  }
});
