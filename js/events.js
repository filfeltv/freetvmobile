(function(){
  const $ = (s, r=document)=>r.querySelector(s);

  const grid = $('#grid');
  const input = $('#q');
  const sheet = $('#sheet');
  const backdrop = $('#backdrop');
  const serversBox = $('#servers');
  const sheetTitle = $('#sheetTitle');
  const closeSheetBtn = $('#closeSheet');
  const toTop = $('#toTop');
  const countPill = $('#countPill');

  // Debounce
  const debounce=(fn,ms)=>{ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; };

  // State
  let allMatches = [];
  let filtered = [];
  const restoreKey = 'events_last_query';

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

  function cardHTML(match){
    const logo = match.logo || 'https://via.placeholder.com/120x80?text=TV';
    // Carte au même format que l’app principale
    const wrap = document.createElement('button');
    wrap.className = 'card';
    wrap.type = 'button';
    wrap.setAttribute('aria-label', `Ouvrir ${match.name}`);

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const img = document.createElement('img');
    img.alt = match.name;
    img.loading = 'lazy';
    img.dataset.src = logo;
    thumb.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = match.name;
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = `${Object.keys(match.servers||{}).length} source(s)`;
    meta.appendChild(name); meta.appendChild(hint);

    const open = document.createElement('div');
    open.className = 'open';
    open.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    wrap.appendChild(thumb);
    wrap.appendChild(meta);
    wrap.appendChild(open);

    // click -> open sheet
    wrap.addEventListener('click', ()=>openSheet(match));

    if(io) io.observe(img); else img.src = logo;

    return wrap;
  }

  function renderList(list){
    grid.setAttribute('aria-busy','true');
    grid.innerHTML = '';
    if(!list.length){
      grid.innerHTML = `<div style="opacity:.7;padding:20px;text-align:center;border:1px dashed rgba(255,255,255,.15);border-radius:12px">Aucun match</div>`;
      grid.removeAttribute('aria-busy');
      updateCount(0);
      return;
    }
    const frag = document.createDocumentFragment();
    list.forEach(m=>frag.appendChild(cardHTML(m)));
    grid.appendChild(frag);
    grid.removeAttribute('aria-busy');
    updateCount(list.length);
  }

  function updateCount(n){
    if(!n && input.value.trim()===''){ countPill.style.display='none'; return; }
    countPill.textContent = `${n} résultat${n>1?'s':''}`;
    countPill.style.display='inline-flex';
  }

  function openSheet(match){
    sheetTitle.textContent = match.name;
    serversBox.innerHTML = '';
    const servers = match.servers || {};
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

  // Search
  const onSearch = debounce(()=>{
    const q = input.value.trim().toLowerCase();
    try{ localStorage.setItem(restoreKey, q); }catch(_){}
    if(!q){ filtered = allMatches.slice(); renderList(filtered); return; }
    filtered = allMatches.filter(c=>c.name.toLowerCase().includes(q));
    renderList(filtered);
  }, 150);
  input.addEventListener('input', onSearch);
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.target.blur(); } });
  input.addEventListener('search', ()=> input.blur());

  // Fetch matches (chaînes d’événements)
  fetch('data/events.json')
    .then(r=>r.json())
    .then(data=>{
      allMatches = Object.entries(data).map(([name, details])=>({
        name,
        logo: (details && details.image) ? details.image : 'https://via.placeholder.com/120x80?text=TV',
        servers: details ? details.servers : {}
      }));
      // Restore query
      try{
        const rq = localStorage.getItem(restoreKey) || '';
        if(rq){ input.value = rq; filtered = allMatches.filter(c=>c.name.toLowerCase().includes(rq.toLowerCase())); }
        else { filtered = allMatches.slice(); }
      }catch(_){ filtered = allMatches.slice(); }
      renderList(filtered);
    })
    .catch(err=>{
      console.error('Erreur chargement events:', err);
      grid.innerHTML = `<div style="opacity:.8;padding:20px;text-align:center">Impossible de charger les matchs.</div>`;
      grid.removeAttribute('aria-busy');
    });
})();
