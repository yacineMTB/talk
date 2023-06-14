
export const llamaInvoke = (prompt: string, input: string, llama: any): Promise<string> => {
  const formattedPrompt = `# Instruction:\n ${prompt} \n # Input:\n ${input} \n # Response:\nagent:\n`;
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
          tokens.push(token);
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