# API Documentation: Project Protection and User Permissions

This document describes the new API endpoints for managing project protection, protected files, and user permissions in Overleaf CE.

## Overview

Three new features have been added:

1. **Protected Projects** - Projects that cannot be deleted
2. **Protected Files** - Files within projects that cannot be modified or deleted
3. **User Permissions** - Control which users can create/upload projects (basic vs full permissions)

## Project Protection API

### Set Project Protection Status

```
POST /api/project/:Project_id/protection
```

**Authentication:** Required (Site Admin only)

**Request Body:**
```json
{
  "isProtected": true
}
```

**Response:** 204 No Content

**Description:** Marks a project as protected. Protected projects cannot be deleted.

---

### Get Project Protection Status

```
GET /api/project/:Project_id/protection
```

**Authentication:** Required (any user with project read access)

**Response:**
```json
{
  "isProtected": false
}
```

**Description:** Returns whether the project is protected.

---

## Protected Files API

### Set Protected Files List

```
POST /api/project/:Project_id/protected-files
```

**Authentication:** Required (Site Admin only)

**Request Body:**
```json
{
  "protectedFiles": [
    "/main.tex",
    "/chapters/intro.tex",
    "/images/logo.png"
  ]
}
```

**Response:** 204 No Content

**Description:** Sets the list of protected files in the project. Protected files cannot be:
- Deleted
- Renamed
- Modified (content changes)

File paths should be relative to the project root and start with `/`.

---

### Get Protected Files List

```
GET /api/project/:Project_id/protected-files
```

**Authentication:** Required (any user with project read access)

**Response:**
```json
{
  "protectedFiles": [
    "/main.tex",
    "/chapters/intro.tex"
  ]
}
```

**Description:** Returns the list of protected files in the project.

---

### Check if File is Protected

```
GET /api/project/:Project_id/is-file-protected/:file_path
```

**Authentication:** Required (any user with project read access)

**Response:**
```json
{
  "isProtected": true
}
```

**Description:** Checks if a specific file is protected.

---

## User Permissions API

### Set User Permissions

```
POST /api/user/:user_id/permissions
```

**Authentication:** Required (Site Admin only)

**Request Body:**
```json
{
  "permissions": "basic"
}
```

**Possible values:**
- `"basic"` - Cannot create, upload, or clone projects
- `"full"` - Can perform all operations

**Response:** 204 No Content

**Description:** Sets the permission level for a user.

---

### Get User Permissions

```
GET /api/user/:user_id/permissions
```

**Authentication:** Required (Site Admin only)

**Response:**
```json
{
  "permissions": "full"
}
```

**Description:** Returns the permission level for a user.

---

## Behavior Changes

### Project Creation/Upload/Clone

Users with `basic` permissions cannot:
- Create new projects (POST `/project/new`)
- Upload projects (POST `/project/new/upload`)
- Clone projects (POST `/Project/:Project_id/clone`)

These operations will return:
```
403 Forbidden
{
  "error": "You do not have permission to create/upload/clone projects"
}
```

### Protected Project Deletion

Attempting to delete a protected project will return:
```
403 Forbidden
{
  "error": "This project is protected and cannot be deleted"
}
```

### Protected File Operations

Attempting to delete, rename, or modify a protected file will throw an error:
- `NonDeletableEntityError: cannot delete protected file`
- `InvalidNameError: cannot rename protected file`
- `InvalidNameError: cannot modify protected file`

### New User Registration

When a new user is created:
- In **normal mode**: User gets `full` permissions
- In **peer-review mode**: User gets `basic` permissions

This can be changed later via the permissions API.

---

## Database Schema Changes

### Project Model

Added fields:
```javascript
{
  isProtected: { type: Boolean, default: false },
  protectedFiles: [{ type: String }]  // Array of file paths
}
```

### User Model

Added field:
```javascript
{
  permissions: { type: String, enum: ['basic', 'full'], default: 'full' }
}
```

---

## Admin UI Integration

The user management page at `/admin/users/list` now includes the `permissions` field for each user.

Frontend applications can use the GET endpoints to check protection status and adjust UI accordingly (e.g., disable delete buttons for protected items).

---

## Example Usage

### Example 1: Protect a Project and Its Template Files

```bash
# Protect the project
curl -X POST http://localhost/api/project/PROJECT_ID/protection \
  -H "Cookie: overleaf_session2=..." \
  -H "Content-Type: application/json" \
  -d '{"isProtected": true}'

# Set protected files
curl -X POST http://localhost/api/project/PROJECT_ID/protected-files \
  -H "Cookie: overleaf_session2=..." \
  -H "Content-Type: application/json" \
  -d '{
    "protectedFiles": [
      "/main.tex",
      "/template.cls",
      "/README.md"
    ]
  }'
```

### Example 2: Set User to Basic Permissions

```bash
curl -X POST http://localhost/api/user/USER_ID/permissions \
  -H "Cookie: overleaf_session2=..." \
  -H "Content-Type: application/json" \
  -d '{"permissions": "basic"}'
```

### Example 3: Check Protection Status

```bash
# Check if project is protected
curl http://localhost/api/project/PROJECT_ID/protection \
  -H "Cookie: overleaf_session2=..."

# Check if file is protected
curl http://localhost/api/project/PROJECT_ID/is-file-protected/%2Fmain.tex \
  -H "Cookie: overleaf_session2=..."
```

Note: URL-encode the file path (e.g., `/main.tex` becomes `%2Fmain.tex`).

---

## Security Notes

1. All protection and permission management endpoints require site admin privileges
2. Protected file paths are stored as strings - ensure paths are normalized and validated
3. File protection is checked at the MongoDB layer, preventing bypass attempts
4. User permission checks are performed before project operations
5. Existing peer-review mode is now independent of user permissions - it only affects new user creation

---

## Migration Notes

For existing installations:
- All existing users will have `permissions: 'full'` by default
- All existing projects will have `isProtected: false` by default
- No data migration is required - new fields have sensible defaults
