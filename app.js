const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#notice');

const categories = ['Охрана труда', 'Производство', 'Качество', 'Адаптация', 'Другое'];
const types = {
  text: 'Текстовый блок',
  link: 'Внешняя ссылка',
  file: 'Файл или видео'
};
const questionTypes = {
  single: 'Один правильный ответ',
  multiple: 'Несколько правильных ответов',
  order: 'Расставить по порядку'
};

const allowed = /\.(pdf|docx?|xlsx?|pptx?|mp4|webm|ogv|mov|m4v|mkv|avi)$/i;
const videoExtension = /\.(mp4|webm|ogv|mov|m4v|mkv|avi)$/i;
const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Qyzylorda'
});

function date(value) {
  return dateFormatter.format(new Date(value)).replace(' г.', '');
}

function escape(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
}

const seed = [
  ['Вводный инструктаж по охране труда', 'Охрана труда', 'ready', '2026-11-19',
    'Разберите основные правила безопасности перед выходом на рабочее место.'],
  ['Работа в чистых помещениях', 'Производство', 'draft', '2026-11-18',
    'Порядок входа, смены одежды и работы в чистой зоне.'],
  ['Основы надлежащей производственной практики', 'Качество', 'ready', '2026-11-16',
    'Познакомьтесь с принципами GMP и правилами ведения записей.'],
  ['Первый день на производстве', 'Адаптация', 'draft', '2026-11-12',
    'Вводный курс для новых сотрудников.']
].map(([title, category, status, updated, body], index) => ({
  id: `sample-${index}`,
  title,
  category,
  status,
  updated,
  description: body,
  blocks: [{ type: 'text', title: 'Введение', value: body }]
}));

const db = new Promise((resolve, reject) => {
  const request = indexedDB.open('dolce-academy', 2);

  request.onupgradeneeded = event => {
    const database = request.result;

    if (event.oldVersion < 1) {
      const store = database.createObjectStore('courses', { keyPath: 'id' });
      seed.forEach(course => store.put(course));
    }

    if (!database.objectStoreNames.contains('tests')) {
      database.createObjectStore('tests', { keyPath: 'id' });
    }
  };

  request.onsuccess = () => {
    const database = request.result;
    database.onversionchange = () => database.close();
    resolve(database);
  };

  request.onerror = () => reject(request.error);

  request.onblocked = () => {
    main.innerHTML = `
      <section class="panel">
        <p>Закройте другие вкладки академии, чтобы завершить обновление.</p>
      </section>
    `;
  };
});

async function storage(mode, action, storeName = 'courses') {
  const database = await db;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));

    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = transaction.onabort = () => {
      reject(transaction.error ?? request.error);
    };
  });
}

let courses = [];
let tests = [];
let course;
let filter = 'all';
let category = '';
let query = '';
let screen = 'list';
let dirty = false;
let urls = [];
let timer;

function tag(status) {
  return status === 'ready'
    ? '<span class="pill ready">Готов</span>'
    : '<span class="pill">Черновик</span>';
}

function toast(message) {
  clearTimeout(timer);
  notice.textContent = message;
  timer = setTimeout(() => { notice.textContent = ''; }, 3800);
}

function safeURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function resetURLs() {
  urls.forEach(url => URL.revokeObjectURL(url));
  urls = [];
}

function options(selected) {
  return categories.map(name =>
    `<option${name === selected ? ' selected' : ''}>${escape(name)}</option>`
  ).join('');
}

// Каталог курсов и тестов

function catalog() {
  resetURLs();
  screen = 'list';

  document.querySelectorAll('[data-nav]').forEach(button => {
    const selected = button.dataset.nav === filter;
    button.classList.toggle('selected', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  const names = { all: 'Все курсы', draft: 'Черновики', ready: 'Готовые курсы' };

  main.innerHTML = `
    <section class="hero">
      <div class="hero-content">
        <p class="eyebrow">Кабинет менеджера</p>
        <h1>Управление курсами</h1>
        <p>Создавайте учебные курсы для сотрудников прямо в академии.</p>
        <div class="actions">
          <button class="btn" data-action="new">＋ Создать курс</button>
          <button class="btn" data-action="new-test">＋ Создать тест</button>
        </div>
      </div>
    </section>

    ${filter === 'all' ? renderTestCatalog() : ''}

    <section aria-labelledby="catalog-title">
      <div class="section-head">
        <div>
          <h2 id="catalog-title">${names[filter]}</h2>
          <div class="muted" id="count"></div>
        </div>
        <div class="toolbar">
          <input id="search" type="search" aria-label="Поиск по курсам"
            placeholder="Поиск по курсам" value="${escape(query)}">
          <select id="category" aria-label="Категория">
            <option value="">Все категории</option>
            ${options(category)}
          </select>
        </div>
      </div>

      <div class="catalog">
        <div class="row head">
          <span>Название курса</span>
          <span>Категория</span>
          <span>Статус</span>
          <span>Обновлён</span>
          <span></span>
        </div>
        <div id="rows"></div>
      </div>
      <p class="footer-note">Курсы, вложения и тесты сохраняются в этом браузере.</p>
    </section>
  `;

  drawRows();
}

function drawRows() {
  const term = query.trim().toLocaleLowerCase('ru');
  const shown = courses
    .filter(item =>
      (filter === 'all' || item.status === filter) &&
      (!category || item.category === category) &&
      item.title.toLocaleLowerCase('ru').includes(term)
    )
    .sort((a, b) => new Date(b.updated) - new Date(a.updated));

  const icons = {
    'Охрана труда': '✚', 'Производство': '▤', 'Качество': '✓', 'Адаптация': '◫'
  };
  const colors = { 'Производство': 'alt', 'Качество': 'warm' };

  main.querySelector('#count').textContent = `Курсов: ${shown.length}`;
  main.querySelector('#rows').innerHTML = shown.map(item => `
    <div class="row">
      <div class="course-title">
        <span class="course-icon ${colors[item.category] ?? ''}" aria-hidden="true">
          ${icons[item.category] ?? '▤'}
        </span>
        <div>
          <button data-action="edit" data-id="${escape(item.id)}">${escape(item.title)}</button>
          <small>Материалов: ${item.blocks.length}</small>
        </div>
      </div>
      <span>${escape(item.category)}</span>
      <span>${tag(item.status)}</span>
      <span>${date(item.updated)}</span>
      <button class="more" data-action="menu" data-id="${escape(item.id)}"
        aria-label="Действия с курсом ${escape(item.title)}">⋯</button>
    </div>
  `).join('') || '<div class="empty">Курсы не найдены.</div>';
}

function renderTestCatalog() {
  const items = [...tests]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .map(test => `
      <li class="course-title">
        <button type="button" data-action="edit-test" data-id="${escape(test.id)}">
          ${escape(test.title)}
        </button>
        <small>Вопросов: ${test.questions.length}</small>
      </li>
    `).join('');

  return `
    <section aria-labelledby="tests-title">
      <div class="section-head"><h2 id="tests-title">Все тесты</h2></div>
      <div class="catalog">
        ${items
          ? `<ul class="test-list">${items}</ul>`
          : '<p class="test-empty muted">Тестов пока нет.</p>'}
      </div>
    </section>
  `;
}

// Редактор тестов

function renderTestQuestion(index, question = {
  text: '',
  type: 'single',
  answers: ['', ''],
  correctAnswers: []
}) {
  const type = question.type ?? 'single';
  const correctAnswers = question.correctAnswers ?? [question.correct ?? 0];
  const ordered = type === 'order';
  const label = ordered ? 'Действие' : 'Вариант';
  const inputType = type === 'multiple' ? 'checkbox' : 'radio';

  const typeOptions = Object.entries(questionTypes).map(([value, name]) =>
    `<option value="${value}" ${value === type ? 'selected' : ''}>${name}</option>`
  ).join('');

  const answers = question.answers.map((answer, position) => `
    <div class="test-answer" data-option="${position}">
      ${ordered ? '' : `
        <input type="${inputType}" name="correct-${index}" value="${position}"
          aria-label="Правильный вариант ${position + 1}"
          ${correctAnswers.includes(position) ? 'checked' : ''}>
      `}
      <label class="field">
        ${label} ${position + 1}
        <input name="answer" value="${escape(answer)}" required>
      </label>
      <div class="actions test-option-actions">
        ${ordered ? `
          <button type="button" class="btn" data-option-action="up"
            aria-label="Поднять действие ${position + 1}"
            ${position === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn" data-option-action="down"
            aria-label="Опустить действие ${position + 1}"
            ${position === question.answers.length - 1 ? 'disabled' : ''}>↓</button>
        ` : ''}
        <button type="button" class="btn error" data-option-action="remove"
          aria-label="Удалить ${label.toLowerCase()} ${position + 1}"
          ${question.answers.length <= 2 ? 'disabled' : ''}>Удалить</button>
      </div>
    </div>
  `).join('');

  return `
    <fieldset class="test-question" data-question-index="${index}">
      <legend>Вопрос ${index + 1}</legend>
      <label class="field">
        Текст вопроса
        <input name="question" value="${escape(question.text)}" required>
      </label>
      <label class="field">
        Тип вопроса
        <select name="question-type">${typeOptions}</select>
      </label>
      <p class="muted">${ordered
        ? 'Расположите действия в правильном порядке сверху вниз.'
        : 'Отметьте правильные варианты.'}</p>
      ${answers}
      <button type="button" class="btn" data-option-action="append">
        ＋ Добавить ${label.toLowerCase()}
      </button>
    </fieldset>
  `;
}

function readTestQuestion(field) {
  return {
    text: field.querySelector('[name="question"]').value,
    type: field.querySelector('[name="question-type"]').value,
    answers: [...field.querySelectorAll('[name="answer"]')].map(input => input.value),
    correctAnswers: [...field.querySelectorAll('input:checked')]
      .map(input => Number(input.value))
  };
}

function redrawTestQuestion(field, question, focusSelector) {
  const index = Number(field.dataset.questionIndex);
  const container = field.parentElement;
  field.outerHTML = renderTestQuestion(index, question);
  container.children[index].querySelector(focusSelector)?.focus();
}

function openTestEditor(test) {
  const savedQuestions = test?.questions ?? [];
  dialog.onclick = null;
  dialog.setAttribute('aria-labelledby', 'test-dialog-title');
  dialog.innerHTML = `
    <form class="test-editor">
      <h2 id="test-dialog-title">${test ? 'Редактировать тест' : 'Создать тест'}</h2>
      <label class="field">
        Название теста
        <input name="test-title" maxlength="140" value="${escape(test?.title)}" required>
      </label>
      <div class="test-questions">
        ${savedQuestions.length
          ? savedQuestions.map((question, index) => renderTestQuestion(index, question)).join('')
          : renderTestQuestion(0)}
      </div>
      <p class="error" role="alert" hidden></p>
      <div class="actions">
        <button type="button" class="btn" data-test-action="add">＋ Добавить вопрос</button>
        <button type="submit" class="btn primary">Сохранить тест</button>
        <button type="button" class="btn" data-test-action="cancel">Отмена</button>
      </div>
    </form>
  `;

  const form = dialog.querySelector('form');
  const fields = form.querySelector('.test-questions');
  const feedback = form.querySelector('[role="alert"]');
  const submit = form.querySelector('[type="submit"]');

  function showError(message) {
    feedback.textContent = message;
    feedback.hidden = false;
  }

  dialog.oncancel = event => {
    if (submit.disabled) event.preventDefault();
  };

  form.onchange = event => {
    if (event.target.name !== 'question-type') return;
    const field = event.target.closest('.test-question');
    const question = readTestQuestion(field);

    if (question.type === 'single') {
      question.correctAnswers = question.correctAnswers.slice(0, 1);
    } else if (question.type === 'order') {
      question.correctAnswers = [];
    }

    redrawTestQuestion(field, question, '[name="question-type"]');
  };

  form.onclick = event => {
    const button = event.target.closest('button');
    if (!button || submit.disabled) return;

    if (button.dataset.testAction === 'cancel') {
      dialog.close();
      return;
    }

    if (button.dataset.testAction === 'add') {
      fields.insertAdjacentHTML('beforeend', renderTestQuestion(fields.children.length));
      fields.lastElementChild.querySelector('[name="question"]').focus();
      return;
    }

    const action = button.dataset.optionAction;
    if (!action) return;

    const field = button.closest('.test-question');
    const question = readTestQuestion(field);
    let position = Number(button.closest('[data-option]')?.dataset.option);

    if (action === 'append') {
      position = question.answers.length;
      question.answers.push('');
    } else if (action === 'remove') {
      if (question.answers.length <= 2) return;
      question.answers.splice(position, 1);
      question.correctAnswers = question.correctAnswers
        .filter(answer => answer !== position)
        .map(answer => answer > position ? answer - 1 : answer);
      position = Math.min(position, question.answers.length - 1);
    } else {
      const next = position + (action === 'up' ? -1 : 1);
      if (next < 0 || next >= question.answers.length) return;
      [question.answers[position], question.answers[next]] = [
        question.answers[next],
        question.answers[position]
      ];
      position = next;
    }

    redrawTestQuestion(field, question, `[data-option="${position}"] [name="answer"]`);
  };

  form.onsubmit = async event => {
    event.preventDefault();
    if (submit.disabled) return;

    const blank = [...form.querySelectorAll('input[required]')]
      .find(input => !input.value.trim());

    if (blank) {
      blank.focus();
      showError('Заполните название, вопросы и варианты.');
      return;
    }

    const questions = [...fields.children].map(readTestQuestion);
    const missing = questions.findIndex(question =>
      question.type !== 'order' && question.correctAnswers.length === 0
    );

    if (missing >= 0) {
      fields.children[missing].querySelector('input[type="radio"], input[type="checkbox"]').focus();
      showError(`Отметьте правильный ответ в вопросе ${missing + 1}.`);
      return;
    }

    const updated = {
      id: test?.id ?? crypto.randomUUID(),
      title: form.elements.namedItem('test-title').value.trim(),
      questions: questions.map(question => ({
        ...question,
        text: question.text.trim(),
        answers: question.answers.map(answer => answer.trim())
      })),
      updated: new Date().toISOString()
    };

    feedback.hidden = true;
    submit.disabled = true;

    try {
      await storage('readwrite', store => store.put(updated), 'tests');
      tests = tests.filter(item => item.id !== updated.id).concat(updated);
      dialog.close();
      filter = 'all';
      catalog();

      const heading = main.querySelector('#tests-title');
      heading.tabIndex = -1;
      heading.focus();
      toast('Тест сохранён.');
    } catch {
      showError('Не удалось сохранить тест. Попробуйте ещё раз.');
    } finally {
      submit.disabled = false;
    }
  };

  dialog.showModal();
}

// Редактор курса

function edit(item) {
  course = item ? structuredClone(item) : {
    id: crypto.randomUUID(),
    title: '',
    category: categories[0],
    description: '',
    status: 'draft',
    blocks: []
  };

  dirty = false;
  renderEditor();
  window.scrollTo(0, 0);
}

function renderEditor() {
  resetURLs();
  screen = 'edit';

  main.innerHTML = `
    <button class="back" data-action="back">Все курсы</button>

    <div class="editor-head">
      <div>
        <h1>${escape(course.title || 'Новый курс')}</h1>
        ${tag(course.status)}
      </div>
      <div class="actions">
        <button class="btn" data-action="preview">Предпросмотр</button>
        <button class="btn" data-action="save">Сохранить черновик</button>
        <button class="btn primary" data-action="ready">Отметить готовым</button>
      </div>
    </div>

    <div class="editor-grid">
      <div>
        <section class="panel">
          <h2>О курсе</h2>
          <label class="field">
            Название
            <input id="title" maxlength="140" placeholder="Например, вводный инструктаж"
              value="${escape(course.title)}" required>
          </label>
          <label class="field">
            Категория
            <select id="editor-category">${options(course.category)}</select>
          </label>
          <label class="field">
            Описание
            <textarea id="description" placeholder="Что сотрудник узнает из курса?">${escape(course.description)}</textarea>
          </label>
        </section>
        <div id="blocks">
          ${course.blocks.map(renderBlock).join('') || `
            <section class="panel">
              <h2>Материалы курса</h2>
              <p class="muted">Добавьте текст, внешнюю ссылку или файл.</p>
            </section>
          `}
        </div>
      </div>
      <aside class="panel">
        <h2>Добавить материал</h2>
        <div class="add-tools">
          ${Object.entries(types).map(([type, label]) =>
            `<button class="btn" data-action="add" data-type="${type}">＋ ${label}</button>`
          ).join('')}
        </div>
        <p class="footer-note">PDF, Word, Excel, PowerPoint и видео.</p>
      </aside>
    </div>
  `;
}

function renderBlock(block, index) {
  const content = {
    text: `
      <label class="field">
        Текст
        <textarea data-field="value">${escape(block.value)}</textarea>
      </label>
    `,
    link: `
      <label class="field">
        Адрес ссылки
        <input type="url" data-field="value" placeholder="https://…" value="${escape(block.value)}">
      </label>
    `,
    file: `
      <label class="field">
        Вложение
        <input type="file" data-field="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp4,.webm,.ogv,.mov,.m4v,.mkv,.avi,video/*">
      </label>
      ${block.file ? `<p class="file-name">${escape(block.file.name)}</p>` : ''}
    `
  }[block.type];

  return `
    <section class="panel" data-block="${index}">
      <div class="block-head">
        <h3>${index + 1}. ${types[block.type]}</h3>
        <div class="actions">
          <button class="btn" data-action="up" aria-label="Переместить выше"
            ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn" data-action="down" aria-label="Переместить ниже"
            ${index === course.blocks.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn error" data-action="remove">Удалить</button>
        </div>
      </div>
      <label class="field">
        Заголовок
        <input data-field="title" value="${escape(block.title)}">
      </label>
      ${content}
    </section>
  `;
}

function previewBlock(block, index) {
  let content = `<p>${escape(block.value)}</p>`;

  if (block.type === 'link') {
    const url = safeURL(block.value);
    content = url
      ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(url)}</a>`
      : '<p class="muted">Ссылка не добавлена</p>';
  }

  if (block.type === 'file') {
    content = '<p class="muted">Файл не добавлен</p>';

    if (block.file) {
      const file = block.file;
      const url = URL.createObjectURL(file);
      const name = escape(file.name);
      urls.push(url);

      let embed = '';
      if (file.type.startsWith('video/') || videoExtension.test(file.name)) {
        embed = `<video controls preload="metadata" src="${url}"></video>`;
      } else if (/\.pdf$/i.test(file.name) && file.type === 'application/pdf') {
        embed = `<iframe title="${name}" sandbox src="${url}"></iframe>`;
      }

      content = `${embed}<p><a download="${name}" href="${url}">Скачать ${name}</a></p>`;
    }
  }

  const title = block.title || `${types[block.type]} ${index + 1}`;
  return `<section class="panel"><h2>${escape(title)}</h2>${content}</section>`;
}

function preview() {
  resetURLs();
  screen = 'preview';
  main.innerHTML = `
    <button class="back" data-action="return-editor">Вернуться к редактору</button>
    <div class="editor-head"><h1>${escape(course.title || 'Новый курс')}</h1></div>
    <div class="preview">
      <section class="panel">
        <span class="pill">${escape(course.category)}</span>
        <p>${escape(course.description)}</p>
      </section>
      ${course.blocks.map(previewBlock).join('')}
    </div>
  `;
  window.scrollTo(0, 0);
}

async function save(status) {
  if (!course.title.trim()) {
    main.querySelector('#title').focus();
    toast('Введите название курса.');
    return;
  }

  if (status === 'ready') {
    const hasEmptyBlock = course.blocks.some(block => {
      if (block.type === 'file') return !block.file;
      if (block.type === 'link') return !safeURL(block.value);
      return !block.value.trim();
    });

    if (!course.blocks.length || hasEmptyBlock) {
      toast('Добавьте материалы и заполните каждый блок.');
      return;
    }
  }

  const updated = {
    ...course,
    title: course.title.trim(),
    status,
    updated: new Date().toISOString()
  };

  main.classList.add('busy');
  try {
    await storage('readwrite', store => store.put(updated));
    courses = courses.filter(item => item.id !== updated.id).concat(updated);
    course = updated;
    dirty = false;
    renderEditor();
    toast(status === 'ready' ? 'Курс отмечен как готовый.' : 'Черновик сохранён.');
  } catch {
    toast('Не удалось сохранить курс. Проверьте свободное место.');
  } finally {
    main.classList.remove('busy');
  }
}

function leave(nextFilter) {
  if (main.classList.contains('busy')) return;
  if (dirty && !confirm('Выйти без сохранения изменений?')) return;

  dirty = false;
  filter = nextFilter;
  category = '';
  query = '';
  catalog();
  window.scrollTo(0, 0);
}

function openMenu(item) {
  dialog.oncancel = null;
  dialog.removeAttribute('aria-labelledby');
  dialog.innerHTML = `
    <h2>${escape(item.title)}</h2>
    <div class="actions">
      <button class="btn primary" data-dialog="edit">Редактировать</button>
      <button class="btn error" data-dialog="delete">Удалить</button>
      <button class="btn" data-dialog="close">Закрыть</button>
    </div>
  `;

  dialog.onclick = async event => {
    const button = event.target.closest('[data-dialog]');
    if (!button) return;
    const action = button.dataset.dialog;

    if (action === 'close') dialog.close();

    if (action === 'edit') {
      dialog.close();
      edit(item);
    }

    if (action === 'delete' && confirm('Удалить курс и все его материалы?')) {
      button.disabled = true;
      try {
        await storage('readwrite', store => store.delete(item.id));
        courses = courses.filter(entry => entry.id !== item.id);
        dialog.close();
        drawRows();
        toast('Курс удалён.');
      } catch {
        button.disabled = false;
        toast('Не удалось удалить курс.');
      }
    }
  };

  dialog.showModal();
}

// События страницы

document.querySelector('.nav').addEventListener('click', event => {
  const button = event.target.closest('[data-nav]');
  if (button) leave(button.dataset.nav);
});

document.querySelector('.brand').addEventListener('click', event => {
  event.preventDefault();
  if (screen !== 'list' || filter !== 'all') leave('all');
});

main.addEventListener('input', event => {
  const input = event.target;

  if (input.id === 'search') {
    query = input.value;
    drawRows();
  }

  if (screen !== 'edit' || input.type === 'file') return;

  if (input.dataset.field) {
    const index = Number(input.closest('[data-block]').dataset.block);
    course.blocks[index][input.dataset.field] = input.value;
  } else if (input.id === 'editor-category') {
    course.category = input.value;
  } else if (input.id === 'title' || input.id === 'description') {
    course[input.id] = input.value;
  } else {
    return;
  }

  if (input.id === 'title') {
    main.querySelector('h1').textContent = course.title || 'Новый курс';
  }
  dirty = true;
});

main.addEventListener('change', event => {
  const input = event.target;

  if (input.id === 'category') {
    category = input.value;
    drawRows();
  }

  if (input.type !== 'file' || !input.files.length) return;

  const file = input.files[0];
  if (!allowed.test(file.name)) {
    input.value = '';
    toast('Выберите PDF, документ Office или видео.');
    return;
  }

  const section = input.closest('[data-block]');
  const index = Number(section.dataset.block);
  const block = course.blocks[index];
  block.file = file;
  if (!block.title.trim()) block.title = file.name;

  dirty = true;
  section.outerHTML = renderBlock(block, index);
});

main.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || main.classList.contains('busy')) return;

  const { action, id, type } = button.dataset;

  switch (action) {
    case 'new-test':
      openTestEditor();
      break;

    case 'edit-test': {
      const test = tests.find(entry => entry.id === id);
      if (test) openTestEditor(test);
      break;
    }

    case 'new':
      edit();
      break;

    case 'edit':
    case 'menu': {
      const item = courses.find(entry => entry.id === id);
      if (!item) break;
      if (action === 'edit') edit(item);
      else openMenu(item);
      break;
    }

    case 'back':
      leave('all');
      break;

    case 'preview':
      preview();
      break;

    case 'return-editor':
      renderEditor();
      break;

    case 'save':
      save('draft');
      break;

    case 'ready':
      save('ready');
      break;

    case 'add':
      course.blocks.push({ type, title: '', value: '' });
      dirty = true;
      renderEditor();
      main.querySelector('[data-block]:last-child [data-field="title"]').focus();
      break;

    case 'remove':
    case 'up':
    case 'down': {
      const index = Number(button.closest('[data-block]').dataset.block);

      if (action === 'remove') {
        course.blocks.splice(index, 1);
      } else {
        const next = index + (action === 'up' ? -1 : 1);
        [course.blocks[index], course.blocks[next]] = [
          course.blocks[next],
          course.blocks[index]
        ];
      }

      dirty = true;
      renderEditor();
      break;
    }
  }
});

window.addEventListener('beforeunload', event => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});

async function start() {
  try {
    [courses, tests] = await Promise.all([
      storage('readonly', store => store.getAll()),
      storage('readonly', store => store.getAll(), 'tests')
    ]);
    catalog();
  } catch {
    main.innerHTML = `
      <section class="panel">
        <h1>Хранилище недоступно</h1>
        <p>Разрешите браузеру хранить данные и обновите страницу.</p>
      </section>
    `;
  }
}

start();