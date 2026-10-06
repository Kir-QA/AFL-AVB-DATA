// Тест модуля автопрохода курса (course-walk) — Z:\Sveet\Git\AFL-AVB, ветка main.
// Проверяем на jsdom-fixtures:
//   W1: course-view — автостарт собирает очередь ТОЛЬКО из невыполненных страниц,
//       ставит флаги running + course_url, собирает очередь квизов.
//   W2: mod/page — отмечает кнопкой «Выполнено», вычитает страницу из очереди.
//   W3: последняя страница + включены тесты → флаги quiz-walk (тесты стартуют).
//   W4: последняя страница + тесты выключены → флаг mark-all (возврат к курсу).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SCRIPT = process.argv[2] ||
    'Z:\\Sveet\\Git\\AFL-AVB\\AVB_14_09_2025 full TURBOhfc (Modular).js';
const code = fs.readFileSync(SCRIPT, 'utf8');

const results = [];
const check = (name, cond) => {
    results.push({ name, ok: !!cond });
    console.log(`${cond ? '✅' : '❌'} ${name}`);
};
const origLog = console.log;
const quietLog = (...args) => {
    const s = args.map(a => String(a)).join(' ');
    if (s.includes('COURSON') || s.includes('[AVB]') || s.includes('AVB EDUCATION'))
        origLog.call(console, '  [script]', s.replace(/%c/g, '').slice(0, 140));
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- fixtures ---------------------------------------------------------------
const P1 = 'https://lms.avb.ru/mod/page/view.php?id=9001';
const P2 = 'https://lms.avb.ru/mod/page/view.php?id=9002';
const P3 = 'https://lms.avb.ru/mod/page/view.php?id=9003';
const Q1 = 'https://lms.avb.ru/mod/quiz/view.php?id=8001';

const pageLi = (id, name, done) => `
  <li class="activity modtype_page" id="module-${id}">
    <a href="https://lms.avb.ru/mod/page/view.php?id=${id}"><span class="instancename">${name}</span></a>
    <button data-action="toggle-manual-completion" data-toggletype="manual:${done ? 'undo' : 'mark-done'}"></button>
  </li>`;

const courseHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="region-main"><div class="course-content"><ul class="section">
  ${pageLi(9001, 'Страница 1', false)}
  ${pageLi(9002, 'Страница 2', true)}
  ${pageLi(9003, 'Страница 3', false)}
  <li class="activity modtype_quiz" id="module-8001">
    <a href="${Q1}"><span class="instancename">Тест 1</span></a>
  </li>
</ul></div></div>
</body></html>`;

const lessonHtml = (id) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="region-main">
  <div role="main">
    <h1>Урок ${id}</h1>
    <button data-action="toggle-manual-completion" data-toggletype="manual:mark-done"></button>
  </div>
</div>
</body></html>`;

// --- harness ----------------------------------------------------------------
function boot(url, html, seed) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;

    Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
        get() { return this.textContent; },
        set(v) { this.textContent = v; },
        configurable: true,
    });

    global.window = window;
    global.document = window.document;
    global.location = window.location;
    global.history = window.history;
    global.navigator = window.navigator;
    global.sessionStorage = window.sessionStorage;
    global.localStorage = window.localStorage;
    global.MouseEvent = window.MouseEvent;
    global.PointerEvent = window.PointerEvent || window.MouseEvent;
    global.Event = window.Event;
    global.CSS = window.CSS;
    global.GM_getResourceText = undefined;
    global.GM_xmlhttpRequest = undefined;
    global.GM_setValue = undefined;
    global.GM_getValue = undefined;

    delete require.cache[require.resolve('jquery')];
    const $ = require('jquery');
    global.$ = $; global.jQuery = $;
    window.$ = $; window.jQuery = $;

    for (const [k, v] of Object.entries(seed || {})) {
        try { window.sessionStorage.setItem(k, v); } catch (e) {}
    }

    console.log = quietLog;
    new Function(code)();
    return window;
}

const getJSON = (w, k) => { try { return JSON.parse(w.sessionStorage.getItem(k) || '[]'); } catch (e) { return []; } };

(async () => {
    // ===== W1: course-view → автостарт, очередь только из pending =====
    {
        const w = boot('https://lms.avb.ru/course/view.php?id=182', courseHtml, {});
        await sleep(6500);   // init 1с + waitForContent + автостарт 3с + clickDelay
        console.log = origLog;

        const queue = getJSON(w, 'avb_moodle_queue');
        check(`W1: в очереди ТОЛЬКО 2 невыполненные страницы (факт: ${queue.length})`,
            queue.length === 2 && queue[0].includes('id=9001') && queue[1].includes('id=9003'));
        check('W1: флаг автопрохода установлен', w.sessionStorage.getItem('avb_moodle_running') === '1');
        check('W1: URL курса сохранён для возврата',
            w.sessionStorage.getItem('avb_moodle_course_url') === 'https://lms.avb.ru/course/view.php?id=182');
        const quizQ = getJSON(w, 'avb_quiz_queue');
        check(`W1: очередь тестов собрана заранее (факт: ${quizQ.length})`, quizQ.length === 1 && quizQ[0] === Q1);
        check(`W1: прогресс страниц 1/3 (факт: ${w.sessionStorage.getItem('avb_pages_done')}/${w.sessionStorage.getItem('avb_pages_total')})`,
            w.sessionStorage.getItem('avb_pages_total') === '3' && w.sessionStorage.getItem('avb_pages_done') === '1');
    }

    // ===== W2: учебная страница → «Выполнено» + вычитание из очереди =====
    {
        let markClicked = 0;
        const w = boot(P1, lessonHtml(9001), {
            'avb_moodle_running': '1',
            'avb_moodle_queue': JSON.stringify([P1, P3]),
            'avb_moodle_course_url': 'https://lms.avb.ru/course/view.php?id=182',
        });
        w.document.querySelector('button[data-action="toggle-manual-completion"]')
            .addEventListener('click', () => { markClicked++; });
        await sleep(7000);   // init 1с + waitForContent + checkInterval + mark + pace
        console.log = origLog;

        check(`W2: кнопка «Выполнено» нажата (кликов: ${markClicked})`, markClicked >= 1);
        const queue = getJSON(w, 'avb_moodle_queue');
        check(`W2: текущая страница вычтена, осталась 1 (факт: ${queue.length})`,
            queue.length === 1 && queue[0].includes('id=9003'));
    }

    // ===== W3: последняя страница + тесты включены → quiz-walk =====
    {
        const w = boot(P3, lessonHtml(9003), {
            'avb_moodle_running': '1',
            'avb_moodle_queue': JSON.stringify([P3]),
            'avb_moodle_course_url': 'https://lms.avb.ru/course/view.php?id=182',
            'avb_quiz_queue': JSON.stringify([Q1]),
            'avb_quiz_total': '1',
        });
        await sleep(7000);
        console.log = origLog;

        check('W3: все страницы пройдены → флаг course-walk снят', w.sessionStorage.getItem('avb_moodle_running') === null);
        check('W3: quiz-walk запущен (флаг avb_quiz_walk)', w.sessionStorage.getItem('avb_quiz_walk') === '1');
        check('W3: флаг запуска квиза установлен', w.sessionStorage.getItem('avb_quiz_running') === '1');
    }

    // ===== W4: последняя страница, тесты ВЫКЛ → mark-all и возврат =====
    {
        const w = boot(P3, lessonHtml(9003), {
            'avb_moodle_running': '1',
            'avb_moodle_queue': JSON.stringify([P3]),
            'avb_moodle_course_url': 'https://lms.avb.ru/course/view.php?id=182',
            'avb_quiz_queue': '[]',
            'avb_cfg_run_quizzes': '0',   // настройка: тесты не трогаем
        });
        await sleep(7000);
        console.log = origLog;

        check('W4: флаг «отметить все разделы» выставлен', w.sessionStorage.getItem('avb_mark_all_done') === '1');
        check('W4: quiz-walk НЕ запущен', w.sessionStorage.getItem('avb_quiz_walk') === null);
    }

    const failed = results.filter(r => !r.ok);
    console.log(failed.length ? `\nИТОГ: ${failed.length} проверок ПРОВАЛЕНО` : '\nИТОГ: все проверки пройдены');
    process.exit(failed.length ? 1 : 0);
})().catch(e => { console.log = origLog; console.error('💥 Ошибка теста:', e); process.exit(2); });
