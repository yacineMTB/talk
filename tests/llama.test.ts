import { stdout } from 'process';
import config from '../config.json';
import { llamaInvoke } from '../src/depedenciesLibrary/llm'
const llama = require("../bindings/llama/llama-addon");
const { llamaModelPath } = config;
llama.init({ model: llamaModelPath });

const main = async () => {
  const result = await llamaInvoke("Tell me about this particular anime", "Cowboy Bepop", llama);
  console.log(result);
}
main();