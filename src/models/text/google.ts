import axios from "axios";
import { GoogleAuth } from "google-auth-library";
import { getPromptLength } from "../../utils/tokenizer.js";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";

export default {
  data: {
    name: "google",
    fullName: "Google Models",
    parameters: {
      messages: {
        type: "array",
        required: true,
      },

      model: {
        type: "string",
        required: false,
        options: ["chat-bison"],
        default: "chat-bison",
      },
      max_tokens: {
        type: "number",
        required: false,
        default: 512,
      },
      temperature: {
        type: "number",
        required: false,
        default: 0.9,
      },
      id: {
        type: "string",
        required: false,
        default: randomUUID(),
        description: "ID of the conversation (used for data saving)",
      },
    },
    response: {
      cost: {
        type: "number",
        description: "Cost of the request in USD",
      },
      result: {
        type: "string",
        description: "Result of the request",
      },
      done: {
        type: "boolean",
        description: "Whether the request is done or not",
      },
    },
  },
  execute: async (data) => {
    let { messages, model, max_tokens, temperature, id } = data;
    if (!model) {
      model = "chat-bison";
    }
    let event = new EventEmitter();
    let res: any = {
      cost: 0,
      done: false,
      result: "",
      record: null,
      id: id || randomUUID(),
    };
    // get message that is message.role == "system"
    let message = messages.find((message) => message.role == "system");
    messages = messages.map((message) => {
      if (message.role != "system") {
        return {
          content: message.content,
          author: message.role == "user" ? "user" : "bot",
        };
      }
    });
    // filter messages that are not null
    messages = messages.filter((message) => message != null);
    const auth = new GoogleAuth({
      keyFilename: "./g-keyfile.json", // Path to your service account key file
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    event.emit("data", res);
    const client = await auth.getClient();
    let token: any = await client.getAccessToken();
    token = token.token;
    res.record = {
      input: {
        instances: [
          {
            context: message
              ? message.content
              : "You are PaLM 2 a AI chatbot created by Google.",
            messages: messages,
            examples: [],
          },
        ],
        parameters: {
          temperature: temperature || 0.2,
          maxOutputTokens: max_tokens || 250,
          topP: 0.8,
          topK: 40,
        },
      },
    };
    axios({
      method: "post",
      url: `https://us-central1-aiplatform.googleapis.com/v1/projects/turingai-4354f/locations/us-central1/publishers/google/models/${
        model == "chat-bison" ? "chat-bison@001" : "chat-bison@001"
      }:predict`,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      data: {
        instances: [
          {
            context: message
              ? message.content
              : "You are PaLM 2 a AI chatbot created by Google.",
            messages: messages,
            examples: [],
          },
        ],
        parameters: {
          temperature: temperature || 0.2,
          maxOutputTokens: max_tokens || 250,
          topP: 0.8,
          topK: 40,
        },
      },
    })
      .then((response) => {
        let cost = 0;
        let promptLength = getPromptLength(
          messages.map((message) => message.content).join(" ")
        );
        res.record = {
          ...res.record,
          output: response.data,
        };
        let result = response.data.predictions[0].candidates[0].content;
        res.result = result;
        let resultLength = getPromptLength(result);
        let pricePerK = 0.0003;
        cost = (promptLength + resultLength) * pricePerK;
        res.cost = cost;
        res.done = true;
        res = {
          ...res,
          ...response.data,
        };
        event.emit("data", res);
      })
      .catch((err) => {
        console.log(err.response.data.error);
        res.done = true;
        res.error = err.response.data.error;
      });

    return event;
  },
};
