#!/usr/bin/env python3
"""
Overleaf CE API Client
Модуль для работы с Overleaf Community Edition через API

Пример использования:
    from overleaf_api import OverleafAPI
    
    api = OverleafAPI('http://localhost:3000', 'user@example.com', 'password')
    
    # Создать проект
    project_id = api.create_project('My Project')
    
    # Пригласить участника
    api.invite_collaborator(project_id, 'colleague@example.com', 'readAndWrite')
    
    # Компилировать и скачать
    build_id = api.compile_project(project_id)
    api.download_pdf(project_id, build_id, 'output.pdf')
"""

import requests
import json
import logging
from typing import Dict, List, Optional, Any
from pathlib import Path

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class OverleafAPIError(Exception):
    """Базовое исключение для ошибок API"""
    pass


class AuthenticationError(OverleafAPIError):
    """Ошибка аутентификации"""
    pass


class ProjectError(OverleafAPIError):
    """Ошибка операций с проектом"""
    pass


class CompilationError(OverleafAPIError):
    """Ошибка компиляции"""
    pass


class OverleafAPI:
    """Клиент для работы с Overleaf CE API"""
    
    def __init__(self, base_url: str = 'http://localhost:3000', 
                 email: Optional[str] = None, 
                 password: Optional[str] = None,
                 auto_login: bool = True):
        """
        Инициализация клиента API
        
        Args:
            base_url: URL Overleaf сервера
            email: Email для входа
            password: Пароль
            auto_login: Автоматический вход при инициализации
        """
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.csrf_token = None
        self.user_info = None
        
        if auto_login and email and password:
            self.login(email, password)
    
    def _get_csrf_token(self) -> str:
        """Получить CSRF token"""
        try:
            response = self.session.get(f'{self.base_url}/dev/csrf')
            response.raise_for_status()
            self.csrf_token = response.text.strip()
            return self.csrf_token
        except requests.RequestException as e:
            raise OverleafAPIError(f"Не удалось получить CSRF token: {e}")
    
    def _request(self, method: str, endpoint: str, 
                 data: Optional[Dict] = None,
                 json_data: Optional[Dict] = None,
                 **kwargs) -> requests.Response:
        """
        Выполнить HTTP запрос с автоматическим добавлением CSRF token
        
        Args:
            method: HTTP метод (GET, POST, PUT, DELETE)
            endpoint: API endpoint
            data: Form data
            json_data: JSON data
            **kwargs: Дополнительные параметры для requests
        
        Returns:
            requests.Response объект
        """
        url = f'{self.base_url}{endpoint}'
        headers = kwargs.pop('headers', {})
        
        # Добавить CSRF token для мутирующих запросов
        if method.upper() in ['POST', 'PUT', 'DELETE']:
            if not self.csrf_token:
                self._get_csrf_token()
            headers['X-CSRF-Token'] = self.csrf_token
        
        # Установить Content-Type для JSON
        if json_data:
            headers['Content-Type'] = 'application/json'
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                data=data,
                json=json_data,
                headers=headers,
                **kwargs
            )
            
            # Обновить CSRF token если он изменился
            if response.status_code != 401:
                self._get_csrf_token()
            
            return response
        except requests.RequestException as e:
            raise OverleafAPIError(f"Ошибка запроса: {e}")
    
    def login(self, email: str, password: str) -> Dict[str, Any]:
        """
        Войти в систему
        
        Args:
            email: Email пользователя
            password: Пароль
        
        Returns:
            Информация о пользователе
        
        Raises:
            AuthenticationError: Если вход не удался
        """
        logger.info(f"Вход в систему как {email}...")
        
        response = self._request(
            'POST',
            '/login',
            json_data={'email': email, 'password': password}
        )
        
        if response.status_code == 200:
            data = response.json()
            if 'redir' in data:
                logger.info("✓ Успешный вход")
                self.user_info = {'email': email}
                return data
            else:
                raise AuthenticationError(f"Ошибка входа: {data.get('message', 'Unknown error')}")
        else:
            raise AuthenticationError(f"HTTP {response.status_code}: {response.text}")
    
    def logout(self) -> None:
        """Выйти из системы"""
        logger.info("Выход из системы...")
        self._request('POST', '/logout')
        self.user_info = None
        self.csrf_token = None
        logger.info("✓ Выход выполнен")
    
    def get_user_info(self) -> Dict[str, Any]:
        """
        Получить информацию о текущем пользователе
        
        Returns:
            Информация о пользователе
        """
        response = self._request('GET', '/user/personal_info')
        response.raise_for_status()
        return response.json()
    
    def list_projects(self) -> List[Dict[str, Any]]:
        """
        Получить список проектов пользователя
        
        Returns:
            Список проектов
        """
        response = self._request('GET', '/user/projects')
        response.raise_for_status()
        data = response.json()
        return data.get('projects', [])
    
    def create_project(self, name: str, template: str = 'basic') -> str:
        """
        Создать новый проект
        
        Args:
            name: Название проекта
            template: Шаблон ('basic' или 'example')
        
        Returns:
            ID созданного проекта
        
        Raises:
            ProjectError: Если создание не удалось
        """
        logger.info(f"Создание проекта '{name}'...")
        
        response = self._request(
            'POST',
            '/project/new',
            json_data={'projectName': name, 'template': template}
        )
        
        if response.status_code == 200:
            data = response.json()
            project_id = data.get('project_id')
            if project_id:
                logger.info(f"✓ Проект создан: {project_id}")
                return project_id
            else:
                raise ProjectError(f"Не удалось получить project_id: {data}")
        else:
            raise ProjectError(f"HTTP {response.status_code}: {response.text}")
    
    def rename_project(self, project_id: str, new_name: str) -> None:
        """
        Переименовать проект
        
        Args:
            project_id: ID проекта
            new_name: Новое название
        """
        logger.info(f"Переименование проекта {project_id} в '{new_name}'...")
        
        response = self._request(
            'POST',
            f'/project/{project_id}/rename',
            json_data={'newProjectName': new_name}
        )
        response.raise_for_status()
        logger.info("✓ Проект переименован")
    
    def get_project_entities(self, project_id: str) -> Dict[str, Any]:
        """
        Получить структуру проекта (файлы и папки)
        
        Args:
            project_id: ID проекта
        
        Returns:
            Структура проекта
        """
        response = self._request('GET', f'/project/{project_id}/entities')
        response.raise_for_status()
        return response.json()
    
    def clone_project(self, project_id: str, new_name: str) -> str:
        """
        Клонировать проект
        
        Args:
            project_id: ID проекта для клонирования
            new_name: Название клона
        
        Returns:
            ID нового проекта
        """
        logger.info(f"Клонирование проекта {project_id}...")
        
        response = self._request(
            'POST',
            f'/Project/{project_id}/clone',
            json_data={'projectName': new_name}
        )
        
        response.raise_for_status()
        data = response.json()
        new_project_id = data.get('project_id')
        
        if new_project_id:
            logger.info(f"✓ Проект клонирован: {new_project_id}")
            return new_project_id
        else:
            raise ProjectError(f"Не удалось получить ID клонированного проекта: {data}")
    
    def delete_project(self, project_id: str) -> None:
        """
        Удалить проект навсегда
        
        Args:
            project_id: ID проекта
        """
        logger.warning(f"Удаление проекта {project_id}...")
        response = self._request('DELETE', f'/Project/{project_id}')
        response.raise_for_status()
        logger.info("✓ Проект удалён")
    
    def archive_project(self, project_id: str) -> None:
        """Архивировать проект"""
        logger.info(f"Архивирование проекта {project_id}...")
        response = self._request('POST', f'/Project/{project_id}/archive')
        response.raise_for_status()
        logger.info("✓ Проект архивирован")
    
    def unarchive_project(self, project_id: str) -> None:
        """Разархивировать проект"""
        logger.info(f"Разархивирование проекта {project_id}...")
        response = self._request('DELETE', f'/Project/{project_id}/archive')
        response.raise_for_status()
        logger.info("✓ Проект разархивирован")
    
    def trash_project(self, project_id: str) -> None:
        """Переместить проект в корзину"""
        logger.info(f"Перемещение проекта {project_id} в корзину...")
        response = self._request('POST', f'/project/{project_id}/trash')
        response.raise_for_status()
        logger.info("✓ Проект в корзине")
    
    def untrash_project(self, project_id: str) -> None:
        """Восстановить проект из корзины"""
        logger.info(f"Восстановление проекта {project_id} из корзины...")
        response = self._request('DELETE', f'/project/{project_id}/trash')
        response.raise_for_status()
        logger.info("✓ Проект восстановлен")
    
    def get_members(self, project_id: str) -> List[Dict[str, Any]]:
        """
        Получить список участников проекта
        
        Args:
            project_id: ID проекта
        
        Returns:
            Список участников с их ролями
        """
        response = self._request('GET', f'/project/{project_id}/members')
        response.raise_for_status()
        data = response.json()
        return data.get('members', [])
    
    def invite_collaborator(self, project_id: str, email: str, 
                           privileges: str = 'readAndWrite',
                           is_anonymous: bool = False) -> Dict[str, Any]:
        """
        Пригласить участника в проект
        
        Args:
            project_id: ID проекта
            email: Email участника
            privileges: Роль ('readAndWrite', 'readOnly', 'review')
            is_anonymous: Анонимный рецензент
        
        Returns:
            Информация о приглашении
        """
        logger.info(f"Приглашение {email} в проект {project_id} с ролью {privileges}...")
        
        payload = {
            'email': email,
            'privileges': privileges
        }
        
        if is_anonymous:
            payload['isAnonymous'] = True
        
        response = self._request(
            'POST',
            f'/project/{project_id}/invite',
            json_data=payload
        )
        
        response.raise_for_status()
        data = response.json()
        
        if 'error' in data:
            raise ProjectError(f"Ошибка приглашения: {data['error']}")
        
        if 'invite' in data:
            logger.info("✓ Участник приглашён")
            return data['invite']
        else:
            logger.warning("Неожиданный ответ от API")
            return data
    
    def change_member_role(self, project_id: str, user_id: str, 
                          privilege_level: str) -> None:
        """
        Изменить роль участника
        
        Args:
            project_id: ID проекта
            user_id: ID пользователя
            privilege_level: Новая роль ('readAndWrite', 'readOnly', 'review')
        """
        logger.info(f"Изменение роли участника {user_id} на {privilege_level}...")
        
        response = self._request(
            'PUT',
            f'/project/{project_id}/users/{user_id}',
            json_data={'privilegeLevel': privilege_level}
        )
        
        response.raise_for_status()
        logger.info("✓ Роль изменена")
    
    def remove_member(self, project_id: str, user_id: str) -> None:
        """
        Удалить участника из проекта
        
        Args:
            project_id: ID проекта
            user_id: ID пользователя
        """
        logger.info(f"Удаление участника {user_id} из проекта...")
        
        response = self._request(
            'DELETE',
            f'/project/{project_id}/users/{user_id}'
        )
        
        response.raise_for_status()
        logger.info("✓ Участник удалён")
    
    def compile_project(self, project_id: str, 
                       root_doc_id: Optional[str] = None,
                       draft: bool = False,
                       incremental: bool = True,
                       stop_on_first_error: bool = False) -> str:
        """
        Компилировать проект
        
        Args:
            project_id: ID проекта
            root_doc_id: ID главного документа (необязательно)
            draft: Черновой режим
            incremental: Инкрементальная компиляция
            stop_on_first_error: Остановка при первой ошибке
        
        Returns:
            Build ID
        
        Raises:
            CompilationError: Если компиляция не удалась
        """
        logger.info(f"Компиляция проекта {project_id}...")
        
        payload = {
            'draft': draft,
            'incrementalCompilesEnabled': incremental,
            'stopOnFirstError': stop_on_first_error
        }
        
        if root_doc_id:
            payload['rootDoc_id'] = root_doc_id
        
        response = self._request(
            'POST',
            f'/project/{project_id}/compile',
            json_data=payload
        )
        
        response.raise_for_status()
        data = response.json()
        
        status = data.get('status')
        build_id = data.get('buildId')
        
        if status == 'success':
            logger.info(f"✓ Компиляция успешна (build: {build_id})")
            return build_id
        else:
            error_msg = f"Компиляция не удалась: {status}"
            logger.error(error_msg)
            raise CompilationError(error_msg)
    
    def stop_compilation(self, project_id: str) -> None:
        """
        Остановить компиляцию
        
        Args:
            project_id: ID проекта
        """
        logger.info(f"Остановка компиляции проекта {project_id}...")
        response = self._request('POST', f'/project/{project_id}/compile/stop')
        response.raise_for_status()
        logger.info("✓ Компиляция остановлена")
    
    def download_pdf(self, project_id: str, build_id: str, 
                    output_path: str = 'output.pdf') -> Path:
        """
        Скачать PDF результат компиляции
        
        Args:
            project_id: ID проекта
            build_id: Build ID
            output_path: Путь для сохранения файла
        
        Returns:
            Path к скачанному файлу
        """
        logger.info(f"Скачивание PDF...")
        
        url = f'{self.base_url}/download/project/{project_id}/build/{build_id}/output/output.pdf'
        response = self.session.get(url)
        response.raise_for_status()
        
        output_file = Path(output_path)
        output_file.write_bytes(response.content)
        
        size_mb = len(response.content) / (1024 * 1024)
        logger.info(f"✓ PDF скачан: {output_file} ({size_mb:.2f} MB)")
        
        return output_file
    
    def download_output_file(self, project_id: str, build_id: str,
                            filename: str, output_path: Optional[str] = None) -> Path:
        """
        Скачать выходной файл компиляции
        
        Args:
            project_id: ID проекта
            build_id: Build ID
            filename: Имя файла (например, 'output.log')
            output_path: Путь для сохранения (по умолчанию = filename)
        
        Returns:
            Path к скачанному файлу
        """
        if not output_path:
            output_path = filename
        
        logger.info(f"Скачивание {filename}...")
        
        url = f'{self.base_url}/project/{project_id}/build/{build_id}/output/{filename}'
        response = self.session.get(url)
        response.raise_for_status()
        
        output_file = Path(output_path)
        output_file.write_bytes(response.content)
        
        logger.info(f"✓ Файл скачан: {output_file}")
        return output_file
    
    def get_word_count(self, project_id: str) -> Dict[str, Any]:
        """
        Получить статистику по количеству слов
        
        Args:
            project_id: ID проекта
        
        Returns:
            Статистика
        """
        response = self._request('GET', f'/project/{project_id}/wordcount')
        response.raise_for_status()
        return response.json()


class OverleafPrivateAPI:
    """Клиент для Private API (требует Basic Auth)"""
    
    def __init__(self, base_url: str = 'http://localhost:3000',
                 username: str = 'overleaf',
                 password: str = 'password'):
        """
        Инициализация Private API клиента
        
        Args:
            base_url: URL сервера
            username: Имя пользователя для Basic Auth
            password: Пароль для Basic Auth
        """
        self.base_url = base_url.rstrip('/')
        self.auth = (username, password)
    
    def _request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Выполнить запрос с Basic Auth"""
        url = f'{self.base_url}{endpoint}'
        response = requests.request(method, url, auth=self.auth, **kwargs)
        return response
    
    def get_project_details(self, project_id: str) -> Dict[str, Any]:
        """
        Получить детальную информацию о проекте
        
        Args:
            project_id: ID проекта
        
        Returns:
            Информация о проекте
        """
        response = self._request('GET', f'/internal/project/{project_id}')
        response.raise_for_status()
        return response.json()
    
    def get_document(self, project_id: str, doc_id: str) -> Dict[str, Any]:
        """
        Получить содержимое документа
        
        Args:
            project_id: ID проекта
            doc_id: ID документа
        
        Returns:
            Содержимое документа (lines, version, etc.)
        """
        response = self._request('GET', f'/project/{project_id}/doc/{doc_id}')
        response.raise_for_status()
        return response.json()
    
    def update_document(self, project_id: str, doc_id: str,
                       lines: List[str], version: int) -> None:
        """
        Обновить содержимое документа
        
        Args:
            project_id: ID проекта
            doc_id: ID документа
            lines: Строки документа
            version: Версия документа
        """
        payload = {
            'lines': lines,
            'version': version,
            'ranges': {}
        }
        
        response = self._request(
            'POST',
            f'/project/{project_id}/doc/{doc_id}',
            json=payload
        )
        response.raise_for_status()
    
    def get_user_info(self, user_id: str) -> Dict[str, Any]:
        """
        Получить информацию о пользователе
        
        Args:
            user_id: ID пользователя
        
        Returns:
            Информация о пользователе
        """
        response = self._request('GET', f'/user/{user_id}/personal_info')
        response.raise_for_status()
        return response.json()


# Пример использования
if __name__ == '__main__':
    # Настройка подробного логирования
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Использование Web API
    print("=== Демонстрация Web API ===")
    api = OverleafAPI(
        base_url='http://localhost:3000',
        email='admin@example.com',
        password='password'
    )
    
    # Список проектов
    projects = api.list_projects()
    print(f"\nТекущие проекты: {len(projects)}")
    for p in projects[:3]:  # Первые 3
        print(f"  - {p['name']} ({p['_id']})")
    
    # Создание проекта
    project_id = api.create_project('API Demo Project')
    print(f"\nСоздан проект: {project_id}")
    
    # Компиляция
    try:
        build_id = api.compile_project(project_id)
        print(f"Build ID: {build_id}")
        
        # Скачать PDF
        pdf_path = api.download_pdf(project_id, build_id, 'demo.pdf')
        print(f"PDF сохранён: {pdf_path}")
    except CompilationError as e:
        print(f"Ошибка компиляции: {e}")
    
    # Очистка
    api.delete_project(project_id)
    api.logout()
    
    print("\n=== Демонстрация Private API ===")
    private_api = OverleafPrivateAPI(
        username='overleaf',
        password='password'
    )
    
    # Получить детали проекта (если есть)
    if projects:
        project_details = private_api.get_project_details(projects[0]['_id'])
        print(f"\nДетали проекта '{project_details['name']}':")
        print(f"  Compiler: {project_details.get('compiler', 'N/A')}")
        print(f"  Language: {project_details.get('spellCheckLanguage', 'N/A')}")

