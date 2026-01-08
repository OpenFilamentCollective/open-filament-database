import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";

const inputDir = '../schemas';         // Folder with JSON schemas
const outputDir = './src/lib/validation'; // Where the Zod TS files will go

const exec = promisify(execCb);

async function generateZodSchemas() {
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const files = fs.readdirSync(inputDir).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const inputPath = path.join(inputDir, file),
          outPath = path.join(outputDir, `${path.basename(file, '.json')}.ts`);

    const { error, stdout, stderr } = await exec(`json-schema-to-zod -i ${inputPath} -o ${outPath}`);
  
    if (error) {
      throw error;
    }

    console.log(`✅ Generated: ${outPath}`);
  }
}

console.log("This script is not ready, please do not use it");
/*generateZodSchemas().catch((err) => {
  console.error('❌ Error generating schemas:', err);
  process.exit(1);
});*/