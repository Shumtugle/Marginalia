// ===== ЗАПАСНЫЕ ЦВЕТА ОБЛОЖЕК =====
const FALLBACK_COVERS = [
  { from: '#5a4530', to: '#2a1d12', accent: '#d4b896' },
  { from: '#3a4a5a', to: '#1a2530', accent: '#b8c8d4' },
  { from: '#4a5a3a', to: '#1f2818', accent: '#c8d4a8' },
  { from: '#5a3a4a', to: '#2a1820', accent: '#d4b8c8' },
  { from: '#5a4a3a', to: '#2a2018', accent: '#d4c8a8' },
  { from: '#3a5a4a', to: '#182a20', accent: '#a8d4c8' },
  { from: '#4a3a5a', to: '#20182a', accent: '#c8b8d4' },
];

function pickFallbackCover(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_COVERS[hash % FALLBACK_COVERS.length];
}

// ===== РАЗБИЕНИЕ ТЕКСТА НА СТРАНИЦЫ =====
// По числу символов, с уважением к границам предложений
function paginate(paragraphs, maxCharsPerPage = 580) {
  const pages = [];
  let current = [];
  let currentLen = 0;

  function flush() {
    if (current.length) {
      pages.push(current);
      current = [];
      currentLen = 0;
    }
  }

  for (const para of paragraphs) {
    if (para.length > maxCharsPerPage * 1.3) {
      flush();
      const sentences = para.split(/(?<=[.!?…])\s+/);
      let buf = '';
      for (const s of sentences) {
        if (buf && (buf.length + 1 + s.length) > maxCharsPerPage) {
          pages.push([buf.trim()]);
          buf = s;
        } else {
          buf = buf ? buf + ' ' + s : s;
        }
      }
      if (buf) {
        current.push(buf.trim());
        currentLen = buf.length;
      }
      continue;
    }

    if (current.length && currentLen + para.length > maxCharsPerPage) {
      flush();
    }
    current.push(para);
    currentLen += para.length;
  }

  flush();
  return pages;
}

// ===== ПАРСЕР КНИГИ =====
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

    if (blocks.length) {
      blocks.forEach(b => {
        const paragraphs = b.trim().split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean);
        if (paragraphs.length) {
          paginate(paragraphs).forEach(p => pages.push(p));
        }
      });
      body = null;
    } else {
      body = '';
    }
  }

  if (!pages.length && body !== null) {
    const paragraphs = body.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean);
    pages = paginate(paragraphs);
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
      card.style.setProperty('--cover-from', book.cover.from);
      card.style.setProperty('--cover-to', book.cover.to);
      card.style.setProperty('--cover-accent', book.cover.accent);
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

  const wrapper = document.getElementById('book-wrapper');
  wrapper.innerHTML = '<div id="book"></div>';
  const container = document.getElementById('book');
  container.style.setProperty('--cover-from', book.cover.from);
  container.style.setProperty('--cover-to', book.cover.to);
  container.style.setProperty('--cover-accent', book.cover.accent);

  const cover = document.createElement('div');
  cover.className = 'page page-cover';
  cover.setAttribute('data-density', 'hard');
  cover.innerHTML = `
    <h1>${escapeHtml(book.title.toUpperCase())}</h1>
    <div class="ornament">· · ·</div>
    <div class="subtitle">${escapeHtml(book.meta)}</div>
  `;
  container.appendChild(cover);

  const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI','XXII','XXIII','XXIV','XXV','XXVI','XXVII','XXVIII','XXIX','XXX','XXXI','XXXII','XXXIII','XXXIV','XXXV','XXXVI','XXXVII','XXXVIII','XXXIX','XL'];
  book.pages.forEach((paragraphs, i) => {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML =
      `<h2>· ${roman[i] || (i+1)} ·</h2>` +
      paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('') +
      `<div class="page-number">— ${i+2} —</div>`;
    container.appendChild(page);
  });

  const end = document.createElement('div');
  end.className = 'page end-page';
  end.textContent = '· конец ·';
  container.appendChild(end);

  const back = document.createElement('div');
  back.className = 'page page-cover';
  back.setAttribute('data-density', 'hard');
  back.innerHTML = `<div class="ornament">· · ·</div>`;
  container.appendChild(back);

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

document.getElementById('back-button').addEventListener('click', () => {
  const audio = document.getElementById('audio');
  audio.pause();
  if (pageFlip) {
    try { pageFlip.destroy(); } catch (e) {}
    pageFlip = null;
  }
  document.getElementById('reader-view').style.display = 'none';
  document.getElementById('library-view').style.display = 'flex';
});

loadLibrary();
