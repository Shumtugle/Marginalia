// ===== ПАРСЕР ФАЙЛА КНИГИ =====
// формат:
//   TITLE: ...
//   META: ...
//   COVER_FROM: #hex
//   COVER_TO: #hex
//   COVER_ACCENT: #hex
//   AUDIO: filename.mp3   (необязательно)
//   ===
//   первая страница, абзацы через пустую строку
//   ===
//   вторая страница
function parseBook(text, id) {
  const blocks = text.split(/\r?\n===\r?\n/);
  const header = blocks.shift();

  const meta = {};
  header.split(/\r?\n/).forEach(line => {
    const m = line.match(/^([A-Z_]+):\s*(.*)$/);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
  });

  const pages = blocks
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => block.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean));

  return {
    id,
    title: meta.title || id,
    meta: meta.meta || '',
    audio: meta.audio || '',
    cover: {
      from: meta.cover_from || '#5a4530',
      to: meta.cover_to || '#2a1d12',
      accent: meta.cover_accent || '#d4b896'
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
        const txt = await fetch('books/' + id + '.txt').then(r => {
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

  const container = document.getElementById('book');
  container.innerHTML = '';

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
  const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI'];
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
    audio.querySelector('source').src = 'audio/' + book.audio;
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
    pageFlip.destroy();
    pageFlip = null;
  }
  document.getElementById('reader-view').style.display = 'none';
  document.getElementById('library-view').style.display = 'flex';
});

// ===== СТАРТ =====
loadLibrary();
