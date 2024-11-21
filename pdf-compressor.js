const { spawn } = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Constants
const CONCURRENT_TASKS = 2;
const BATCH_SIZE = 100;
const THUMBNAIL_WIDTH = 200;

const DEFAULT_OPTIONS = {
    createMerged: true,
    keepPages: true,
    createMetadata: true,
    createThumbnails: true
};

// Helper function to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to format time
function formatTime(seconds) {
    if (seconds < 60) return `${ seconds.toFixed(1) } s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(1);
    return `${ minutes }m ${ remainingSeconds } s`;
}

// Check if required executables are available
function checkExecutable(command) {
    try {
        execSync(`which ${ command } `);
    } catch (error) {
        console.error(`Error: ${ command } is not installed or not in the system PATH.`);
        process.exit(1);
    }
}

// Function to ensure directory exists
async function ensureDir(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

// Function to process batches of pages
async function processBatch(startPage, endPage, pdfDoc, tempDir, outputDir, options) {
    const promises = [];
    const batchStats = {
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        bestToolCounts: { gs: 0, qpdf: 0, mutool: 0, original: 0 }
    };

    for (let i = startPage; i <= endPage && i <= pdfDoc.getPageCount(); i++) {
        const pageNum = i;
        const tempPdfDoc = await PDFDocument.create();
        const [page] = await tempPdfDoc.copyPages(pdfDoc, [pageNum - 1]);
        tempPdfDoc.addPage(page);

        const tempPath = path.join(tempDir, `page_${ String(pageNum).padStart(5, '0') }.pdf`);
        const outputPath = path.join(outputDir, `page_${ String(pageNum).padStart(5, '0') }.pdf`);

        const pdfBytes = await tempPdfDoc.save();
        await fs.writeFile(tempPath, pdfBytes);

        promises.push(
            compressPage(tempPath, outputPath, pageNum)
                .then(result => {
                    batchStats.totalOriginalSize += result.originalSize;
                    batchStats.totalCompressedSize += result.size;
                    batchStats.bestToolCounts[result.compressionStats.bestTool]++;
                    return result;
                })
        );

        if (promises.length >= CONCURRENT_TASKS) {
            await Promise.all(promises);
            promises.length = 0;
        }
    }

    if (promises.length > 0) {
        await Promise.all(promises);
    }

    // Log batch compression statistics
    console.log('\nBatch Compression Statistics:');
    console.log(`Original size: ${formatBytes(batchStats.totalOriginalSize)}`);
    console.log(`Compressed size: ${formatBytes(batchStats.totalCompressedSize)}`);
    console.log(`Compression ratio: ${((1 - batchStats.totalCompressedSize / batchStats.totalOriginalSize) * 100).toFixed(1)}%`);
    console.log('\nBest compression by tool:');
    Object.entries(batchStats.bestToolCounts)
        .filter(([_, count]) => count > 0)
        .forEach(([tool, count]) => {
            console.log(`${tool}: ${count} pages`);
        });

    return batchStats;
}

// Function to compress a single page
async function compressPage(inputPath, outputPath, pageNum) {
    try {
        await fs.access(inputPath);
    } catch {
        throw new Error(`Input file not found: ${inputPath}`);
    }

    const originalStats = await fs.stat(inputPath);
    const originalSize = originalStats.size;
    
    return new Promise((resolve, reject) => {
        const gsArgs = [
            '-sDEVICE=pdfwrite',
            '-dNOPAUSE',
            '-dBATCH',
            '-dSAFER',
            '-dQUIET',
            
            // Extreme compression settings
            '-dPDFSETTINGS=/screen',
            '-dCompatibilityLevel=1.4',
            
            // Aggressive image downsampling
            '-dDownsampleColorImages=true',
            '-dDownsampleGrayImages=true',
            '-dDownsampleMonoImages=true',
            '-dColorImageResolution=96',
            '-dGrayImageResolution=96',
            '-dMonoImageResolution=96',
            
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

        const gsProcess = spawn('gs', gsArgs);

        let stderr = '';
        gsProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        gsProcess.on('error', (error) => {
            reject(new Error(`Failed to start Ghostscript process: ${error.message}`));
        });

        gsProcess.on('close', async (code) => {
            if (code === 0) {
                try {
                    // Track sizes after each step
                    const gsStats = await fs.stat(outputPath);
                    const gsSize = gsStats.size;

                    // QPDF optimization
                    await optimizeWithQpdf(outputPath, outputPath);
                    const qpdfStats = await fs.stat(outputPath);
                    const qpdfSize = qpdfStats.size;

                    // MuTool optimization
                    await optimizeWithMutool(outputPath, outputPath);
                    const mutoolStats = await fs.stat(outputPath);
                    const mutoolSize = mutoolStats.size;

                    // Determine which tool provided the best compression
                    const compressionResults = [
                        { tool: 'gs', size: gsSize },
                        { tool: 'qpdf', size: qpdfSize },
                        { tool: 'mutool', size: mutoolSize }
                    ];
                    
                    const bestResult = compressionResults.reduce((best, current) => 
                        current.size < best.size ? current : best
                    );

                    if (bestResult.size >= originalSize) {
                        // If no compression method was better, use original
                        await fs.copyFile(inputPath, outputPath);
                        resolve({
                            size: originalSize,
                            originalSize,
                            usedOriginal: true,
                            compressionStats: {
                                gs: gsSize,
                                qpdf: qpdfSize,
                                mutool: mutoolSize,
                                bestTool: 'original'
                            }
                        });
                    } else {
                        // Generate thumbnail after successful compression
                        const thumbnailPath = outputPath.replace('.pdf', '_thumb.jpg');
                        await generateThumbnail(outputPath, thumbnailPath);

                        resolve({
                            size: bestResult.size,
                            originalSize,
                            usedOriginal: false,
                            thumbnailPath,
                            compressionStats: {
                                gs: gsSize,
                                qpdf: qpdfSize,
                                mutool: mutoolSize,
                                bestTool: bestResult.tool
                            }
                        });
                    }
                } catch (err) {
                    reject(new Error(`Processing failed: ${err.message}`));
                }
            } else {
                reject(new Error(`Ghostscript failed with code ${code}: ${stderr}`));
            }
        });
    });
}

// Function to optimize PDF using qpdf
async function optimizeWithQpdf(inputFile, outputFile) {
    const tempFile = `${outputFile}.tmp`;
    return new Promise((resolve, reject) => {
        const qpdfProcess = spawn('qpdf', [
            '--linearize',
            '--optimize-images',
            '--compression-level=9',
            inputFile,
            tempFile
        ]);

        let stderr = '';
        qpdfProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        qpdfProcess.on('error', (error) => {
            reject(new Error(`Failed to start qpdf process: ${error.message}`));
        });

        qpdfProcess.on('close', async (code) => {
            if (code === 0) {
                try {
                    await fs.rename(tempFile, outputFile);
                    resolve();
                } catch (err) {
                    reject(new Error(`Failed to rename temporary file: ${err.message}`));
                }
            } else {
                // Clean up temp file if it exists
                try {
                    await fs.unlink(tempFile);
                } catch (err) {
                    // Ignore error if temp file doesn't exist
                }
                reject(new Error(`qpdf failed: ${stderr}`));
            }
        });
    });
}

// Function to optimize PDF using mutool
async function optimizeWithMutool(inputFile, outputFile) {
    const tempFile = `${outputFile}.tmp`;
    return new Promise((resolve, reject) => {
        const args = ['clean', '-gggg', inputFile, tempFile];
        const mutoolProcess = spawn('mutool', args);

        let stderr = '';
        mutoolProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        mutoolProcess.on('error', (error) => {
            reject(new Error(`Failed to start mutool process: ${error.message}`));
        });

        mutoolProcess.on('close', async (code) => {
            if (code === 0) {
                try {
                    await fs.rename(tempFile, outputFile);
                    resolve();
                } catch (err) {
                    reject(new Error(`Failed to rename temporary file: ${err.message}`));
                }
            } else {
                // Clean up temp file if it exists
                try {
                    await fs.unlink(tempFile);
                } catch (err) {
                    // Ignore error if temp file doesn't exist
                }
                reject(new Error(`mutool failed: ${stderr}`));
            }
        });
    });
}

// Function to merge PDF pages
async function mergePDFs(inputDir, outputFile, originalInputFile) {
    const mergedPdf = await PDFDocument.create();
    
    // Get all PDF files in the directory
    const files = await fs.readdir(inputDir);
    const pdfFiles = files
        .filter(file => file.endsWith('.pdf'))
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0]);
            const numB = parseInt(b.match(/\d+/)[0]);
            return numA - numB;
        });

    // Merge each PDF file
    for (const file of pdfFiles) {
        const pdfBytes = await fs.readFile(path.join(inputDir, file));
        const pdf = await PDFDocument.load(pdfBytes);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsStack: 50,
        compress: true
    });

    // Compare with original file size
    const originalStats = await fs.stat(originalInputFile);
    const originalSize = originalStats.size;
    
    if (mergedPdfBytes.length < originalSize) {
        await fs.writeFile(outputFile, mergedPdfBytes);
    } else {
        // If merged file is larger, use the original
        await fs.copyFile(originalInputFile, outputFile);
        console.log('Warning: Compressed version was larger than original. Using original file.');
    }
}

// Function to generate thumbnail
async function generateThumbnail(pdfPath, thumbnailPath) {
    const thumbnailsDir = path.join(__dirname, 'out', 'thumbnails');
    const newThumbnailPath = path.join(thumbnailsDir, path.basename(thumbnailPath));

    return new Promise((resolve, reject) => {
        const pdftocairoProcess = spawn('pdftocairo', [
            '-jpeg',
            '-scale-to', THUMBNAIL_WIDTH.toString(),
            '-f', '1',
            '-l', '1',
            pdfPath,
            newThumbnailPath.replace('.jpg', '')
        ]);

        let stderr = '';
        pdftocairoProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pdftocairoProcess.on('error', (error) => {
            reject(new Error(`Failed to start pdftocairo process: ${error.message}`));
        });

        pdftocairoProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`pdftocairo failed: ${stderr}`));
            }
        });
    });
}

// Moved to a separate utility function
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Added error handling and input validation
async function extractAndSaveMetadata(pdfPath, outputDir, isCompressed = false) {
    try {
        if (!pdfPath || !outputDir) {
            throw new Error('PDF path and output directory are required');
        }

        const pdfBytes = await fs.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const stats = await fs.stat(pdfPath);
        
        const metadata = [
            'PDF Document Metadata',
            '===================\n',
            'Basic Information',
            '-----------------',
            `Filename: ${path.basename(pdfPath)}`,
            `File Size: ${formatBytes(stats.size)} (${stats.size.toLocaleString()} bytes)`,
            `Number of Pages: ${pdfDoc.getPageCount()}`,
            `Extracted At: ${new Date().toISOString()}`,
            `Type: ${isCompressed ? 'Compressed Output' : 'Original Input'}\n`,
            'Document Properties',
            '------------------',
            `Title: ${pdfDoc.getTitle() || 'Not specified'}`,
            `Author: ${pdfDoc.getAuthor() || 'Not specified'}`,
            `Subject: ${pdfDoc.getSubject() || 'Not specified'}`,
            `Keywords: ${pdfDoc.getKeywords() || 'Not specified'}`,
            `Creator: ${pdfDoc.getCreator() || 'Not specified'}`,
            `Producer: ${pdfDoc.getProducer() || 'Not specified'}`,
            `Creation Date: ${pdfDoc.getCreationDate()?.toISOString() || 'Not specified'}`,
            `Last Modified: ${pdfDoc.getModificationDate()?.toISOString() || 'Not specified'}`
        ].join('\n');

        // Use different filenames for input and output metadata
        const filename = isCompressed ? 'compressed_pdf_metadata.txt' : 'original_pdf_metadata.txt';
        const metadataPath = path.join(outputDir, filename);
        
        await fs.writeFile(metadataPath, metadata);
        return metadataPath;
    } catch (error) {
        throw new Error(`Failed to extract metadata: ${error.message}`);
    }
}

// Main function
async function main() {
    const argv = yargs(hideBin(process.argv))
        .option('no-merge', {
            type: 'boolean',
            description: 'Do not create merged output file'
        })
        .option('no-pages', {
            type: 'boolean',
            description: 'Do not keep individual page files'
        })
        .option('no-metadata', {
            type: 'boolean',
            description: 'Do not create metadata file'
        })
        .option('no-thumbnails', {
            type: 'boolean',
            description: 'Do not create page thumbnails'
        })
        .option('batch-size', {
            type: 'number',
            description: 'Number of pages to process in each batch',
            default: BATCH_SIZE
        })
        .argv;

    const options = {
        ...DEFAULT_OPTIONS,
        createMerged: !argv['no-merge'],
        keepPages: !argv['no-pages'],
        createMetadata: !argv['no-metadata'],
        createThumbnails: !argv['no-thumbnails'],
        batchSize: argv['batch-size']
    };

    console.log(`Using batch size: ${options.batchSize}`);

    try {
        // Check for required executables
        checkExecutable('gs');
        checkExecutable('qpdf');
        checkExecutable('mutool');
        if (options.createThumbnails) {
            checkExecutable('pdftocairo');
        }

        const inputFile = argv._[0];
        if (!inputFile) {
            throw new Error('Input file is required');
        }

        // Create output directories with new structure
        const outDir = path.join(__dirname, 'out');
        const tempDir = path.join(__dirname, 'temp_pages');
        const pagesDir = path.join(outDir, 'pages');
        const thumbnailsDir = path.join(outDir, 'thumbnails');

        await ensureDir(outDir);
        await ensureDir(tempDir);
        await ensureDir(pagesDir);
        await ensureDir(thumbnailsDir);

        // Process the PDF
        const pdfDoc = await PDFDocument.load(await fs.readFile(inputFile));
        const totalPages = pdfDoc.getPageCount();
        
        console.log(`Processing ${totalPages} pages...`);

        // Get the actual file size once at the start
        const originalFileStats = await fs.stat(inputFile);
        const actualOriginalSize = originalFileStats.size;

        const stats = {
            totalPages,
            actualOriginalSize,  // Store the actual original file size
            totalOriginalSize: 0,
            totalCompressedSize: 0,
            bestToolCounts: { gs: 0, qpdf: 0, mutool: 0, original: 0 },
            startTime: Date.now()
        };

        // Process in batches
        for (let i = 0; i < totalPages; i += options.batchSize) {
            const batchStart = i + 1;
            const batchEnd = Math.min(i + options.batchSize, totalPages);
            console.log(`Processing batch from page ${batchStart} to ${batchEnd}`);
            const batchStats = await processBatch(batchStart, batchEnd, pdfDoc, tempDir, pagesDir, options);
            
            // Aggregate statistics
            stats.totalOriginalSize += batchStats.totalOriginalSize;
            stats.totalCompressedSize += batchStats.totalCompressedSize;
            Object.entries(batchStats.bestToolCounts).forEach(([tool, count]) => {
                stats.bestToolCounts[tool] = (stats.bestToolCounts[tool] || 0) + count;
            });
        }

        stats.processingTime = Date.now() - stats.startTime;

        // Create metadata if requested
        if (options.createMetadata) {
            const inputMetadataPath = await extractAndSaveMetadata(inputFile, outDir, false);
            console.log(`Original PDF metadata written to: ${inputMetadataPath}`);
        }

        // Merge if requested
        if (options.createMerged) {
            const originalName = path.basename(inputFile, '.pdf');
            const outputFile = path.join(outDir, `${originalName}_compressed.pdf`);
            
            await mergePDFs(pagesDir, outputFile, inputFile);
            
            // Verify final file size
            const finalStats = await fs.stat(outputFile);
            const originalStats = await fs.stat(inputFile);
            
            if (finalStats.size >= originalStats.size) {
                await fs.copyFile(inputFile, outputFile);
                console.log('Warning: Final compression unsuccessful. Using original file.');
            } else {
                console.log(`Merged PDF saved to: ${outputFile}`);
            }

            if (options.createMetadata) {
                const outputMetadataPath = await extractAndSaveMetadata(outputFile, outDir, true);
                console.log(`Compressed PDF metadata written to: ${outputMetadataPath}`);
            }
        }

        // Clean up temp directory
        await fs.rm(tempDir, { recursive: true, force: true });

        // Clean up pages if not keeping them
        if (!options.keepPages) {
            await fs.rm(pagesDir, { recursive: true, force: true });
        }

        console.log('\nCompression Summary:');
        console.log(`Total pages processed: ${stats.totalPages}`);
        console.log(`Original size: ${formatBytes(stats.actualOriginalSize)}`);  // Use actual original size
        console.log(`Compressed size: ${formatBytes(stats.totalCompressedSize)}`);
        console.log(`Compression ratio: ${((1 - stats.totalCompressedSize / stats.actualOriginalSize) * 100).toFixed(1)}%`);
        console.log(`Total processing time: ${formatTime(stats.processingTime / 1000)}`);
        console.log(`Average time per page: ${formatTime((stats.processingTime / 1000) / stats.totalPages)}`);

    } catch (error) {
        console.error('An error occurred:', error);
        process.exit(1);
    }
}

// Run the main function
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = {
    compressPage,
    optimizeWithQpdf,
    optimizeWithMutool,
    formatBytes,
    formatTime,
    mergePDFs,
    processBatch
};