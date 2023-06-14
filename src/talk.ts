import { playAudioFile, generateAudio } from './depedenciesLibrary/voice'

// Talk: as fast as possible
export const talk = async (prompt: string, input: string, llama: any): Promise<string> => {
  const formattedPrompt = `### Instruction:\n ${prompt} \n ### Input:\n ${input} \n ### Response:\nagent: `;
  return new Promise((resolve, reject) => {
    const promptTokens: string[] = [];
    let promptTokensDoneEchoing: boolean = false;
    let sentenceEndRegex = /[.!?,;]/;  // Adjust as necessary.
    let promisesChain = Promise.resolve();

    const sentences: string[] = [];
    let currentSentence: string[] = [];
    llama.startAsync({
      prompt: formattedPrompt,
      listener: (token: string) => {
        if (token === '[end of text]') {
          // Add any remaining tokens to the sentences array.
          if (currentSentence.length > 0) {
            sentences.push(currentSentence.join(''));
          }
          return resolve(promisesChain.then(() => sentences.join(' ')));
        }

        if (promptTokensDoneEchoing) {
          token = token.replace(/[^a-zA-Z0-9 .,!?'\n-]/g, '');
          currentSentence.push(token);
          // Check if the token ends a sentence.
          if (sentenceEndRegex.test(token)) {
            const sentence = currentSentence.join('');
            sentences.push(sentence);
            const promise = generateAudio(sentence);
            promisesChain = promisesChain.then(() => promise.then(playAudioFile));
            sentenceEndRegex = /[.!?]/;  // less greedy
            currentSentence = [];
          }
        } else {
          promptTokens.push(token)
        }
        // TODO: The trim is leak from llama tokenizer inside the cpp
        // Ideally the cpp binding can take an option on whether to echo prompt tokens or not 
        // so I don't have to leak the lurk in here
        if (!promptTokensDoneEchoing && promptTokens.join('').trim() === formattedPrompt.trim()) {
          promptTokensDoneEchoing = true;
        }
      }
    });
  });
}