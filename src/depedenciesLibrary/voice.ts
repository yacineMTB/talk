import { spawn, ChildProcessWithoutNullStreams, exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import config from '../../config.json';
import fs from 'fs';
const { piperModelPath } = config;

export const generateAudio = (text: string): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const modelPath = piperModelPath;
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
        // console.error(`exec error: ${error}`);
        reject(error);
      } else {
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
      audioPlayerState.isPlaying = false;
      fs.unlink(audioPath, (err) => {
        // ignore error
      });
      resolve();
    });
    audioPlayerState.process.on('error', (err) => {
      audioPlayerState.isPlaying = false;
      fs.unlink(audioPath, (err) => {
        // ignore error
      });
      reject(err);
    });
  });
};

export const stopAudioPlayback = (): void => {
  if (audioPlayerState.process) {
    audioPlayerState.process.kill('SIGINT');
    audioPlayerState.isPlaying = false;
  }
};
