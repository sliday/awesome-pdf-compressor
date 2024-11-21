const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const chalk = require('chalk');
const { statSync } = require('fs');

// Configuration constants
const THUMBNAIL_WIDTH = 200;

async function generateThumbnail(pdfPath, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-jpeg',
            '-f', '1',
            '-l', '1',
            '-scale-to', THUMBNAIL_WIDTH.toString(),
            pdfPath,
            outputPath
        ];
        
        const pdftocairo = spawn('pdftocairo', args);
        let stderr = '';
        
        pdftocairo.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pdftocairo.on('error', (error) => {
            reject(new Error(`pdftocairo failed: ${error.message}`));
        });

        pdftocairo.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`pdftocairo failed with code ${code}: ${stderr}`));
        });
    });
}

async function extractMetadata(pdfPath, outputPath) {
    return new Promise((resolve, reject) => {
        const pdfinfo = spawn('pdfinfo', [pdfPath]);
        let stdout = '';
        let stderr = '';
        
        pdfinfo.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        pdfinfo.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pdfinfo.on('error', (error) => {
            reject(new Error(`pdfinfo failed: ${error.message}`));
        });

        pdfinfo.on('close', async (code) => {
            if (code === 0) {
                await fs.writeFile(outputPath, stdout);
                resolve();
            } else {
                reject(new Error(`pdfinfo failed with code ${code}: ${stderr}`));
            }
        });
    });
}

// Helper functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    return size.padStart(8);
}

function checkExecutable(command) {
    try {
        execSync(`which ${command}`);
        return true;
    } catch {
        console.error(chalk.red(`Error: ${command} is not installed or not in PATH`));
        return false;
    }
}

async function ensureDir(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

async function compressWithGs(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const gsArgs = [
            '-sDEVICE=pdfwrite',
            '-dNOPAUSE',
            '-dBATCH',
            '-dSAFER',
            '-dQUIET',
            
            // Extreme compression settings
            '-dPDFSETTINGS=/ebook',
            '-dCompatibilityLevel=1.4',
            
            // Aggressive image downsampling
            '-dDownsampleColorImages=true',
            '-dDownsampleGrayImages=true',
            '-dDownsampleMonoImages=true',
            '-dColorImageResolution=112',
            '-dGrayImageResolution=112',
            '-dMonoImageResolution=112',
            
            // Maximum image compression
            '-dAutoFilterColorImages=true',
            '-dAutoFilterGrayImages=true',
            '-dColorImageFilter=/FlateEncode',
            '-dGrayImageFilter=/FlateEncode',
            '-dMonoImageFilter=/CCITTFaxEncode',
            '-dEncodeColorImages=true',
            '-dEncodeGrayImages=true',
            '-dEncodeMonoImages=true',
            '-dJPEGQ=51',
            
            // CCITT Fax specific options
            '-dCCITTCompressMode=3',
            '-dCCITTKCompression=2',
            
            // Strip everything possible
            '-dFastWebView=false',
            '-dPrinted=false',
            '-dHaveTransparency=false',
            '-dCompressPages=true',
            '-dUseFlateCompression=true',
            '-dDetectDuplicateImages=true',
            '-dOptimize=true',
            
            // Remove all metadata
            '-dRemoveMetadata=true',
            '-dRemoveAnnots=true',
            '-dRemoveDocinfo=true',
            '-dRemoveXMP=true',
            '-dRemoveOCProperties=true',
            '-dRemovePageLabels=true',
            '-dRemoveStructTreeRoot=true',
            '-dRemoveOutputIntents=true',
            '-dRemoveAcroForm=true',
            '-dRemoveEmbeddedFiles=true',
            '-dRemoveArticle=true',
            '-dRemoveCanonicalMediaBox=true',
            '-dRemoveColorManagement=true',
            '-dRemoveBeads=true',
            '-dRemoveMarkedContent=true',
            '-dRemoveICCProfiles=true',
            
            // Font Settings
            '-dEmbedAllFonts=true',
            '-dSubsetFonts=true',
            '-dCompressFonts=true',
            '-dConvertToCompactFontFormat=true',
            '-dCompressFontStrings=true',
            '-dRemoveUnusedFonts=true',
            '-dMergeFontPrograms=true',
            '-dConvertCMYKImagesToRGB=true',
            
            // Disable all preservation flags
            '-dPreserveMarkedContent=false',
            '-dPreserveAnnots=false',
            '-dPreserveOPIComments=false',
            '-dPreserveOverprint=false',
            '-dPreserveHalftone=false',
            '-dPreserveSeparation=false',
            '-dPreserveDeviceN=false',
            '-dPreserveIndexed=false',
            '-dPreserveTrMode=false',
            '-dPreserveEPSInfo=false',

            // Advanced Settings
            '-dRemoveThumbnails=true',
            '-dRemoveApplicationData=true',
            '-dRemoveStructureTree=true',
            '-dRemoveArticleThreads=true',
            '-dRemoveWebCapture=true',
            '-dRemoveOutputIntents=true',
            
            // Additional optimization
            '-dDoThumbnails=false',
            '-dCreateJobTicket=false',
            '-dPreserveEmbeddedFiles=false',
            '-dPassThroughJPEGImages=false',
            '-dMaxInlineImageSize=0',
            '-dCompressEntireFile=true',
            '-dUseMaxCompression=true',

            // Additional Optimizations
            '-dOptimize=true',
            '-dCompressPages=true',
            '-dUseFlateCompression=true',
            '-dDetectDuplicateImages=true',
            
            `-sOutputFile=${outputPath}`,
            inputPath
        ];

        const gs = spawn('gs', gsArgs);
        let stderr = '';
        
        gs.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        gs.on('error', (error) => {
            reject(new Error(`GS failed: ${error.message}`));
        });

        gs.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`GS failed with code ${code}: ${stderr}`));
        });
    });
}

async function compressWithMutool(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            'clean',
            '-gggg',
            '-z',
            '-f',
            '-i',
            '-c',
            '-s',
            '-t',
            '-Z',
            '-e', '100',
            '--color-image-subsample-method', 'bicubic',
            '--gray-image-subsample-method', 'bicubic',
            '--color-image-subsample-dpi', '112,112',
            '--gray-image-subsample-dpi', '112,112',
            '--color-image-recompress-method', 'jpeg:50',
            '--gray-image-recompress-method', 'jpeg:50',
            inputPath,
            outputPath
        ];
        
        const mutool = spawn('mutool', args);
        let stderr = '';
        let stdout = '';
        
        mutool.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        mutool.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        mutool.on('error', (error) => {
            reject(new Error(`MuTool failed: ${error.message}`));
        });

        mutool.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`MuTool failed with code ${code}: ${stderr}`));
            }
        });
    });
}

function calculateRatio(originalSize, compressedSize) {
    if (!originalSize || !compressedSize) return -1;
    return parseFloat(((1 - compressedSize / originalSize) * 100).toFixed(1));
}

async function processBatch(pdfDoc, startPage, endPage, tempDir, outputDir) {
    console.log(chalk.cyan(`\n📦 Processing batch: pages ${startPage}-${endPage}`));
    
    const batchResults = [];

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        const tempPdfDoc = await PDFDocument.create();
        const [page] = await tempPdfDoc.copyPages(pdfDoc, [pageNum - 1]);
        tempPdfDoc.addPage(page);

        // Save temporary page
        const pagePath = path.join(tempDir, `page_${pageNum}_temp.pdf`);
        await fs.writeFile(pagePath, await tempPdfDoc.save());
        const originalSize = (await fs.stat(pagePath)).size;

        // Single-line status with emojis and colors
        process.stdout.write(
            `📄 Page ${chalk.cyan(String(pageNum).padStart(2))}: ` +
            `${chalk.gray(formatBytes(originalSize))} → `
        );

        const gsOutputPath = path.join(tempDir, `page_${pageNum}_gs.pdf`);
        const mutoolOutputPath = path.join(tempDir, `page_${pageNum}_mutool.pdf`);

        const results = await Promise.all([
            compressWithMutool(pagePath, mutoolOutputPath).then(() => {
                const size = statSync(mutoolOutputPath).size;
                process.stdout.write(`${chalk.blue(formatBytes(size))} [MuTool] `);
                return { tool: 'mutool', size, originalSize, pageNum, path: mutoolOutputPath };
            }),
            compressWithGs(pagePath, gsOutputPath).then(() => {
                const size = statSync(gsOutputPath).size;
                process.stdout.write(`${chalk.yellow(formatBytes(size))} [GS]`);
                return { tool: 'gs', size, originalSize, pageNum, path: gsOutputPath };
            })
        ]);

        const bestResult = results.reduce((best, current) => 
            current.size < best.size ? current : best
        );

        // Show best result
        const ratio = calculateRatio(originalSize, bestResult.size);
        const ratioColor = ratio > 0 ? chalk.green : chalk.red;
        console.log(` ✨ ${chalk.magenta(formatBytes(bestResult.size))} ` +
                   `${ratioColor(`(${ratio > 0 ? '-' : ''}${Math.abs(ratio)}%)`)} ` +
                   `using ${chalk.yellow(bestResult.tool)}`);

        batchResults.push(bestResult);

        // Save with proper padding in filename
        const outputPath = path.join(outputDir, `page_${String(pageNum).padStart(5, '0')}.pdf`);
        await fs.copyFile(bestResult.path, outputPath);
    }

    return batchResults;
}

async function main() {
    const argv = yargs(hideBin(process.argv))
        .option('merge', {
            alias: 'm',
            type: 'boolean',
            default: true,
            description: 'Create merged output file'
        })
        .option('pages', {
            alias: 'p',
            type: 'boolean',
            default: true,
            description: 'Keep individual pages'
        })
        .option('metadata', {
            alias: 'd',
            type: 'boolean',
            default: true,
            description: 'Extract metadata'
        })
        .option('thumbnails', {
            alias: 't',
            type: 'boolean',
            default: true,
            description: 'Generate thumbnails'
        })
        .option('batch-size', {
            alias: 'b',
            type: 'number',
            default: 100,
            description: 'Number of pages to process in each batch'
        })
        .demandCommand(1)
        .usage('Usage: $0 <input-pdf> [options]')
        .argv;

    const inputPath = argv._[0];
    const outputDir = path.resolve('out');
    const pagesDir = path.join(outputDir, 'pages');
    const thumbnailsDir = path.join(outputDir, 'thumbnails');
    const tempDir = path.join(outputDir, 'temp');

    // Create directories
    await Promise.all([
        ensureDir(outputDir),
        ensureDir(pagesDir),
        ensureDir(thumbnailsDir),
        ensureDir(tempDir)
    ]);

    // Initialize statistics
    const stats = {
        startTime: Date.now(),
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        toolCounts: {
            gs: 0,
            mutool: 0
        }
    };

    // Extract original metadata
    if (argv.metadata) {
        console.log(chalk.cyan('\n📝 Extracting original metadata...'));
        await extractMetadata(inputPath, path.join(outputDir, 'original_pdf_metadata.txt'));
    }

    // Process pages
    console.log(chalk.cyan('\n📄 Loading PDF...'));
    const pdfBytes = await fs.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    const batchSize = argv.batchSize;
    const batches = Math.ceil(pageCount / batchSize);

    console.log(chalk.cyan('\n🔍 Processing'), chalk.white(`${pageCount} pages...`));

    const batchResults = [];
    for (let i = 0; i < batches; i++) {
        const startPage = i * batchSize + 1;
        const endPage = Math.min((i + 1) * batchSize, pageCount);
        const results = await processBatch(pdfDoc, startPage, endPage, tempDir, pagesDir);
        batchResults.push(...results);
    }

    // Generate thumbnails
    if (argv.thumbnails) {
        console.log(chalk.cyan('\n🖼️  Generating thumbnails...'));
        process.stdout.write('  '); // Initial indent
        
        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            const paddedNum = String(pageNum).padStart(5, '0');
            const pagePath = path.join(pagesDir, `page_${paddedNum}.pdf`);
            const thumbPath = path.join(thumbnailsDir, `page_${paddedNum}_thumb`);
            
            try {
                await generateThumbnail(pagePath, thumbPath);
                process.stdout.write(`${pageNum}${chalk.green('✓')} `);
                
                // Add line break every 10 pages for readability
                if (pageNum % 10 === 0) {
                    process.stdout.write('\n  ');
                }
            } catch (error) {
                process.stdout.write(`${pageNum}${chalk.red('✗')} `);
                console.error(chalk.red(`\nError: ${error.message}`));
            }
        }
        console.log(); // Final newline
    }

    // Merge compressed pages
    if (argv.merge) {
        console.log(chalk.cyan('\n📚 Merging compressed pages...'));
        const mergedPdfDoc = await PDFDocument.create();
        
        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            const paddedNum = String(pageNum).padStart(5, '0');
            const pagePath = path.join(pagesDir, `page_${paddedNum}.pdf`);
            const pageBytes = await fs.readFile(pagePath);
            const [page] = await mergedPdfDoc.copyPages(await PDFDocument.load(pageBytes), [0]);
            mergedPdfDoc.addPage(page);
        }

        const outputPath = path.join(outputDir, path.basename(inputPath, '.pdf') + '_compressed.pdf');
        await fs.writeFile(outputPath, await mergedPdfDoc.save());
        
    }

    // Show summary
    const totalTime = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    const totalRatio = calculateRatio(stats.totalOriginalSize, stats.totalCompressedSize);
    const ratioDisplay = totalRatio > 0 
        ? `-${Math.abs(totalRatio)}%`  // For positive ratio (size reduction)
        : `+${Math.abs(totalRatio)}%`; // For negative ratio (size increase)
    
    console.log(
        `📊 Summary: ${chalk.cyan(pageCount)} pages | ` +
        `${chalk.gray(formatBytes(stats.totalOriginalSize))} → ` +
        `${chalk.magenta(formatBytes(stats.totalCompressedSize))} ` +
        `${chalk.green(`(${ratioDisplay})`)} | ` +
        `${chalk.yellow(`${totalTime}s`)}`
    );

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
    
    console.log(chalk.green('\n✅ Compression complete!'));
    console.log(chalk.gray(`Output saved in: ${outputDir}`));
}

main().catch(err => {
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
});

function createProgressBar(total) {
    const width = 30;
    let current = 0;
    
    return {
        update: (value) => {
            current = value;
            const percentage = Math.round((current / total) * 100);
            const filled = Math.round((width * current) / total);
            const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
            
            process.stdout.write(`\r  ${bar} ${percentage}% | Page ${current}/${total}`);
        },
        done: () => {
            process.stdout.write('\n');
        }
    };
}