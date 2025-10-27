#!/usr/bin/env python3
"""
Пример использования API endpoint /project/:Project_id/add
для прямого добавления пользователей в проект без приглашения.
"""

import requests
import json


class OverleafAPI:
    def __init__(self, base_url='http://localhost'):
        self.base_url = base_url
        self.session = requests.Session()
        self.csrf_token = None

    def get_csrf_token(self):
        """Получить CSRF токен"""
        response = self.session.get(f'{self.base_url}/dev/csrf')
        self.csrf_token = response.text
        return self.csrf_token

    def login(self, email, password):
        """Войти в систему"""
        if not self.csrf_token:
            self.get_csrf_token()

        headers = {
            'Content-Type': 'application/json',
            'X-CSRF-Token': self.csrf_token
        }
        data = {
            'email': email,
            'password': password
        }
        response = self.session.post(
            f'{self.base_url}/login',
            headers=headers,
            json=data
        )
        return response.json()

    def create_project(self, name):
        """Создать новый проект"""
        headers = {
            'Content-Type': 'application/json',
            'X-CSRF-Token': self.csrf_token
        }
        data = {'projectName': name}
        response = self.session.post(
            f'{self.base_url}/project/new',
            headers=headers,
            json=data
        )
        return response.json()

    def add_collaborator_directly(self, project_id, email, privileges='readAndWrite', is_anonymous=False):
        """
        Добавить пользователя напрямую в проект (без приглашения)

        Args:
            project_id: ID проекта
            email: Email существующего пользователя
            privileges: 'readAndWrite', 'readOnly' или 'review'
            is_anonymous: True для анонимных рецензентов

        Returns:
            dict: Результат операции
        """
        headers = {
            'Content-Type': 'application/json',
            'X-CSRF-Token': self.csrf_token
        }
        data = {
            'email': email,
            'privileges': privileges
        }
        if is_anonymous:
            data['isAnonymous'] = True

        response = self.session.post(
            f'{self.base_url}/project/{project_id}/add',
            headers=headers,
            json=data
        )

        # Вернем и статус код и данные
        result = {
            'status_code': response.status_code,
            'data': response.json() if response.text else None
        }
        return result

    def invite_collaborator(self, project_id, email, privileges='readAndWrite'):
        """
        Пригласить пользователя (старый метод - создает приглашение)

        Args:
            project_id: ID проекта
            email: Email пользователя (может не существовать)
            privileges: 'readAndWrite', 'readOnly' или 'review'

        Returns:
            dict: Информация о приглашении
        """
        headers = {
            'Content-Type': 'application/json',
            'X-CSRF-Token': self.csrf_token
        }
        data = {
            'email': email,
            'privileges': privileges
        }
        response = self.session.post(
            f'{self.base_url}/project/{project_id}/invite',
            headers=headers,
            json=data
        )
        return response.json()

    def get_members(self, project_id):
        """Получить список участников проекта"""
        response = self.session.get(f'{self.base_url}/project/{project_id}/members')
        return response.json()


def main():
    """Демонстрация использования нового API"""

    print("=== Пример использования /project/:Project_id/add ===\n")

    # Инициализация
    api = OverleafAPI()

    # Вход
    print("1. Вход в систему...")
    api.login('user1@example.com', 'password123')
    print("   ✓ Вошли как user1@example.com\n")

    # Создание проекта
    print("2. Создание проекта...")
    project = api.create_project('API Direct Add Example')
    project_id = project['project_id']
    print(f"   ✓ Проект создан: {project_id}\n")

    # Пример 1: Добавление существующего пользователя
    print("3. Добавление user2@example.com с правами readAndWrite...")
    result = api.add_collaborator_directly(project_id, 'user2@example.com', 'readAndWrite')
    if result['status_code'] == 200 and result['data'].get('success'):
        print(f"   ✓ Пользователь добавлен успешно")
        print(f"   User ID: {result['data']['user']['_id']}")
    else:
        print(f"   ✗ Ошибка: {result['data'].get('error')}")
    print()

    # Пример 2: Добавление рецензента
    print("4. Добавление user3@example.com как рецензента...")
    result = api.add_collaborator_directly(project_id, 'user3@example.com', 'review')
    if result['status_code'] == 200 and result['data'].get('success'):
        print(f"   ✓ Рецензент добавлен успешно")
    elif result['status_code'] == 404:
        print(f"   ! Пользователь не найден (необходимо создать user3@example.com)")
    else:
        print(f"   ✗ Ошибка: {result['data'].get('error')}")
    print()

    # Пример 3: Попытка добавить несуществующего пользователя
    print("5. Попытка добавить несуществующего пользователя...")
    result = api.add_collaborator_directly(project_id, 'nonexistent@example.com', 'readOnly')
    if result['status_code'] == 404:
        print(f"   ✓ Ожидаемая ошибка: {result['data'].get('error')}")
    print()

    # Пример 4: Попытка добавить дубликат
    print("6. Попытка добавить user2@example.com повторно...")
    result = api.add_collaborator_directly(project_id, 'user2@example.com', 'readOnly')
    if result['status_code'] == 400 and result['data'].get('error') == 'user_already_member':
        print(f"   ✓ Ожидаемая ошибка: {result['data'].get('error')}")
    print()

    # Получение списка участников
    print("7. Список участников проекта:")
    members = api.get_members(project_id)
    for member in members['members']:
        print(f"   - {member['email']}: {member['privileges']}")
    print()

    print("=== Сравнение /add vs /invite ===\n")
    print("/add (новый метод):")
    print("  ✓ Сразу добавляет пользователя в проект")
    print("  ✓ Не требует принятия приглашения")
    print("  ✓ Не отправляет email")
    print("  ✗ Требует чтобы пользователь был зарегистрирован")
    print()
    print("/invite (существующий метод):")
    print("  ✓ Работает с незарегистрированными пользователями")
    print("  ✓ Отправляет email с приглашением")
    print("  ✗ Требует принятия приглашения пользователем")
    print()


if __name__ == '__main__':
    main()
