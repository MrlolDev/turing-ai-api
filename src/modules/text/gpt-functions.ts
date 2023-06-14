import { Configuration, OpenAIApi } from "openai";
import googleAPI from "googlethis";
import { EventEmitter } from "events";
import axios from "axios";
import { fetchEventSource } from "@waylaidwanderer/fetch-event-source";
import yts from "yt-search";
import { get_encoding } from "@dqbd/tiktoken";
import { getChatMessageLength } from "./langchain.js";
export const encoder = get_encoding("cl100k_base");

export async function pluginsChat(config, plugins) {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const event = new EventEmitter();
  const openai = new OpenAIApi(configuration);
  let functions = [];
  let messages = config.messages;
  delete config.messages;
  let result = {
    result: "",
    done: false,
    tool: null,
    credits: 0,
  };

  for (let i = 0; i < plugins.length; i++) {
    let plugin = pluginList.find((p) => p.name === plugins[i]);
    if (plugin) {
      functions.push(plugin);
    }
  }
  event.emit("data", result);
  openai
    .createChatCompletion({
      ...config,
      messages: messages,
      functions: functions,
      function_call: "auto",
    })
    .then(async (completion) => {
      let message = completion.data.choices[0].message;
      let pricePerK = 0.002;
      if (config.model.includes("gpt-4")) pricePerK = 0.05;
      result.credits += (completion.data.usage.total_tokens / 1000) * pricePerK;
      if (message["function_call"]) {
        let functionName = message["function_call"]["name"];
        result.tool = functionName;
        event.emit("data", result);
        let pluginInfo = pluginList.find((p) => p.name === functionName);
        let args = JSON.parse(message["function_call"]["arguments"]);
        if (args[pluginInfo.parameters.required[0]]) {
          console.log(args);
          let pluginResponse = await pluginInfo.function(args);
          let body = {
            ...config,
            messages: [
              ...messages,
              {
                role: "function",
                name: functionName,
                content: JSON.stringify(pluginResponse),
              },
            ],
            stream: true,
          };
          await fetchEventSource("	https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify(body),
            onmessage: async (ev) => {
              let data: any = ev.data;
              if (data == "[DONE]") {
                result.done = true;
                result.credits +=
                  (getPromptLength(result.result) / 1000) * pricePerK;
                result.credits +=
                  (getChatMessageLength(messages) / 1000) * pricePerK;
                event.emit("data", result);
              } else {
                data = JSON.parse(data);
                if (data.choices[0].delta.content) {
                  result.result += data.choices[0].delta.content;
                }
                event.emit("data", result);
              }
            },
          });
        }
      } else {
        result.result = message.content;
        result.done = true;
        event.emit("data", result);
      }
    })
    .catch((err) => {
      console.log(JSON.stringify(err));
      result.done = true;
      event.emit("data", result);
    });
  return event;
}
export const getPromptLength = (content: string): number => {
  content = content
    .replaceAll("<|endoftext|>", "<|im_end|>")
    .replaceAll("<|endofprompt|>", "<|im_end|>");
  return encoder.encode(content).length;
};
let pluginList = [
  {
    name: "google",
    description:
      "Searches Google to get updated information from internet, based on the user query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "A very descriptive query for google search.",
        },
      },
      required: ["query"],
    },
    function: async (params) => {
      // use google-it
      const options = {
        page: 0,
        safe: false, // Safe Search
        parse_ads: false, // If set to true sponsored results will be parsed
        additional_params: {},
      };

      let response: any = await googleAPI.search(params.query, options);
      //  return first 2 results
      response.results = response.results.slice(0, 4);
      return response;
    },
  },
  {
    name: "youtube-search",
    description:
      "Searches youtube videos to display the most relevant videos based on the user query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "A very descriptive query for youtube search.",
        },
        count: {
          type: "number",
          description: "Number of videos to return. Default is 3",
        },
      },
      required: ["query"],
    },
    function: async (params) => {
      const r = await yts(params.query);
      let videos = r.videos.slice(0, params.count || 3);
      return videos;
    },
  },
  {
    name: "weather",
    description:
      "Get weather information for a specific location using open weather map.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            "Location for openweathermap to get weather information. It needs to be the name of a real location that openweathermap can find.",
        },
      },
      required: ["location"],
    },
    function: async (params) => {
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=${params.location}&appid=${process.env.OPEN_WEATHER}`
      );
      return response.data;
    },
  },
  {
    name: "wikipedia",
    description: "Get wikipedia information for a specific topic.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Topic to get wikipedia information.",
        },
      },
      required: ["topic"],
    },
    function: async (params) => {
      const response = await axios.get(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${params.topic}`
      );
      return response.data;
    },
  },
  {
    name: "tenor",
    description: "Get a gif from tenor based on a specific query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Query to get a gif from tenor.",
        },
      },
    },
    function: async (params) => {
      const response = await axios.get(
        `https://api.tenor.com/v1/search?q=${params.query}&key=${process.env.TENOR_KEY}`
      );
      return response.data;
    },
  },
  {
    name: "alphavantage-stocks",
    description:
      "Get stock information for a specific stock using alphavantage.",
    parameters: {
      type: "object",
      properties: {
        stock: {
          type: "string",
          description: "Stock symbol to get information from.",
        },
      },
      required: ["stock"],
    },
    function: async (params) => {
      const response = await axios.get(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${params.stock}&apikey=${process.env.ALPHA_VANTAGE}`
      );
      return response.data;
    },
  },
  {
    name: "alphavantage-crypto",
    description:
      "Get crypto information for a specific crypto using alphavantage.",
    parameters: {
      type: "object",
      properties: {
        from_currency: {
          type: "string",
          description: "Crypto symbol to get information from.",
        },
        to_currency: {
          type: "string",
          description: "Currency to convert crypto to.",
        },
      },
      required: ["from_currency"],
    },
    function: async (params) => {
      let to_currency = params.to_currency || "USD";
      const response = await axios.get(
        `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${params.from_currency}&to_currency=${to_currency}&apikey=${process.env.ALPHA_VANTAGE}`
      );
      return response.data;
    },
  },
  {
    name: "alphavantage-forex",
    description:
      "Get forex information for a specific forex using alphavantage.",
    parameters: {
      type: "object",
      properties: {
        from_currency: {
          type: "string",
          description: "Forex symbol to get information from.",
        },
        to_currency: {
          type: "string",
          description: "Currency to convert forex to.",
        },
      },
      required: ["from_currency"],
    },
    function: async (params) => {
      let to_currency = params.to_currency || "USD";
      const response = await axios.get(
        `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${params.from_currency}&to_currency=${to_currency}&apikey=${process.env.ALPHA_VANTAGE}`
      );
      return response.data;
    },
  },
  {
    name: "free-games",
    description: "Get free games from different platforms or categories.",
    parameters: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          description: "Platform to get free games from.",
        },
        category: {
          type: "string",
          description:
            "Category to get free games from. Complete list: mmorpg, shooter, strategy, moba, racing, sports, social, sandbox, open-world, survival, pvp, pve, pixel, voxel, zombie, turn-based, first-person, third-Person, top-down, tank, space, sailing, side-scroller, superhero, permadeath, card, battle-royale, mmo, mmofps, mmotps, 3d, 2d, anime, fantasy, sci-fi, fighting, action-rpg, action, military, martial-arts, flight, low-spec, tower-defense, horror, mmorts",
        },
      },
    },
    function: async (params) => {
      let platform = params.platform || "pc";
      let category = params.category || "mmorpg";
      const response = await axios.get(
        `https://www.freetogame.com/api/games?${
          params.platform ? `platform=${platform}` : ""
        }${params.category ? `&category=${category}` : ""}`
      );
      console.log(response.data);
      return response.data;
    },
  },
];
