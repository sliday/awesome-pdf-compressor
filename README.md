# Awesome PDF Compressor & Thumbnailer

Aggressive PDF compression with thumbnail generation, metadata extraction, and multi-tool optimization.

![CleanShot 2024-11-21 at 22 24 23@2x](https://github.com/user-attachments/assets/895d31f2-61d4-4a25-81a1-6f31a739ef89)

## Features
- Multi-tool PDF compression (Ghostscript and mutool)
- 200px thumbnail generation (pdftocairo)
- Metadata preservation and extraction
- Parallel processing with batch support
- Keeps original if compressed version is larger
- Organized output directory structure

## Prerequisites
```bash
# Ubuntu/Debian
sudo apt-get install ghostscript mupdf-tools poppler-utils

# macOS
brew install ghostscript mupdf-tools poppler

# Windows (Chocolatey)
choco install ghostscript mupdf poppler
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
| `--batch-size` | Number of pages to process in each batch | 100 |

### Examples
```bash
# Basic usage (all features)
node pdf-compressor.js input.pdf

# Only individual pages
node pdf-compressor.js input.pdf --no-merge

# Only merged output
node pdf-compressor.js input.pdf --no-pages --no-thumbnails --no-metadata

# Custom batch size
node pdf-compressor.js input.pdf --batch-size 50
```

### Output Structure
```
./out/
├── pages/                      # [Unless --no-pages]
│   ├── page_00001.pdf
│   ├── page_00002.pdf
│   └── ...
├── thumbnails/                 # [Unless --no-thumbnails]
│   ├── page_00001_thumb.jpg
│   ├── page_00002_thumb.jpg
│   └── ...
├── original_pdf_metadata.txt   # [Unless --no-metadata]
├── compressed_pdf_metadata.txt # [Unless --no-metadata]
└── originalname_compressed.pdf # [Unless --no-merge]
```

## Configuration
```javascript
const CONCURRENT_TASKS = 2;    // Parallel processes
const BATCH_SIZE = 100;        // Default pages per batch
const THUMBNAIL_WIDTH = 200;   // Thumbnail width in pixels
```

## Memory Tips
- Use `--no-merge` for large PDFs
- Use `--no-thumbnails` for faster processing
- Adjust `--batch-size` for memory optimization (lower values use less memory)
- All output files are organized in the `out` directory

## Dependencies
- pdf-lib: ^1.17.1
- yargs: ^17.7.2

## License
MIT
