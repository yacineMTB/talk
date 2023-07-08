import { playAudioFile, generateAudio } from './depedenciesLibrary/voice'
import { llamaInvoke, llamaEmbed } from './depedenciesLibrary/llm';

export type CommandType = 'continue' | 'restart';

interface Phrase {
  content: string;
  embedding: number[];
  similarity: number;
}

export interface CommandEmbedding {
  name: CommandType;
  threshold: number;
  phrases: Phrase[];
}

// Talk: Greedily generate audio while completing an LLM inference
export const talk = async (prompt: string, input: string, llamaServerUrl: string, personaConfig:string, sentenceCallback: (sentence: string) => void): Promise<string> => {
  let sentenceEndRegex = /[.!?,;]/;  // Adjust as necessary.
  let promisesChain = Promise.resolve();

  const sentences: string[] = [];
  let currentSentence: string[] = [];

  const response = await llamaInvoke(prompt, input, llamaServerUrl, personaConfig, (token: string) => {
    token = token.replace(/[^a-zA-Z0-9 .,!?'\n-]/g, '');
    currentSentence.push(token);
    // Check if the token ends a sentence.
    if (sentenceEndRegex.test(token)) {
      const sentence = currentSentence.join('');
      sentences.push(sentence);
      const promise = generateAudio(sentence);
      promisesChain = promisesChain.then(async () => { 
        await promise.then(playAudioFile);
        sentenceCallback(sentence);
      });
      sentenceEndRegex = /[.!?]/;
      currentSentence = [];
    }
  });
  await promisesChain;
  return response;

}

const cosineSimilarity = (A: number[], B: number[]): number => {
  if ((!A.length) || (!B.length) || (A.length !== B.length)) {
    throw new Error('Invalid vectors');
  }
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i=0; i<A.length; i++) {
    dotProduct += A[i] * B[i];
    magA += A[i] * A[i];
    magB += B[i] * B[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  return dotProduct / (magA * magB);
}

// Check the transcription for a match to the command embeddings
export const checkTranscriptionForCommand = async (llamaServerUrl: string, commandEmbeddings: CommandEmbedding[], transcription: string): Promise<CommandType> => {
  if (transcription.length) {
    // Remove punctuation from the end
    transcription = transcription.replace(/[^\w\s]*$/, "");
    console.log(transcription);
    const transcriptionEmbedding = await llamaEmbed(llamaServerUrl, transcription);
    for (const command of commandEmbeddings) {
      command.phrases.map((phrase: Phrase) => {
        phrase.similarity = cosineSimilarity(phrase.embedding, transcriptionEmbedding)
      });
      command.phrases.sort((a, b) => b.similarity - a.similarity);
      const phrase = command.phrases[0];
      if (phrase.similarity > command.threshold) {
        //console.log(`transcription: "${transcription}" PASSED`);
        //console.log(`phrase: "${phrase.content}" ${phrase.similarity}`);
        //console.log(`greater than threshold ${command.threshold}`);
        return command.name;
      }
      //console.log(`${command.name}: ${phrase.similarity}`);
    }
  }
  return 'continue';
}
