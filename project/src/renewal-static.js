document.querySelector('.jt-renewal-skip')?.addEventListener('click', event => {
  event.preventDefault();
  const target=document.querySelector('main, article');
  if(target){ target.setAttribute('tabindex','-1'); target.focus(); target.scrollIntoView(); }
});
document.querySelector('.jt-renewal-menu')?.addEventListener('keydown', event => {
  if(event.key==='Escape'){
    event.currentTarget.open=false;
    event.currentTarget.querySelector('summary')?.focus();
  }
});
