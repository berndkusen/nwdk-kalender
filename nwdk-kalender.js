/**
 * NWDK-Kalender - Eigenständige Terminliste mit Kategorie-Filter
 * Ruft Termine direkt über die DokuMe-API ab und rendert sie.
 * Version: 1.0.0
 */
(function () {
  'use strict';

  var API_BASE = 'https://api.dokume.net/public.php/calendar/myevents';
  var OBJECT_API = 'https://api.dokume.net/public.php/object/67';

  // Deutsche Monatsnamen
  var MONTHS = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];

  function NWDKKalender(element) {
    this.element = element;
    this.config = JSON.parse(element.getAttribute('data-config') || '{}');
    this.events = [];
    this.categories = [];
    this.init();
  }

  NWDKKalender.prototype.init = function () {
    if (!this.config.key || !this.config.profile) {
      this.element.innerHTML = '<p style="color:red;">Fehler: API-Key und Profil-ID erforderlich.</p>';
      return;
    }

    this.element.innerHTML = '<div class="nwdk-loading">Termine werden geladen…</div>';
    this.loadEvents();
  };

  // =========================================================================
  // API-Aufruf
  // =========================================================================
  NWDKKalender.prototype.loadEvents = function () {
    var self = this;

    // Zeitraum: heute bis +2 Jahre
    var now = new Date();
    var start = this.formatDate(now);
    var end = this.formatDate(new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()));

    // object/67 Endpoint liefert TERMS-Feld für Kategorien
    var url = OBJECT_API +
      '?references=' + encodeURIComponent('[{"OBJECT":"CALENDAR"}]') +
      '&where=' + encodeURIComponent('[{"key":"CALENDAR_ID.ENDDATE","operator":"higher","value":"' + start + '"}]') +
      '&include_data=true';

    fetch(url, {
      method: 'GET',
      headers: {
        'X-DOKUME-API-KEY': this.config.key,
        'X-DOKUME-PROFILEID': this.config.profile
      }
    })
      .then(function (response) {
        if (!response.ok) throw new Error('API-Fehler: ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data.SUCCESS || !Array.isArray(data.MESSAGE)) {
          throw new Error('Ungültige API-Antwort');
        }
        self.processEvents(data.MESSAGE);
      })
      .catch(function (err) {
        self.element.innerHTML = '<p style="color:red;">Fehler beim Laden der Termine: ' + self.escapeHTML(err.message) + '</p>';
      });
  };

  // =========================================================================
  // Events verarbeiten, sortieren, Kategorien extrahieren
  // =========================================================================
  NWDKKalender.prototype.processEvents = function (rawEvents) {
    var self = this;
    var categoryField = this.config.categoryField || 'TERMS';

    // Events normalisieren
    this.events = rawEvents.map(function (ev) {
      var cal = ev.CALENDAR_ID || {};
      return {
        id: ev.ID,
        title: cal.TITLE || ev.TITLE || '(Ohne Titel)',
        location: cal.LOCATION || '',
        startDate: cal.STARTDATE ? new Date(cal.STARTDATE.replace(' ', 'T')) : null,
        endDate: cal.ENDDATE ? new Date(cal.ENDDATE.replace(' ', 'T')) : null,
        note: cal.NOTE || '',
        category: (ev[categoryField] || '').trim(),
        color: cal.COLOR || '#e35138',
        bannerImageId: ev.BANNER_IMAGE_ID,
        logoFileId: ev.LOGO_FILE_ID,
        closingDate: ev.CLOSING_DATE,
        raw: ev
      };
    });

    // Nach Startdatum sortieren
    this.events.sort(function (a, b) {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return a.startDate - b.startDate;
    });

    // Kategorien extrahieren (nur aus vorhandenen Events)
    var catSet = {};
    this.events.forEach(function (ev) {
      if (ev.category) catSet[ev.category] = true;
    });
    this.categories = Object.keys(catSet).sort();

    this.render();
  };

  // =========================================================================
  // Rendering
  // =========================================================================
  NWDKKalender.prototype.render = function () {
    var html = '';

    // CSS
    html += '<style>' + this.getCSS() + '</style>';

    // Filter-Leiste (Kategorie + Datum)
    html += this.renderFilter();

    // Events nach Monat gruppieren
    html += '<div class="nwdk-events">';
    html += this.renderEventList(this.events);
    html += '</div>';

    this.element.innerHTML = html;

    // Filter-Events binden
    this.bindFilter();
  };

  NWDKKalender.prototype.renderFilter = function () {
    var html = '<div class="nwdk-filter">';

    // Kategorie-Dropdown (nur wenn Kategorien vorhanden)
    if (this.categories.length > 0) {
      var allLabel = this.config.allLabel || 'Alle Kategorien';
      var options = '<option value="">' + this.escapeHTML(allLabel) + '</option>';
      this.categories.forEach(function (cat) {
        options += '<option value="' + this.escapeHTML(cat) + '">' + this.escapeHTML(cat) + '</option>';
      }.bind(this));

      html += '<div class="nwdk-filter-group">' +
        '<label for="nwdk-category-select">Kategorie:</label>' +
        '<select id="nwdk-category-select">' + options + '</select>' +
        '</div>';
    }

    // Datum Von/Bis
    html += '<div class="nwdk-filter-group">' +
      '<label for="nwdk-date-from">Von:</label>' +
      '<input type="date" id="nwdk-date-from">' +
      '</div>' +
      '<div class="nwdk-filter-group">' +
      '<label for="nwdk-date-to">Bis:</label>' +
      '<input type="date" id="nwdk-date-to">' +
      '</div>' +
      '<button id="nwdk-filter-reset" title="Filter zurücksetzen">✕</button>';

    html += '</div>';
    return html;
  };

  NWDKKalender.prototype.renderEventList = function (events) {
    if (events.length === 0) {
      return '<p class="nwdk-empty">Keine Termine vorhanden.</p>';
    }

    var html = '';
    var currentMonth = '';

    events.forEach(function (ev) {
      // Monats-Header
      var monthKey = ev.startDate
        ? MONTHS[ev.startDate.getMonth()] + ' ' + ev.startDate.getFullYear()
        : 'Ohne Datum';

      if (monthKey !== currentMonth) {
        currentMonth = monthKey;
        html += '<div class="nwdk-month-header" data-month="' + this.escapeHTML(monthKey) + '">';
        html += '<h3>' + this.escapeHTML(monthKey) + '</h3>';
        html += '</div>';
      }

      // Event-Card
      html += this.renderEventCard(ev);
    }.bind(this));

    return html;
  };

  NWDKKalender.prototype.renderEventCard = function (ev) {
    var dateStr = ev.startDate ? this.formatDisplayDate(ev.startDate) : '';
    var categoryLabel = ev.category
      ? '<strong>Kategorie:</strong> ' + this.escapeHTML(ev.category)
      : '<strong>Kategorie:</strong> –';

    // Logo-URL (DokuMe File-API)
    var logoHTML = '';
    if (ev.bannerImageId || ev.logoFileId) {
      var fileId = ev.bannerImageId || ev.logoFileId;
      var logoUrl = 'https://api.dokume.net/public.php/file/' + fileId + '/display';
      logoHTML = '<div class="nwdk-card-logo">' +
        '<img src="' + logoUrl + '" alt="" loading="lazy"' +
        ' onerror="this.parentElement.style.display=\'none\'">' +
        '</div>';
    }

    var isoDate = ev.startDate ? ev.startDate.toISOString().slice(0, 10) : '';

    return '<div class="nwdk-card" data-category="' + this.escapeHTML(ev.category) + '" data-date="' + isoDate + '">' +
      '<div class="nwdk-card-body">' +
      logoHTML +
      '<div class="nwdk-card-content">' +
      '<div class="nwdk-card-title">' + this.escapeHTML(ev.title) + '</div>' +
      (ev.location ? '<div class="nwdk-card-location">' + this.escapeHTML(ev.location) + '</div>' : '') +
      (dateStr ? '<div class="nwdk-card-date">' + dateStr + '</div>' : '') +
      '</div>' +
      '</div>' +
      '<div class="nwdk-card-category">' + categoryLabel + '</div>' +
      '</div>';
  };

  // =========================================================================
  // Filter-Logik
  // =========================================================================
  NWDKKalender.prototype.bindFilter = function () {
    var self = this;
    var select = this.element.querySelector('#nwdk-category-select');
    var dateFrom = this.element.querySelector('#nwdk-date-from');
    var dateTo = this.element.querySelector('#nwdk-date-to');
    var resetBtn = this.element.querySelector('#nwdk-filter-reset');

    var applyFilters = function () {
      var catVal = select ? select.value : '';
      var fromVal = dateFrom ? dateFrom.value : '';
      var toVal = dateTo ? dateTo.value : '';

      var cards = self.element.querySelectorAll('.nwdk-card');
      var monthHeaders = self.element.querySelectorAll('.nwdk-month-header');

      cards.forEach(function (card) {
        var visible = true;

        // Kategorie-Filter
        if (catVal) {
          visible = card.getAttribute('data-category') === catVal;
        }

        // Datum Von-Filter
        if (visible && fromVal) {
          var cardDate = card.getAttribute('data-date');
          if (cardDate && cardDate < fromVal) visible = false;
        }

        // Datum Bis-Filter
        if (visible && toVal) {
          var cardDate = card.getAttribute('data-date');
          if (cardDate && cardDate > toVal) visible = false;
        }

        card.style.display = visible ? '' : 'none';
      });

      // Leere Monats-Header ausblenden
      monthHeaders.forEach(function (header) {
        var next = header.nextElementSibling;
        var hasVisible = false;

        while (next && !next.classList.contains('nwdk-month-header')) {
          if (next.classList.contains('nwdk-card') && next.style.display !== 'none') {
            hasVisible = true;
            break;
          }
          next = next.nextElementSibling;
        }

        header.style.display = hasVisible ? '' : 'none';
      });
    };

    if (select) select.addEventListener('change', applyFilters);
    if (dateFrom) dateFrom.addEventListener('change', applyFilters);
    if (dateTo) dateTo.addEventListener('change', applyFilters);

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (select) select.value = '';
        if (dateFrom) dateFrom.value = '';
        if (dateTo) dateTo.value = '';
        applyFilters();
      });
    }
  };

  // =========================================================================
  // Hilfsfunktionen
  // =========================================================================
  NWDKKalender.prototype.formatDate = function (date) {
    var y = date.getFullYear();
    var m = ('0' + (date.getMonth() + 1)).slice(-2);
    var d = ('0' + date.getDate()).slice(-2);
    return y + '-' + m + '-' + d + ' 00:00';
  };

  NWDKKalender.prototype.formatDisplayDate = function (date) {
    var d = ('0' + date.getDate()).slice(-2);
    var m = ('0' + (date.getMonth() + 1)).slice(-2);
    var y = date.getFullYear();
    return d + '.' + m + '.' + y;
  };

  NWDKKalender.prototype.escapeHTML = function (str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  };

  // =========================================================================
  // CSS
  // =========================================================================
  NWDKKalender.prototype.getCSS = function () {
    var customBg = this.config.background || '#c3da9f';

    return '' +
      '.nwdk-loading {' +
      '  padding: 20px; text-align: center; color: #666;' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '}' +
      '.nwdk-filter {' +
      '  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;' +
      '  padding: 14px 16px; margin-bottom: 16px;' +
      '  background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 8px;' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '}' +
      '.nwdk-filter-group {' +
      '  display: flex; align-items: center; gap: 8px;' +
      '}' +
      '.nwdk-filter label {' +
      '  font-weight: 600; font-size: 0.95rem; white-space: nowrap;' +
      '}' +
      '#nwdk-category-select {' +
      '  padding: 8px 12px; font-size: 0.95rem;' +
      '  border: 1px solid #ccc; border-radius: 6px; background: #fff;' +
      '  cursor: pointer; min-width: 180px;' +
      '}' +
      '#nwdk-category-select:focus,' +
      '#nwdk-date-from:focus,' +
      '#nwdk-date-to:focus {' +
      '  outline: none; border-color: #4a90d9;' +
      '  box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.15);' +
      '}' +
      '#nwdk-date-from, #nwdk-date-to {' +
      '  padding: 7px 10px; font-size: 0.9rem;' +
      '  border: 1px solid #ccc; border-radius: 6px; background: #fff;' +
      '}' +
      '#nwdk-filter-reset {' +
      '  padding: 6px 12px; font-size: 1rem; line-height: 1;' +
      '  border: 1px solid #ccc; border-radius: 6px; background: #fff;' +
      '  cursor: pointer; color: #888;' +
      '}' +
      '#nwdk-filter-reset:hover { background: #eee; color: #333; }' +
      '.nwdk-events {' +
      '  background: ' + customBg + '; border-radius: 4px; padding: 10px;' +
      '}' +
      '.nwdk-month-header h3 {' +
      '  margin: 16px 0 8px 0; padding: 0;' +
      '  font-size: 1.1rem; font-weight: 700;' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '}' +
      '.nwdk-month-header:first-child h3 { margin-top: 4px; }' +
      '.nwdk-card {' +
      '  background: #fff; border: 1px solid rgba(0,0,0,0.125);' +
      '  border-radius: 0.375rem; margin-bottom: 12px; overflow: hidden;' +
      '}' +
      '.nwdk-card-body {' +
      '  display: flex; align-items: flex-start; padding: 12px 16px; gap: 14px;' +
      '}' +
      '.nwdk-card-logo {' +
      '  flex-shrink: 0; width: 60px; height: 60px;' +
      '  display: flex; align-items: center; justify-content: center;' +
      '}' +
      '.nwdk-card-logo img {' +
      '  max-width: 100%; max-height: 100%; object-fit: contain;' +
      '}' +
      '.nwdk-card-content { flex: 1; min-width: 0; }' +
      '.nwdk-card-title {' +
      '  font-weight: 700; font-size: 1rem; margin-bottom: 2px;' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '}' +
      '.nwdk-card-location {' +
      '  font-size: 0.9rem; color: #555;' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '}' +
      '.nwdk-card-date {' +
      '  font-size: 0.9rem; color: #888; margin-top: 2px;' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '}' +
      '.nwdk-card-category {' +
      '  font-size: 0.85em; color: #666; padding: 6px 16px;' +
      '  border-top: 1px solid #eee;' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '}' +
      '.nwdk-card-category strong { color: #444; }' +
      '.nwdk-empty {' +
      '  padding: 20px; text-align: center; color: #666;' +
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
      '}';
  };

  // =========================================================================
  // Auto-Initialisierung
  // =========================================================================
  function initAll() {
    var elements = document.querySelectorAll('[data-nwdk-kalender]');
    elements.forEach(function (el) {
      new NWDKKalender(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
