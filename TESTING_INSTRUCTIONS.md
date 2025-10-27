# Инструкция по тестированию endpoint /project/:Project_id/add

## Проблема

При попытке протестировать новый endpoint через curl или Python скрипт возникает ошибка `403 Forbidden` из-за защиты captcha и CSRF.

## ✅ Endpoint работает!

Проверка показала что:
- ✅ Код загружен в контейнер
- ✅ Маршрут зарегистрирован
- ✅ Endpoint отвечает (без авторизации возвращает 403, что правильно)

## Способы тестирования

### Способ 1: Через консоль браузера (РЕКОМЕНДУЕТСЯ)

Это самый простой способ, так как использует вашу активную сессию.

**Шаги:**

1. Откройте http://localhost в браузере
2. Залогиньтесь как `gleb.kalachev@yandex.ru`
3. Откройте консоль разработчика (F12 → Console)
4. Скопируйте и вставьте содержимое файла `test_add_endpoint_browser.js`
5. Нажмите Enter

**Файл для копирования:**
```bash
cat test_add_endpoint_browser.js
```

**Что произойдёт:**
- Скрипт автоматически получит CSRF токен из страницы
- Выполнит POST запрос к `/project/68f42280ee75875128fa771b/add`
- Попытается добавить `ivan@example.com` с ролью `readOnly`
- Покажет результат в консоли

**Ожидаемые результаты:**
- ✅ Успех: `{"success": true, "user": {...}}`
- ⚠️ Пользователь не найден: `{"error": "user_not_found"}` - нужно создать ivan@example.com
- ℹ️ Уже участник: `{"error": "user_already_member"}`

---

### Способ 2: Через curl с экспортом cookies из браузера

Если вы хотите использовать curl, экспортируйте cookies из браузера.

**Chrome/Firefox:**
1. Установите расширение "EditThisCookie" или "Cookie-Editor"
2. Зайдите на http://localhost
3. Экспортируйте cookies в формате Netscape
4. Сохраните в файл `browser_cookies.txt`

**Затем:**
```bash
CSRF_TOKEN=$(curl -s http://localhost/dev/csrf)

curl -b browser_cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"ivan@example.com","privileges":"readOnly"}' \
  http://localhost/project/68f42280ee75875128fa771b/add
```

---

### Способ 3: Создать пользователя ivan@example.com сначала

Если пользователь не существует, endpoint вернёт `user_not_found`. Создайте пользователя:

**Через консоль браузера (после логина):**
```javascript
// Открыть страницу /launchpad и создать пользователя там
// ИЛИ через MongoDB:
```

**Через MongoDB (в контейнере):**
```bash
docker compose exec mongo mongosh sharelatex --eval '
  db.users.insertOne({
    email: "ivan@example.com",
    emails: [{ email: "ivan@example.com", confirmedAt: new Date() }],
    first_name: "Ivan",
    last_name: "Test",
    hashedPassword: "$2a$12$qwertyuiopasdfghjklzxc",
    isAdmin: false,
    createdAt: new Date()
  })
'
```

**Затем:**
Установите пароль через интерфейс админа или через API.

---

### Способ 4: Использовать Private API (Basic Auth)

Если настроена Basic Auth для Private API, можно использовать её.

Проверьте настройки в `config/settings.defaults.js`:
```bash
docker compose exec web grep -A 5 "httpAuthUsers" /overleaf/services/web/config/settings.defaults.js
```

Если есть пользователь, используйте:
```bash
curl -u username:password \
  -H "Content-Type: application/json" \
  -d '{"email":"ivan@example.com","privileges":"readOnly"}' \
  http://localhost/project/68f42280ee75875128fa771b/add
```

---

## Отладка

### Проверить что endpoint работает:

```bash
# Без авторизации должно вернуть 403
curl -X POST http://localhost/project/68f42280ee75875128fa771b/add \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","privileges":"readOnly"}'
# Ожидаемо: Forbidden
```

### Проверить что код загружен в контейнер:

```bash
docker compose exec web grep -n "addUserDirectly" \
  /overleaf/services/web/app/src/Features/Collaborators/CollaboratorsController.mjs
# Должно найти строки 32, 239, 254
```

### Проверить что маршрут зарегистрирован:

```bash
docker compose exec web grep "/project/:Project_id/add" \
  /overleaf/services/web/app/src/Features/Collaborators/CollaboratorsRouter.mjs
# Должно найти строку 87
```

### Посмотреть логи сервиса:

```bash
docker compose logs -f web
# Запустите тест и смотрите логи в реальном времени
```

---

## Быстрый тест (только проверка доступности endpoint)

```bash
# Endpoint должен отвечать 403 без авторизации
curl -I -X POST http://localhost/project/test/add 2>&1 | grep "HTTP"
# Ожидаемо: HTTP/1.1 403 Forbidden
```

Если видите `403 Forbidden` - **endpoint работает!** ✅

Если видите `404 Not Found` - что-то не так с маршрутизацией.

---

## Рекомендация

**Используйте Способ 1 (консоль браузера)** - это самый простой и надёжный способ.

1. Откройте http://localhost
2. Войдите в систему
3. Откройте консоль (F12)
4. Вставьте код из `test_add_endpoint_browser.js`
5. Смотрите результат

---

## Создание тестового пользователя ivan@example.com

**Самый простой способ:**

1. Откройте http://localhost в режиме инкогнито
2. Если есть кнопка Register - зарегистрируйте `ivan@example.com`
3. Если нет - используйте `/launchpad` для создания пользователя (если вы admin)

**ИЛИ через существующий интерфейс:**

Если у вас есть admin доступ, зайдите в Admin Panel → Create User.

---

## Итоговый чеклист

- [ ] Endpoint `/project/:Project_id/add` отвечает 403 без авторизации ✅
- [ ] Код `addUserDirectly` есть в контейнере ✅
- [ ] Маршрут зарегистрирован в роутере ✅
- [ ] Создан пользователь `ivan@example.com` (или другой для теста)
- [ ] Запущен тест через консоль браузера
- [ ] Endpoint вернул успешный результат `{"success": true}`

## Если всё равно не работает

Возможные причины:
1. **CSRF токен не передаётся** - используйте консоль браузера
2. **Captcha включена** - отключите в настройках или используйте браузер
3. **Пользователь не существует** - создайте `ivan@example.com`
4. **Нет прав на проект** - используйте владельца проекта
5. **Проект не существует** - проверьте ID проекта

## Логи для диагностики

```bash
# Смотреть логи в реальном времени
docker compose logs -f web | grep -i "add-collaborator\|error"

# Последние 100 строк
docker compose logs --tail=100 web
```
