import axios from 'axios';

// Mostly meant to remove the narrator's text from the input. It sounds weird unless we start using multispeaker models.
function removeBetweenStars(input: string) {
  const regex = /\*.*?\*/g;
  const result = input.replace(regex, '');
  return result;
}

const formatPrompt = (prompt: string, input: string, personaConfig: string): string => {
  if (personaConfig) {
      const personaConfigJSON = JSON.parse(personaConfig);
      const charName = personaConfigJSON.name || personaConfigJSON.char_name;
      let charPersona  = personaConfigJSON.description || personaConfigJSON.char_persona;

      charPersona = charPersona.replace(/{{char}}/g, charName);
      charPersona = charPersona.replace(/{{user}}/g, "You");

      let promptWithPersona = prompt + charPersona;

      // roleplay model work better with "You" instead of USER or any other name
      let existingDialogues = input.replace(/alice/gi, "You");
      existingDialogues = existingDialogues.replace(/bob/gi, charName);
      existingDialogues = removeBetweenStars(existingDialogues);

      let exampleDialogues = personaConfigJSON.example_dialogue || personaConfigJSON.mes_example;
      exampleDialogues = exampleDialogues.replace(/{{char}}/g, charName);
      exampleDialogues = exampleDialogues.replace(/{{user}}/g, "You");      
      exampleDialogues = exampleDialogues.replace(/<START>/g, "\n");
      exampleDialogues = removeBetweenStars(exampleDialogues);

      let scenario = personaConfigJSON.scenario || personaConfigJSON.world_scenario;
      scenario = removeBetweenStars(scenario);

      let promptWithScenario = `${promptWithPersona}\n World Scenario: ${scenario}\n Example Dialogues: ${exampleDialogues}`
      let promptInstruction = `Imitate the personality of the following character and continue the conversation based on the existing input. RESPONSES SHOULD ONLY BE IN FIRST PERSON. \n ${charName}'s Persona: ${promptWithScenario}`
      return `### Instruction:\n ${promptInstruction} \n ### Input:\n ${existingDialogues} \n ### Response:\n${charName}:\n`;
  } else {
    return `### Instruction:\n ${prompt} \n ### Input:\n ${input} \n ### Response:\nbob:\n`;
  }
}

export interface LlamaStreamCommand {
  stop: boolean;
}

export const llamaInvoke = (prompt: string, input: string, llamaServerUrl: string, personConfig:string, onDataFunction: (data: string) => void | LlamaStreamCommand): Promise<string> => {
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
    stopTokens.push(`\n`);
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

