import { stdout } from 'process';
import { llamaInvoke, LlamaStreamCommand } from '../src/depedenciesLibrary/llm'

const streamCommand: LlamaStreamCommand = {
  stop: false
}

const main = async () => {
  const result = await llamaInvoke("Tell me about this particular anime", "Cowboy Bepop", " http://localhost:8080", "", (data) => {stdout.write(data)});
  console.log("\n");
}
main();
