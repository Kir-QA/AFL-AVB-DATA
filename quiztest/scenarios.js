// Сценарный тест v0.05.2 — логика ответов Moodle-quiz на DOM, точь-в-точь
// по разведке AVB_Moodle_quiz_DOM.md §2.2:
//   .answer > div.r0/r1…, input БЕЗ <label>, текст в div[data-region=answer-label]
//   > div.flex-fill.ml-1 (номер в span.answernumber — не брать в текст),
//   у radio есть скрытый sr-only «Очистить выбор» (value=-1) — фильтровать.
//
// С1: checkbox, 3 правильных из 5 → отмечаются все три.
// С2: checkbox, частичное совпадение — отмечается только существующий ответ.
// С3: вопрос ВНЕ БД → пауза → плашка с непустыми вариантами → «▶ Продолжить»
//     → вариант применён, форма сабмитится, корректировка сохраняется.
// С4 (v0.05.2): radio, в БД НЕСКОЛЬКО ответов, есть сводный «Все вышеперечисленные…»
//     → кликается ТОЛЬКО сводный вариант (radio держит один выбор).
// С5 (v0.05.2): radio, в БД несколько ответов, сводного варианта НЕТ
//     → пауза + корректировка, форма НЕ сабмитится (был «пропуск» вопроса).
const fs = require('fs');
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
    if (s.includes('COURSON')) origLog.call(console, '  [script]', s.replace(/%c/g, '').slice(0, 150));
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const makeDb = (entries) => 'const AVB_QUESTIONS_DB = ' + JSON.stringify(entries) + ';';

// DOM по разведке §2.2. multi=true — checkbox-вопрос, иначе radio (+sr-only clear).
const attemptHtml = (question, options, multi) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="region-main">
  <div class="que multichoice deferredfeedback notyetanswered" id="question-298938-1">
    <div class="formulation">
      <div class="qtext">${question}</div>
      <div class="answer">
        ${options.map((t, i) => `
        <div class="r${i}">
          <input type="${multi ? 'checkbox' : 'radio'}" name="q298938:1_${multi ? 'choice' + i : 'answer'}" value="${i}" id="q298938:1_a${i}">
          <div class="d-flex w-auto" id="q298938:1_a${i}_label" data-region="answer-label">
            <span class="answernumber">${'abcde'[i]}. </span>
            <div class="flex-fill ml-1">${t}</div>
          </div>
        </div>`).join('')}
        ${multi ? '' : `
        <div class="r${options.length}">
          <input type="radio" name="q298938:1_answer" value="-1" id="q298938:1_clear" class="sr-only">
        </div>`}
      </div>
    </div>
  </div>
  <form id="responseform" action="https://lms.avb.ru/mod/quiz/processattempt.php?cmid=8032">
    <input type="hidden" name="attempt" value="297918">
    <input type="hidden" name="thispage" value="0">
    <input type="hidden" name="nextpage" value="1">
    <input type="hidden" name="sesskey" value="Crx5raAzzT">
    <input type="submit" name="next" value="Следующая страница">
  </form>
</div>
</body></html>`;

function bootPage(url, html, dbCode) {
    const dom = new JSDOM(html, {
        url,
        runScripts: 'outside-only',
        pretendToBeVisual: true,
    });
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
    global.GM_setValue = undefined;
    global.GM_getValue = undefined;
    global.GM_xmlhttpRequest = (opts) => setTimeout(() => {
        opts.onload({ status: 200, responseText: dbCode });
    }, 10);

    delete require.cache[require.resolve('jquery')];
    const $ = require('jquery');
    global.$ = $; global.jQuery = $;
    window.$ = $; window.jQuery = $;

    window.sessionStorage.setItem('avb_quiz_running', '1');

    let submits = 0;
    const form = window.document.getElementById('responseform');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); submits++; });

    console.log = quietLog;
    new Function(code)();
    return { window, getSubmits: () => submits };
}

function bootAttempt(question, options, dbCode, multi) {
    return bootPage(
        'https://lms.avb.ru/mod/quiz/attempt.php?attempt=777&cmid=8032&page=0',
        attemptHtml(question, options, multi),
        dbCode
    );
}

// review.php: сводная оценка + блоки вопросов (correct/incorrect + .rightanswer).
const reviewHtml = (gradeText, questions) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="region-main">
  <div class="quizgradesummary"><div class="grade">${gradeText}</div></div>
  ${questions.map((q, i) => `
  <div class="que multichoice ${q.ok ? 'correct' : 'incorrect'}" id="question-298938-${i + 1}">
    <div class="formulation">
      <div class="qtext">${q.q}</div>
      ${q.ok ? '' : `<div class="rightanswer">Правильный ответ: ${q.ra}</div>`}
    </div>
  </div>`).join('')}
</div>
</body></html>`;

// summary.php: форма завершения + модалка подтверждения (появляется по клику).
const summaryHtml = () => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="region-main">
  <table class="generaltable"><tbody>
    <tr class="notyetanswered"><td>1</td></tr>
  </tbody></table>
  <form id="frm-finishattempt" method="post" action="https://lms.avb.ru/mod/quiz/processattempt.php?cmid=8032">
    <button type="submit" class="btn btn-primary">Отправить всё и завершить тест</button>
  </form>
</div>
</body></html>`;

const checkedIndices = (window, type) =>
    [...window.document.querySelectorAll(`.que .answer input[type="${type}"]:not(.sr-only)`)]
        .map((b, i) => b.checked ? i : -1).filter(i => i >= 0);

(async () => {
    // ===== С1: checkbox, 3 правильных из 5 =====
    {
        const Q = 'Какие действия входят в обязанности бортпроводника при эвакуации?';
        const OPTS = [
            'Команда «Всем выйти! Всем выйти!»',
            'Контроль быстроты эвакуации',
            'Проверка отсутствия пассажиров',
            'Сбор личных вещей пассажиров',
            'Фотографирование сценария',
        ];
        const db = makeDb([[[Q, null], OPTS.slice(0, 3)]]);
        const { window } = bootAttempt(Q, OPTS, db, true);
        await sleep(6000);
        const idx = checkedIndices(window, 'checkbox');
        console.log = origLog;
        check(`С1: отмечены все 3 правильных из 5 (факт: [${idx}])`,
            idx.length === 3 && idx.every(i => i <= 2));
    }

    // ===== С2: checkbox, частичное совпадение =====
    {
        const Q = 'Что относится к спецсредствам сдерживания на борту?';
        const OPTS = ['Пластиковые наручники', 'Наручники металлические с запором', 'Спальная маска'];
        const db = makeDb([[[Q, null], [OPTS[0], 'Верёвка для фиксации нарушителя']]]);
        const { window } = bootAttempt(Q, OPTS, db, true);
        await sleep(6000);
        const idx = checkedIndices(window, 'checkbox');
        console.log = origLog;
        check(`С2: отмечен ТОЛЬКО существующий на странице ответ (факт: [${idx}])`,
            idx.length === 1 && idx[0] === 0);
    }

    // ===== С3: вне БД → пауза → корректировка → «Продолжить» =====
    {
        const Q = 'Вопрос, которого гарантированно нет ни в одной базе данных?';
        const OPTS = ['Вариант альфа — заведомо неверный', 'Вариант бета — правильный', 'Вариант гамма — заведомо неверный'];
        const db = makeDb([[['Совершенно другой вопрос в базе?', null], ['да']]]);
        const { window, getSubmits } = bootAttempt(Q, OPTS, db, true);
        await sleep(6000);
        console.log = origLog;

        const panel = window.document.getElementById('courson-corrections');
        check('С3: плашка корректировок появилась', !!panel);
        const entry = (window.__COURSON_CORRECTIONS__ || [])[0];
        check('С3: варианты в корректировках НЕпустые',
            !!entry && entry.options.length === 3 && entry.options.every(o => o && o.trim().length > 0));
        check('С3: форма не сабмитилась на паузе', getSubmits() === 0);

        const box = panel.querySelector('input[data-opt="1"]');
        box.checked = true;
        box.dispatchEvent(new window.Event('change', { bubbles: true }));
        panel.querySelector('.cc-btn-continue').click();
        await sleep(1500);

        const idx = checkedIndices(window, 'checkbox');
        check(`С3: применён вариант «бета» к форме (факт: [${idx}])`, idx.length === 1 && idx[0] === 1);
        check('С3: форма сабмитнута после «Продолжить»', getSubmits() >= 1);
    }

    // ===== С4 (v0.05.2): radio + несколько ответов в БД + сводный вариант =====
    {
        const Q = 'Кто из перечисленных лиц обязан соблюдать требования авиационной безопасности?';
        const OPTS = [
            'Капитан воздушного судна',
            'Бортпроводники',
            'Пассажиры',
            'Все вышеперечисленные лица',
        ];
        const db = makeDb([[[Q, null], OPTS.slice(0, 3)]]); // в БД — три ответа
        const { window, getSubmits } = bootAttempt(Q, OPTS, db, false);
        await sleep(6000);
        const idx = checkedIndices(window, 'radio');
        console.log = origLog;
        check(`С4: radio с несколькими ответами БД → ТОЛЬКО сводный вариант [3] (факт: [${idx}])`,
            idx.length === 1 && idx[0] === 3);
        check('С4: форма сабмитнута', getSubmits() >= 1);
    }

    // ===== С5 (v0.05.2): radio + несколько ответов в БД, сводного НЕТ → пауза =====
    {
        const Q = 'Какие из перечисленных документов подлежат проверке при посадке?';
        const OPTS = [
            'Посадочный талон',
            'Документ, удостоверяющий личность',
            'Справка о вакцинации',
        ];
        const db = makeDb([[[Q, null], OPTS.slice(0, 2)]]); // в БД — два ответа
        const { window, getSubmits } = bootAttempt(Q, OPTS, db, false);
        await sleep(6000);
        const idx = checkedIndices(window, 'radio');
        const panel = window.document.getElementById('courson-corrections');
        console.log = origLog;
        check(`С5: сводного варианта нет → форма НЕ тронута (факт: [${idx}])`, idx.length === 0);
        check('С5: форма НЕ сабмитилась (раньше уходил пустой ответ)', getSubmits() === 0);
        check('С5: вопрос ушёл в плашку корректировок для ручного ответа', !!panel);
    }

    // ===== С6 (v0.05.3): review.php < 95% → файл корректировок =====
    {
        const Q_WRONG_DB = 'Вопрос с устаревшим ответом в базе?';
        const Q_MISSING = 'Вопрос, которого нет в базе данных совсем?';
        const Q_OK = 'Вопрос, отвеченный верно?';
        const db = makeDb([
            [[Q_WRONG_DB, null], ['Устаревший ответ из БД']],
            [[Q_OK, null], ['Правильный ответ']],
        ]);
        const html = reviewHtml('80,00 из 100,00', [
            { q: Q_OK, ok: true },
            { q: Q_WRONG_DB, ok: false, ra: 'Актуальный ответ с review' },
            { q: Q_MISSING, ok: false, ra: 'Ответ для нового вопроса' },
        ]);
        const { window } = bootPage(
            'https://lms.avb.ru/mod/quiz/review.php?attempt=777&cmid=8032', html, db);
        await sleep(6000);
        console.log = origLog;
        const corr = window.__AVB_LAST_REVIEW_CORRECTIONS__;
        check('С6: корректировки собраны (низкий процент)', !!corr);
        check(`С6: верный вопрос НЕ в файле, в файле 2 записи (факт: ${corr && corr.count})`,
            !!corr && corr.count === 2);
        const wrongDb = corr && corr.items.find(i => i[0][0] === Q_WRONG_DB);
        check('С6: вопрос из БД с неверным ответом — взят ответ СО СТРАНИЦЫ review',
            !!wrongDb && wrongDb[1].includes('Актуальный ответ с review'));
        const missing = corr && corr.items.find(i => i[0][0] === Q_MISSING);
        check('С6: вопроса нет в БД — добавлен с ответом review',
            !!missing && missing[1].includes('Ответ для нового вопроса'));
    }

    // ===== С7 (v0.05.3): summary.php → подтверждение модалки =====
    {
        const { window } = bootPage(
            'https://lms.avb.ru/mod/quiz/summary.php?cmid=8032', summaryHtml(),
            makeDb([]));
        // По клику на «Отправить всё и завершить тест» Moodle показывает модалку.
        window.document.querySelector('#frm-finishattempt button')
            .addEventListener('click', () => {
                const modal = window.document.createElement('div');
                modal.className = 'modal show';
                modal.innerHTML =
                    '<div class="modal-dialog"><div class="modal-content">' +
                    '<div class="modal-body">Отправить все свои ответы и закончить?</div>' +
                    '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-secondary">Отмена</button>' +
                    '<button type="button" class="btn btn-primary">Отправить все свои ответы и закончить</button>' +
                    '</div></div></div>';
                window.document.body.appendChild(modal);
                modal.querySelector('.btn-primary').addEventListener('click', () => {
                    window.__MODAL_CONFIRMED__ = true;
                });
            });
        await sleep(6000);
        console.log = origLog;
        check('С7: модалка «Отправить все свои ответы и закончить» подтверждена скриптом',
            window.__MODAL_CONFIRMED__ === true);
    }

    const failed = results.filter(r => !r.ok);
    console.log(failed.length ? `\nИТОГ: ${failed.length} проверок ПРОВАЛЕНО` : '\nИТОГ: все проверки пройдены');
    process.exit(failed.length ? 1 : 0);
})().catch(e => { console.log = origLog; console.error('💥 Ошибка теста:', e); process.exit(2); });
