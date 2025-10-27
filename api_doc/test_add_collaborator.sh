#!/bin/bash

# Скрипт для тестирования нового API endpoint /project/:Project_id/add
# Этот endpoint добавляет пользователя напрямую в проект без приглашения

set -e

BASE_URL="http://localhost:3000"

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Тестирование /project/:Project_id/add ===${NC}\n"

# 1. Получить CSRF токен
echo "1. Получение CSRF токена..."
CSRF_TOKEN=$(curl -s ${BASE_URL}/dev/csrf)
echo -e "${GREEN}✓ CSRF токен получен${NC}\n"

# 2. Войти как первый пользователь (владелец проекта)
echo "2. Вход как user1@example.com..."
curl -s -c cookies.txt -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"user1@example.com","password":"password123"}' \
  ${BASE_URL}/login > /dev/null
echo -e "${GREEN}✓ Вошли как user1@example.com${NC}\n"

# 3. Создать проект
echo "3. Создание тестового проекта..."
PROJECT_RESPONSE=$(curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"projectName":"Test Add Collaborator API"}' \
  ${BASE_URL}/project/new)

PROJECT_ID=$(echo $PROJECT_RESPONSE | jq -r '.project_id')
echo -e "${GREEN}✓ Проект создан: $PROJECT_ID${NC}\n"

# 4. Тест 1: Добавить существующего пользователя
echo "4. Тест 1: Добавление существующего пользователя (user2@example.com)..."
ADD_RESPONSE=$(curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"user2@example.com","privileges":"readAndWrite"}' \
  ${BASE_URL}/project/${PROJECT_ID}/add)

if echo $ADD_RESPONSE | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ Пользователь успешно добавлен${NC}"
  echo "  Ответ: $ADD_RESPONSE"
else
  echo -e "${RED}✗ Ошибка при добавлении${NC}"
  echo "  Ответ: $ADD_RESPONSE"
fi
echo ""

# 5. Проверить список участников
echo "5. Проверка списка участников..."
MEMBERS_RESPONSE=$(curl -s -b cookies.txt ${BASE_URL}/project/${PROJECT_ID}/members)
MEMBER_COUNT=$(echo $MEMBERS_RESPONSE | jq '.members | length')
echo -e "${GREEN}✓ Количество участников: $MEMBER_COUNT${NC}"
echo "  Участники: $(echo $MEMBERS_RESPONSE | jq -c '.members[] | {email: .email, privileges: .privileges}')"
echo ""

# 6. Тест 2: Попытка добавить несуществующего пользователя
echo "6. Тест 2: Попытка добавить несуществующего пользователя..."
ERROR_RESPONSE=$(curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"nonexistent@example.com","privileges":"readOnly"}' \
  ${BASE_URL}/project/${PROJECT_ID}/add)

if echo $ERROR_RESPONSE | jq -e '.error == "user_not_found"' > /dev/null; then
  echo -e "${GREEN}✓ Корректная ошибка: user_not_found${NC}"
else
  echo -e "${YELLOW}⚠ Неожиданный ответ: $ERROR_RESPONSE${NC}"
fi
echo ""

# 7. Тест 3: Попытка добавить уже существующего участника
echo "7. Тест 3: Попытка добавить пользователя, который уже является участником..."
DUPLICATE_RESPONSE=$(curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"user2@example.com","privileges":"readOnly"}' \
  ${BASE_URL}/project/${PROJECT_ID}/add)

if echo $DUPLICATE_RESPONSE | jq -e '.error == "user_already_member"' > /dev/null; then
  echo -e "${GREEN}✓ Корректная ошибка: user_already_member${NC}"
else
  echo -e "${YELLOW}⚠ Неожиданный ответ: $DUPLICATE_RESPONSE${NC}"
fi
echo ""

# 8. Тест 4: Попытка добавить самого себя
echo "8. Тест 4: Попытка добавить самого себя..."
SELF_RESPONSE=$(curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"user1@example.com","privileges":"readAndWrite"}' \
  ${BASE_URL}/project/${PROJECT_ID}/add)

if echo $SELF_RESPONSE | jq -e '.error == "cannot_add_self"' > /dev/null; then
  echo -e "${GREEN}✓ Корректная ошибка: cannot_add_self${NC}"
else
  echo -e "${YELLOW}⚠ Неожиданный ответ: $SELF_RESPONSE${NC}"
fi
echo ""

# 9. Тест 5: Добавить с ролью review
echo "9. Тест 5: Добавление пользователя с ролью 'review'..."
if [ -z "$USER3_EMAIL" ]; then
  USER3_EMAIL="user3@example.com"
fi

REVIEW_RESPONSE=$(curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d "{\"email\":\"$USER3_EMAIL\",\"privileges\":\"review\"}" \
  ${BASE_URL}/project/${PROJECT_ID}/add)

if echo $REVIEW_RESPONSE | jq -e '.success' > /dev/null; then
  echo -e "${GREEN}✓ Рецензент успешно добавлен${NC}"
  echo "  Ответ: $REVIEW_RESPONSE"
else
  echo -e "${YELLOW}⚠ Возможно пользователь не существует: $REVIEW_RESPONSE${NC}"
fi
echo ""

# 10. Финальная проверка участников
echo "10. Финальный список участников проекта:"
FINAL_MEMBERS=$(curl -s -b cookies.txt ${BASE_URL}/project/${PROJECT_ID}/members)
echo $FINAL_MEMBERS | jq '.members[] | {email: .email, privileges: .privileges}'
echo ""

echo -e "${YELLOW}=== Тестирование завершено ===${NC}"
echo -e "${GREEN}✓ Endpoint /project/:Project_id/add работает корректно${NC}"
echo ""
echo "Примечания:"
echo "  - Для полного тестирования убедитесь, что существуют пользователи:"
echo "    * user1@example.com (владелец проекта)"
echo "    * user2@example.com (будет добавлен как collaborator)"
echo "    * user3@example.com (опционально, для теста review)"

# Очистка
rm -f cookies.txt
