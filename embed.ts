import fs from 'fs';
import util from 'util';
import { CommandEmbedding } from './src/talk';
import { llamaEmbed } from './src/depedenciesLibrary/llm';

const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

const COMMAND_DEF_PATH = 'commands.json';
const EMBEDDINGS_PATH = 'embeddings.json';
const llamaServerUrl = 'http://127.0.0.1:8080';

const embedCommands = async (): Promise<void> => {
  const commandData = await readFileAsync(COMMAND_DEF_PATH, 'utf8');
  const commands: CommandEmbedding[] = JSON.parse(commandData);
  for (const command of commands) {  
    for (const phrase of command.phrases) {
      phrase.embedding = await llamaEmbed(llamaServerUrl, phrase.content);
    }
  }
  const jsonStr = JSON.stringify(commands);

  try {
    await writeFileAsync(EMBEDDINGS_PATH, jsonStr, 'utf8');
  } catch (err) {
    console.error('Error writing JSON to file:', err);
  }
  console.log(`Embedding data written to ${EMBEDDINGS_PATH} successfully.`);
}

embedCommands();
