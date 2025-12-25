#!/usr/bin/env python3
"""
Example script to retrieve comments from an Overleaf project via API.

Usage:
    python3 example_get_comments.py <project_id>

Requirements:
    pip install requests
"""

import sys
import json
import requests

BASE_URL = 'http://localhost'

def get_comments(email, password, project_id):
    """
    Get all comments from a project with their positions.
    
    Args:
        email: User email for authentication
        password: User password
        project_id: Project ID to get comments from
        
    Returns:
        dict: Comments data with positions and messages
    """
    # Create session
    session = requests.Session()
    
    # Get CSRF token
    csrf_token = session.get(f'{BASE_URL}/dev/csrf').text
    print(f"✓ Got CSRF token: {csrf_token[:20]}...")
    
    # Login
    login_response = session.post(
        f'{BASE_URL}/login',
        json={'email': email, 'password': password},
        headers={'X-CSRF-Token': csrf_token}
    )
    
    if login_response.status_code != 200:
        print(f"✗ Login failed: {login_response.status_code}")
        return None
    
    print(f"✓ Logged in as {email}")
    
    # Get comments
    response = session.get(f'{BASE_URL}/api/project/{project_id}/comments')
    
    if response.status_code != 200:
        print(f"✗ Failed to get comments: {response.status_code}")
        print(f"  Response: {response.text}")
        return None
    
    print(f"✓ Got comments data")
    return response.json()


def print_comments(comments_data):
    """Pretty print comments data."""
    if not comments_data or 'comments' not in comments_data:
        print("No comments found.")
        return
    
    comments = comments_data['comments']
    print(f"\n{'='*80}")
    print(f"Found {len(comments)} comment(s)")
    print(f"{'='*80}\n")
    
    for i, comment in enumerate(comments, 1):
        print(f"Comment #{i}")
        print(f"  Thread ID: {comment['thread_id']}")
        print(f"  File: {comment['file']}")
        print(f"  Position: {comment['position']['start']} - {comment['position']['end']}")
        print(f"  Text: {comment['text'][:50]}..." if len(comment['text']) > 50 else f"  Text: {comment['text']}")
        print(f"  Resolved: {comment['resolved']}")
        print(f"  Messages: {len(comment['messages'])}")
        
        for j, msg in enumerate(comment['messages'], 1):
            author = msg['author']
            if author:
                author_name = f"{author.get('first_name', '')} {author.get('last_name', '')}".strip()
                if author.get('alias'):
                    author_name += f" ({author['alias']})"
                print(f"    [{j}] {author_name}: {msg['text'][:60]}..." if len(msg['text']) > 60 else f"    [{j}] {author_name}: {msg['text']}")
            else:
                print(f"    [{j}] Unknown author: {msg['text'][:60]}..." if len(msg['text']) > 60 else f"    [{j}] Unknown author: {msg['text']}")
        
        print()


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 example_get_comments.py <project_id> [email] [password]")
        print("\nExample:")
        print("  python3 example_get_comments.py 60a7b1234567890abcdef123")
        print("  python3 example_get_comments.py 60a7b1234567890abcdef123 user@example.com password123")
        sys.exit(1)
    
    project_id = sys.argv[1]
    email = sys.argv[2] if len(sys.argv) > 2 else 'admin@example.com'
    password = sys.argv[3] if len(sys.argv) > 3 else 'admin'
    
    print(f"Getting comments for project: {project_id}")
    print(f"Using credentials: {email}")
    print()
    
    comments_data = get_comments(email, password, project_id)
    
    if comments_data:
        print_comments(comments_data)
        
        # Optionally save to file
        output_file = f'comments_{project_id}.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(comments_data, f, indent=2, ensure_ascii=False)
        print(f"✓ Saved to {output_file}")
    else:
        print("✗ Failed to get comments")
        sys.exit(1)


if __name__ == '__main__':
    main()

