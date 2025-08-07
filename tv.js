


// tv.js
(function () {
  'use strict';
  function init() {
    
/* ---- état global ---- */
let channels = [];
let currentIndex = -1;         // -1 = recherche active
let isServerMode = false;
let lastChannelIndex = 0;
let searchTimeoutId = null;

/* ---- utilitaires ---- */
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function preloadImage(src) { const img = new Image(); img.src = src; }

function focusElement(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch (_) { }
}

function clearActive(list) { list.forEach(n => n.classList.remove('is-active')); }

/* ---- données ---- */
function loadChannels() {
    fetch('channels.json')
        .then(r => r.json())
        .then(data => {
            channels = Object.entries(data).map(([name, details]) => {
                const logo = details.image || 'https://via.placeholder.com/80';
                preloadImage(logo);
                return { name, logo, servers: details.servers };
            });
            renderChannels();
        })
        .catch(err => console.error('Erreur lors du chargement des chaînes:', err));
}

/* ---- rendu ---- */
function renderChannels(filter = "") {
    const container = $("#channels");
    container.innerHTML = "";

    const filtered = channels.filter(ch => ch.name.toLowerCase().includes(filter.toLowerCase()));
    filtered.forEach(channel => {
        const tile = document.createElement("div");
        tile.className = "channel";
        tile.tabIndex = 0;

        const bg = document.createElement("div");
        bg.className = "channel-bg";
        bg.style.backgroundImage = `url(${channel.logo})`;
        tile.appendChild(bg);

        const name = document.createElement("div");
        name.className = "channel-name";
        name.textContent = channel.name;
        tile.appendChild(name);

        tile.addEventListener("click", () => showServers(channel));

        container.appendChild(tile);
        requestAnimationFrame(() => tile.classList.add("visible"));
    });

    // reset sélection cartes (on garde éventuel halo de la recherche)
    clearActive($all('.channel'));
    if (document.activeElement !== $('#searchBar')) currentIndex = -1;
}

/* ---- sélection cartes / recherche ---- */
function setActiveChannel(idx) {
    const tiles = $all('.channel');
    if (!tiles.length) return;
    idx = Math.max(0, Math.min(idx, tiles.length - 1));
    clearActive(tiles);
    tiles[idx].classList.add('is-active');
    $('#searchBar').classList.remove('is-active');
    currentIndex = idx;
    focusElement(tiles[idx]);
}

function startEditingSearch() {
    const sb = $('#searchBar');
    if (!sb) return;
    sb.classList.add('is-active');
    focusElement(sb);
    // Aide l’IME en WebView
    try { sb.click(); } catch (_) { }
}

function setActiveSearch() {
    clearActive($all('.channel'));
    currentIndex = -1;
    startEditingSearch();
}

/* ---- modal serveurs ---- */
function showServers(channel) {
    isServerMode = true;
    const serverList = $("#serverList");
    const serverContent = $("#serverContent");
    serverContent.innerHTML = `<h2>Choisissez un serveur pour "${channel.name}"</h2>`;

    Object.entries(channel.servers).forEach(([serverName, serverLink]) => {
        const div = document.createElement("div");
        div.className = "server";
        div.tabIndex = 0;
        div.textContent = serverName;
        div.addEventListener("click", () => window.open(serverLink, '_blank', 'noopener,noreferrer'));
        serverContent.appendChild(div);
    });

    const quitBtn = document.createElement("div");
    quitBtn.className = "server quit-btn";
    quitBtn.tabIndex = 0;
    quitBtn.textContent = "Quitter";
    quitBtn.addEventListener("click", closeServers);
    serverContent.appendChild(quitBtn);

    serverList.style.display = "block";
    setActiveServer(0);
}

function closeServers() {
    isServerMode = false;
    $("#serverList").style.display = "none";
    const tiles = $all('.channel');
    if (tiles[lastChannelIndex]) setActiveChannel(lastChannelIndex);
}

function setActiveServer(idx) {
    const items = $all('.server');
    if (!items.length) return;
    idx = Math.max(0, Math.min(idx, items.length - 1));
    clearActive(items);
    items[idx].classList.add('is-active');
    currentIndex = idx;
    focusElement(items[idx]);
}

/* ---- recherche ---- */
const searchBar = document.getElementById('searchBar');

searchBar.addEventListener('input', () => {
    if (searchTimeoutId) clearTimeout(searchTimeoutId);
    searchTimeoutId = setTimeout(() => {
        renderChannels(searchBar.value.trim());
    }, 120);
});

searchBar.addEventListener('focus', () => searchBar.classList.add('is-active'));
searchBar.addEventListener('blur', () => searchBar.classList.remove('is-active'));

// ✅ IMPORTANT : empêcher la propagation au handler global
searchBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        // Passer à la 1ʳᵉ carte APRÈS ce tick pour éviter que le global voie le même event
        setTimeout(() => {
            const tiles = $all('.channel');
            if (tiles.length) setActiveChannel(0);
        }, 0);
    } else if (e.key === 'ArrowDown') {
        const first = $('.channel');
        if (first) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            setTimeout(() => setActiveChannel(0), 0);
        }
    }
});

/* ---- navigation globale D-Pad ---- */
document.addEventListener('keydown', (event) => {
    // Garde : si l'event VIENT de la barre de recherche, on sort
    if (event.target === searchBar) return;

    // Si le modal serveurs est ouvert, le gérer exclusivement
    if (isServerMode) {
        const items = $all('.server');
        if (!items.length) return;
        if (event.key === 'ArrowDown') { event.preventDefault(); setActiveServer(Math.min(currentIndex + 1, items.length - 1)); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveServer(Math.max(currentIndex - 1, 0)); }
        else if (event.key === 'Enter') { event.preventDefault(); items[currentIndex].click(); }
        else if (event.key === 'Backspace' || event.key === 'Escape') { event.preventDefault(); closeServers(); }
        return;
    }

    const tiles = $all('.channel');
    const cols = getCols();

    // Si l'input est réellement focus, on laisse ses handlers agir
    if (document.activeElement === searchBar) return;

    // Cas "recherche active mais pas encore en édition"
    if (currentIndex === -1) {
        if (event.key === 'Enter') { event.preventDefault(); startEditingSearch(); return; }
        if (event.key === 'ArrowDown') {
            const first = $('.channel');
            if (first) { event.preventDefault(); setActiveChannel(0); }
            return;
        }
    }

    // Navigation dans la grille
    if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveChannel(currentIndex === -1 ? 0 : Math.min(currentIndex + 1, tiles.length - 1));
    } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveChannel(currentIndex <= 0 ? 0 : currentIndex - 1);
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (currentIndex === -1) setActiveChannel(0);
        else if (currentIndex + cols < tiles.length) setActiveChannel(currentIndex + cols);
        else setActiveChannel(tiles.length - 1);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (currentIndex - cols >= 0) setActiveChannel(currentIndex - cols);
        else setActiveSearch(); // remonte vers la barre (et entre en édition)
    } else if (event.key === 'Enter') {
        event.preventDefault();
        if (currentIndex >= 0) { lastChannelIndex = currentIndex; tiles[currentIndex].click(); }
    }
});

function getCols() {
    const container = $('.container');
    const item = $('.channel');
    if (!container || !item) return 5;
    const cw = container.offsetWidth;
    const iw = item.offsetWidth || 1;
    return Math.max(1, Math.floor(cw / iw));
}

/* ---- boot ---- */
loadChannels();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
