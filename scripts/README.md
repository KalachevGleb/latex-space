# Scripts

This directory contains utility scripts for Overleaf Custom Edition.

## prepare_install.sh

Prepares Overleaf Custom Edition for deployment by building Docker images and packaging them into a deployable archive.

### Usage

```bash
./scripts/prepare_install.sh
```

### Environment Variables

- `SKIP_TEXLIVE` - Set to `true` to skip TexLive build (default: `false`)
- `SKIP_BASE_DEPS` - Set to `true` to skip MongoDB/Redis pull (default: `false`)
- `CLEANUP_AFTER` - Set to `false` to keep intermediate images (default: `true`)
- `MONGO_VERSION` - MongoDB version to use (default: `6.0`, use `4.4` for systems without AVX)

### Examples

**Standard build:**
```bash
./scripts/prepare_install.sh
```

**For systems without AVX support (older CPUs):**
```bash
MONGO_VERSION=4.4 ./scripts/prepare_install.sh
```

**Fast rebuild (skip TexLive):**
```bash
SKIP_TEXLIVE=true ./scripts/prepare_install.sh
```

**Rebuild only MongoDB (e.g., to change version):**
```bash
SKIP_TEXLIVE=true SKIP_BASE_DEPS=false MONGO_VERSION=4.4 ./scripts/prepare_install.sh
```

### MongoDB Version Notes

- **MongoDB 6.0** (default): Requires AVX CPU instruction set. Works on most modern CPUs (Intel Sandy Bridge and newer, AMD Bulldozer and newer).
- **MongoDB 4.4**: Does not require AVX. Use this for older CPUs or virtual machines without AVX support.

To check if your system supports AVX:
```bash
# Linux
grep -o 'avx[^ ]*' /proc/cpuinfo | sort -u

# macOS
sysctl -a | grep machdep.cpu.features | grep AVX
```

### Output

Creates `overleaf-custom.tar.gz` package containing:
- Docker images (overleaf, texlive, mongo, redis)
- docker-compose.yml configuration
- Installation scripts
- Version information

## install_overleaf.sh

Installs Overleaf Custom Edition from a prepared package.

### Usage

```bash
./scripts/install_overleaf.sh <archive.tar.gz> <config.json> [options]
```

### Options

- `--install-dir DIR` - Install to custom directory (overrides config.json)
- `--no-start` - Don't start services after installation
- `--help` - Show help message

### Example

```bash
./scripts/install_overleaf.sh overleaf-custom.tar.gz overleaf_config.json
```

## check_requirements.sh

Checks system requirements before installation.

### Usage

```bash
./scripts/check_requirements.sh
```

## update-version.sh

Generates `services/web/public/version.json` with current git commit information.

### Usage

```bash
./scripts/update-version.sh
```

### Automatic Execution

The script is automatically executed after each git commit via the `.git/hooks/post-commit` hook.

### Output

Creates/updates `services/web/public/version.json` with:

```json
{
  "commit": "full-commit-hash",
  "commitShort": "short-hash",
  "commitDate": "2025-10-28 00:59:16 +0300",
  "branch": "main",
  "repoUrl": "https://github.com/YOUR_USERNAME/latex-space",
  "generatedAt": "2025-10-28T00:59:16+03:00"
}
```

This information is displayed in the application footer as "Build: abc1234" with a link to the commit on GitHub.

### Important Notes

- `version.json` is gitignored and should NOT be committed
- The repository URL needs to be updated in the script after creating the GitHub fork
- Replace `YOUR_USERNAME/latex-space` with your actual GitHub repository URL

### Updating Repository URL

After creating your GitHub fork, update the `REPO_URL` variable in `update-version.sh`:

```bash
# Find this line:
REPO_URL="https://github.com/YOUR_USERNAME/latex-space"

# Replace with your actual repository:
REPO_URL="https://github.com/your-github-username/your-repo-name"
```

Then run the script to regenerate version.json with the correct URL:

```bash
./scripts/update-version.sh
```
