#!/usr/bin/env python3
"""
Примеры использования Overleaf API Python клиента

Для запуска:
    pip install -r requirements_api.txt
    python api_examples.py
"""

from overleaf_api import OverleafAPI, OverleafPrivateAPI, OverleafAPIError, CompilationError
import logging
import time

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)


def example_basic_workflow():
    """
    Пример 1: Базовый workflow
    Создание проекта, компиляция, скачивание PDF
    """
    print("\n" + "="*50)
    print("Пример 1: Базовый workflow")
    print("="*50)
    
    # Создать API клиент и войти
    api = OverleafAPI(
        base_url='http://localhost:3000',
        email='admin@example.com',
        password='password'
    )
    
    try:
        # Создать проект
        project_id = api.create_project('Basic Workflow Demo')
        print(f"✓ Создан проект: {project_id}")
        
        # Дождаться инициализации проекта
        time.sleep(2)
        
        # Компилировать
        build_id = api.compile_project(project_id)
        print(f"✓ Компиляция завершена: {build_id}")
        
        # Скачать PDF
        pdf_path = api.download_pdf(project_id, build_id, f'example1_{project_id}.pdf')
        print(f"✓ PDF скачан: {pdf_path}")
        
        # Очистка
        api.delete_project(project_id)
        print(f"✓ Проект удалён")
        
    except OverleafAPIError as e:
        print(f"✗ Ошибка: {e}")
    finally:
        api.logout()


def example_collaboration():
    """
    Пример 2: Работа с участниками проекта
    Приглашение, изменение ролей, удаление
    """
    print("\n" + "="*50)
    print("Пример 2: Работа с участниками")
    print("="*50)
    
    api = OverleafAPI(
        base_url='http://localhost:3000',
        email='admin@example.com',
        password='password'
    )
    
    try:
        # Создать проект
        project_id = api.create_project('Collaboration Demo')
        print(f"✓ Создан проект: {project_id}")
        
        # Получить текущих участников
        members = api.get_members(project_id)
        print(f"\nТекущие участники ({len(members)}):")
        for member in members:
            print(f"  - {member['email']} ({member['privileges']})")
        
        # Пригласить участника
        # ВАЖНО: Пользователь должен существовать в системе
        try:
            invite = api.invite_collaborator(
                project_id,
                'collaborator@example.com',
                privileges='readAndWrite'
            )
            print(f"\n✓ Приглашён: {invite['email']}")
            
            # Получить обновлённый список
            members = api.get_members(project_id)
            print(f"\nУчастники после приглашения ({len(members)}):")
            for member in members:
                print(f"  - {member['email']} ({member['privileges']})")
            
            # Изменить роль (если пользователь принял приглашение)
            # Найти ID приглашённого пользователя
            for member in members:
                if member['email'] == 'collaborator@example.com':
                    api.change_member_role(
                        project_id,
                        member['_id'],
                        'readOnly'
                    )
                    print(f"\n✓ Роль изменена на readOnly")
                    
                    # Удалить участника
                    api.remove_member(project_id, member['_id'])
                    print(f"✓ Участник удалён")
                    break
                    
        except OverleafAPIError as e:
            print(f"\n⚠ Ошибка работы с участниками: {e}")
            print("  (Возможно, пользователь не существует)")
        
        # Очистка
        api.delete_project(project_id)
        print(f"\n✓ Проект удалён")
        
    except OverleafAPIError as e:
        print(f"✗ Ошибка: {e}")
    finally:
        api.logout()


def example_project_management():
    """
    Пример 3: Управление проектами
    Создание, переименование, клонирование, архивирование
    """
    print("\n" + "="*50)
    print("Пример 3: Управление проектами")
    print("="*50)
    
    api = OverleafAPI(
        base_url='http://localhost:3000',
        email='admin@example.com',
        password='password'
    )
    
    try:
        # Создать проект
        project_id = api.create_project('Project Management Demo')
        print(f"✓ Создан проект: {project_id}")
        
        # Переименовать
        api.rename_project(project_id, 'Renamed Project')
        print(f"✓ Проект переименован")
        
        # Получить структуру
        entities = api.get_project_entities(project_id)
        print(f"\n✓ Структура проекта:")
        root_folder = entities.get('rootFolder', [{}])[0]
        docs = root_folder.get('docs', [])
        for doc in docs:
            print(f"  - {doc['name']}")
        
        # Клонировать
        cloned_id = api.clone_project(project_id, 'Cloned Project')
        print(f"\n✓ Проект клонирован: {cloned_id}")
        
        # Архивировать оригинальный
        api.archive_project(project_id)
        print(f"✓ Оригинальный проект архивирован")
        
        # Разархивировать
        time.sleep(1)
        api.unarchive_project(project_id)
        print(f"✓ Проект разархивирован")
        
        # Переместить клон в корзину
        api.trash_project(cloned_id)
        print(f"✓ Клон перемещён в корзину")
        
        # Восстановить из корзины
        time.sleep(1)
        api.untrash_project(cloned_id)
        print(f"✓ Клон восстановлен из корзины")
        
        # Удалить оба проекта
        api.delete_project(project_id)
        api.delete_project(cloned_id)
        print(f"\n✓ Проекты удалены")
        
    except OverleafAPIError as e:
        print(f"✗ Ошибка: {e}")
    finally:
        api.logout()


def example_compilation_workflow():
    """
    Пример 4: Расширенная работа с компиляцией
    """
    print("\n" + "="*50)
    print("Пример 4: Расширенная компиляция")
    print("="*50)
    
    api = OverleafAPI(
        base_url='http://localhost:3000',
        email='admin@example.com',
        password='password'
    )
    
    try:
        # Создать проект
        project_id = api.create_project('Compilation Demo', template='example')
        print(f"✓ Создан проект с примером: {project_id}")
        
        time.sleep(2)
        
        # Компиляция с различными параметрами
        print("\nКомпиляция с параметрами:")
        build_id = api.compile_project(
            project_id,
            draft=False,
            incremental=True,
            stop_on_first_error=False
        )
        print(f"✓ Build ID: {build_id}")
        
        # Скачать PDF
        pdf_path = api.download_pdf(project_id, build_id, f'example4_{project_id}.pdf')
        print(f"✓ PDF: {pdf_path}")
        
        # Скачать лог
        log_path = api.download_output_file(
            project_id,
            build_id,
            'output.log',
            f'example4_{project_id}.log'
        )
        print(f"✓ Log: {log_path}")
        
        # Получить статистику слов
        try:
            word_count = api.get_word_count(project_id)
            print(f"\n✓ Статистика:")
            print(f"  Слов в тексте: {word_count.get('textWords', 'N/A')}")
            print(f"  Слов в заголовках: {word_count.get('headWords', 'N/A')}")
        except Exception as e:
            print(f"⚠ Не удалось получить статистику: {e}")
        
        # Очистка
        api.delete_project(project_id)
        print(f"\n✓ Проект удалён")
        
    except CompilationError as e:
        print(f"✗ Ошибка компиляции: {e}")
    except OverleafAPIError as e:
        print(f"✗ Ошибка API: {e}")
    finally:
        api.logout()


def example_private_api():
    """
    Пример 5: Использование Private API
    """
    print("\n" + "="*50)
    print("Пример 5: Private API")
    print("="*50)
    
    # Web API для создания проекта
    api = OverleafAPI(
        base_url='http://localhost:3000',
        email='admin@example.com',
        password='password'
    )
    
    try:
        # Создать проект через Web API
        project_id = api.create_project('Private API Demo')
        print(f"✓ Создан проект: {project_id}")
        
        time.sleep(2)
        
        # Использовать Private API
        private_api = OverleafPrivateAPI(
            base_url='http://localhost:3000',
            username='overleaf',  # из settings.defaults.js
            password='password'   # измените в production!
        )
        
        # Получить детали проекта
        details = private_api.get_project_details(project_id)
        print(f"\n✓ Детали проекта через Private API:")
        print(f"  Название: {details['name']}")
        print(f"  Compiler: {details.get('compiler', 'N/A')}")
        print(f"  Язык: {details.get('spellCheckLanguage', 'N/A')}")
        
        # Получить документы
        root_folder = details.get('rootFolder', [{}])[0]
        docs = root_folder.get('docs', [])
        
        if docs:
            doc = docs[0]
            print(f"\n✓ Получение документа '{doc['name']}'...")
            
            doc_content = private_api.get_document(project_id, doc['_id'])
            print(f"  Строк: {len(doc_content['lines'])}")
            print(f"  Версия: {doc_content['version']}")
            print(f"  Первые 3 строки:")
            for i, line in enumerate(doc_content['lines'][:3], 1):
                print(f"    {i}: {line}")
            
            # Обновить документ
            print(f"\n✓ Обновление документа...")
            new_lines = doc_content['lines'].copy()
            new_lines.append("% Added via API")
            
            private_api.update_document(
                project_id,
                doc['_id'],
                new_lines,
                doc_content['version'] + 1
            )
            print(f"  ✓ Документ обновлён")
            
            # Проверить обновление
            updated_doc = private_api.get_document(project_id, doc['_id'])
            print(f"  Новая версия: {updated_doc['version']}")
            print(f"  Последняя строка: {updated_doc['lines'][-1]}")
        
        # Очистка
        api.delete_project(project_id)
        print(f"\n✓ Проект удалён")
        
    except OverleafAPIError as e:
        print(f"✗ Ошибка: {e}")
    finally:
        api.logout()


def example_error_handling():
    """
    Пример 6: Обработка ошибок
    """
    print("\n" + "="*50)
    print("Пример 6: Обработка ошибок")
    print("="*50)
    
    api = OverleafAPI(
        base_url='http://localhost:3000',
        email='admin@example.com',
        password='password'
    )
    
    try:
        # Попытка работы с несуществующим проектом
        fake_project_id = '000000000000000000000000'
        
        print("\nПопытка получить несуществующий проект...")
        try:
            entities = api.get_project_entities(fake_project_id)
        except OverleafAPIError as e:
            print(f"✓ Корректно обработана ошибка: {e}")
        
        # Попытка пригласить несуществующего пользователя
        project_id = api.create_project('Error Handling Demo')
        print(f"\n✓ Создан тестовый проект: {project_id}")
        
        print("\nПопытка пригласить несуществующего пользователя...")
        try:
            api.invite_collaborator(
                project_id,
                'nonexistent@example.com',
                'readAndWrite'
            )
        except OverleafAPIError as e:
            print(f"✓ Корректно обработана ошибка: {e}")
        
        # Попытка компиляции сразу после создания (может быть не готов)
        print("\nПопытка немедленной компиляции...")
        try:
            build_id = api.compile_project(project_id)
            print(f"✓ Компиляция успешна: {build_id}")
        except CompilationError as e:
            print(f"✓ Корректно обработана ошибка компиляции: {e}")
        
        # Очистка
        api.delete_project(project_id)
        print(f"\n✓ Проект удалён")
        
    except Exception as e:
        print(f"✗ Неожиданная ошибка: {e}")
    finally:
        api.logout()


def main():
    """Запуск всех примеров"""
    print("\n" + "="*70)
    print(" Примеры использования Overleaf API Python Client")
    print("="*70)
    
    examples = [
        ("Базовый workflow", example_basic_workflow),
        ("Работа с участниками", example_collaboration),
        ("Управление проектами", example_project_management),
        ("Расширенная компиляция", example_compilation_workflow),
        ("Private API", example_private_api),
        ("Обработка ошибок", example_error_handling),
    ]
    
    print("\nДоступные примеры:")
    for i, (name, _) in enumerate(examples, 1):
        print(f"  {i}. {name}")
    print(f"  0. Все примеры")
    
    choice = input("\nВыберите пример (0-6): ").strip()
    
    if choice == '0':
        for name, func in examples:
            try:
                func()
                time.sleep(1)
            except KeyboardInterrupt:
                print("\n\n✗ Прервано пользователем")
                break
            except Exception as e:
                print(f"\n✗ Ошибка в примере '{name}': {e}")
                continue
    elif choice.isdigit() and 1 <= int(choice) <= len(examples):
        name, func = examples[int(choice) - 1]
        try:
            func()
        except KeyboardInterrupt:
            print("\n\n✗ Прервано пользователем")
        except Exception as e:
            print(f"\n✗ Ошибка: {e}")
    else:
        print("✗ Неверный выбор")
        return
    
    print("\n" + "="*70)
    print(" Примеры завершены")
    print("="*70 + "\n")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n✗ Программа прервана")
    except Exception as e:
        print(f"\n✗ Критическая ошибка: {e}")
        import traceback
        traceback.print_exc()

