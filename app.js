/**
 * CINEPLEX SPA — Milestone 3
 * TMDB API integration using jQuery AJAX
 *
 * NOTE FOR GRADER:
 *   Replace API_KEY below with a valid TMDB v3 API key.
 *   Free keys: https://www.themoviedb.org/settings/api
 */

$(function () {

  /* ── CONFIG ───────────────────────────────── */
  const API_KEY   = 'ec49f2d5bd16d2cf6f6a55185e08503c';   // ← replace this
  const BASE_URL  = 'https://api.themoviedb.org/3';
  const IMG_BASE  = 'https://image.tmdb.org/t/p/';
  const PER_PAGE  = 10;   // items per page-view
  const TOTAL_ITEMS = 50; // fetch up to 50 results

  /* ── STATE ────────────────────────────────── */
  let state = {
    mode:       'collection',   // 'collection' | 'search'
    category:   'popular',      // current collection category
    query:      '',
    allItems:   [],             // full 50-item result set
    currentPage: 1,             // 1-based page view
    activeId:   null
  };

  /* ── CATEGORY MAP ─────────────────────────── */
  const CATEGORIES = {
    popular:    { label: 'Popular Movies',   endpoint: '/movie/popular' },
    top_rated:  { label: 'Top Rated Movies', endpoint: '/movie/top_rated' },
    upcoming:   { label: 'Upcoming Movies',  endpoint: '/movie/upcoming' }
  };

  /* ─────────────────────────────────────────── */
  /*  FETCH HELPERS                              */
  /* ─────────────────────────────────────────── */

  /** Fetch multiple TMDB pages, resolve when we have ≥ TOTAL_ITEMS results */
  function fetchPages(params, pagesNeeded) {
    const requests = [];
    for (let p = 1; p <= pagesNeeded; p++) {
      requests.push(
        $.getJSON(`${BASE_URL}${params.endpoint}`, {
          api_key:  API_KEY,
          language: 'en-US',
          page:     p
        })
      );
    }
    return $.when.apply($, requests).then(function () {
      // $.when with multiple deferred passes each result as separate arg
      const responses = pagesNeeded === 1
        ? [arguments[0]]
        : Array.from(arguments).map(a => Array.isArray(a) ? a[0] : a);

      let combined = [];
      responses.forEach(r => {
        if (r && r.results) combined = combined.concat(r.results);
      });
      return combined.slice(0, TOTAL_ITEMS);
    });
  }

  /** Fetch movies from a collection category (popular / top_rated / upcoming) */
  function fetchCollection(category) {
    showLoading();
    const cat = CATEGORIES[category];
    return fetchPages({ endpoint: cat.endpoint }, 3)   // 3 pages × ~20 = 60 → take 50
      .done(function (items) {
        state.allItems   = items;
        state.currentPage = 1;
        state.activeId   = null;
        renderGrid();
        renderPagination();
        clearDetail();
      })
      .fail(handleError)
      .always(hideLoading);
  }

  /** Fetch movies by search query */
  function fetchSearch(query) {
    showLoading();
    return $.ajax({
      url:      `${BASE_URL}/search/movie`,
      method:   'GET',
      dataType: 'json',
      data: {
        api_key:  API_KEY,
        language: 'en-US',
        query:    query,
        page:     1
      }
    }).then(function (firstPage) {
      const total    = firstPage.total_results;
      const perApi   = firstPage.results.length;
      if (total === 0 || perApi === 0) return [];

      // How many more pages we need to hit 50
      const need     = Math.ceil(TOTAL_ITEMS / perApi);
      const maxPage  = Math.min(Math.ceil(total / perApi), need);

      if (maxPage <= 1) return firstPage.results.slice(0, TOTAL_ITEMS);

      const extra = [];
      for (let p = 2; p <= maxPage; p++) {
        extra.push(
          $.getJSON(`${BASE_URL}/search/movie`, {
            api_key:  API_KEY,
            language: 'en-US',
            query:    query,
            page:     p
          })
        );
      }
      return $.when.apply($, extra).then(function () {
        const morePages = maxPage === 2
          ? [arguments[0]]
          : Array.from(arguments).map(a => Array.isArray(a) ? a[0] : a);
        let combined = firstPage.results;
        morePages.forEach(r => { if (r && r.results) combined = combined.concat(r.results); });
        return combined.slice(0, TOTAL_ITEMS);
      });
    })
    .done(function (items) {
      state.allItems    = items;
      state.currentPage = 1;
      state.activeId    = null;
      renderGrid();
      renderPagination();
      clearDetail();
    })
    .fail(handleError)
    .always(hideLoading);
  }

  /** Fetch full movie details by id */
  function fetchDetail(movieId) {
    return $.ajax({
      url:      `${BASE_URL}/movie/${movieId}`,
      method:   'GET',
      dataType: 'json',
      data: {
        api_key:  API_KEY,
        language: 'en-US'
      }
    });
  }

  /* ─────────────────────────────────────────── */
  /*  RENDER HELPERS                             */
  /* ─────────────────────────────────────────── */

  function getCurrentPageItems() {
    const start = (state.currentPage - 1) * PER_PAGE;
    return state.allItems.slice(start, start + PER_PAGE);
  }

  function totalPages() {
    return Math.ceil(state.allItems.length / PER_PAGE);
  }

  function renderGrid() {
    const $grid = $('#movie-grid').empty();
    const items = getCurrentPageItems();

    if (items.length === 0) {
      $grid.html('<div class="state-message"><strong>No results found</strong>Try a different search term.</div>');
      return;
    }

    // Update section title
    if (state.mode === 'search') {
      $('#section-title-text').text('Search Results');
      $('#section-badge').text(`"${state.query}" — ${state.allItems.length} results`);
    } else {
      $('#section-title-text').text(CATEGORIES[state.category].label);
      $('#section-badge').text(`${state.allItems.length} movies`);
    }

    items.forEach(function (movie) {
      const posterUrl  = movie.poster_path
        ? `${IMG_BASE}w300${movie.poster_path}`
        : null;
      const year       = movie.release_date ? movie.release_date.substring(0, 4) : '—';
      const rating     = movie.vote_average ? movie.vote_average.toFixed(1) : null;
      const isActive   = state.activeId === movie.id ? ' active-card' : '';

      const posterHtml = posterUrl
        ? `<img src="${posterUrl}" alt="${escHtml(movie.title)}" loading="lazy">`
        : `<div class="no-poster">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
               <rect x="2" y="2" width="20" height="20" rx="2"/>
               <circle cx="8.5" cy="8.5" r="1.5"/>
               <polyline points="21 15 16 10 5 21"/>
             </svg>
             <span>No Image</span>
           </div>`;

      const ratingHtml = rating
        ? `<span class="card-rating">★ ${rating}</span>` : '';

      const $card = $(`
        <div class="movie-card${isActive}" data-id="${movie.id}" tabindex="0" role="button" aria-label="${escHtml(movie.title)}">
          <div class="card-poster-wrap">
            ${posterHtml}
            ${ratingHtml}
          </div>
          <div class="card-info">
            <div class="card-title">${escHtml(movie.title)}</div>
            <div class="card-year">${year}</div>
          </div>
        </div>
      `);

      $card.on('click keydown', function (e) {
        if (e.type === 'keydown' && e.key !== 'Enter') return;
        selectMovie(movie.id);
      });

      $grid.append($card);
    });
  }

  function renderPagination() {
    const $pag = $('#pagination').empty();
    const pages = totalPages();
    if (pages <= 1) return;

    // Prev button
    const $prev = $('<button class="page-btn page-prev">← Prev</button>');
    if (state.currentPage === 1) $prev.prop('disabled', true).css('opacity', 0.35);
    $prev.on('click', function () { goToPage(state.currentPage - 1); });
    $pag.append($prev);

    // Page number buttons
    for (let p = 1; p <= pages; p++) {
      const isCurrent = p === state.currentPage;
      const $btn = $(`<button class="page-btn${isCurrent ? ' current-page' : ''}" aria-current="${isCurrent}">${p}</button>`);
      const pg = p;
      $btn.on('click', function () { goToPage(pg); });
      $pag.append($btn);
    }

    // Next button
    const $next = $('<button class="page-btn page-next">Next →</button>');
    if (state.currentPage === pages) $next.prop('disabled', true).css('opacity', 0.35);
    $next.on('click', function () { goToPage(state.currentPage + 1); });
    $pag.append($next);
  }

  function goToPage(p) {
    const pages = totalPages();
    if (p < 1 || p > pages) return;
    state.currentPage = p;
    renderGrid();
    renderPagination();
    // Scroll main panel to top
    $('#main-panel').scrollTop(0);
  }

  /* ─────────────────────────────────────────── */
  /*  DETAIL PANEL                               */
  /* ─────────────────────────────────────────── */

  function selectMovie(id) {
    state.activeId = id;

    // Highlight active card
    $('.movie-card').removeClass('active-card');
    $(`.movie-card[data-id="${id}"]`).addClass('active-card');

    // Show loading state in detail panel
    $('#detail-empty').hide();
    $('#detail-content').hide();
    $('#detail-panel').find('.detail-loading').remove();
    $('#detail-panel').append('<div class="detail-loading" style="display:flex;align-items:center;justify-content:center;height:60%;flex-direction:column;gap:1rem"><div class="spinner"></div><p class="loading-text">Loading details…</p></div>');

    fetchDetail(id)
      .done(renderDetail)
      .fail(function () {
        $('#detail-panel').find('.detail-loading').remove();
        $('#detail-empty').show().find('p').text('Failed to load details. Try again.');
      });
  }

  function renderDetail(movie) {
    $('#detail-panel').find('.detail-loading').remove();

    const backdropUrl = movie.backdrop_path
      ? `${IMG_BASE}w780${movie.backdrop_path}` : null;
    const posterUrl   = movie.poster_path
      ? `${IMG_BASE}w342${movie.poster_path}` : null;

    // Backdrop
    const $backdrop = $('#detail-backdrop');
    if (backdropUrl) {
      $backdrop.attr('src', backdropUrl).show();
    } else {
      $backdrop.hide();
    }

    // Poster
    const $posterImg    = $('#detail-poster');
    const $posterMissed = $('#detail-poster-missing');
    if (posterUrl) {
      $posterImg.attr('src', posterUrl).attr('alt', movie.title).show();
      $posterMissed.hide();
    } else {
      $posterImg.hide();
      $posterMissed.show();
    }

    // Title
    $('#detail-title').text(movie.title);

    // Meta chips
    const $meta = $('#detail-meta').empty();
    if (movie.vote_average) {
      $meta.append(`<span class="meta-chip gold">★ ${movie.vote_average.toFixed(1)}</span>`);
    }
    if (movie.release_date) {
      $meta.append(`<span class="meta-chip">${movie.release_date}</span>`);
    }
    if (movie.runtime) {
      const h = Math.floor(movie.runtime / 60);
      const m = movie.runtime % 60;
      $meta.append(`<span class="meta-chip">${h}h ${m}m</span>`);
    }
    if (movie.status) {
      const cls = movie.status === 'Released' ? 'red' : '';
      $meta.append(`<span class="meta-chip ${cls}">${movie.status}</span>`);
    }

    // Overview
    $('#detail-overview').text(movie.overview || 'No overview available.');

    // Extra info
    $('#detail-budget').text(movie.budget ? '$' + movie.budget.toLocaleString() : '—');
    $('#detail-revenue').text(movie.revenue ? '$' + movie.revenue.toLocaleString() : '—');
    $('#detail-lang').text(movie.original_language ? movie.original_language.toUpperCase() : '—');
    $('#detail-votes').text(movie.vote_count ? movie.vote_count.toLocaleString() : '—');

    // Genres
    const $genres = $('#detail-genres').empty();
    if (movie.genres && movie.genres.length) {
      movie.genres.forEach(g => $genres.append(`<span class="genre-tag">${escHtml(g.name)}</span>`));
    }

    $('#detail-content').show();

    // Scroll to top of detail panel on mobile
    if (window.innerWidth < 900) {
      $('html, body').animate({ scrollTop: $('#detail-panel').offset().top - 80 }, 300);
    } else {
      $('#detail-panel').scrollTop(0);
    }
  }

  function clearDetail() {
    state.activeId = null;
    $('#detail-content').hide();
    $('#detail-empty').show().find('p').text('Click any movie to see details here.');
  }

  /* ─────────────────────────────────────────── */
  /*  UI STATE                                   */
  /* ─────────────────────────────────────────── */

  function showLoading() {
    $('#movie-grid').html('<div id="loading-overlay" style="display:flex"><div class="spinner"></div><p class="loading-text">Fetching movies…</p></div>');
    $('#pagination').empty();
  }

  function hideLoading() {
    // grid is already populated by the done handler
  }

  function handleError(xhr) {
    let msg = 'Failed to fetch data.';
    if (xhr.status === 401) msg = 'Invalid API key. Please update API_KEY in app.js.';
    else if (xhr.status === 404) msg = 'Resource not found.';
    else if (xhr.status === 429) msg = 'Rate limit exceeded. Try again in a moment.';
    $('#movie-grid').html(`<div class="state-message"><strong>Error ${xhr.status}</strong>${msg}</div>`);
  }

  /* ─────────────────────────────────────────── */
  /*  EVENTS                                     */
  /* ─────────────────────────────────────────── */

  // Nav tab switching
  $('.nav-tab[data-mode]').on('click', function () {
    const mode = $(this).data('mode');
    if (mode === state.mode && mode === 'collection') return;
    if (mode === 'collection') {
      $('.nav-tab').removeClass('active');
      $(this).addClass('active');
      state.mode = 'collection';
      fetchCollection(state.category);
    }
  });

  // Category tabs
  $('.nav-tab[data-cat]').on('click', function () {
    const cat = $(this).data('cat');
    if (state.mode === 'collection' && cat === state.category) return;
    state.mode     = 'collection';
    state.category = cat;
    $('.nav-tab').removeClass('active');
    $(this).addClass('active');
    fetchCollection(cat);
  });

  // Search button
  $('#search-btn').on('click', doSearch);

  // Enter key in search box
  $('#search-input').on('keydown', function (e) {
    if (e.key === 'Enter') doSearch();
  });

  function doSearch() {
    const q = $('#search-input').val().trim();
    if (!q) return;
    state.mode  = 'search';
    state.query = q;
    // deactivate nav tabs when searching
    $('.nav-tab').removeClass('active');
    fetchSearch(q);
  }

  /* ─────────────────────────────────────────── */
  /*  UTILITY                                    */
  /* ─────────────────────────────────────────── */

  function escHtml(str) {
    return $('<div>').text(str).html();
  }

  /* ─────────────────────────────────────────── */
  /*  INIT — load Popular Movies on startup      */
  /* ─────────────────────────────────────────── */
  fetchCollection('popular');

});
