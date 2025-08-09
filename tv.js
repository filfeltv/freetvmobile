// tv.js
(function () {
    'use strict';

    function init() {

        /* ---- état global ---- */
        let channels = [];
        let currentIndex = -1;         // -1 = "état neutre / recherche quand on la demande"
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

        // ---- Bridge vers l’app (optionnel)
        function notify(type) {
            try { if (window.Tv && Tv.postMessage) Tv.postMessage(type); } catch (_) { }
        }

        // ---- Simuler un “vrai” tap (pour WebView strictes)
        function simulateUserTap(el) {
            try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); } catch (_) { }
            try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })); } catch (_) { }
            try { el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true })); } catch (_) { }
            try { el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })); } catch (_) { }
            try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch (_) { try { el.click(); } catch (_) { } }
        }

        /* ---- barre de recherche ---- */
        const searchBar = document.getElementById('searchBar');

        // 1) Empêcher tout focus auto au démarrage (aucun clavier qui pop)
        if (searchBar) {
            searchBar.setAttribute('tabindex', '-1'); // hors tab order par défaut
            // Si jamais l’UA la focus quand même, on la blur immédiatement
            if (document.activeElement === searchBar) {
                try { searchBar.blur(); } catch (_) {}
            }
        }

        // 2) Re-blinder au retour/bfcache/prise de focus fenêtre
        window.addEventListener('pageshow', () => {
            if (!searchBar) return;
            searchBar.setAttribute('tabindex', '-1');
            if (document.activeElement === searchBar) {
                try { searchBar.blur(); } catch (_) {}
            }
        });
        window.addEventListener('focus', () => {
            if (!searchBar) return;
            searchBar.setAttribute('tabindex', '-1');
        });

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

            // Réinitialiser la sélection visuelle (aucune carte active au chargement)
            clearActive($all('.channel'));

            // ⚠️ Ne PAS appeler setActiveChannel(0) ici : pas de sélection par défaut.
            // On attend une action utilisateur (flèches / clic).
        }

        /* ---- sélection cartes / recherche ---- */
        function setActiveChannel(idx) {
            const tiles = $all('.channel');
            if (!tiles.length) return;
            idx = Math.max(0, Math.min(idx, tiles.length - 1));
            clearActive(tiles);
            tiles[idx].classList.add('is-active');
            if (searchBar) {
                searchBar.classList.remove('is-active');
                // On laisse la recherche hors tab-order tant que l’utilisateur ne la demande pas
                searchBar.setAttribute('tabindex', '-1');
            }
            currentIndex = idx;
            focusElement(tiles[idx]);
        }

        function startEditingSearch() {
            if (!searchBar) return;
            // La recherche devient focusable UNIQUEMENT quand l’utilisateur la demande
            searchBar.setAttribute('tabindex', '0');
            searchBar.classList.add('is-active');

            try { searchBar.focus({ preventScroll: true }); } catch (_) { searchBar.focus(); }
            try { searchBar.setSelectionRange(searchBar.value.length, searchBar.value.length); } catch (_) { }

            simulateUserTap(searchBar);

            try { if (navigator.virtualKeyboard && navigator.virtualKeyboard.show) navigator.virtualKeyboard.show(); } catch (_) { }
            notify('input_focus');
        }

        function setActiveSearch(e) {
            if (e) {
                e.preventDefault();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation(); else e.stopPropagation();
            }
            clearActive($all('.channel'));
            currentIndex = -1;

            requestAnimationFrame(() => {
                startEditingSearch();
                setTimeout(() => {
                    if (document.activeElement !== searchBar) startEditingSearch();
                }, 30);
            });
        }

        /* ---- modal serveurs ---- */
        function showServers(channel) {
            // ✅ Fix n°2 : mémoriser la carte courante même si on ouvre via CLIC
            lastChannelIndex = currentIndex;

            isServerMode = true;
            const serverList = $("#serverList");
            const serverContent = $("#serverContent");
            serverContent.innerHTML = `<h2>Choisissez un serveur pour "${channel.name}"</h2>`;

            Object.entries(channel.servers).forEach(([serverName, serverLink]) => {
                const div = document.createElement("div");
                div.className = "server";
                div.tabIndex = 0;
                div.textContent = serverName;
                div.addEventListener("click", () => {
                    // On garde en mémoire où on était pour bien revenir ensuite
                    lastChannelIndex = currentIndex;
                    window.open(serverLink, '_blank', 'noopener,noreferrer');
                });
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
        searchBar.addEventListener('input', () => {
            if (searchTimeoutId) clearTimeout(searchTimeoutId);
            searchTimeoutId = setTimeout(() => {
                renderChannels(searchBar.value.trim());
            }, 120);
        });

        searchBar.addEventListener('focus', () => {
            // Si, pour une raison externe, la WebView focus la barre alors qu'on ne l'a pas demandée,
            // on la retire immédiatement du focus (tabindex=-1 ⇒ hors tab-order).
            if (searchBar.getAttribute('tabindex') === '-1') {
                try { searchBar.blur(); } catch (_) {}
                return;
            }
            searchBar.classList.add('is-active');
            notify('input_focus');
        });

        searchBar.addEventListener('blur', () => {
            searchBar.classList.remove('is-active');
            notify('input_blur');
            // Re-blinder : pas focusable tant qu'on ne la demande pas
            searchBar.setAttribute('tabindex', '-1');
        });

        // Empêche la double action Enter/Bas et pilote la nav
        searchBar.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation(); else e.stopPropagation();
                notify('input_submit');
                // Pas de sélection auto ici non plus : on laisse l’utilisateur choisir
            } else if (e.key === 'ArrowDown') {
                const first = $('.channel');
                if (first) {
                    e.preventDefault();
                    if (e.stopImmediatePropagation) e.stopImmediatePropagation(); else e.stopPropagation();
                    setTimeout(() => setActiveChannel(0), 0);
                }
            }
        });

        /* ---- navigation globale D-Pad ---- */
        document.addEventListener('keydown', (event) => {
            // Si l'event vient de la barre de recherche, on la laisse gérer
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

            // État "neutre" : aucune carte sélectionnée au départ
            if (currentIndex === -1) {
                if (event.key === 'Enter') { event.preventDefault(); setActiveSearch(event); return; }
                if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                    if (tiles.length) { event.preventDefault(); setActiveChannel(0); }
                    return;
                }
                // ArrowUp depuis l'état neutre ⇒ aller vers la barre (volontaire)
                if (event.key === 'ArrowUp') { event.preventDefault(); setActiveSearch(event); return; }
            }

            // Navigation dans la grille une fois qu'une carte est active
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                setActiveChannel(Math.min(currentIndex + 1, tiles.length - 1));
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setActiveChannel(currentIndex <= 0 ? 0 : currentIndex - 1);
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (currentIndex + cols < tiles.length) setActiveChannel(currentIndex + cols);
                else setActiveChannel(tiles.length - 1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (currentIndex - cols >= 0) setActiveChannel(currentIndex - cols);
                else setActiveSearch(event); // remonte vers la barre (volontaire)
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
