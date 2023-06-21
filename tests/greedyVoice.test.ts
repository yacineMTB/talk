import { talk } from '../src/talk'

const inputData = `
Agent: God, you can really be a silly billy..
User: Wait, why? Why am I a silly billy? I know I did that thing.. but..
`;
talk(
  "Be extremely terse. Simulate the next step in a role playing conversation. Only respond with a single sentence." +
  "'agent' represents you. Don't use lists, only use english sentences. Only use UTF-8 characters." +
  "Keep the conversation going! Your name is alice. Only speak for alice, preceded with 'agent: '. What does alice say next?",
  inputData,
  (sent: string) => { console.log(sent) }
);
