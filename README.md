# Две стороны — по 4 числа

Веб-приложение: на каждой стороне 4 разных числа от 1 до 8, ввод одним четырёхзначным числом (например `1234` → 1, 2, 3, 4).

## Запуск

Откройте `index.html` в браузере или из папки проекта:

```bash
# Python
python -m http.server 8080

# Node (если установлен npx)
npx serve .
```

Затем откройте http://localhost:8080

## Сайт на GitHub Pages

https://jfeldman777.github.io/man/

В репозитории: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

После каждого push в `main` workflow «Deploy to GitHub Pages» обновляет сайт (1–3 минуты).

## Изменение формулы

Логика расчёта в `app.js`, функция `calculate(sideA, sideB)` — каждый аргумент массив из 4 цифр.
