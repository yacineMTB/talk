import axios from 'axios';

const API_URL = 'http://127.0.0.1:8080'

export const llamaInvoke = (prompt: string, input: string, onDataFunction: (data: string) => void): Promise<string> => {
  const formattedPrompt = `### Instruction:\n ${prompt} \n ### Input:\n ${input} \n ### Response:\nbob:\n`;
  let answer = '';
  return new Promise(async (resolve, reject) => {
    const response = await axios({
      method: 'post',
      url: `${API_URL}/completion`,
      data: {
        prompt: formattedPrompt,
        temperature: 0.7,
        top_k: 40,
        top_p: 0.9,
        repeat_penalty: 1.3,
        // n_predict: 256,
        stream: true
      },
      responseType: 'stream',
    });
    response.data.on('data', (data: string) => {
      const t = Buffer.from(data).toString('utf8');
      if (t.startsWith('data: ')) {
        const message = JSON.parse(t.substring(6))
        answer += message.content;
        onDataFunction(message.content)
      }
    });
    response.data.on('end', () => {
      resolve(answer);
    });
  });
}
