(function(){
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

  const grid = $('#grid');
  const input = $('#q');
  const sheet = $('#sheet');
  const backdrop = $('#backdrop');
  const serversBox = $('#servers');
  const sheetTitle = $('#sheetTitle');
  const closeSheetBtn = $('#closeSheet');
  const toTop = $('#toTop');
  const infobar = $('#infobar');
  const hideInfo = $('#hideInfo');
  const countPill = $('#countPill');

  // Hide infobar (persist)
  hideInfo.addEventListener('click', ()=>{
    infobar.style.display='none';
    try{ localStorage.setItem('infobar.hide','1'); }catch(_){}
  });
  try{ if(localStorage.getItem('infobar.hide')==='1'){ infobar.style.display='none'; } }catch(_){}

  // Debounce util
  const debounce=(fn,ms)=>{ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; };

  // State
  let allChannels = [];
  let filtered = [];
  const restoreKey = 'mobile_last_query';

  // Lazy images
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        const img = entry.target;
        img.src = img.dataset.src;
        io.unobserve(img);
      }
    });
  },{rootMargin:'200px'}) : null;

  // Render list
  function renderList(list){
    grid.setAttribute('aria-busy','true');
    grid.innerHTML = '';
    if(!list.length){
      grid.innerHTML = `<div style="opacity:.7;padding:20px;text-align:center;border:1px dashed rgba(255,255,255,.15);border-radius:12px">Aucun résultat</div>`;
      grid.removeAttribute('aria-busy');
      updateCount(0);
      return;
    }
    const frag = document.createDocumentFragment();
    list.forEach(ch=>{
      const card = document.createElement('button');
      card.className = 'card';
      card.type='button';
      card.setAttribute('aria-label', `Ouvrir ${ch.name}`);
      // thumb
      const th = document.createElement('div');
      th.className='thumb';
      const img = document.createElement('img');
      img.alt = ch.name;
      img.loading='lazy';
      img.dataset.src = ch.logo || 'https://via.placeholder.com/120x80?text=TV';
      th.appendChild(img);
      // meta
      const meta = document.createElement('div');
      meta.className='meta';
      const name = document.createElement('div');
      name.className='name';
      name.textContent = ch.name;
      const hint = document.createElement('div');
      hint.className='hint';
      hint.textContent = `${Object.keys(ch.servers||{}).length} serveur(s)`;
      meta.appendChild(name); meta.appendChild(hint);
      // open icon
      const open = document.createElement('div');
      open.className='open';
      open.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      // compose
      card.appendChild(th); card.appendChild(meta); card.appendChild(open);
      // click
      card.addEventListener('click', ()=>openSheet(ch));
      frag.appendChild(card);

      if(io) io.observe(img); else img.src = img.dataset.src;
    });
    grid.appendChild(frag);
    grid.removeAttribute('aria-busy');
    updateCount(list.length);
  }

  function updateCount(n){
    if(!n && input.value.trim()===''){ countPill.style.display='none'; return; }
    countPill.textContent = `${n} résultat${n>1?'s':''}`;
    countPill.style.display='inline-flex';
  }

  // Sheet open/close
  function openSheet(channel){
    sheetTitle.textContent = channel.name;
    serversBox.innerHTML = '';
    const servers = channel.servers || {};
    Object.entries(servers).forEach(([label, href])=>{
      const a = document.createElement('a');
      a.className='server';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = label;
      serversBox.appendChild(a);
    });
    backdrop.classList.add('active');
    sheet.classList.add('active');
    sheet.setAttribute('aria-hidden','false');
    backdrop.setAttribute('aria-hidden','false');
  }
  function closeSheet(){
    sheet.classList.remove('active');
    backdrop.classList.remove('active');
    sheet.setAttribute('aria-hidden','true');
    backdrop.setAttribute('aria-hidden','true');
  }
  closeSheetBtn.addEventListener('click', closeSheet);
  backdrop.addEventListener('click', closeSheet);

  // Swipe-to-close
  (function enableSwipe(){
    let startY=null, currentY=null, dragging=false;
    const thresh=70;
    sheet.addEventListener('touchstart', (e)=>{ startY = e.touches[0].clientY; dragging=true; sheet.style.transition='none'; }, {passive:true});
    sheet.addEventListener('touchmove', (e)=>{
      if(!dragging) return;
      currentY = e.touches[0].clientY;
      const dy = Math.max(0, currentY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    }, {passive:true});
    sheet.addEventListener('touchend', ()=>{
      sheet.style.transition='';
      const dy = (currentY??0) - (startY??0);
      if(dy>thresh) closeSheet();
      else sheet.style.transform = '';
      dragging=false; startY=null; currentY=null;
    });
  })();

  // Scroll to top
  toTop.addEventListener('click', ()=>window.scrollTo({top:0,behavior:'smooth'}));
  window.addEventListener('scroll', ()=>{
    if(document.documentElement.scrollTop > 600) toTop.classList.add('show');
    else toTop.classList.remove('show');
  });

  // Search + debounce + persist query
  const onSearch = debounce(()=>{
    const q = input.value.trim().toLowerCase();
    try{ localStorage.setItem(restoreKey, q); }catch(_){}
    if(!q){ filtered = allChannels.slice(); renderList(filtered); return; }
    filtered = allChannels.filter(c=>c.name.toLowerCase().includes(q));
    renderList(filtered);
  }, 150);
  input.addEventListener('input', onSearch);
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.target.blur(); } });
  input.addEventListener('search', ()=> input.blur());

  // Fetch channels
  fetch('data/channels.json')
    .then(r=>r.json())
    .then(data=>{
      allChannels = Object.entries(data).map(([name, details])=>({
        name,
        logo: (details && details.image) ? details.image : 'https://via.placeholder.com/120x80?text=TV',
        servers: details ? details.servers : {}
      }));
      // Restore query
      try{
        const rq = localStorage.getItem(restoreKey) || '';
        if(rq){ input.value = rq; filtered = allChannels.filter(c=>c.name.toLowerCase().includes(rq.toLowerCase())); }
        else { filtered = allChannels.slice(); }
      }catch(_){ filtered = allChannels.slice(); }
      renderList(filtered);
    })
    .catch(err=>{
      console.error('Erreur chargement channels:', err);
      grid.innerHTML = `<div style="opacity:.8;padding:20px;text-align:center">Impossible de charger les chaînes.</div>`;
      grid.removeAttribute('aria-busy');
    });
})();
