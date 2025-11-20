import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import convert from "./src/lib.js"

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


async function process_lst(filename) {
    const workspace = process.cwd();
    const filePath = path.resolve(workspace, filename);
    const baseFilename = path.basename(filename);
    const failedFilePath = path.join(workspace, 'failed.txt');
    const failedLines = [];

    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        const lines = data.split('\n');

        if (filename === 'test.txt') {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            for (let index = 0; index < lines.length; index++) {
                const latexString = lines[index];
                console.log(`formula [${index}]:`, latexString);
                console.log(convert(latexString).expr);
                await new Promise(resolve => rl.once('line', resolve));
            }
            rl.close();
        } else {
            const convertedFilePath = path.join(path.dirname(filePath), `converted_${baseFilename}`);
            const writeStream = fs.createWriteStream(convertedFilePath, { flags: 'w' });

            for (let index = 0; index < lines.length; index++) {
                try {
                    writeStream.write(`${convert(lines[index]).expr}\n`);
                } catch (convertErr) {
                    console.log(`Error converting formula [${index}]: ${convertErr}\n`);
                    failedLines.push(lines[index]);
                }
            }
            writeStream.end();
        }

        console.log(failedLines.length)
        if (failedLines.length > 0) {
            await fs.promises.writeFile(failedFilePath, failedLines.join('\n'), 'utf8');
            console.log('Successfully wrote failed lines to file:', failedFilePath);
        }
    } catch (err) {
        console.error('Error processing file:', err);
    }
}


async function process_csv(csv_name) {
    const workspace = process.cwd();
    const csvName = csv_name;
    const inputFilePath = path.join(workspace, csvName);

    const outputFilePath = path.join(path.dirname(inputFilePath), `typ_${path.basename(inputFilePath)}`);

    const failedFilePath = path.join(workspace, 'failed.txt');
    const failedLines = [];
    const outputData = [];

    console.log(`Processing CSV file: ${inputFilePath}`);

    const parser = fs.createReadStream(inputFilePath)
        .pipe(parse({ columns: true, skip_empty_lines: true }));

    for await (const row of parser) {
        const name = row.image_filename;
        let formula = row.latex;

        try {
            formula = convert(formula).expr;
            outputData.push({ name, formula });
        } catch (err) {
            console.error(`Failed to process formula for ${name}:`, err);
            failedLines.push(formula);
        }
    }

    console.log(`Finished processing CSV file. Writing to output file: ${outputFilePath}`);

    const csvWriter = fs.createWriteStream(outputFilePath);
    const stringifier = stringify({ header: true, columns: ['name', 'formula'] });

    stringifier.pipe(csvWriter);
    outputData.forEach((row) => {
        stringifier.write(row);
    });
    stringifier.end();

    await new Promise((resolve) => {
        csvWriter.on('finish', resolve);
    });

    console.log("CSV writing done");

    if (failedLines.length > 0) {
        await fs.promises.writeFile(failedFilePath, failedLines.join('\n'), 'utf8');
        console.log('Successfully wrote failed lines to file:', failedFilePath);
    }
}


async function process_stdin() {
    let input = '';

    // Read from stdin
    for await (const chunk of process.stdin) {
        input += chunk;
    }

    // Convert and write to stdout
    try {
        const result = convert(input.trim());
        process.stdout.write(result.expr);
    } catch (err) {
        console.error('Error converting LaTeX:', err);
        process.exit(1);
    }
}


async function process_stdin_json() {
    let input = '';

    // Read from stdin
    for await (const chunk of process.stdin) {
        input += chunk;
    }

    // Parse JSON array of LaTeX strings
    try {
        const latexList = JSON.parse(input.trim());

        if (!Array.isArray(latexList)) {
            throw new Error('Input must be a JSON array of strings');
        }

        // Convert each LaTeX string to Typst
        const typstList = latexList.map((latex, index) => {
            try {
                const result = convert(latex.trim());
                // Check if result exists and has expr property
                if (!result || typeof result.expr !== 'string') {
                    return `CONVERT_ERROR: Conversion returned invalid result (index ${index})`;
                }
                // Check if result is empty
                if (result.expr === '') {
                    return `CONVERT_ERROR: Conversion returned empty string (index ${index})`;
                }
                return result.expr;
            } catch (err) {
                // Return error message for failed conversions
                return `CONVERT_ERROR: ${err.message || err.toString()} (index ${index})`;
            }
        });

        // Output JSON array
        process.stdout.write(JSON.stringify(typstList));
    } catch (err) {
        console.error('Error processing JSON:', err);
        process.exit(1);
    }
}


async function main() {
    const args = process.argv.slice(2);
    const functionName = args[0];

    if (functionName === 'lst') {
        const fileName = args[1];
        if (!fileName) {
            await process_lst("test.txt");
        } else {
            await process_lst(fileName);
        }
    } else if (functionName === 'csv') {
        const fileName = args[1];
        if (!fileName) {
            console.log("Please provide a file name for process_csv");
        } else {
            await process_csv(fileName);
        }
    } else if (functionName === 'stdin') {
        await process_stdin();
    } else if (functionName === 'stdin-json') {
        await process_stdin_json();
    } else {
        console.log(`Function ${functionName} not found`);
    }
}

main();