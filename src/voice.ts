import { spawn, ChildProcessWithoutNullStreams, exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

export const generateAudio = (text: string): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const modelPath = '~/models/piper/en-gb-southern_english_female-low.onnx';
    const fileName = uuidv4();
    const directoryPath = './tmp';
    const outputFilePath = `${directoryPath}/${fileName}.wav`;

    // Check if the tmp directory exists, create it if it doesn't
    if (!fs.existsSync(directoryPath)) {
      try {
        fs.mkdirSync(directoryPath, { recursive: true });
      } catch (err) {
        console.error('Failed to create directory:', err);
        reject(err);
        return;
      }
    }

    exec(`echo "${text}" | piper --model ${modelPath} --output_file ${outputFilePath}`, (error) => {
      if (error) {
        console.error(`exec error: ${error}`);
        reject(error);
      } else {
        console.log(`Audio file has been saved to ${outputFilePath}`);
        resolve(fileName);
      }
    });
  });
};

interface AudioPlayerState {
  isPlaying: boolean;
  process?: ChildProcessWithoutNullStreams;
}

const audioPlayerState: AudioPlayerState = {
  isPlaying: false,
  process: undefined,
};

export const playAudioFile = async (fileName: string): Promise<void> => {
  if (audioPlayerState.isPlaying) {
    stopAudioPlayback();
  }

  return new Promise<void>((resolve, reject) => {
    audioPlayerState.isPlaying = true;
    const audioPath = `./tmp/${fileName}.wav`;
    audioPlayerState.process = spawn('ffplay', ['-nodisp', '-autoexit', audioPath]);
    audioPlayerState.process.on('close', (code) => {
      console.log(`ffplay exited with code ${code}`);
      audioPlayerState.isPlaying = false;
      resolve();
    });
  });
};

export const stopAudioPlayback = (): void => {
  if (audioPlayerState.process) {
    audioPlayerState.process.kill('SIGINT');
    audioPlayerState.isPlaying = false;
  }
};
