/* ============================================================
   MOTO MARKET WEST — спільна логіка сторінок.

   ЩО ДЕ ЗБЕРІГАЄТЬСЯ:
   • «Збережене» (що саме вподобав ЦЕЙ відвідувач) — у localStorage його
     браузера, ключ mm_saved. Переживає закриття вкладки, браузера й
     перезавантаження компʼютера. Іншим людям не видно — і не має бути.
   • Кількість вподобань (число «512») — спільна для всіх, лежить на сервері.
     Вмикається заповненням LIKES нижче.
   ============================================================ */

/* ------------------------------------------------------------------
   СПІЛЬНІ ЛАЙКИ. Поки url і key порожні — число рахується локально
   (демо-режим: базове значення з data.js + лайк цього відвідувача).

   ЯК УВІМКНУТИ СПРАВЖНІ:
   1. Відкрити ІСНУЮЧИЙ проєкт платформи в Supabase (новий не потрібен).
   2. SQL Editor → вставити вміст файлу supabase-likes.sql → Run.
   3. Project Settings → API → скопіювати "Project URL" і ключ "anon public".
   4. Вставити їх у два рядки нижче. Все, лічильники стали спільними:
      їх бачать усі відвідувачі з будь-якого пристрою.

   Таблиця ключується по сайту (поле site), тому одна база платформи
   обслуговує всі сайти одразу — кожен рахує свої позиції окремо.
   ------------------------------------------------------------------ */
var LIKES = {
  url: '',              // напр. 'https://abcdefgh.supabase.co'
  key: '',              // ключ anon public
  site: 'motomarket',   // ключ цього сайту в спільній базі платформи
  table: 'likes',
  fn: 'bump_like'
};

var MM = (function(){

  var KEY = 'mm_saved';
  var mem = null; // запасне сховище, якщо localStorage недоступний

  function read(){
    if (mem) return mem.slice();
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e){ mem = mem || []; return mem.slice(); }
  }
  function write(list){
    try { localStorage.setItem(KEY, JSON.stringify(list)); }
    catch(e){ mem = list.slice(); }
  }

  function saved(){ return read(); }
  function isSaved(id){ return read().indexOf(id) !== -1; }
  function toggle(id){
    var list = read(), i = list.indexOf(id);
    if (i === -1) list.push(id); else list.splice(i, 1);
    write(list);
    badges();
    return i === -1;
  }

  /* лічильник у шапці */
  function badges(){
    var n = read().length;
    [].forEach.call(document.querySelectorAll('[data-fav-count]'), function(el){
      el.textContent = n;
      el.hidden = (n === 0);
    });
  }

  /* 128000 -> "128 000" */
  function fmt(n){
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /* ---------- лічильник вподобань ---------- */
  var remote = {};          // id -> кількість, віддана сервером
  var remoteLoaded = false;

  function shared(){ return !!(LIKES.url && LIKES.key); }
  function heads(){
    return {apikey: LIKES.key, Authorization: 'Bearer ' + LIKES.key, 'Content-Type': 'application/json'};
  }

  /* Скільки людей позначило позицію.
     Спільний режим — число з сервера. Демо-режим — базове з data.js плюс
     вподобання цього відвідувача, щоб макет не показував самі нулі. */
  function likeCount(p){
    if (shared()) return remote[p.id] || 0;
    return (p.likes || 0) + (isSaved(p.id) ? 1 : 0);
  }
  function repaintCounts(){
    [].forEach.call(document.querySelectorAll('[data-like-n]'), function(el){
      var p = byId(el.getAttribute('data-like-n'));
      if (p) el.textContent = likeCount(p);
    });
  }

  /* хто хоче знати, що лічильники змінились (напр. топ-3 у героєві) */
  var countsCbs = [];
  function onCounts(fn){ countsCbs.push(fn); }
  function fireCounts(){ countsCbs.forEach(function(fn){ try { fn(); } catch(e){} }); }

  /* три найпопулярніші позиції за вподобаннями */
  function topLiked(n){
    return PRODUCTS.slice().sort(function(a, b){
      return likeCount(b) - likeCount(a) || PRODUCTS.indexOf(a) - PRODUCTS.indexOf(b);
    }).slice(0, n || 3);
  }

  /* забрати всі лічильники з сервера */
  function loadCounts(){
    if (!shared()) return;
    fetch(LIKES.url + '/rest/v1/' + LIKES.table +
          '?select=id,count&site=eq.' + encodeURIComponent(LIKES.site) + '&limit=1000', {headers: heads()})
      .then(function(r){ return r.ok ? r.json() : []; })
      .then(function(rows){
        rows.forEach(function(row){ remote[row.id] = row.count; });
        remoteLoaded = true;
        repaintCounts();
        fireCounts();
      })
      .catch(function(){ /* сервер недоступний — залишаємо те, що вже показано */ });
  }

  /* +1 / -1 на сервері; у відповідь приходить нове число */
  function bump(id, delta){
    if (!shared()) return;
    remote[id] = Math.max((remote[id] || 0) + delta, 0);   // одразу, без чекання
    repaintCounts();
    fetch(LIKES.url + '/rest/v1/rpc/' + LIKES.fn, {
      method: 'POST', headers: heads(),
      body: JSON.stringify({site: LIKES.site, item: id, delta: delta})
    })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(n){ if (typeof n === 'number'){ remote[id] = n; repaintCounts(); } })
      .catch(function(){});
  }

  function byId(id){
    for (var i=0;i<PRODUCTS.length;i++) if (PRODUCTS[i].id === id) return PRODUCTS[i];
    return null;
  }
  function catName(id){
    for (var i=0;i<CATS.length;i++) if (CATS[i].id === id) return CATS[i].name;
    return '';
  }

  /* картка техніки */
  function card(p){
    return '' +
    '<article class="card rv" data-id="' + p.id + '">' +
      '<a class="shot hatch" href="model.html?id=' + p.id + '" aria-label="' + p.brand + ' ' + p.name + '">' +
        '<i class="corner c1"></i><i class="corner c2"></i><i class="corner c3"></i><i class="corner c4"></i>' +
        '<span class="mono shot-cap">Фото ' + p.brand + '</span>' +
      '</a>' +
      '<button class="like' + (isSaved(p.id) ? ' on' : '') + '" type="button" data-like="' + p.id + '"' +
        ' aria-label="Подобається"><svg><use href="#i-heart"/></svg>' +
        '<b data-like-n="' + p.id + '">' + likeCount(p) + '</b></button>' +
      '<div class="c-body">' +
        '<span class="c-brand mono">' + p.brand + ' · ' + catName(p.cat) + '</span>' +
        '<a class="c-name" href="model.html?id=' + p.id + '">' + p.name + '</a>' +
        '<span class="c-spec">' + p.spec + '</span>' +
        '<div class="c-foot">' +
          '<span class="c-price">' + fmt(p.price) + ' <em>грн</em></span>' +
          '<a class="c-go" href="model.html?id=' + p.id + '" aria-label="Детальніше"><svg><use href="#i-arrow"/></svg></a>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  /* делеговані кліки по «серцю» */
  function bindLikes(root){
    (root || document).addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('[data-like]') : null;
      if (!b) return;
      e.preventDefault();
      var id = b.getAttribute('data-like');
      var now = toggle(id);
      b.classList.toggle('on', now);
      bump(id, now ? 1 : -1);
      repaintCounts();
      fireCounts();
      var host = b.closest('[data-saved-view]');
      if (host) host.dispatchEvent(new CustomEvent('mm:changed', {bubbles:true}));
    });
  }

  /* повзунок «від — до» з двох range-інпутів */
  function range(box, onChange){
    var lo = box.querySelector('[data-rng="min"]');
    var hi = box.querySelector('[data-rng="max"]');
    var fill = box.querySelector('.rng-fill');
    var out = box.querySelector('[data-rng-out]');
    var max = +lo.max;

    function paint(){
      var a = +lo.value, b = +hi.value;
      if (a > b - +lo.step){ if (document.activeElement === lo) lo.value = a = b - +lo.step; else hi.value = b = a + +lo.step; }
      fill.style.left  = (a / max * 100) + '%';
      fill.style.right = (100 - b / max * 100) + '%';
      if (out) out.textContent = fmt(a) + ' — ' + fmt(b) + (b >= max ? '+' : '') + ' грн';
      if (onChange) onChange(a, b);
    }
    lo.addEventListener('input', paint);
    hi.addEventListener('input', paint);
    paint();
    return {paint:paint, min:function(){return +lo.value}, max:function(){return +hi.value},
            set:function(a,b){ lo.value = a; hi.value = b; paint(); }};
  }

  /* ---------- пошук ----------
     Кирилиця й латиниця зводяться до однієї форми, тому «кове» знаходить
     KOVE, а «shleom» — ні. Шукаємо по назві, бренду, характеристиці,
     тегах, напрямку й місту. */
  var CYR = {
    'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ye','ж':'zh','з':'z',
    'и':'y','і':'i','ї':'yi','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p',
    'р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch',
    'ь':'','ю':'yu','я':'ya','ы':'y','э':'e','ъ':'','ё':'e'
  };
  function fold(s){
    s = String(s == null ? '' : s).toLowerCase();
    var out = '';
    for (var i = 0; i < s.length; i++){
      var c = s.charAt(i);
      out += (CYR[c] !== undefined ? CYR[c] : c);
    }
    return out;
  }
  function hay(p){
    return fold([p.brand, p.name, p.spec, (p.tags || []).join(' '), catName(p.cat), p.city].join(' '));
  }
  function find(q){
    var f = fold(q).replace(/\s+/g, ' ').trim();
    if (!f) return [];
    var parts = f.split(' ');
    var hits = [];
    PRODUCTS.forEach(function(p, i){
      var h = hay(p);
      if (!parts.every(function(w){ return h.indexOf(w) !== -1; })) return;
      // збіг у бренді чи назві важливіший за збіг у місті або характеристиці:
      // «кове» має спершу показати KOVE, а вже потім техніку з Ковеля
      var head = fold(p.brand + ' ' + p.name);
      var score = parts.every(function(w){ return head.indexOf(w) !== -1; }) ? 2
                : (parts.some(function(w){ return head.indexOf(w) !== -1; }) ? 1 : 0);
      hits.push({p: p, score: score, i: i});
    });
    hits.sort(function(a, b){ return b.score - a.score || a.i - b.i; });
    return hits.map(function(x){ return x.p; });
  }

  /* накладка пошуку — одна на всі сторінки, будується з коду */
  function buildSearch(){
    if (document.getElementById('srch')) return;
    var box = document.createElement('div');
    box.className = 'srch';
    box.id = 'srch';
    box.hidden = true;
    box.innerHTML =
      '<div class="srch-bar">' +
        '<svg class="srch-ico"><use href="#i-search"/></svg>' +
        '<input type="search" id="srchInput" autocomplete="off" spellcheck="false"' +
        ' placeholder="Модель, бренд або тип техніки">' +
        '<button class="srch-x" id="srchClose" type="button" aria-label="Закрити">✕</button>' +
      '</div>' +
      '<div class="srch-body"><div class="srch-inner">' +
        '<div class="srch-tips mono"><span>Спробуйте:</span>' +
          ['KOVE','Ендуро','Квадроцикл','Шолом','Запчастини'].map(function(t){
            return '<button class="srch-tip" type="button" data-tip="' + t + '">' + t + '</button>';
          }).join('') +
        '</div>' +
        '<div class="srch-res" id="srchRes"></div>' +
      '</div></div>';
    document.body.appendChild(box);

    var input = box.querySelector('#srchInput');
    var res = box.querySelector('#srchRes');

    function render(){
      var q = input.value.trim();
      if (!q){ res.innerHTML = ''; return; }
      var list = find(q);
      if (!list.length){
        res.innerHTML = '<p class="srch-none">Нічого не знайшли за запитом «' + q + '».<br>' +
          'Наберіть <a href="tel:+380689879872">068 987 98 72</a> — підберемо вручну.</p>';
        return;
      }
      res.innerHTML =
        '<div class="srch-count mono">Знайдено: ' + list.length + '</div>' +
        list.slice(0, 8).map(function(p){
          return '<a class="sr" href="model.html?id=' + p.id + '">' +
            '<span class="sr-l"><span class="sr-b mono">' + p.brand + ' · ' + catName(p.cat) + '</span>' +
            '<span class="sr-n">' + p.name + '</span>' +
            '<span class="sr-s">' + p.spec + '</span></span>' +
            '<span class="sr-p">' + fmt(p.price) + ' <em>грн</em></span></a>';
        }).join('') +
        (list.length > 8
          ? '<a class="srch-all" href="tehnika.html?q=' + encodeURIComponent(q) + '">Показати всі ' + list.length + ' →</a>'
          : '');
    }

    function open(){
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      setTimeout(function(){ input.focus(); }, 30);
    }
    function close(){
      box.hidden = true;
      document.body.style.overflow = '';
    }

    input.addEventListener('input', render);
    box.querySelector('#srchClose').addEventListener('click', close);
    box.addEventListener('click', function(e){
      var tip = e.target.closest('[data-tip]');
      if (tip){ input.value = tip.getAttribute('data-tip'); render(); input.focus(); return; }
      if (e.target === box) close();
    });
    input.addEventListener('keydown', function(e){
      if (e.key === 'Escape'){ close(); return; }
      if (e.key === 'Enter'){
        e.preventDefault();
        var first = res.querySelector('.sr');
        if (first) location.href = first.getAttribute('href');
        else if (input.value.trim()) location.href = 'tehnika.html?q=' + encodeURIComponent(input.value.trim());
      }
    });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !box.hidden) close(); });
    document.addEventListener('click', function(e){
      if (e.target.closest('[data-search-open]')){ e.preventDefault(); open(); }
    });
  }

  /* поява блоків при скролі */
  function reveal(){
    var items = document.querySelectorAll('.rv:not(.on)');
    if (!items.length) return;
    var io = new IntersectionObserver(function(en){
      en.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add('on'); io.unobserve(e.target); } });
    }, {rootMargin:'0px 0px -8% 0px', threshold:0.08});
    [].forEach.call(items, function(el, i){
      el.style.transitionDelay = ((i % 6) * 55) + 'ms';
      io.observe(el);
    });
  }

  /* шапка: стиснення, прогрес, мобільне меню */
  function chrome(){
    var topbar = document.getElementById('topbar');
    var prog = document.getElementById('bar-progress');
    function onScroll(){
      var y = window.scrollY || document.documentElement.scrollTop;
      if (topbar) topbar.classList.toggle('shrunk', y > 60);
      if (prog){
        var h = document.documentElement.scrollHeight - window.innerHeight;
        prog.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
      }
    }
    window.addEventListener('scroll', onScroll, {passive:true});
    onScroll();

    var sheet = document.getElementById('sheet');
    var burger = document.getElementById('burger');
    if (sheet && burger){
      burger.addEventListener('click', function(){ sheet.classList.add('open'); });
      var x = document.getElementById('sheetClose');
      if (x) x.addEventListener('click', function(){ sheet.classList.remove('open'); });
      [].forEach.call(sheet.querySelectorAll('a'), function(a){
        a.addEventListener('click', function(){ sheet.classList.remove('open'); });
      });
    }

    var yr = document.getElementById('yr');
    if (yr) yr.textContent = new Date().getFullYear();

    document.addEventListener('click', function(e){
      if (e.target.closest('[data-to-top]')) window.scrollTo({top:0, behavior:'smooth'});
      /* заглушки без сторінок — щоб клік не стрибав угору по href="#" */
      if (e.target.closest('[data-soon]')) e.preventDefault();
    });
  }

  function init(){
    chrome();
    badges();
    bindLikes(document);
    reveal();
    loadCounts();
    buildSearch();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {saved:saved, isSaved:isSaved, toggle:toggle, badges:badges, fmt:fmt,
          byId:byId, catName:catName, card:card, range:range, reveal:reveal,
          likeCount:likeCount, repaintCounts:repaintCounts, loadCounts:loadCounts, shared:shared,
          fold:fold, find:find, topLiked:topLiked, onCounts:onCounts};
})();
