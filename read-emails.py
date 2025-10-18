#!/usr/bin/env python3
"""Простой скрипт для чтения писем из Mailpit"""

import requests
import json
from datetime import datetime

MAILPIT_URL = "http://localhost:8025/api/v1"

def get_messages():
    """Получить список всех писем"""
    response = requests.get(f"{MAILPIT_URL}/messages")
    return response.json()

def get_message(message_id):
    """Получить детали письма по ID"""
    response = requests.get(f"{MAILPIT_URL}/message/{message_id}")
    return response.json()

def print_messages():
    """Вывести все письма в читаемом виде"""
    data = get_messages()
    messages = data.get('messages', [])
    
    if not messages:
        print("📭 Нет писем")
        return
    
    print(f"\n📬 Всего писем: {data.get('total', 0)}\n")
    
    for msg in messages:
        created = datetime.fromisoformat(msg['Created'].replace('Z', '+00:00'))
        print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"От:   {msg['From']['Address']}")
        print(f"Кому: {msg['To'][0]['Address'] if msg['To'] else 'N/A'}")
        print(f"Тема: {msg['Subject']}")
        print(f"Дата: {created.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"ID:   {msg['ID']}")
        
        # Получить полное содержимое
        full_msg = get_message(msg['ID'])
        if full_msg.get('Text'):
            print(f"\n{full_msg['Text'][:200]}...")
        print()

if __name__ == "__main__":
    try:
        print_messages()
    except requests.exceptions.ConnectionError:
        print("❌ Не могу подключиться к Mailpit. Убедитесь, что он запущен.")
    except Exception as e:
        print(f"❌ Ошибка: {e}")

