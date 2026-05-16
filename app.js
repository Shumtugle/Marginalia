// ===== ЗАПАСНЫЕ ЦВЕТА ОБЛОЖЕК =====
// Если в файле не указаны цвета — берём из этой палитры по id книги
const FALLBACK_COVERS = [
  { from: '#5a4530', to: '#2a1d12', accent: '#d4b896' }, // тёплый коричневый
  { from: '#3a4a5a', to: '#1a2530', accent: '#b8c8d4' }, // зимний синий
  { from: '#4a5a3a', to: '#1f2818', accent: '#c8d4a8' }, // оливковый
  { from: '#5a3a4a', to: '#2a1820', accent: '#d4b8c8' }, // приглушённый винный
  { from: '#5a4a3a', to: '#2a2018', accent: '#d4c8a8' }, // охра
  { from: '#3a5a4a', to: '#182a20', accent: '#a8d4c8' }, // морской
  { from: '#4a3a5a', to: '#20182a', accent: '#c8b8d4' }, // фиолетовый
];

function pickFallbackCover(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_COVERS[hash % FALLBACK_COVERS.length];
}

// ===== ПАРСЕР =====
// Поддерживает два формата:
// 1) С заголовком и разделителями страниц:
//    TITLE: ...
//    META: ...
//    AUDIO: ...
//    ===
//    первая страница
//    ===
//    вторая страница
//
// 2) Просто текст без всякого служебного синтаксиса —
//    тогда заголовок берётся из имени файла,
//    а страницы режутся автоматически по N абзацев.
function parseBook(text, id) {
  const hasHeader = /^\s*TITLE\s*:/im.test(text.slice(0, 200));

  let meta = {};
  let pages = [];
  let body = text;

  if (hasHeader) {
    const blocks = text.split(/\r?\n===\r?\n/);
    const header = blocks.shift();
    header.split(/\r?\n/).forEach(line => {
      const m = line.match(/^([A-Z_]+)\s*:\s*(.*)$/);
      if (m) meta[m[1].toLowerCase()] = m[2].trim();
    });
    // блоки страниц (если есть)
    if (blocks.length) {
      pages = blocks
        .map(b => b.trim())
        .filter(Boolean)
        .map(b => b.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean));
      body = null;
    } else {
      // были метаданные, но нет ===, режем оставшееся автоматически
      body = '';
    }
  }

  // Автоматическое разбиение: ~2 абзаца на страницу
  if (!pages.length && body !== null) {
    const paragraphs = body.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean);
    const PARS_PER_PAGE = 2;
    for (let i = 0; i < paragraphs.length; i += PARS_PER_PAGE) {
      pages.push(paragraphs.slice(i, i + PARS_PER_PAGE));
    }
  }

  const fallback = pickFallbackCover(id);

  return {
    id,
    title: meta.title || id,
    meta: meta.meta || '',
    audio: meta.audio || '',
    cover: {
      from: meta.cover_from || fallback.from,
      to: meta.cover_to || fallback.to,
      accent: meta.cover_accent || fallback.accent
    },
    pages
  };
}

// ===== ЗАГРУЗКА БИБЛИОТЕКИ =====
async function loadLibrary() {
  const shelf = document.getElementById('shelf');
  try {
    const indexText = await fetch('library.txt').then(r => r.text());
    const ids = indexText.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));

    const books = [];
    for (const id of ids) {
      try {
        const url = 'books/' + encodeURIComponent(id) + '.txt';
        const txt = await fetch(url).then(r => {
          if (!r.ok) throw new Error(r.status);
          return r.text();
        });
        books.push(parseBook(txt, id));
      } catch (e) {
        console.warn('не получилось загрузить', id, e);
      }
    }

    shelf.innerHTML = '';
    if (!books.length) {
      shelf.innerHTML = '<div class="loading">полка пуста</div>';
      return;
    }
    books.forEach(book => {
      const card = document.createElement('div');
      card.className = 'shelf-book';
      card.style.background = `linear-gradient(135deg, ${book.cover.from} 0%, ${book.cover.to} 100%)`;
      card.style.color = book.cover.accent;
      card.innerHTML = `
        <h3>${escapeHtml(book.title)}</h3>
        <div class="ornament">· · ·</div>
        <div class="meta">${escapeHtml(book.meta)}</div>
      `;
      card.addEventListener('click', () => openBook(book));
      shelf.appendChild(card);
    });
  } catch (e) {
    shelf.innerHTML = '<div class="loading">не удалось загрузить library.txt</div>';
    console.error(e);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ===== ОТКРЫТИЕ КНИГИ =====
let pageFlip = null;

function openBook(book) {
  document.getElementById('library-view').style.display = 'none';
  document.getElementById('reader-view').style.display = 'flex';

  // Полностью пересоздаём контейнер — иначе StPageFlip спотыкается
  // о свои же остатки от предыдущей книги
  const wrapper = document.getElementById('book-wrapper');
  wrapper.innerHTML = '<div id="book"></div>';
  const container = document.getElementById('book');

  // передняя обложка
  const cover = document.createElement('div');
  cover.className = 'page page-cover';
  cover.setAttribute('data-density', 'hard');
  cover.style.background = `linear-gradient(135deg, ${book.cover.from} 0%, ${book.cover.to} 100%)`;
  cover.style.color = book.cover.accent;
  cover.innerHTML = `
    <h1>${escapeHtml(book.title.toUpperCase())}</h1>
    <div class="ornament">· · ·</div>
    <div class="subtitle">${escapeHtml(book.meta)}</div>
  `;
  container.appendChild(cover);

  // страницы
  const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
  book.pages.forEach((paragraphs, i) => {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML =
      `<h2>· ${roman[i] || (i+1)} ·</h2>` +
      paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('') +
      `<div class="page-number">— ${i+2} —</div>`;
    container.appendChild(page);
  });

  // финальная страница
  const end = document.createElement('div');
  end.className = 'page end-page';
  end.textContent = '· конец ·';
  container.appendChild(end);

  // задняя обложка
  const back = document.createElement('div');
  back.className = 'page page-cover';
  back.setAttribute('data-density', 'hard');
  back.style.background = `linear-gradient(135deg, ${book.cover.from} 0%, ${book.cover.to} 100%)`;
  back.style.color = book.cover.accent;
  back.innerHTML = `<div class="ornament">· · ·</div>`;
  container.appendChild(back);

  // аудио
  const audioWrap = document.getElementById('audio-player');
  const audio = document.getElementById('audio');
  if (book.audio) {
    audioWrap.classList.remove('empty');
    audio.querySelector('source').src = 'audio/' + encodeURIComponent(book.audio);
    audio.load();
  } else {
    audioWrap.classList.add('empty');
    audio.querySelector('source').src = '';
  }

  // инициализация StPageFlip
  pageFlip = new St.PageFlip(container, {
    width: 380, height: 540,
    size: "stretch",
    minWidth: 280, maxWidth: 600,
    minHeight: 400, maxHeight: 760,
    maxShadowOpacity: 0.4,
    showCover: true,
    mobileScrollSupport: false,
    usePortrait: true,
    flippingTime: 700,
  });
  pageFlip.loadFromHTML(container.querySelectorAll('.page'));
  pageFlip.on('flip', updateCounter);
  setTimeout(updateCounter, 100);
}

// ===== УПРАВЛЕНИЕ =====
const counter = document.getElementById('page-counter');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');

function updateCounter() {
  if (!pageFlip) return;
  const total = pageFlip.getPageCount();
  const current = pageFlip.getCurrentPageIndex() + 1;
  counter.textContent = current + ' / ' + total;
  prevBtn.disabled = current === 1;
  nextBtn.disabled = current === total;
}

prevBtn.addEventListener('click', () => pageFlip && pageFlip.flipPrev());
nextBtn.addEventListener('click', () => pageFlip && pageFlip.flipNext());

// ===== ВОЗВРАТ К ПОЛКЕ =====
document.getElementById('back-button').addEventListener('click', () => {
  const audio = document.getElementById('audio');
  audio.pause();
  if (pageFlip) {
    try { pageFlip.destroy(); } catch (e) { /* ничего */ }
    pageFlip = null;
  }
  document.getElementById('reader-view').style.display = 'none';
  document.getElementById('library-view').style.display = 'flex';
});

// ===== СТАРТ =====
loadLibrary();
