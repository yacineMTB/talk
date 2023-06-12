import readline from 'readline';
import { spawn } from 'child_process';
import process from 'process';
import config from './config.json';

const { llamaModelPath, whisperModelPath, audioListenerScript } = config;

const whisper = require('./bindings/whisper/whisper-addon');
const llama = require("./bindings/llama/llama-addon");
const audioProcess = spawn('bash', [audioListenerScript]);

// Init ggml cpp bindings
llama.init({ model: llamaModelPath });
whisper.init(whisperModelPath);


let globalLlamaPromise: Promise<string>; 
let globalWhisperPromise: Promise<string>;

// Utility functions
const updateScreen = () => {
  console.clear();
  console.log(`\x1b[36m last whisper transcription: \x1b[0m ${lastWhisperTranscription}\n\n\x1b[33m previous thoughts: \x1b[0m ${completedInferences}\n\n\x1b`);
}

// Big bag of state
const SAMPLING_RATE = 16000;
const CHANNELS = 1;
const BIT_DEPTH = 16;
const ONE_SECOND = SAMPLING_RATE * (BIT_DEPTH / 8) * CHANNELS;
const BUFFER_LENGTH_SECONDS = 28;
const BUFFER_LENGTH = ONE_SECOND * BUFFER_LENGTH_SECONDS;

class Conversation {
  public audioBuffer: Buffer;
  public transcriptions: { startByte: number, text: string, responses: string[] }[];

  constructor() {
    this.audioBuffer = Buffer.alloc(0);
    this.transcriptions = [];
  }

  addTranscription(startByte: number, text: string) {
    const lastTranscription = this.transcriptions[this.transcriptions.length - 1];
    if (!lastTranscription || lastTranscription.text !== text) {
      this.transcriptions.push({ startByte, text, responses: [] });
    }
  }

  addAudioData(data: Buffer) {
    this.audioBuffer = Buffer.concat([this.audioBuffer, data]);
  }
}

// State init
const conversation = new Conversation();
let lastWhisperTranscription = '';
let completedInferences: string[] = [];

// Event handlers
process.stdin.on('readable', () => {
  let data;
  // Implicit, should be injected into conversation
  while (data = audioProcess.stdout.read()) {
    conversation.addAudioData(data);
  }
});

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', async (str, key) => {
  // Detect Ctrl+C and manually emit SIGINT to preserve default behavior
  if (key.sequence === '\u0003') {
    // The reason I wait for these promises is because ggml core dumps when you do it in the middle of an infer
    // Yes, lurk
    if (globalLlamaPromise) {
      await globalLlamaPromise;
    }
    if (globalWhisperPromise) {
      await globalWhisperPromise;
    }
    process.exit();
  }

  // R for respond
  if (key.sequence === 'r') {
    for (let i = conversation.transcriptions.length - 1; i >= 0; i--) {
      const transcription = conversation.transcriptions[i];
      const {startByte, text, responses } = transcription;
      if (responses.length > 0) {
        // TODO: simulate response
      }
    }
  }
});

const whisperLoop = async () => {
  // TODO: Figure out why segfault occurs when no waiting
  // Likely a hint in the original whisper cpp napi addon code
  // I presume the cause is init func early return?
  await new Promise(r => setTimeout(r, 2000));

  while (true) {
    const total_buffer_length = conversation.audioBuffer.length;
    let start = (total_buffer_length - BUFFER_LENGTH);
    if (start < 0) {
      start = 0;
    }
    const audioSlice = conversation.audioBuffer.slice(start, total_buffer_length);
    globalWhisperPromise = whisper.whisperInferenceOnBytes(audioSlice);
    const result = await globalWhisperPromise;
    conversation.addTranscription(start, result);
    if (conversation.transcriptions.length > 0) {
      lastWhisperTranscription = conversation.transcriptions[conversation.transcriptions.length - 1].text;
    }
    updateScreen();
  }
}

// A bit lurky. So TODO: unlurk
// Returns a promise based on an eventual callback trigger
const llamaInvoke = (prompt: string, input: string): Promise<string> => {
  const formattedPrompt = `### Instruction:\n ${prompt} \n ### Input:\n ${input} \n ### Response:\n`;
  return new Promise((resolve, reject) => {
    const promptTokens: string[] = [];
    let promptTokensDoneEchoing: boolean = false;
    const tokens: string[] = [];
    llama.startAsync({
      prompt: formattedPrompt,
      listener: (token: string) => {
        if (token === '[end of text]') {
          return resolve(tokens.join(''));
        }
        if (promptTokensDoneEchoing) {
          tokens.push(token)
          updateScreen();
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

const llamaLoop = async () => {
  await new Promise(r => setTimeout(r, 2000));
  while (true) {
    await new Promise(r => setTimeout(r, 30));
    if (conversation.transcriptions.length > 0) {
      const currentTranscription = conversation.transcriptions[conversation.transcriptions.length - 1];
      globalLlamaPromise = llamaInvoke("Be extremely terse. Given the following transcript, respond to it as if there was a conversation.", 'transcript:' + currentTranscription.text);
      const result = await globalLlamaPromise;
      currentTranscription.responses.push(result);
      completedInferences.push(result);
    }
  }
}

whisperLoop();
llamaLoop();
