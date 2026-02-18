/**
 * Universal Plugin Core Framework - Mit externen Quellen
 * Erweitert um Kategorie-Filter (basierend auf TERMS-Feld aus DokuMe)
 */
(function (window) {
  'use strict';

  window.UniversalPlugins = window.UniversalPlugins || {};

  const PLUGIN_CONFIG = {
    baseUrl: 'https://plugin.dokume.net/embed/',
    externalBaseUrl: 'https://public.dokume.app/apps_public/',
    externalSources: new Map(),
    version: '2.1.0',
    loadedPlugins: new Set(),
    loadedCSS: new Set(),
    loadedScripts: new Set()
  };

  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    PLUGIN_CONFIG.baseUrl = 'http://127.0.0.1:5501/src/js/customapps/embed/';
    PLUGIN_CONFIG.externalBaseUrl = 'http://127.0.0.1:5501/src/apps_public/';
  }

  class PluginCore {
    constructor(element, pluginName, options = {}) {
      this.element = element;
      this.pluginName = pluginName;
      this.options = options;
      this.shadow = null;
      this.isInitialized = false;
      this.id = this.generateId();
      this.pluginSource = null;

      this.defaultOptions = {
        theme: 'default',
        width: '100%',
        height: 'auto',
        debug: false,
        source: null,
        baseUrl: null,
        app: null,
        externalFile: null,
        shadowMode: 'closed',
        customCSS: null,
        customCSSUrl: null,
        // Kategorie-Filter Optionen
        categoryFilter: false,
        categoryField: 'TERMS',
        categoryAllLabel: 'Alle Kategorien'
      };

      this.mergedOptions = Object.assign({}, this.defaultOptions, options);

      // Kategorie-Daten (wird durch fetch-Interception befüllt)
      this._cat = {
        events: [],
        categories: [],
        titleMap: new Map(),
        ready: false
      };

      this.events = {};
      this.init();
    }

    generateId() {
      return 'plugin_' + Math.random().toString(36).substr(2, 9);
    }

    async init() {
      try {
        this.log('Initialisiere Plugin:', this.pluginName);

        await this.determinePluginSource();
        this.log('Plugin-Quelle bestimmt:', this.pluginSource);

        this.createShadowDOM();

        if (this.pluginSource.type === 'external') {
          await this.loadExternalPlugin();
        } else {
          await this.loadInternalPlugin();
        }

        this.isInitialized = true;
        this.emit('initialized');

      } catch (error) {
        this.handleError('Fehler bei Plugin-Initialisierung', error);
      }
    }

    async determinePluginSource() {
      if (this.mergedOptions.source) {
        this.pluginSource = {
          type: 'external',
          url: this.mergedOptions.source,
          baseUrl: this.extractBaseUrl(this.mergedOptions.source)
        };
        this.log('Verwende explizite externe Quelle:', this.pluginSource.url);
        return;
      }

      if (this.mergedOptions.app) {
        const fileName = this.mergedOptions.externalFile || 'index.html';
        const fullUrl = `${PLUGIN_CONFIG.externalBaseUrl}${this.mergedOptions.app}/${fileName}`;

        this.pluginSource = {
          type: 'external',
          url: fullUrl,
          baseUrl: `${PLUGIN_CONFIG.externalBaseUrl}${this.mergedOptions.app}/`
        };

        this.log('Verwende einfache externe Plugin-Syntax:', fullUrl);
        return;
      }

      if (PLUGIN_CONFIG.externalSources.has(this.pluginName)) {
        const externalSource = PLUGIN_CONFIG.externalSources.get(this.pluginName);
        this.pluginSource = {
          type: 'external',
          url: externalSource.url,
          baseUrl: externalSource.baseUrl
        };
        this.log('Verwende registrierte externe Quelle:', this.pluginSource.url);
        return;
      }

      this.pluginSource = {
        type: 'internal',
        baseUrl: PLUGIN_CONFIG.baseUrl
      };
      this.log('Verwende interne Plugin-Quelle');
    }

    extractBaseUrl(fullUrl) {
      const url = new URL(fullUrl);
      return url.origin + url.pathname.replace(/\/[^\/]*$/, '/');
    }

    createShadowDOM() {
      if (this.element.shadowRoot) {
        this.shadow = this.element.shadowRoot;
      } else {
        const shadowMode = this.mergedOptions.shadowMode === 'open' ? 'open' : 'closed';
        this.shadow = this.element.attachShadow({ mode: shadowMode });
        this.log(`Shadow DOM erstellt im ${shadowMode} Modus`);
      }
    }

    // =========================================================================
    // EXTERNE PLUGINS LADEN
    // =========================================================================
    async loadExternalPlugin() {
      this.log('Lade externes Plugin von:', this.pluginSource.url);

      // Kategorie-Filter: fetch-Interception VOR Skeleton aktivieren
      if (this.mergedOptions.categoryFilter) {
        this._setupFetchInterception();
      }

      await Promise.all([
        this.loadDokuMeSkeleton()
      ]);

      const response = await fetch(this.pluginSource.url);
      if (!response.ok) {
        throw new Error(`Externes Plugin nicht erreichbar: ${this.pluginSource.url}`);
      }

      const htmlContent = await response.text();
      await this.processExternalHTML(htmlContent);
    }

    async processExternalHTML(htmlContent) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;

      const cssLinks = tempDiv.querySelectorAll('link[rel="stylesheet"]');
      for (const link of cssLinks) {
        const originalHref = link.getAttribute('href');
        this.log('Verarbeite CSS Link:', originalHref);
        await this.loadExternalCSS(originalHref);
      }

      const scriptTags = tempDiv.querySelectorAll('script[src]');
      const scriptsToLoad = Array.from(scriptTags).map(script => script.getAttribute('src'));

      const inlineScripts = tempDiv.querySelectorAll('script:not([src])');
      const inlineScriptsContent = Array.from(inlineScripts).map(script => script.textContent);

      const bodyContent = tempDiv.querySelector('body')?.innerHTML || htmlContent;
      const cleanedHTML = bodyContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      this.shadow.innerHTML = cleanedHTML;

      this.log('HTML eingefügt, lade jetzt Scripts...');

      if (window.getSkeletonAPI) {
        const skeleton = await window.getSkeletonAPI('utilities');
        skeleton.setQuerySelectorContext(this.shadow);
        this.log('Shadow DOM Context für Skeleton gesetzt nach HTML-Einfügung');
      }

      await this.loadCustomCSS();

      for (const scriptSrc of scriptsToLoad) {
        this.log('Verarbeite Script Tag:', scriptSrc);
        await this.loadExternalScript(scriptSrc);
      }

      window.currentPlugin = this;

      for (const scriptContent of inlineScriptsContent) {
        this.executeInlineScript(scriptContent);
      }

      await this.executePluginMethods();

      // Kategorie-Filter aufbauen nachdem alles geladen ist
      if (this.mergedOptions.categoryFilter) {
        this._buildCategoryFilter();
      }
    }

    async loadExternalCSS(href) {
      const fullUrl = this.resolveExternalUrl(href);
      const cacheKey = `css_${fullUrl}`;

      if (PLUGIN_CONFIG.loadedCSS.has(cacheKey)) {
        return;
      }

      try {
        const response = await fetch(fullUrl);
        if (response.ok) {
          const css = await response.text();
          const style = document.createElement('style');
          style.textContent = css;
          this.shadow.appendChild(style);
          PLUGIN_CONFIG.loadedCSS.add(cacheKey);
          this.log('CSS geladen:', fullUrl);
        }
      } catch (error) {
        console.warn('CSS konnte nicht geladen werden:', fullUrl, error);
      }
    }

    async loadExternalScript(src) {
      const fullUrl = this.resolveExternalUrl(src);
      const cacheKey = `js_${fullUrl}`;

      if (PLUGIN_CONFIG.loadedScripts.has(cacheKey)) {
        return;
      }

      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = fullUrl;
        script.onload = () => {
          PLUGIN_CONFIG.loadedScripts.add(cacheKey);
          this.log('Script geladen:', fullUrl);
          resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    async loadCustomCSS() {
      if (this.mergedOptions.customCSSUrl) {
        try {
          const response = await fetch(this.mergedOptions.customCSSUrl);
          if (response.ok) {
            const css = await response.text();
            this.addCustomCSS(css);
            this.log('Custom CSS von URL geladen:', this.mergedOptions.customCSSUrl);
          }
        } catch (error) {
          console.warn('Custom CSS URL konnte nicht geladen werden:', this.mergedOptions.customCSSUrl, error);
        }
      }

      if (this.mergedOptions.customCSS) {
        this.addCustomCSS(this.mergedOptions.customCSS);
        this.log('Custom CSS aus String hinzugefügt');
      }
    }

    addCustomCSS(cssContent) {
      const style = document.createElement('style');
      style.textContent = cssContent;
      style.setAttribute('data-custom-css', 'true');
      this.shadow.appendChild(style);
    }

    injectCSS(cssContent) {
      this.addCustomCSS(cssContent);
      this.log('CSS dynamisch injiziert');
    }

    async loadCSSFromUrl(url) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const css = await response.text();
          this.addCustomCSS(css);
          this.log('CSS von URL dynamisch geladen:', url);
        }
      } catch (error) {
        console.warn('CSS URL konnte nicht geladen werden:', url, error);
      }
    }

    removeCustomCSS() {
      const customStyles = this.shadow.querySelectorAll('style[data-custom-css="true"]');
      customStyles.forEach(style => style.remove());
      this.log('Alle Custom CSS entfernt');
    }

    resolveExternalUrl(url) {
      this.log('Resolving external URL:', url, 'mit baseUrl:', this.pluginSource.baseUrl);

      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }

      if (url.startsWith('apps_public/')) {
        const baseUrlObj = new URL(this.pluginSource.baseUrl);
        const resolvedUrl = baseUrlObj.origin + '/' + url;
        this.log('Resolved apps_public URL:', url, '→', resolvedUrl);
        return resolvedUrl;
      }

      if (url.startsWith('./') || !url.startsWith('/')) {
        const resolvedUrl = this.pluginSource.baseUrl + url.replace('./', '');
        this.log('Resolved relative URL:', url, '→', resolvedUrl);
        return resolvedUrl;
      }

      const baseUrlObj = new URL(this.pluginSource.baseUrl);
      const resolvedUrl = baseUrlObj.origin + url;
      this.log('Resolved root-relative URL:', url, '→', resolvedUrl);
      return resolvedUrl;
    }

    executeInlineScript(scriptContent) {
      try {
        const func = new Function('plugin', 'shadow', 'element', scriptContent);
        func.call(this, this, this.shadow, this.element);
        this.log('Inline Script ausgeführt');
      } catch (error) {
        this.handleError('Fehler beim Ausführen des Inline Scripts', error);
      }
    }

    resolveUrl(url) {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }

      if (url.startsWith('./') || !url.startsWith('/')) {
        return this.pluginSource.baseUrl + url.replace('./', '');
      }

      const baseUrlObj = new URL(this.pluginSource.baseUrl);
      return baseUrlObj.origin + url;
    }

    // =========================================================================
    // INTERNE PLUGINS LADEN (unverändert)
    // =========================================================================
    async loadInternalPlugin() {
      this.log('Lade internes Plugin');

      let config = {};
      try {
        config = await this.loadPluginConfig();
      } catch (e) {
        this.log('Keine config.json gefunden, verwende Defaults');
      }

      if (!PLUGIN_CONFIG.loadedCSS.has('base-styles')) {
        await this.loadBaseCSSIntoShadow();
        PLUGIN_CONFIG.loadedCSS.add('base-styles');
      }

      await Promise.all([
        this.loadPluginCSS(),
        this.loadPluginHTML(),
        this.loadPluginJS()
      ]);

      await this.loadCustomCSS();
      await this.executePluginMethods();
    }

    async executePluginMethods() {
      await this.render();
    }

    async render() {
      if (window.UniversalPlugins.plugins &&
        window.UniversalPlugins.plugins[this.pluginName] &&
        window.UniversalPlugins.plugins[this.pluginName].render) {
        await window.UniversalPlugins.plugins[this.pluginName].render.call(this);
      }
      this.bindCoreEvents();
    }

    bindCoreEvents() {
      const shadow = this.shadow;

      const closeBtn = shadow.querySelector('[data-plugin-close]');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.destroy());
      }

      if (window.UniversalPlugins.plugins &&
        window.UniversalPlugins.plugins[this.pluginName] &&
        window.UniversalPlugins.plugins[this.pluginName].bindEvents) {
        window.UniversalPlugins.plugins[this.pluginName].bindEvents.call(this);
      }
    }

    async loadPluginConfig() {
      const response = await fetch(`${PLUGIN_CONFIG.baseUrl}plugins/${this.pluginName}/config.json`);
      if (!response.ok) throw new Error(`Config nicht gefunden: ${this.pluginName}`);
      return await response.json();
    }

    async loadBaseCSSIntoShadow() {
      try {
        const response = await fetch(`${PLUGIN_CONFIG.baseUrl}assets/base-styles.css`);
        if (response.ok) {
          const css = await response.text();
          const style = document.createElement('style');
          style.textContent = css;
          this.shadow.appendChild(style);
        }
      } catch (e) {
        this.log('Basis-CSS nicht gefunden');
      }
    }

    async loadPluginCSS() {
      const response = await fetch(`${PLUGIN_CONFIG.baseUrl}plugins/${this.pluginName}/styles.css`);
      if (response.ok) {
        const css = await response.text();
        const style = document.createElement('style');
        style.textContent = css;
        this.shadow.appendChild(style);
      }
    }

    async loadPluginHTML() {
      const response = await fetch(`${PLUGIN_CONFIG.baseUrl}plugins/${this.pluginName}/template.html`);
      if (!response.ok) throw new Error('Template nicht gefunden');
      this.template = await response.text();
      this.shadow.innerHTML = this.template;
    }

    async loadPluginJS() {
      if (!PLUGIN_CONFIG.loadedPlugins.has(this.pluginName)) {
        await this.loadScript(`${PLUGIN_CONFIG.baseUrl}plugins/${this.pluginName}/plugin.js`);
        PLUGIN_CONFIG.loadedPlugins.add(this.pluginName);
      }
    }

    async loadDokuMeSkeleton() {
      if (!PLUGIN_CONFIG.loadedPlugins.has('dm-skeleton')) {
        if (!window.CoreInit || !window.getSkeletonAPI) {
          await this.loadScript(`https://public.dokume.app/skeleton/bundle.js`);
          const DM_CORE_CONFIG = {};
          window.CoreInit(DM_CORE_CONFIG);
        }

        const skeleton = await window.getSkeletonAPI('utilities');
        skeleton.setQuerySelectorContext(this.shadow);
        this.log('skeleton geladen und shadow als context gesetzt', this.shadow);

        PLUGIN_CONFIG.loadedPlugins.add('dm-skeleton');
      }
    }

    async loadScript(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    // =========================================================================
    // EVENT SYSTEM & UTILITIES
    // =========================================================================
    on(event, callback) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(callback);
    }

    emit(event, data) {
      if (this.events[event]) {
        this.events[event].forEach(callback => callback(data));
      }
    }

    log(...args) {
      if (this.mergedOptions.debug) {
        console.log(`[${this.pluginName}]`, ...args);
      }
    }

    handleError(message, error) {
      console.error(`[${this.pluginName}] ${message}:`, error);
      this.emit('error', { message, error });
    }

    destroy() {
      this.emit('beforeDestroy');
      this.element.innerHTML = '';
      this.emit('destroyed');
    }

    call(method, ...args) {
      if (window.UniversalPlugins.plugins &&
        window.UniversalPlugins.plugins[this.pluginName] &&
        window.UniversalPlugins.plugins[this.pluginName][method]) {
        return window.UniversalPlugins.plugins[this.pluginName][method].apply(this, args);
      }
    }

    // =========================================================================
    // KATEGORIE-FILTER FEATURE
    // =========================================================================

    /**
     * Schritt 1: fetch() UND XMLHttpRequest wrappen um API-Antworten abzufangen.
     * Muss VOR loadDokuMeSkeleton() aufgerufen werden, damit der
     * Skeleton-Bundle unsere Wrapper verwendet.
     */
    _setupFetchInterception() {
      var self = this;

      // --- fetch wrappen ---
      var originalFetch = window.fetch;
      window.fetch = function () {
        var args = arguments;
        var url = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url ? args[0].url : '');

        return originalFetch.apply(this, args).then(function (response) {
          if (url.indexOf('api.dokume.net') !== -1 || url.indexOf('public.php') !== -1) {
            console.info('[Kategorie-Filter] fetch-Response abgefangen:', url.substring(0, 80));
            response.clone().text().then(function (text) {
              self._tryParseApiResponse(text);
            });
          }
          return response;
        });
      };

      // --- XMLHttpRequest wrappen ---
      var originalXHROpen = XMLHttpRequest.prototype.open;
      var originalXHRSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method, url) {
        this._categoryFilterUrl = url || '';
        return originalXHROpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function () {
        var xhr = this;
        var url = xhr._categoryFilterUrl || '';

        if (url.indexOf('api.dokume.net') !== -1 || url.indexOf('public.php') !== -1) {
          xhr.addEventListener('load', function () {
            console.info('[Kategorie-Filter] XHR-Response abgefangen:', url.substring(0, 80));
            self._tryParseApiResponse(xhr.responseText);
          });
        }

        return originalXHRSend.apply(this, arguments);
      };

      console.info('[Kategorie-Filter] fetch + XHR Interception aktiviert');
    }

    /**
     * Versucht eine API-Response als Event-Daten zu parsen
     */
    _tryParseApiResponse(text) {
      try {
        var data = JSON.parse(text);
        if (data && data.SUCCESS === true && Array.isArray(data.MESSAGE) && data.MESSAGE.length > 0) {
          var fieldKey = this.mergedOptions.categoryField || 'TERMS';
          if (data.MESSAGE[0].hasOwnProperty(fieldKey)) {
            console.info('[Kategorie-Filter] API-Daten erkannt:', data.MESSAGE.length, 'Events');
            this._processApiEvents(data.MESSAGE);
          }
        }
      } catch (e) {
        // Kein JSON oder ungültiges Format
      }
    }

    /**
     * Schritt 2: Events verarbeiten - Kategorien und TitleMap aufbauen
     */
    _processApiEvents(events) {
      var fieldKey = this.mergedOptions.categoryField || 'TERMS';
      var categories = new Set();
      var titleMap = new Map();

      events.forEach(function (event) {
        var category = (event[fieldKey] || '').trim();
        if (category) {
          categories.add(category);
        }

        // CALENDAR_ID.TITLE → Kategorie mappen (Hauptstrategie)
        if (event.CALENDAR_ID && event.CALENDAR_ID.TITLE) {
          titleMap.set(event.CALENDAR_ID.TITLE.trim().toLowerCase(), category);
        }

        // Auch direkte TITLE-Felder mappen
        if (event.TITLE) {
          titleMap.set(event.TITLE.trim().toLowerCase(), category);
        }
      });

      this._cat = {
        events: events,
        categories: Array.from(categories).sort(),
        titleMap: titleMap,
        ready: true
      };

      console.info('[Kategorie-Filter] Kategorien gefunden:', this._cat.categories);
      console.info('[Kategorie-Filter] TitleMap:', Array.from(titleMap.entries()).map(function (e) {
        return '"' + e[0] + '" → "' + e[1] + '"';
      }).join(', '));
    }

    /**
     * Schritt 3: Filter-UI aufbauen, Kategorien zuordnen, Filter-Logik aktivieren.
     * Wartet auf API-Daten UND DOM-Rendering.
     */
    _buildCategoryFilter() {
      var self = this;
      var attempts = 0;
      var maxAttempts = 60;

      // Sofort sichtbaren Status-Hinweis einfügen
      var statusEl = document.createElement('div');
      statusEl.id = 'dm-category-status';
      statusEl.style.cssText = 'padding:10px;margin:8px 0;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;font-size:0.85em;font-family:sans-serif;';
      statusEl.textContent = 'Kategorie-Filter: Warte auf Daten...';
      self.shadow.insertBefore(statusEl, self.shadow.firstChild);

      var tryBuild = function () {
        attempts++;

        // Warten bis API-Daten da sind
        if (!self._cat.ready) {
          statusEl.textContent = 'Kategorie-Filter: Warte auf API-Daten... (Versuch ' + attempts + ')';
          if (attempts < maxAttempts) {
            setTimeout(tryBuild, 500);
          } else {
            statusEl.textContent = 'Kategorie-Filter: Keine API-Daten empfangen (Timeout)';
            statusEl.style.background = '#f8d7da';
            statusEl.style.borderColor = '#f5c6cb';
          }
          return;
        }

        // Warten bis Cards im DOM gerendert sind
        var cards = self._findEventCards();
        if (cards.length === 0) {
          statusEl.textContent = 'Kategorie-Filter: API-Daten da (' + self._cat.events.length + ' Events), warte auf DOM... (Versuch ' + attempts + ')';
          if (attempts < maxAttempts) {
            setTimeout(tryBuild, 500);
          } else {
            // Alle Element-Tags im Shadow DOM auflisten
            var allEls = self.shadow.querySelectorAll('*');
            var tags = [];
            for (var t = 0; t < Math.min(allEls.length, 30); t++) {
              tags.push(allEls[t].tagName + (allEls[t].className ? '.' + allEls[t].className.toString().substring(0, 20) : ''));
            }
            statusEl.textContent = 'Kategorie-Filter: ' + allEls.length + ' DOM-Elemente, aber keine Cards. Tags: ' + tags.join(', ');
            statusEl.style.background = '#f8d7da';
            statusEl.style.borderColor = '#f5c6cb';
          }
          return;
        }

        // Alles bereit - Status entfernen und Filter aufbauen
        statusEl.remove();

        console.info('[Kategorie-Filter] Starte Aufbau: ' + cards.length + ' Cards, ' + self._cat.categories.length + ' Kategorien');

        // 1. CSS einfügen
        self._injectCategoryCSS();

        // 2. Dropdown einfügen
        self._injectCategoryDropdown();

        // 3. Cards taggen und Labels setzen
        self._tagCards(cards);

        // 4. Filter-Event binden
        self._bindFilterEvent(cards);

        console.info('[Kategorie-Filter] Fertig aufgebaut');
      };

      setTimeout(tryBuild, 500);
    }

    /**
     * Findet die Event-Card-Elemente im Shadow DOM.
     * Mehrere Strategien, von spezifisch zu breit.
     */
    _findEventCards() {
      var cards = [];

      // Strategie 1: .card-title → .card
      var titleEls = this.shadow.querySelectorAll('.card-title');
      for (var i = 0; i < titleEls.length; i++) {
        var card = titleEls[i].closest('.card');
        if (card && cards.indexOf(card) === -1) cards.push(card);
      }
      if (cards.length > 0) {
        console.info('[Kategorie-Filter] Cards via .card-title gefunden:', cards.length);
        return cards;
      }

      // Strategie 2: .card mit Inhalt
      var allCards = this.shadow.querySelectorAll('.card');
      for (var j = 0; j < allCards.length; j++) {
        if (allCards[j].querySelector('.card-title, strong, b, h5, h4')) {
          cards.push(allCards[j]);
        }
      }
      if (cards.length > 0) {
        console.info('[Kategorie-Filter] Cards via .card gefunden:', cards.length);
        return cards;
      }

      // Strategie 3: Event-Titel aus API-Daten im DOM suchen
      // Wir kennen die Titel aus der API → suchen sie im DOM
      if (this._cat.ready && this._cat.events.length > 0) {
        var knownTitles = [];
        this._cat.events.forEach(function (ev) {
          var t = (ev.CALENDAR_ID && ev.CALENDAR_ID.TITLE) ? ev.CALENDAR_ID.TITLE.trim() : '';
          if (t) knownTitles.push(t.toLowerCase());
        });

        // Alle Elemente im Shadow DOM durchsuchen
        var allElements = this.shadow.querySelectorAll('*');
        console.info('[Kategorie-Filter] DOM-Analyse: ' + allElements.length + ' Elemente total');

        // DOM-Struktur loggen (erste 30 Elemente mit Klassen)
        var logLines = [];
        for (var k = 0; k < Math.min(allElements.length, 50); k++) {
          var el = allElements[k];
          var txt = el.textContent ? el.textContent.trim().substring(0, 40) : '';
          logLines.push(el.tagName + (el.className ? '.' + el.className.toString().replace(/\s+/g, '.') : '') + (el.id ? '#' + el.id : '') + ' → "' + txt + '"');
        }
        console.info('[Kategorie-Filter] DOM-Struktur:\n' + logLines.join('\n'));

        // Suche Elemente die einen bekannten Titel enthalten
        for (var m = 0; m < allElements.length; m++) {
          var elem = allElements[m];
          if (elem.tagName === 'STYLE' || elem.tagName === 'SCRIPT' || elem.id === 'dm-category-status') continue;

          // Prüfe ob dieses Element einen Event-Titel als direkten/nahen Text hat
          var directText = '';
          for (var c = 0; c < elem.childNodes.length; c++) {
            if (elem.childNodes[c].nodeType === 3) directText += elem.childNodes[c].textContent;
          }

          // Oder der innerText eines Kind-Elements (strong, b, span)
          var titleChild = elem.querySelector('strong, b, h5, h4, h3, span[class*="title"], div[class*="title"]');
          var childText = titleChild ? titleChild.textContent.trim().toLowerCase() : '';

          for (var n = 0; n < knownTitles.length; n++) {
            if ((childText && childText.indexOf(knownTitles[n]) !== -1) ||
                (childText && knownTitles[n].indexOf(childText) !== -1)) {
              // Dieses Element enthält einen Event-Titel
              if (cards.indexOf(elem) === -1) {
                cards.push(elem);
                console.info('[Kategorie-Filter] Event-Element gefunden: <' + elem.tagName + ' class="' + (elem.className || '') + '"> enthält "' + knownTitles[n] + '"');
              }
              break;
            }
          }
        }

        // Zum nächsten Block-Container aufsteigen (aber nicht zu weit)
        if (cards.length > 0) {
          var refinedCards = [];
          cards.forEach(function (c) {
            var target = c;
            var inlineTags = ['STRONG', 'B', 'SPAN', 'A', 'EM', 'I'];
            var limit = 5;
            while (inlineTags.indexOf(target.tagName) !== -1 && target.parentElement && limit > 0) {
              target = target.parentElement;
              limit--;
            }
            if (refinedCards.indexOf(target) === -1) {
              refinedCards.push(target);
            }
          });

          // Duplikate entfernen: Wenn ein Element Vorfahre eines anderen ist, nur das innerste behalten
          var finalCards = refinedCards.filter(function (card) {
            for (var f = 0; f < refinedCards.length; f++) {
              if (refinedCards[f] !== card && card.contains(refinedCards[f])) {
                return false; // card ist Vorfahre → entfernen
              }
            }
            return true;
          });

          console.info('[Kategorie-Filter] Cards:', finalCards.length, finalCards.map(function (c) { return '<' + c.tagName + ' class="' + (c.className || '') + '">'; }));
          return finalCards;
        }
      }

      console.warn('[Kategorie-Filter] Keine Event-Elemente gefunden');
      return cards;
    }

    /**
     * Ordnet jeder Card ihre Kategorie zu und fügt das Label hinzu.
     */
    _tagCards(cards) {
      var self = this;

      cards.forEach(function (card, idx) {
        // Titel aus dem DOM extrahieren
        var titleEl = card.querySelector('.card-title');
        if (!titleEl) {
          titleEl = card.querySelector('strong') || card.querySelector('b') || card.querySelector('h5');
        }

        var domTitle = titleEl ? titleEl.textContent.trim() : '';
        var domTitleLower = domTitle.toLowerCase();
        var category = '';
        var matchMethod = '';

        // Exakte Übereinstimmung
        if (domTitleLower && self._cat.titleMap.has(domTitleLower)) {
          category = self._cat.titleMap.get(domTitleLower);
          matchMethod = 'exakt';
        }

        // Teilweise Übereinstimmung (DOM-Titel enthält API-Titel oder umgekehrt)
        if (!category && domTitleLower) {
          self._cat.titleMap.forEach(function (cat, apiTitle) {
            if (!category) {
              if (domTitleLower.indexOf(apiTitle) !== -1 || apiTitle.indexOf(domTitleLower) !== -1) {
                category = cat;
                matchMethod = 'partial';
              }
            }
          });
        }

        console.info('[Kategorie-Filter] Card #' + idx + ': "' + domTitle + '" → "' + (category || '–') + '" (' + (matchMethod || 'kein Match') + ')');

        // data-category Attribut setzen (für Filterung)
        card.setAttribute('data-category', category);

        // Sichtbares Kategorie-Label hinzufügen
        var label = document.createElement('div');
        label.className = 'dm-category-label';
        var escapedCat = category ? self._escapeHTML(category) : '–';
        label.innerHTML = '<strong>Kategorie:</strong> ' + escapedCat;

        var cardBody = card.querySelector('.card-body');
        if (cardBody) {
          cardBody.appendChild(label);
        } else {
          card.appendChild(label);
        }
      });
    }

    /**
     * Fügt das Dropdown-Auswahlfeld ein.
     */
    _injectCategoryDropdown() {
      var allLabel = this.mergedOptions.categoryAllLabel || 'Alle Kategorien';
      var optionsHTML = '<option value="">' + this._escapeHTML(allLabel) + '</option>';

      this._cat.categories.forEach(function (cat) {
        var escaped = cat.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        optionsHTML += '<option value="' + escaped + '">' + escaped + '</option>';
      });

      var filterHTML = '<div id="dm-category-filter">' +
        '<label for="dm-category-select">Kategorie:</label>' +
        '<select id="dm-category-select">' + optionsHTML + '</select>' +
        '</div>';

      // Vor dem Event-Container einfügen
      var container = this.shadow.querySelector('#eventListDIV');
      if (container) {
        container.insertAdjacentHTML('beforebegin', filterHTML);
      } else {
        // Fallback: ganz oben im Shadow DOM
        this.shadow.insertAdjacentHTML('afterbegin', filterHTML);
      }

      console.info('[Kategorie-Filter] Dropdown eingefügt mit ' + this._cat.categories.length + ' Kategorien');
    }

    /**
     * Bindet den Change-Event des Dropdown-Filters.
     */
    _bindFilterEvent(cards) {
      var self = this;
      var select = this.shadow.querySelector('#dm-category-select');
      if (!select) return;

      // Für jede Card das äußerste Event-Container-Element finden (mb-3 oder ähnlich)
      var hideTargets = cards.map(function (card) {
        var target = card;
        var el = card;
        // Aufsteigen bis zum mb-3 Container oder max 5 Ebenen
        var limit = 5;
        while (el.parentElement && limit > 0) {
          el = el.parentElement;
          limit--;
          // Wenn wir ein Element mit mb-3 oder mb-* Klasse finden, ist das unser Ziel
          if (el.className && el.className.toString().indexOf('mb-') !== -1) {
            target = el;
            break;
          }
          // Oder wenn es ein card-ähnliches Element ist
          if (el.className && el.className.toString().indexOf('card') !== -1) {
            target = el;
          }
        }
        return target;
      });

      console.info('[Kategorie-Filter] Hide-Targets:', hideTargets.map(function (t) {
        return '<' + t.tagName + ' class="' + (t.className || '') + '">';
      }));

      select.addEventListener('change', function () {
        var selectedCategory = select.value;

        cards.forEach(function (card, idx) {
          var hideTarget = hideTargets[idx];
          var cardCategory = (card.getAttribute('data-category') || '').trim();
          var visible = !selectedCategory || cardCategory === selectedCategory;

          hideTarget.style.display = visible ? '' : 'none';
        });

        // Monats-Header (card-header) ausblenden wenn keine sichtbaren Events folgen
        self._hideEmptyMonthGroups();

        console.info('[Kategorie-Filter] Filter aktiv:', selectedCategory || 'Alle');
      });
    }

    /**
     * Blendet Monats-Header aus, wenn alle Events in diesem Monat ausgeblendet sind.
     */
    _hideEmptyMonthGroups() {
      var container = this.shadow.querySelector('#eventListDIV');
      if (!container) return;

      // Alle Kinder des Containers durchgehen
      var children = Array.from(container.children);
      var i = 0;

      while (i < children.length) {
        var child = children[i];
        var isHeader = child.querySelector('.card-header') && !child.querySelector('.dm-category-label');

        // Prüfe ob dieses Element ein Monats-Header-Container ist
        // (enthält card-header aber keine Kategorie-Labels → ist kein Event)
        if (isHeader || (child.className && child.className.toString().indexOf('card-header') !== -1)) {
          // Finde alle folgenden Event-Elemente bis zum nächsten Header
          var hasVisibleEvents = false;
          for (var j = i + 1; j < children.length; j++) {
            var next = children[j];
            var nextIsHeader = next.querySelector('.card-header') && !next.querySelector('.dm-category-label');
            if (nextIsHeader || (next.className && next.className.toString().indexOf('card-header') !== -1)) {
              break; // Nächster Monats-Header erreicht
            }
            if (next.style.display !== 'none') {
              hasVisibleEvents = true;
              break;
            }
          }
          child.style.display = hasVisibleEvents ? '' : 'none';
        }

        i++;
      }
    }

    /**
     * CSS für den Kategorie-Filter und Labels
     */
    _injectCategoryCSS() {
      var css = '' +
        '#dm-category-filter {' +
        '  display: flex;' +
        '  align-items: center;' +
        '  gap: 12px;' +
        '  padding: 14px 16px;' +
        '  margin-bottom: 16px;' +
        '  background: #f8f9fa;' +
        '  border: 1px solid #e0e0e0;' +
        '  border-radius: 8px;' +
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;' +
        '}' +
        '#dm-category-filter label {' +
        '  font-weight: 600;' +
        '  font-size: 0.95rem;' +
        '  white-space: nowrap;' +
        '}' +
        '#dm-category-select {' +
        '  flex: 1;' +
        '  padding: 8px 12px;' +
        '  font-size: 0.95rem;' +
        '  border: 1px solid #ccc;' +
        '  border-radius: 6px;' +
        '  background: #fff;' +
        '  cursor: pointer;' +
        '  max-width: 400px;' +
        '}' +
        '#dm-category-select:focus {' +
        '  outline: none;' +
        '  border-color: #4a90d9;' +
        '  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.15);' +
        '}' +
        '.dm-category-label {' +
        '  font-size: 0.85em;' +
        '  color: #666;' +
        '  margin-top: 6px;' +
        '  padding-top: 6px;' +
        '  border-top: 1px solid #eee;' +
        '}' +
        '.dm-category-label strong {' +
        '  color: #444;' +
        '}';

      var style = document.createElement('style');
      style.setAttribute('data-category-filter', 'true');
      style.textContent = css;
      this.shadow.appendChild(style);
    }

    _escapeHTML(str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  }

  // =========================================================================
  // PLUGIN MANAGER & AUTO-INITIALISIERUNG (unverändert)
  // =========================================================================
  window.UniversalPlugins.create = function (selector, pluginName, options) {
    const elements = document.querySelectorAll(selector);
    const instances = [];

    elements.forEach(element => {
      const instance = new PluginCore(element, pluginName, options);
      element._pluginInstance = instance;
      instances.push(instance);
    });

    return instances.length === 1 ? instances[0] : instances;
  };

  window.UniversalPlugins.setExternalBaseUrl = function (url) {
    PLUGIN_CONFIG.externalBaseUrl = url.endsWith('/') ? url : url + '/';
    console.log(`[UniversalPlugins] Externe Base-URL gesetzt: ${PLUGIN_CONFIG.externalBaseUrl}`);
  };

  window.UniversalPlugins.registerExternalSource = function (pluginName, url) {
    const baseUrl = url.replace(/\/[^\/]*$/, '/');
    PLUGIN_CONFIG.externalSources.set(pluginName, { url, baseUrl });
    console.log(`[UniversalPlugins] Externe Quelle registriert: ${pluginName} -> ${url}`);
  };

  window.UniversalPlugins.registerExternalSources = function (sources) {
    Object.entries(sources).forEach(([pluginName, url]) => {
      this.registerExternalSource(pluginName, url);
    });
  };

  function initPlugins() {
    document.querySelectorAll('[data-universal-plugin]').forEach(element => {
      const pluginName = element.dataset.universalPlugin;
      const options = JSON.parse(element.dataset.options || '{}');
      new PluginCore(element, pluginName, options);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlugins);
  } else {
    initPlugins();
  }

})(window);
