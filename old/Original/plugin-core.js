/**
 * Universal Plugin Core Framework - Mit externen Quellen
 */
(function (window) {
  'use strict';

  window.UniversalPlugins = window.UniversalPlugins || {};

  const PLUGIN_CONFIG = {
    baseUrl: 'https://plugin.dokume.net/embed/',
    externalBaseUrl: 'https://public.dokume.app/apps_public/', // Hardcodierte Base-URI für deine externen Plugins
    externalSources: new Map(), // Für externe Plugin-Quellen
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
      this.pluginSource = null; // Tracking der Plugin-Quelle

      this.defaultOptions = {
        theme: 'default',
        width: '100%',
        height: 'auto',
        debug: false,
        // Neue Optionen für externe Quellen
        source: null, // URL zur externen HTML-Datei
        baseUrl: null, // Basis-URL für relative Pfade
        // Einfache externe Plugin-Optionen
        app: null, // z.B. "contact-form"
        externalFile: null,   // z.B. "index.html" (Standard)
        // Shadow DOM Konfiguration
        shadowMode: 'closed', // 'open' oder 'closed'
        // Custom CSS Optionen
        customCSS: null,      // String mit CSS-Code
        customCSSUrl: null    // URL zu externer CSS-Datei
      };

      this.mergedOptions = Object.assign({}, this.defaultOptions, options);

      // Event System
      this.events = {};

      this.init();
    }

    generateId() {
      return 'plugin_' + Math.random().toString(36).substr(2, 9);
    }

    async init() {
      try {
        this.log('Initialisiere Plugin:', this.pluginName);

        // Plugin-Quelle bestimmen
        await this.determinePluginSource();
        this.log('Plugin-Quelle bestimmt:', this.pluginSource);

        // Shadow DOM erstellen
        this.createShadowDOM();

        // Plugin laden basierend auf Quelle
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
      // 1. Explizite Quelle in Optionen
      if (this.mergedOptions.source) {
        this.pluginSource = {
          type: 'external',
          url: this.mergedOptions.source,
          baseUrl: this.extractBaseUrl(this.mergedOptions.source)
        };
        this.log('Verwende explizite externe Quelle:', this.pluginSource.url);
        return;
      }

      // 2. Einfache externe Plugin-Syntax (NEUE FUNKTION - FEHLTE!)
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

      // 3. Plugin in externen Quellen registriert?
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

      // 4. Fallback: Interne Quelle
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
        // Shadow Mode aus Optionen verwenden (open/closed)
        const shadowMode = this.mergedOptions.shadowMode === 'open' ? 'open' : 'closed';
        this.shadow = this.element.attachShadow({ mode: shadowMode });
        this.log(`Shadow DOM erstellt im ${shadowMode} Modus`);
      }
    }

    // EXTERNE PLUGINS LADEN
    async loadExternalPlugin() {
      this.log('Lade externes Plugin von:', this.pluginSource.url);

      await Promise.all([
        this.loadDokuMeSkeleton()
      ]);

      // HTML-Datei laden
      const response = await fetch(this.pluginSource.url);
      if (!response.ok) {
        throw new Error(`Externes Plugin nicht erreichbar: ${this.pluginSource.url}`);
      }

      const htmlContent = await response.text();

      // HTML parsen und verarbeiten
      await this.processExternalHTML(htmlContent);
    }

    async processExternalHTML(htmlContent) {
      // Temporäres DOM erstellen
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;

      // CSS-Links extrahieren und laden (BEVOR sie in DOM eingefügt werden)
      const cssLinks = tempDiv.querySelectorAll('link[rel="stylesheet"]');
      for (const link of cssLinks) {
        const originalHref = link.getAttribute('href');
        this.log('Verarbeite CSS Link:', originalHref);
        await this.loadExternalCSS(originalHref);
      }

      // Script-Tags extrahieren (ABER NOCH NICHT LADEN)
      const scriptTags = tempDiv.querySelectorAll('script[src]');
      const scriptsToLoad = Array.from(scriptTags).map(script => script.getAttribute('src'));

      // Inline Scripts extrahieren (ABER NOCH NICHT AUSFÜHREN)
      const inlineScripts = tempDiv.querySelectorAll('script:not([src])');
      const inlineScriptsContent = Array.from(inlineScripts).map(script => script.textContent);

      // HTML-Content ZUERST in Shadow DOM einfügen (Scripts entfernen)
      const bodyContent = tempDiv.querySelector('body')?.innerHTML || htmlContent;
      const cleanedHTML = bodyContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      this.shadow.innerHTML = cleanedHTML;

      this.log('HTML eingefügt, lade jetzt Scripts...');

      // SKELETON CONTEXT NOCHMAL SETZEN (nach HTML-Einfügung)
      if (window.getSkeletonAPI) {
        const skeleton = await window.getSkeletonAPI('utilities');
        skeleton.setQuerySelectorContext(this.shadow);
        this.log('Shadow DOM Context für Skeleton gesetzt nach HTML-Einfügung');
      }

      // Custom CSS laden (nach HTML-Einfügung)
      await this.loadCustomCSS();

      // JETZT Scripts laden (nachdem HTML im Shadow DOM ist)
      for (const scriptSrc of scriptsToLoad) {
        this.log('Verarbeite Script Tag:', scriptSrc);
        await this.loadExternalScript(scriptSrc);
      }

      // Plugin-Instanz global verfügbar machen (VOR Script-Ausführung)
      window.currentPlugin = this;

      // JETZT Inline Scripts ausführen (nachdem HTML im Shadow DOM ist)
      for (const scriptContent of inlineScriptsContent) {
        this.executeInlineScript(scriptContent);
      }

      // Plugin-spezifische Render- und Bind-Methoden aufrufen
      await this.executePluginMethods();
    }

    async loadExternalCSS(href) {
      const fullUrl = this.resolveExternalUrl(href); // Spezielle externe URL-Auflösung
      const cacheKey = `css_${fullUrl}`;

      if (PLUGIN_CONFIG.loadedCSS.has(cacheKey)) {
        return; // Bereits geladen
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
      const fullUrl = this.resolveExternalUrl(src); // Spezielle externe URL-Auflösung
      const cacheKey = `js_${fullUrl}`;

      if (PLUGIN_CONFIG.loadedScripts.has(cacheKey)) {
        return; // Bereits geladen
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

    // Custom CSS laden
    async loadCustomCSS() {
      // 1. Custom CSS aus URL laden
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

      // 2. Custom CSS aus String hinzufügen
      if (this.mergedOptions.customCSS) {
        this.addCustomCSS(this.mergedOptions.customCSS);
        this.log('Custom CSS aus String hinzugefügt');
      }
    }

    // Custom CSS zum Shadow DOM hinzufügen
    addCustomCSS(cssContent) {
      const style = document.createElement('style');
      style.textContent = cssContent;
      style.setAttribute('data-custom-css', 'true');
      this.shadow.appendChild(style);
    }

    // API-Methode: Custom CSS dynamisch hinzufügen
    injectCSS(cssContent) {
      this.addCustomCSS(cssContent);
      this.log('CSS dynamisch injiziert');
    }

    // API-Methode: Custom CSS von URL laden
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

    // API-Methode: Alle Custom CSS entfernen
    removeCustomCSS() {
      const customStyles = this.shadow.querySelectorAll('style[data-custom-css="true"]');
      customStyles.forEach(style => style.remove());
      this.log('Alle Custom CSS entfernt');
    }

    // NEUE METHODE: Spezielle URL-Auflösung für externe Plugins
    resolveExternalUrl(url) {
      this.log('Resolving external URL:', url, 'mit baseUrl:', this.pluginSource.baseUrl);

      // Absolute URLs direkt zurückgeben
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }

      // Falls die URL schon mit "apps_public/" beginnt → von Domain auflösen
      if (url.startsWith('apps_public/')) {
        const baseUrlObj = new URL(this.pluginSource.baseUrl);
        const resolvedUrl = baseUrlObj.origin + '/' + url;
        this.log('Resolved apps_public URL:', url, '→', resolvedUrl);
        return resolvedUrl;
      }

      // Relative URLs basierend auf der EXTERNEN Plugin-Quelle
      if (url.startsWith('./') || !url.startsWith('/')) {
        const resolvedUrl = this.pluginSource.baseUrl + url.replace('./', '');
        this.log('Resolved relative URL:', url, '→', resolvedUrl);
        return resolvedUrl;
      }

      // Root-relative URL
      const baseUrlObj = new URL(this.pluginSource.baseUrl);
      const resolvedUrl = baseUrlObj.origin + url;
      this.log('Resolved root-relative URL:', url, '→', resolvedUrl);
      return resolvedUrl;
    }

    executeInlineScript(scriptContent) {
      try {
        // Script im Kontext der Plugin-Instanz ausführen
        const func = new Function('plugin', 'shadow', 'element', scriptContent);
        func.call(this, this, this.shadow, this.element);
        this.log('Inline Script ausgeführt');
      } catch (error) {
        this.handleError('Fehler beim Ausführen des Inline Scripts', error);
      }
    }

    resolveUrl(url) {
      // Relative URLs zu absoluten URLs auflösen
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url; // Bereits absolute URL
      }

      if (url.startsWith('./') || !url.startsWith('/')) {
        // Relative URL basierend auf Plugin-Quelle
        return this.pluginSource.baseUrl + url.replace('./', '');
      }

      // Root-relative URL
      const baseUrlObj = new URL(this.pluginSource.baseUrl);
      return baseUrlObj.origin + url;
    }

    // INTERNE PLUGINS LADEN (wie vorher)
    async loadInternalPlugin() {
      this.log('Lade internes Plugin');

      // Plugin Config laden (optional)
      let config = {};
      try {
        config = await this.loadPluginConfig();
      } catch (e) {
        this.log('Keine config.json gefunden, verwende Defaults');
      }

      // Basis CSS laden
      if (!PLUGIN_CONFIG.loadedCSS.has('base-styles')) {
        await this.loadBaseCSSIntoShadow();
        PLUGIN_CONFIG.loadedCSS.add('base-styles');
      }

      // Plugin-spezifische Dateien laden
      await Promise.all([
        this.loadPluginCSS(),
        this.loadPluginHTML(),
        this.loadPluginJS()
      ]);

      // Custom CSS auch für interne Plugins laden
      await this.loadCustomCSS();

      await this.executePluginMethods();
    }

    async executePluginMethods() {
      // Plugin rendern
      await this.render();
    }

    async render() {
      // Plugin-spezifische Render-Methode aufrufen
      if (window.UniversalPlugins.plugins &&
        window.UniversalPlugins.plugins[this.pluginName] &&
        window.UniversalPlugins.plugins[this.pluginName].render) {
        await window.UniversalPlugins.plugins[this.pluginName].render.call(this);
      }

      this.bindCoreEvents();
    }

    bindCoreEvents() {
      const shadow = this.shadow;

      // Close Button Event
      const closeBtn = shadow.querySelector('[data-plugin-close]');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.destroy());
      }

      // Plugin-spezifische Events
      if (window.UniversalPlugins.plugins &&
        window.UniversalPlugins.plugins[this.pluginName] &&
        window.UniversalPlugins.plugins[this.pluginName].bindEvents) {
        window.UniversalPlugins.plugins[this.pluginName].bindEvents.call(this);
      }
    }

    // INTERNE PLUGIN METHODEN (unverändert)
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

    // Event System & Utility (unverändert)
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
  }

  // Plugin Manager
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

  // Konfiguration für externe Base-URL ändern
  window.UniversalPlugins.setExternalBaseUrl = function (url) {
    PLUGIN_CONFIG.externalBaseUrl = url.endsWith('/') ? url : url + '/';
    console.log(`[UniversalPlugins] Externe Base-URL gesetzt: ${PLUGIN_CONFIG.externalBaseUrl}`);
  };

  // Externe Plugin-Quellen registrieren
  window.UniversalPlugins.registerExternalSource = function (pluginName, url) {
    const baseUrl = url.replace(/\/[^\/]*$/, '/'); // Basis-URL extrahieren
    PLUGIN_CONFIG.externalSources.set(pluginName, { url, baseUrl });
    console.log(`[UniversalPlugins] Externe Quelle registriert: ${pluginName} -> ${url}`);
  };

  // Mehrere externe Quellen registrieren
  window.UniversalPlugins.registerExternalSources = function (sources) {
    Object.entries(sources).forEach(([pluginName, url]) => {
      this.registerExternalSource(pluginName, url);
    });
  };

  // Auto-Initialisierung
  function initPlugins() {
    document.querySelectorAll('[data-universal-plugin]').forEach(element => {
      const pluginName = element.dataset.universalPlugin;
      const options = JSON.parse(element.dataset.options || '{}');
      new PluginCore(element, pluginName, options);
    });
  }

  // Prüfen ob DOM bereits geladen ist
  if (document.readyState === 'loading') {
    // DOM lädt noch, warte auf DOMContentLoaded
    document.addEventListener('DOMContentLoaded', initPlugins);
  } else {
    // DOM ist bereits geladen, sofort ausführen
    initPlugins();
  }

})(window);