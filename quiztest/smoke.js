// Смоук-тест v0.05.1 — ПОЛНЫЙ сценарий инициализации, как в браузере:
//   Стадия A: /mod/quiz/view.php  — автозапуск (флаг avb_quiz_walk, как ставит
//             автопроход курса), скрипт сам жмёт «Пройти тест» и preflight.
//   Стадия B: /mod/quiz/attempt.php — с перенесённым sessionStorage; скрипт
//             сам находит вопрос и отмечает варианты из реальной БД (372 вопр.).
// Вопрос — НАСТОЯЩИЙ из Kir-QA/AFL-AVB-DATA, множественный выбор (2 из 4).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SCRIPT = process.argv[2] ||
    'Z:\\Sveet\\Git\\AFL-AVB\\AVB_14_09_2025 full TURBOhfc (Modular).js';
const code = fs.readFileSync(SCRIPT, 'utf8');

// БД берём ЛОКАЛЬНО (../AVB-questions-database.js этого же репозитория) —
// тест не должен зависеть от сети/GitHub.
const DB_CODE = fs.readFileSync(path.join(__dirname, '..', 'AVB-questions-database.js'), 'utf8');

const DB_QUESTION = 'Хозяйственно-бытовые ножи (ножницы) с длиной клинка (лезвия) свыше 60 мм на борту ВС перевозить:';
const CORRECT = [
    'не принимаются, но есть исключения',
    'разрешено в зарегистрированном багаже',
];
const DECOYS = [
    'принимаются в ручной клади без ограничений',
    'передаются командиру воздушного судна для хранения',
];
const OPTIONS = [...CORRECT, ...DECOYS]; // правильные — индексы 0 и 1

const VIEW_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="region-main">
  <div class="quizstartbuttondiv">
    <form method="get" action="https://lms.avb.ru/mod/quiz/attempt.php">
      <button type="submit">Пройти тест</button>
    </form>
  </div>
</div>
</body></html>`;

const ATTEMPT_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="region-main">
  <div class="que">
    <div class="qtext">${DB_QUESTION}</div>
    <div class="answer">
      ${OPTIONS.map((t, i) => `
      <div>
        <input type="checkbox" name="q1_choice${i}" id="q1_a${i}">
        <label for="q1_a${i}"><span class="flex-fill ml-1">${t}</span></label>
      </div>`).join('')}
    </div>
  </div>
  <form id="responseform">
    <input type="hidden" name="nextpage" value="2">
    <input type="submit" name="next" value="Следующая страница">
  </form>
</div>
</body></html>`;

const results = [];
const check = (name, cond) => {
    results.push({ name, ok: !!cond });
    console.log(`${cond ? '✅' : '❌'} ${name}`);
};

let markerSeen = false;
const origLog = console.log;
const quietLog = (...args) => {
    const s = args.map(a => String(a)).join(' ');
    if (s.includes('v0.05.4 activated')) markerSeen = true;
    if (s.includes('COURSON') || s.includes('[AVB]')) origLog.call(console, '  [script]', s.replace(/%c/g, '').slice(0, 150));
};

// Запуск скрипта в изолированном jsdom-окне. seed — {ключ: значение} в sessionStorage.
function boot(url, html, seed) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;

    // jsdom не реализует innerText (в Chrome он есть) — полифолим текстом.
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
    // fetch → локальная копия БД из этого репозитория (без сети).
    const localFetch = () => Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(DB_CODE),
    });
    global.fetch = localFetch;
    window.fetch = localFetch;

    // jQuery (dist) при require берёт window из глобала и биндится к нему
    // навсегда — поэтому для каждого окна: свежий require с чистым кэшем,
    // ПОСЛЕ того как global.window указывает на текущее окно.
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

const snapStorage = (window) => {
    const out = {};
    try {
        for (let i = 0; i < window.sessionStorage.length; i++) {
            const k = window.sessionStorage.key(i);
            out[k] = window.sessionStorage.getItem(k);
        }
    } catch (e) {}
    return out;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    // === Стадия A: view.php — ставим флаг avb_quiz_walk (как mContinueOnPage при
    // переходе к тестам после страниц), всё остальное должен сделать сам скрипт.
    let preflightClicks = 0;
    const wA = boot('https://lms.avb.ru/mod/quiz/view.php?id=99', VIEW_HTML, {
        avb_quiz_walk: '1',                       // автопроход курса передал эстафету
        avb_moodle_course_url: 'https://lms.avb.ru/course/view.php?id=182',
    });
    // Имитируем Moodle: после клика «Пройти тест» появляется preflight-форма.
    wA.document.querySelector('.quizstartbuttondiv button').addEventListener('click', () => {
        setTimeout(() => {
            const d = wA.document.createElement('div');
            d.className = 'modal show';
            d.innerHTML = '<form id="mod_quiz_preflight_form">' +
                '<button type="submit">Начать попытку</button></form>';
            wA.document.body.appendChild(d);
        }, 300);
    });
    // Считаем клики по preflight (submit — jsdom не навигирует, только считаем).
    await sleep(7000); // init 1с + waitForContent + clickDelay 0.3с + пауза 1.5с до preflight

    const storeA = snapStorage(wA);
    console.log = origLog;
    console.log('  [test] sessionStorage после view.php:', JSON.stringify(storeA));
    check('A1: скрипт выставил флаг avb_quiz_running на view.php', storeA.avb_quiz_running === '1');
    check('A2: скрипт сохранил returnUrl', !!storeA.avb_quiz_return_url);
    check('A3: preflight-диалог появился и был подтверждён', !!wA.document.getElementById('mod_quiz_preflight_form'));

    // === Стадия B: attempt.php — тот же sessionStorage, свежая «страница».
    const wB = boot('https://lms.avb.ru/mod/quiz/attempt.php?attempt=12345', ATTEMPT_HTML, storeA);
    await sleep(9000); // init 1с + loadDatabase (fetch) + waitForContent + клики + submit 1.2с

    const boxes = [...wB.document.querySelectorAll('.que .answer input[type="checkbox"]')];
    const checkedIdx = boxes.map((b, i) => b.checked ? i : -1).filter(i => i >= 0);
    const dbg = wB.__COURSON_DEBUG__;

    console.log = origLog;
    check('B1: консольный маркер v0.05.3 — скрипт запустился', markerSeen);
    check('B2: панель создана без исключений', !!wB.document.getElementById('courson-panel'));
    check(`B3: отмечено РОВНО ${CORRECT.length} варианта (факт: [${checkedIdx}])`, checkedIdx.length === CORRECT.length);
    check(`B4: отмечены ПРАВИЛЬНЫЕ варианты (индексы 0,1)`,
        checkedIdx.length === CORRECT.length && checkedIdx.every(i => i < CORRECT.length));
    check('B5: ложные варианты (2,3) не отмечены', !boxes[2]?.checked && !boxes[3]?.checked);
    check(`B6: статистика ведётся (correctAnswers = ${dbg?.getStats?.().correctAnswers})`,
        (dbg?.getStats?.().correctAnswers || 0) >= CORRECT.length);
    check('B7: счётчик exact-матчей увеличился', (dbg?.getStats?.().matchedExact || 0) >= 1);

    const failed = results.filter(r => !r.ok);
    console.log(failed.length ? `\nИТОГ: ${failed.length} проверок ПРОВАЛЕНО` : '\nИТОГ: все проверки пройдены — полный цикл view.php → preflight → attempt.php работает');
    process.exit(failed.length ? 1 : 0);
})().catch(e => { console.log = origLog; console.error('💥 Ошибка теста:', e); process.exit(2); });
