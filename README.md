# Awesome PDF Compressor & Thumbnailer

Aggressive PDF compression with thumbnail generation, metadata extraction, and multi-tool optimization.

## Features
- Multi-tool PDF compression (Ghostscript, qpdf, mutool)
- 200x400px thumbnail generation (pdftocairo)
- Metadata preservation and extraction
- Parallel processing with batch support
- Keeps original if compressed version is larger

## Prerequisites
```bash
# Ubuntu/Debian
sudo apt-get install ghostscript qpdf mupdf-tools poppler-utils

# macOS
brew install ghostscript qpdf mupdf-tools poppler

# Windows (Chocolatey)
choco install ghostscript qpdf mupdf poppler
```

## Usage
```bash
npm install
node pdf-compressor.js <input.pdf> [options]
```

### Options
| Option | Description | Default |
|--------|-------------|---------|
| `--no-merge` | Skip merged output file | Creates merged PDF |
| `--no-pages` | Skip individual pages | Keeps pages |
| `--no-metadata` | Skip metadata extraction | Creates metadata |
| `--no-thumbnails` | Skip thumbnails | Creates thumbnails |

### Examples
```bash
# Basic usage (all features)
node pdf-compressor.js input.pdf

# Only individual pages
node pdf-compressor.js input.pdf --no-merge

# Only merged output
node pdf-compressor.js input.pdf --no-pages --no-thumbnails --no-metadata
```

### Output Structure
```
./
├── compressed_output.pdf         # [Unless --no-merge]
└── compressed_pages/            
    ├── page_00001.pdf           # [Unless --no-pages]
    ├── page_00001_thumb.jpg     # [Unless --no-thumbnails]
    ├── original_pdf_metadata.txt # [Unless --no-metadata]
    └── compressed_pdf_metadata.txt
```

## Configuration
```javascript
const CONCURRENT_TASKS = 2;    // Parallel processes
const BATCH_SIZE = 100;        // Pages per batch
const THUMBNAIL_WIDTH = 200;   // Thumbnail dimensions
const THUMBNAIL_HEIGHT = 400;
```

## Memory Tips
- Use `--no-merge` for large PDFs
- Use `--no-thumbnails` for faster processing
- Adjust `BATCH_SIZE` for memory optimization

## Dependencies
- pdf-lib: ^1.17.1
- yargs: ^17.7.2

## License
MIT