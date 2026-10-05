# quiztest — автотесты скрипта AVB-toster (Moodle-quiz)

Запускаются в Node.js (jsdom, эмуляция страниц lms.avb.ru без браузера).
Тестируют репозиторий **Kir-QA/AFL-AVB** (сам userscript) — по умолчанию
берут его из соседней локальной копии `Z:\Sveet\Git\AFL-AVB`.

## Установка

```bash
npm install
```

## Запуск

```bash
# Сценарии С1–С7 (логика ответов, паузы, review.php, модалка финала):
node scenarios.js [путь-к-скрипту]

# Смоук полного цикла view.php → preflight → attempt.php
# (на реальной БД ../AVB-questions-database.js этого репозитория, без сети):
node smoke.js [путь-к-скрипту]
```

Путь к скрипту опционален; по умолчанию — `Z:\Sveet\Git\AFL-AVB\AVB_14_09_2025 full TURBOhfc (Modular).js`.

Перед пушем в AFL-AVB: `node --check` скрипта + оба набора должны быть зелёными.
