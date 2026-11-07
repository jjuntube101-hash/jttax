(() => {
  const search = document.querySelector('.jt-ih-search');
  if (!search) return;
  const input = search.querySelector('input');
  const status = search.querySelector('[role=status]');
  const entries = Array.from(document.querySelectorAll('.jt-ih-card'), card => ({
    card,
    text: card.textContent.toLocaleLowerCase('ko').replace(/\s+/g, ' '),
  }));
  function filterGuides() {
    const words = input.value.toLocaleLowerCase('ko').trim().split(/\s+/);
    let count = 0;
    for (const { card, text } of entries) {
      card.hidden = !words.every(word => text.includes(word));
      if (!card.hidden) count++;
    }
    status.textContent = count ? ('가이드 ' + count + '편') : '검색 결과가 없습니다.';
  }
  input.addEventListener('input', filterGuides);
  filterGuides();
  search.hidden = false;
})();
