import axios from 'axios';

//TODO: Format Names should ideally be enums
const formatPrompt = (prompt: string, input: string, personaConfig: string): string => {
  if (personaConfig) {
      const personaConfigJSON = JSON.parse(personaConfig);
      const charName = personaConfigJSON.name || personaConfigJSON.char_name;
      var charPersona  = personaConfigJSON.description || personaConfigJSON.char_persona;

      charPersona = charPersona.replace(/{{char}}/g, charName);
      charPersona = charPersona.replace(/{{user}}/g, "You");     

      var promptWithPersona = prompt + charPersona;

      // roleplay model work better with "You" instead of USER or any other name
      var re = /alice/gi;
      var existingDialogues = input.replace(re, "You");

      var re = /bob/gi;
      existingDialogues = existingDialogues.replace(re, charName);

      var exampleDialogues = personaConfigJSON.example_dialogue || personaConfigJSON.mes_example;
      exampleDialogues = exampleDialogues.replace(/{{char}}/g, charName);
      exampleDialogues = exampleDialogues.replace(/{{user}}/g, "You");      

      var scenario = personaConfigJSON.scenario || personaConfigJSON.world_scenario;
      var promptWithScenario = `${promptWithPersona}\n<START>\n${scenario}\n${exampleDialogues}`
      return `${charName}'s Persona: ${promptWithScenario}\n<START>\n${existingDialogues}\n${charName}:`
  } else {
    return `### Instruction:\n ${prompt} \n ### Input:\n ${input} \n ### Response:\nbob:\n`;
  }
}

export interface LlamaStreamCommand {
  stop: boolean;
}

export const llamaInvoke = (prompt: string, input: string, llamaServerUrl: string, personConfig:string, onDataFunction: (data: string) => LlamaStreamCommand): Promise<string> => {
  let formattedPrompt:string;
  formattedPrompt = formatPrompt(prompt, input, personConfig);
  let stopTokens:string[] = [];
  if (personConfig) {
    const personaConfigJSON = JSON.parse(personConfig);
    const charName = personaConfigJSON.name || personaConfigJSON.char_name;

    //TODO: There should be a better way to do this using logit_bias
    stopTokens.push(`${charName}:`);
    stopTokens.push(`Alice:`);
    stopTokens.push(`Alice  `);
    stopTokens.push(`alice:`);
    stopTokens.push(`alice  `);
  }

  let answer = '';
  return new Promise(async (resolve, reject) => {
    const abortController = new AbortController();
    const response = await axios({
      method: 'post',
      url: `${llamaServerUrl}/completion`,
      data: {
        prompt: formattedPrompt,
        temperature: 0.7,
        top_k: 40,
        top_p: 0.9,
        repeat_penalty: 1.3,
        // n_predict: 256,
        stream: true,
        stop: stopTokens,
      },
      signal: abortController.signal,
      responseType: 'stream',
    });

    const onData = async (data: string) => {
      const t = Buffer.from(data).toString('utf8');
      if (t.startsWith('data: ')) {
        const message = JSON.parse(t.substring(6));
        answer += message.content;
        const streamCommand = onDataFunction(message.content);
        if (streamCommand?.stop) {
          response.data.removeListener('data', onData);
          abortController.abort();
          resolve(answer);
        }
      }
    }

    response.data.on('data', onData);

    response.data.on('end', () => {
      resolve(answer);
    });
  });
}

