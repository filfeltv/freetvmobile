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

        // Restauration focus
        const STORAGE_KEY = 'tv_last_channel_index';
        let wantedIndex = null; // on veut restaurer cet index après rendu

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

        // ---- Bridge vers l’app (optionnel, inoffensif sur desktop)
        function notify(type) {
            try { if (window.Tv && Tv.postMessage) Tv.postMessage(type); } catch (_) { }
        }

        // ---- Simuler un “vrai” tap (certaines WebView exigent un pointer/mouse)
        function simulateUserTap(el) {
            try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); } catch (_) { }
            try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })); } catch (_) { }
            try { el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true })); } catch (_) { }
            try { el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })); } catch (_) { }
            try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch (_) { try { el.click(); } catch (_) { } }
        }

        /* ---- recherche (référence dès maintenant) ---- */
        const searchBar = document.getElementById('searchBar');
        // Empêcher tout auto-focus par le navigateur/webview
        searchBar.setAttribute('tabindex', '-1');

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

                    // Tenter de restaurer l’index mémorisé
                    const saved = parseInt(sessionStorage.getItem(STORAGE_KEY) ?? 'NaN', 10);
                    if (!Number.isNaN(saved)) {
                        wantedIndex = saved;
                        currentIndex = saved; // pour que render sache qu’on vise une carte
                    }

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

            // Si on ne tape pas dans la recherche, on ne veut pas la considérer "active"
            if (document.activeElement !== searchBar) currentIndex = (currentIndex < 0 ? -1 : currentIndex);

            // Restauration prioritaire : si wantedIndex défini, on le prend (borné)
            if (wantedIndex !== null && filtered.length > 0) {
                setActiveChannel(Math.max(0, Math.min(wantedIndex, filtered.length - 1)));
                wantedIndex = null; // consommé
                return;
            }

            // Sinon, au tout premier rendu, prendre la première carte.
            if (currentIndex === -1 && filtered.length > 0) {
                setActiveChannel(0);
            } else if (currentIndex >= 0 && filtered.length > 0) {
                setActiveChannel(Math.min(currentIndex, filtered.length - 1));
            }
        }

        /* ---- sélection cartes / recherche ---- */
        function setActiveChannel(idx) {
            const tiles = $all('.channel');
            if (!tiles.length) return;
            idx = Math.max(0, Math.min(idx, tiles.length - 1));
            clearActive(tiles);
            tiles[idx].classList.add('is-active');

            // Empêcher la recherche d’être focusable par défaut
            searchBar.classList.remove('is-active');
            if (searchBar.getAttribute('tabindex') !== '-1') {
                searchBar.setAttribute('tabindex', '-1');
            }

            currentIndex = idx;
            lastChannelIndex = idx;
            // Sauvegarde pour retour / reload
            try { sessionStorage.setItem(STORAGE_KEY, String(idx)); } catch (_) {}

            focusElement(tiles[idx]);
        }

        function startEditingSearch() {
            const sb = searchBar;
            if (!sb) return;

            // Rendre la recherche focusable UNIQUEMENT quand on le demande
            sb.setAttribute('tabindex', '0');
            sb.classList.add('is-active');

            // 1) focus + caret visible
            try { sb.focus({ preventScroll: true }); } catch (_) { sb.focus(); }
            try { sb.setSelectionRange(sb.value.length, sb.value.length); } catch (_) { }

            // 2) “user gesture” synthétique pour WebView strictes
            simulateUserTap(sb);

            // 3) API Virtual Keyboard si dispo (certaines WebView récentes)
            try { if (navigator.virtualKeyboard && navigator.virtualKeyboard.show) navigator.virtualKeyboard.show(); } catch (_) { }

            // 4) Notifier l’app (si présente) pour ouvrir l’IME nativement
            notify('input_focus');
        }

        function setActiveSearch(e) {
            if (e) {
                e.preventDefault();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation(); else e.stopPropagation();
            }
            clearActive($all('.channel'));
            currentIndex = -1;

            // Double passe pour fiabiliser le focus sur certaines WebView
            requestAnimationFrame(() => {
                startEditingSearch();
                setTimeout(() => {
                    if (document.activeElement !== searchBar) {
                        startEditingSearch();
                    }
                }, 30);
            });
        }

        /* ---- modal serveurs ---- */
        function showServers(channel) {
            // Mémoriser la carte courante avant d’ouvrir le modal (utile si on part puis revient)
            lastChannelIndex = currentIndex;
            try { sessionStorage.setItem(STORAGE_KEY, String(lastChannelIndex)); } catch (_) {}

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
                    // Sauvegarder l’index avant tentative d’ouverture (deep link OK ou KO)
                    try { sessionStorage.setItem(STORAGE_KEY, String(lastChannelIndex)); } catch (_) {}
                    // Ouvrir (deep link, nouvelle fenêtre, etc.)
                    window.open(serverLink, '_blank', 'noopener,noreferrer');
                    // Le reste (retour/bfcache) sera géré par pageshow/focus + restauration
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
            searchBar.classList.add('is-active');
            notify('input_focus'); // l’app peut ouvrir l’IME
        });

        searchBar.addEventListener('blur', () => {
            searchBar.classList.remove('is-active');
            notify('input_blur'); // l’app peut fermer l’IME
        });

        // Empêche la double action Enter/Bas (propagation) et pilote la nav
        searchBar.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation(); else e.stopPropagation();
                notify('input_submit'); // l’app peut fermer l’IME si besoin
                setTimeout(() => {
                    const tiles = $all('.channel');
                    if (tiles.length) setActiveChannel(0);
                }, 0);
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
            // Garde : si l'event vient de la barre de recherche, on sort
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
                if (event.key === 'Enter') { event.preventDefault(); setActiveSearch(event); return; }
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
                else setActiveSearch(event); // remonte vers la barre (et ENTRE en édition)
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

        /* ---- restauration au retour / bfcache ---- */
        window.addEventListener('pageshow', () => {
            const saved = parseInt(sessionStorage.getItem(STORAGE_KEY) ?? 'NaN', 10);
            if (!Number.isNaN(saved)) {
                wantedIndex = saved;
                // Si les cartes existent déjà, applique tout de suite
                const tiles = $all('.channel');
                if (tiles.length) setActiveChannel(Math.min(saved, tiles.length - 1));
            }
            // S’assurer que la recherche n’est pas tabbable par défaut
            searchBar.setAttribute('tabindex', '-1');
        });

        // Quand l’onglet reprend le focus, réappliquer la sélection
        window.addEventListener('focus', () => {
            const saved = parseInt(sessionStorage.getItem(STORAGE_KEY) ?? 'NaN', 10);
            if (!Number.isNaN(saved) && !isServerMode) {
                const tiles = $all('.channel');
                if (tiles.length) setActiveChannel(Math.min(saved, tiles.length - 1));
            }
            searchBar.setAttribute('tabindex', '-1');
        });

        /* ---- boot ---- */
        loadChannels();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
