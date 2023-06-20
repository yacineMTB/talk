// Remove the import statement for 'stdout'
import { stdout } from 'process';
import { llamaInvoke } from '../src/depedenciesLibrary/llm'

const main = async () => {
  const result = await llamaInvoke("Tell me about this particular anime", "Cowboy Bepop", (data) => stdout.write(data));
  console.log(result);
}
main();
