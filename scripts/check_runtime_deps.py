#!/usr/bin/env python3
"""Проверка: все npm-пакеты, импортируемые backend-кодом сервисов в рантайме,
объявлены в dependencies (а не только в devDependencies и не забыты).
В production-образ ставится `npm install --omit=dev`, поэтому пакет из
devDependencies приводит к падению сервиса при старте (ERR_MODULE_NOT_FOUND).

Запуск: scripts/check_runtime_deps.py   (код возврата 1 при проблемах)
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# Сервисы, которые работают в production-образе (server-ce/services.js)
SERVICES = ['web', 'chat', 'clsi', 'contacts', 'docstore', 'document-updater',
            'filestore', 'history-v1', 'notifications', 'project-history', 'real-time']
# Файлы, которые никогда не грузятся в рантайме
SKIP_DIRS = ('/test/', '/scripts/', '/migrations/', '/frontend/', '/types/', '/node_modules/', '/cypress/', '/stories/')

BUILTIN = set('''fs path crypto http https url util os stream events zlib child_process net dns assert
buffer querystring string_decoder tls readline worker_threads perf_hooks timers async_hooks module vm
http2 dgram cluster process tty v8 inspector diagnostics_channel'''.split())

root_pkg = json.load(open('package.json'))
root_deps = set(root_pkg.get('dependencies', {}))
workspace_names = set()
for pj in glob.glob('libraries/*/package.json') + glob.glob('services/*/package.json'):
    try:
        workspace_names.add(json.load(open(pj))['name'])
    except Exception:
        pass

IMPORT_RE = re.compile(
    r"""(?:^|\n)\s*(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|(?:const|let|var)\s+[^=]+=\s*require\(\s*)['"]([^'"./][^'"]*)['"]""")

def pkg_name(spec):
    if spec.startswith('node:'):
        return None
    parts = spec.split('/')
    return '/'.join(parts[:2]) if spec.startswith('@') else parts[0]

problems = []
checked = 0
for svc in SERVICES:
    base = f'services/{svc}'
    if not os.path.isdir(base):
        continue
    pkg = json.load(open(f'{base}/package.json'))
    deps = set(pkg.get('dependencies', {}))
    dev = set(pkg.get('devDependencies', {}))
    files = []
    for pat in ('*.js', '*.mjs', '*.cjs', 'app/**/*.js', 'app/**/*.mjs', 'app/**/*.cjs',
                'config/*.js', 'config/*.cjs', 'config/*.json', 'modules/*/index.*', 'modules/*/app/**/*.js', 'modules/*/app/**/*.mjs',
                'storage/**/*.js', 'api/**/*.js', 'lib/**/*.js', 'index.js', 'app.js', 'app.mjs'):
        files += glob.glob(f'{base}/{pat}', recursive=True)
    for f in sorted(set(files)):
        bn = os.path.basename(f)
        # build-time конфиги (webpack/vitest/i18next и т.п.) в рантайме не грузятся
        if any(s in f + '/' for s in SKIP_DIRS) or f.endswith('.json') or '.config.' in bn or bn.startswith('.'):
            continue
        checked += 1
        try:
            src = open(f, encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        for m in IMPORT_RE.finditer(src):
            name = pkg_name(m.group(1))
            if not name or name in BUILTIN or name in workspace_names or name in deps or name in root_deps:
                continue
            status = 'только в devDependencies' if name in dev else 'НЕ ОБЪЯВЛЕН'
            problems.append((svc, name, status, f))

print(f'check_runtime_deps: проверено {checked} файлов в {len(SERVICES)} сервисах')
if problems:
    seen = set()
    for svc, name, status, f in problems:
        key = (svc, name)
        if key in seen:
            continue
        seen.add(key)
        print(f'  ПРОБЛЕМА [{svc}] пакет "{name}" {status}, импортируется в {f}')
    print('Исправьте: перенесите пакет в "dependencies" в services/<сервис>/package.json '
          '(и снимите "dev": true с записи node_modules/<пакет> в package-lock.json).')
    sys.exit(1)
print('  OK — все рантайм-импорты объявлены в dependencies')
