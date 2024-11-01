const OpenAI = require('openai');
const { OllamaClient } = require('./OllamaClient');
const { HttpsProxyAgent } = require('https-proxy-agent');
const {
  Constants,
  ImageDetail,
  EModelEndpoint,
  resolveHeaders,
  ImageDetailCost,
  CohereConstants,
  getResponseSender,
  validateVisionModel,
  mapModelToAzureConfig,
} = require('librechat-data-provider');
const { encoding_for_model: encodingForModel, get_encoding: getEncoding } = require('tiktoken');
const {
  extractBaseURL,
  constructAzureURL,
  getModelMaxTokens,
  genAzureChatCompletion,
} = require('~/utils');
const {
  truncateText,
  formatMessage,
  CUT_OFF_PROMPT,
  titleInstruction,
  createContextHandlers,
} = require('./prompts');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { updateTokenWebsocket } = require('~/server/services/Files/Audio');
const { isEnabled, sleep } = require('~/server/utils');
const { handleOpenAIErrors } = require('./tools/util');
const spendTokens = require('~/models/spendTokens');
const { createLLM, RunManager } = require('./llm');
const ChatGPTClient = require('./ChatGPTClient');
const { summaryBuffer } = require('./memory');
const { runTitleChain } = require('./chains');
const { tokenSplit } = require('./document');
const BaseClient = require('./BaseClient');
const { logger } = require('~/config');

// Cache to store Tiktoken instances
const tokenizersCache = {};
// Counter for keeping track of the number of tokenizer calls
let tokenizerCallsCount = 0;

class OpenAIClient extends BaseClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.ChatGPTClient = new ChatGPTClient();
    this.buildPrompt = this.ChatGPTClient.buildPrompt.bind(this);
    /** @type {getCompletion} */
    this.getCompletion = this.ChatGPTClient.getCompletion.bind(this);
    /** @type {cohereChatCompletion} */
    this.cohereChatCompletion = this.ChatGPTClient.cohereChatCompletion.bind(this);
    this.contextStrategy = options.contextStrategy
      ? options.contextStrategy.toLowerCase()
      : 'discard';
    this.shouldSummarize = this.contextStrategy === 'summarize';
    /** @type {AzureOptions} */
    this.azure = options.azure || false;
    this.setOptions(options);
    this.metadata = {};

    /** @type {string | undefined} - The API Completions URL */
    this.completionsUrl;
  }

  // TODO: PluginsClient calls this 3x, unneeded
  setOptions(options) {
    if (this.options && !this.options.replaceOptions) {
      this.options.modelOptions = {
        ...this.options.modelOptions,
        ...options.modelOptions,
      };
      delete options.modelOptions;
      this.options = {
        ...this.options,
        ...options,
      };
    } else {
      this.options = options;
    }

    if (this.options.openaiApiKey) {
      this.apiKey = this.options.openaiApiKey;
    }

    const modelOptions = this.options.modelOptions || {};

    if (!this.modelOptions) {
      this.modelOptions = {
        ...modelOptions,
        model: modelOptions.model || 'gpt-3.5-turbo',
        temperature:
          typeof modelOptions.temperature === 'undefined' ? 0.8 : modelOptions.temperature,
        top_p: typeof modelOptions.top_p === 'undefined' ? 1 : modelOptions.top_p,
        presence_penalty:
          typeof modelOptions.presence_penalty === 'undefined' ? 1 : modelOptions.presence_penalty,
        stop: modelOptions.stop,
      };
    } else {
      // Update the modelOptions if it already exists
      this.modelOptions = {
        ...this.modelOptions,
        ...modelOptions,
      };
    }

    this.defaultVisionModel = this.options.visionModel ?? 'gpt-4-vision-preview';
    if (typeof this.options.attachments?.then === 'function') {
      this.options.attachments.then((attachments) => this.checkVisionRequest(attachments));
    } else {
      this.checkVisionRequest(this.options.attachments);
    }

    const { OPENROUTER_API_KEY, OPENAI_FORCE_PROMPT } = process.env ?? {};
    if (OPENROUTER_API_KEY && !this.azure) {
      this.apiKey = OPENROUTER_API_KEY;
      this.useOpenRouter = true;
    }

    const { reverseProxyUrl: reverseProxy } = this.options;

    if (
      !this.useOpenRouter &&
      reverseProxy &&
      reverseProxy.includes('https://openrouter.ai/api/v1')
    ) {
      this.useOpenRouter = true;
    }

    if (this.options.endpoint?.toLowerCase() === 'ollama') {
      this.isOllama = true;
    }

    this.FORCE_PROMPT =
      isEnabled(OPENAI_FORCE_PROMPT) ||
      (reverseProxy && reverseProxy.includes('completions') && !reverseProxy.includes('chat'));

    if (typeof this.options.forcePrompt === 'boolean') {
      this.FORCE_PROMPT = this.options.forcePrompt;
    }

    if (this.azure && process.env.AZURE_OPENAI_DEFAULT_MODEL) {
      this.azureEndpoint = genAzureChatCompletion(this.azure, this.modelOptions.model, this);
      this.modelOptions.model = process.env.AZURE_OPENAI_DEFAULT_MODEL;
    } else if (this.azure) {
      this.azureEndpoint = genAzureChatCompletion(this.azure, this.modelOptions.model, this);
    }

    const { model } = this.modelOptions;

    this.isChatCompletion = this.useOpenRouter || !!reverseProxy || model.includes('gpt');
    this.isChatGptModel = this.isChatCompletion;
    if (
      model.includes('text-davinci') ||
      model.includes('gpt-3.5-turbo-instruct') ||
      this.FORCE_PROMPT
    ) {
      this.isChatCompletion = false;
      this.isChatGptModel = false;
    }
    const { isChatGptModel } = this;
    this.isUnofficialChatGptModel =
      model.startsWith('text-chat') || model.startsWith('text-davinci-002-render');

    this.maxContextTokens =
      this.options.maxContextTokens ??
      getModelMaxTokens(
        model,
        this.options.endpointType ?? this.options.endpoint,
        this.options.endpointTokenConfig,
      ) ??
      4095; // 1 less than maximum

    if (this.shouldSummarize) {
      this.maxContextTokens = Math.floor(this.maxContextTokens / 2);
    }

    if (this.options.debug) {
      logger.debug('[OpenAIClient] maxContextTokens', this.maxContextTokens);
    }

    this.maxResponseTokens = this.modelOptions.max_tokens || 1024;
    this.maxPromptTokens =
      this.options.maxPromptTokens || this.maxContextTokens - this.maxResponseTokens;

    if (this.maxPromptTokens + this.maxResponseTokens > this.maxContextTokens) {
      throw new Error(
        `maxPromptTokens + max_tokens (${this.maxPromptTokens} + ${this.maxResponseTokens} = ${
          this.maxPromptTokens + this.maxResponseTokens
        }) must be less than or equal to maxContextTokens (${this.maxContextTokens})`,
      );
    }

    this.sender =
      this.options.sender ??
      getResponseSender({
        model: this.modelOptions.model,
        endpoint: this.options.endpoint,
        endpointType: this.options.endpointType,
        chatGptLabel: this.options.chatGptLabel,
        modelDisplayLabel: this.options.modelDisplayLabel,
      });

    this.userLabel = this.options.userLabel || 'User';
    this.chatGptLabel = this.options.chatGptLabel || 'Assistant';

    this.setupTokens();

    if (reverseProxy) {
      this.completionsUrl = reverseProxy;
      this.langchainProxy = extractBaseURL(reverseProxy);
    } else if (isChatGptModel) {
      this.completionsUrl = 'https://api.openai.com/v1/chat/completions';
    } else {
      this.completionsUrl = 'https://api.openai.com/v1/completions';
    }

    if (this.azureEndpoint) {
      this.completionsUrl = this.azureEndpoint;
    }

    if (this.azureEndpoint && this.options.debug) {
      logger.debug('Using Azure endpoint');
    }

    if (this.useOpenRouter) {
      this.completionsUrl = 'https://openrouter.ai/api/v1/chat/completions';
    }

    return this;
  }

  /**
   *
   * Checks if the model is a vision model based on request attachments and sets the appropriate options:
   * - Sets `this.modelOptions.model` to `gpt-4-vision-preview` if the request is a vision request.
   * - Sets `this.isVisionModel` to `true` if vision request.
   * - Deletes `this.modelOptions.stop` if vision request.
   * @param {MongoFile[]} attachments
   */
  checkVisionRequest(attachments) {
    if (!attachments) {
      return;
    }

    const availableModels = this.options.modelsConfig?.[this.options.endpoint];
    if (!availableModels) {
      return;
    }

    let visionRequestDetected = false;
    for (const file of attachments) {
      if (file?.type?.includes('image')) {
        visionRequestDetected = true;
        break;
      }
    }
    if (!visionRequestDetected) {
      return;
    }

    this.isVisionModel = validateVisionModel({ model: this.modelOptions.model, availableModels });
    if (this.isVisionModel) {
      delete this.modelOptions.stop;
      return;
    }

    for (const model of availableModels) {
      if (!validateVisionModel({ model, availableModels })) {
        continue;
      }
      this.modelOptions.model = model;
      this.isVisionModel = true;
      delete this.modelOptions.stop;
      return;
    }

    if (!availableModels.includes(this.defaultVisionModel)) {
      return;
    }
    if (!validateVisionModel({ model: this.defaultVisionModel, availableModels })) {
      return;
    }

    this.modelOptions.model = this.defaultVisionModel;
    this.isVisionModel = true;
    delete this.modelOptions.stop;
  }

  setupTokens() {
    if (this.isChatCompletion) {
      this.startToken = '||>';
      this.endToken = '';
    } else if (this.isUnofficialChatGptModel) {
      this.startToken = '<|im_start|>';
      this.endToken = '<|im_end|>';
    } else {
      this.startToken = '||>';
      this.endToken = '';
    }
  }

  // Selects an appropriate tokenizer based on the current configuration of the client instance.
  // It takes into account factors such as whether it's a chat completion, an unofficial chat GPT model, etc.
  selectTokenizer() {
    let tokenizer;
    this.encoding = 'text-davinci-003';
    if (this.isChatCompletion) {
      this.encoding = this.modelOptions.model.includes('gpt-4o') ? 'o200k_base' : 'cl100k_base';
      tokenizer = this.constructor.getTokenizer(this.encoding);
    } else if (this.isUnofficialChatGptModel) {
      const extendSpecialTokens = {
        '<|im_start|>': 100264,
        '<|im_end|>': 100265,
      };
      tokenizer = this.constructor.getTokenizer(this.encoding, true, extendSpecialTokens);
    } else {
      try {
        const { model } = this.modelOptions;
        this.encoding = model.includes('instruct') ? 'text-davinci-003' : model;
        tokenizer = this.constructor.getTokenizer(this.encoding, true);
      } catch {
        tokenizer = this.constructor.getTokenizer('text-davinci-003', true);
      }
    }

    return tokenizer;
  }

  // Retrieves a tokenizer either from the cache or creates a new one if one doesn't exist in the cache.
  // If a tokenizer is being created, it's also added to the cache.
  static getTokenizer(encoding, isModelName = false, extendSpecialTokens = {}) {
    let tokenizer;
    if (tokenizersCache[encoding]) {
      tokenizer = tokenizersCache[encoding];
    } else {
      if (isModelName) {
        tokenizer = encodingForModel(encoding, extendSpecialTokens);
      } else {
        tokenizer = getEncoding(encoding, extendSpecialTokens);
      }
      tokenizersCache[encoding] = tokenizer;
    }
    return tokenizer;
  }

  // Frees all encoders in the cache and resets the count.
  static freeAndResetAllEncoders() {
    try {
      Object.keys(tokenizersCache).forEach((key) => {
        if (tokenizersCache[key]) {
          tokenizersCache[key].free();
          delete tokenizersCache[key];
        }
      });
      // Reset count
      tokenizerCallsCount = 1;
    } catch (error) {
      logger.error('[OpenAIClient] Free and reset encoders error', error);
    }
  }

  // Checks if the cache of tokenizers has reached a certain size. If it has, it frees and resets all tokenizers.
  resetTokenizersIfNecessary() {
    if (tokenizerCallsCount >= 25) {
      if (this.options.debug) {
        logger.debug('[OpenAIClient] freeAndResetAllEncoders: reached 25 encodings, resetting...');
      }
      this.constructor.freeAndResetAllEncoders();
    }
    tokenizerCallsCount++;
  }

  /**
   * Returns the token count of a given text. It also checks and resets the tokenizers if necessary.
   * @param {string} text - The text to get the token count for.
   * @returns {number} The token count of the given text.
   */
  getTokenCount(text) {
    this.resetTokenizersIfNecessary();
    try {
      const tokenizer = this.selectTokenizer();
      return tokenizer.encode(text, 'all').length;
    } catch (error) {
      this.constructor.freeAndResetAllEncoders();
      const tokenizer = this.selectTokenizer();
      return tokenizer.encode(text, 'all').length;
    }
  }

  /**
   * Calculate the token cost for an image based on its dimensions and detail level.
   *
   * @param {Object} image - The image object.
   * @param {number} image.width - The width of the image.
   * @param {number} image.height - The height of the image.
   * @param {'low'|'high'|string|undefined} [image.detail] - The detail level ('low', 'high', or other).
   * @returns {number} The calculated token cost.
   */
  calculateImageTokenCost({ width, height, detail }) {
    if (detail === 'low') {
      return ImageDetailCost.LOW;
    }

    // Calculate the number of 512px squares
    const numSquares = Math.ceil(width / 512) * Math.ceil(height / 512);

    // Default to high detail cost calculation
    return numSquares * ImageDetailCost.HIGH + ImageDetailCost.ADDITIONAL;
  }

  getSaveOptions() {
    return {
      maxContextTokens: this.options.maxContextTokens,
      chatGptLabel: this.options.chatGptLabel,
      promptPrefix: this.options.promptPrefix,
      resendFiles: this.options.resendFiles,
      imageDetail: this.options.imageDetail,
      iconURL: this.options.iconURL,
      greeting: this.options.greeting,
      toxicityCheckbox: this.options.toxicityCheckbox,
      consistencyCheckbox: this.options.consistencyCheckbox,
      factualityCheckbox: this.options.factualityCheckbox,
      injectCheckbox: this.options.injectCheckbox,
      piiCheckbox: this.options.piiCheckbox,
      factualityText: this.options.factualityText,
      fullDocCheckbox: this.options.fullDocCheckbox,
      spec: this.options.spec,
      ...this.modelOptions,
    };
  }

  getBuildMessagesOptions(opts) {
    return {
      isChatCompletion: this.isChatCompletion,
      promptPrefix: opts.promptPrefix,
      abortController: opts.abortController,
    };
  }

  /**
   *
   * Adds image URLs to the message object and returns the files
   *
   * @param {TMessage[]} messages
   * @param {MongoFile[]} files
   * @returns {Promise<MongoFile[]>}
   */
  async addImageURLs(message, attachments) {
    const { files, image_urls } = await encodeAndFormat(
      this.options.req,
      attachments,
      this.options.endpoint,
    );
    message.image_urls = image_urls.length ? image_urls : undefined;
    return files;
  }

  async buildMessages(
    messages,
    parentMessageId,
    { isChatCompletion = false, promptPrefix = null },
    opts,
  ) {
    let orderedMessages = this.constructor.getMessagesForConversation({
      messages,
      parentMessageId,
      summary: this.shouldSummarize,
    });
  
    if (!isChatCompletion) {
      return await this.buildPrompt(orderedMessages, {
        isChatGptModel: isChatCompletion,
        promptPrefix,
      });
    }
  
    let payload;
    let instructions;
    let tokenCountMap;
    let promptTokens;
  
    //Adding Safety Prompt - PG Code
let safetyPrompt = process.env.SAFETY_PROMPT;

// Adding Safety Prompt - PG Code
if (safetyPrompt) {
  promptPrefix = ((promptPrefix || this.options.promptPrefix || '').trim() + ' ' + safetyPrompt);
} else {
  promptPrefix = (promptPrefix || this.options.promptPrefix || '').trim();
}


  
    // Attachments handling
    if (this.options.attachments) {
      const attachments = await this.options.attachments;
  
      if (this.message_file_map) {
        this.message_file_map[orderedMessages[orderedMessages.length - 1].messageId] = attachments;
      } else {
        this.message_file_map = {
          [orderedMessages[orderedMessages.length - 1].messageId]: attachments,
        };
      }
  
      const files = await this.addImageURLs(
        orderedMessages[orderedMessages.length - 1],
        attachments,
      );
  
      this.options.attachments = files;
    }
  
    
//Conditionally Turn on Send Full File - PG Code
    if (this.message_file_map) {
      this.contextHandlers = createContextHandlers(
        this.options.req,
        orderedMessages[orderedMessages.length - 1].text, `${this.options.fullDocCheckbox}`
      );
    }
  
    // **Step 1: Calculate token counts without formatting**
    orderedMessages.forEach((message, i) => {
      const formattedMessage = formatMessage({
        message,
        userName: this.options?.name,
        assistantName: this.options?.chatGptLabel,
      });
  
      const needsTokenCount = this.contextStrategy && !message.tokenCount;
  
      if (needsTokenCount || (this.isVisionModel && (message.image_urls || message.files))) {
        message.tokenCount = this.getTokenCountForMessage(formattedMessage);
      }
  
      if (this.message_file_map && this.message_file_map[message.messageId]) {
        const attachments = this.message_file_map[message.messageId];
        for (const file of attachments) {
          if (file.embedded) {
            this.contextHandlers?.processFile(file);
            continue;
          }
  
          message.tokenCount += this.calculateImageTokenCost({
            width: file.width,
            height: file.height,
            detail: this.options.imageDetail ?? ImageDetail.auto,
          });
        }
      }
    });


//     // **Step 2: Calculate total tokens and apply truncation if needed**

//     const conservativeLimit = Math.floor(maxTokens * 0.91);
//  // Apply a leeway
//     let totalTokens = promptPrefix ? this.getTokenCountForMessage({ content: promptPrefix }) : 0;
  
//     totalTokens += orderedMessages.reduce((count, message) => {
//       return count + message.tokenCount;
//     }, 0);
  
//     // Truncate messages if total tokens exceed the conservative limit
//     const truncatedMessages = [];
//     while (totalTokens > conservativeLimit && orderedMessages.length > 1) {
//       const removedMessage = orderedMessages.shift();
//       totalTokens -= removedMessage.tokenCount;
//       truncatedMessages.push(removedMessage);
//     }
  


//     if (totalTokens > this.options.maxContextTokens) {
//       throw new Error(
//         `Total tokens still exceed the limit after truncation: ${totalTokens}, Max allowed tokens: ${conservativeLimit}`,
//       );
//     }
  
//     if (truncatedMessages.length > 0) {
//       truncatedMessages.forEach((message, index) => {
//         console.log(`Truncated message ${index + 1}:`, message);
//       });
//     }
  
    // **Step 3: Format messages after truncation**
    const formattedMessages = orderedMessages.map((message) => {
      return formatMessage({
        message,
        userName: this.options?.name,
        assistantName: this.options?.chatGptLabel,
      });
    });
  
    // If there is a context handler, create augmented prompt
    if (this.contextHandlers) {
      this.augmentedPrompt = await this.contextHandlers.createContext();
      promptPrefix = this.augmentedPrompt + promptPrefix;
    }
  
    if (promptPrefix) {
      promptPrefix = `Instructions:\n${promptPrefix.trim()}`;
      instructions = {
        role: 'system',
        name: 'instructions',
        content: promptPrefix,
      };
  
      const wordCount = promptPrefix.trim().split(/\s+/).length;
console.log(wordCount);
      if (this.contextStrategy) {
        instructions.tokenCount = this.getTokenCountForMessage(instructions);
      }
    }


  
    // Handle context strategy
    if (this.contextStrategy) {
      ({
        payload,
        tokenCountMap,
        promptTokens,
        messages,
      } = await this.handleContextStrategy({
        instructions,
        orderedMessages,
        formattedMessages,
      }));
    }
  
    const result = {
      prompt: payload,
      promptTokens,
      messages,
    };
  
    if (tokenCountMap) {
      tokenCountMap.instructions = instructions?.tokenCount;
      result.tokenCountMap = tokenCountMap;
    }
  
    if (promptTokens >= 0 && typeof opts?.getReqData === 'function') {
      opts.getReqData({ promptTokens });
    }
    // console.log(this.options.maxContextTokens,conservativeLimit,totalTokens)
    console.log("result:", result)
    return result;
  }
  
  
  /** @type {sendCompletion} */
  async sendCompletion(payload, opts = {}) {
    let reply = '';
    let result = null;
    let streamResult = null;
    this.modelOptions.user = this.user;
    const invalidBaseUrl = this.completionsUrl && extractBaseURL(this.completionsUrl) === null;
    const useOldMethod = !!(invalidBaseUrl || !this.isChatCompletion);
    if (typeof opts.onProgress === 'function' && useOldMethod) {
      const completionResult = await this.getCompletion(
        payload,
        (progressMessage) => {
          if (progressMessage === '[DONE]') {
            updateTokenWebsocket('[DONE]');
            return;
          }

          if (progressMessage.choices) {
            streamResult = progressMessage;
          }

          let token = null;
          if (this.isChatCompletion) {
            token =
              progressMessage.choices?.[0]?.delta?.content ?? progressMessage.choices?.[0]?.text;
          } else {
            token = progressMessage.choices?.[0]?.text;
          }

          if (!token && this.useOpenRouter) {
            token = progressMessage.choices?.[0]?.message?.content;
          }
          // first event's delta content is always undefined
          if (!token) {
            return;
          }

          if (token === this.endToken) {
            return;
          }
          opts.onProgress(token);
          reply += token;
        },
        opts.onProgress,
        opts.abortController || new AbortController(),
      );

      if (completionResult && typeof completionResult === 'string') {
        reply = completionResult;
      }
    } else if (typeof opts.onProgress === 'function' || this.options.useChatCompletion) {
      reply = await this.chatCompletion({
        payload,
        onProgress: opts.onProgress,
        abortController: opts.abortController,
      });
    } else {
      result = await this.getCompletion(
        payload,
        null,
        opts.onProgress,
        opts.abortController || new AbortController(),
      );

      if (result && typeof result === 'string') {
        return result.trim();
      }

      logger.debug('[OpenAIClient] sendCompletion: result', result);

      if (this.isChatCompletion) {
        reply = result.choices[0].message.content;
      } else {
        reply = result.choices[0].text.replace(this.endToken, '');
      }
    }

    if (streamResult) {
      const { finish_reason } = streamResult.choices[0];
      this.metadata = { finish_reason };
    }
    return (reply ?? '').trim();
  }


  initializeLLM({
    model = 'gpt-3.5-turbo',
    modelName,
    temperature = 0.2,
    presence_penalty = 0,
    frequency_penalty = 0,
    max_tokens,
    streaming,
    context,
    tokenBuffer,
    initialMessageCount,
    conversationId,
    toxicityCheckbox,
    consistencyCheckbox,
    factualityCheckbox,
    factualityText,
    injectCheckbox,
    piiCheckbox,
    fullDocCheckbox,
  }) {
    const modelOptions = {
      modelName: modelName ?? model,
      temperature,
      presence_penalty,
      frequency_penalty,
      user: this.user,
      toxicityCheckbox,
      consistencyCheckbox,
      factualityCheckbox,
      injectCheckbox,
      fullDocCheckbox,
      piiCheckbox,
      factualityText,
      max_tokens,
    };

    if (max_tokens) {
      modelOptions.max_tokens = max_tokens;
    }

    const configOptions = {};

    if (this.langchainProxy) {
      configOptions.basePath = this.langchainProxy;
    }

    if (this.useOpenRouter) {
      configOptions.basePath = 'https://openrouter.ai/api/v1';
      configOptions.baseOptions = {
        headers: {
          'HTTP-Referer': 'https://librechat.ai',
          'X-Title': 'LibreChat',
        },
      };
    }

    const { headers } = this.options;
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      configOptions.baseOptions = {
        headers: resolveHeaders({
          ...headers,
          ...configOptions?.baseOptions?.headers,
        }),
      };
    }

    if (this.options.proxy) {
      configOptions.httpAgent = new HttpsProxyAgent(this.options.proxy);
      configOptions.httpsAgent = new HttpsProxyAgent(this.options.proxy);
    }

    const { req, res, debug } = this.options;
    const runManager = new RunManager({ req, res, debug, abortController: this.abortController });
    this.runManager = runManager;

    const llm = createLLM({
      modelOptions,
      configOptions,
      openAIApiKey: this.apiKey,
      azure: this.azure,
      streaming,
      callbacks: runManager.createCallbacks({
        context,
        tokenBuffer,
        conversationId: this.conversationId ?? conversationId,
        initialMessageCount,
      }),
    });

    return llm;
  }

  /**
   * Generates a concise title for a conversation based on the user's input text and response.
   * Uses either specified method or starts with the OpenAI `functions` method (using LangChain).
   * If the `functions` method fails, it falls back to the `completion` method,
   * which involves sending a chat completion request with specific instructions for title generation.
   *
   * @param {Object} params - The parameters for the conversation title generation.
   * @param {string} params.text - The user's input.
   * @param {string} [params.conversationId] - The current conversationId, if not already defined on client initialization.
   * @param {string} [params.responseText=''] - The AI's immediate response to the user.
   *
   * @returns {Promise<string | 'New Chat'>} A promise that resolves to the generated conversation title.
   *                            In case of failure, it will return the default title, "New Chat".
   */
  async titleConvo({ text, conversationId, responseText = '' }) {
    this.conversationId = conversationId;

    if (this.options.attachments) {
      delete this.options.attachments;
    }

    let title = 'New Chat';
    const convo = `||>User:
"${truncateText(text)}"
||>Response:
"${JSON.stringify(truncateText(responseText))}"`;

    const { OPENAI_TITLE_MODEL } = process.env ?? {};

    let model = this.options.titleModel ?? OPENAI_TITLE_MODEL ?? 'gpt-3.5-turbo';
    if (model === Constants.CURRENT_MODEL) {
      model = this.modelOptions.model;
    }

    const modelOptions = {
      // TODO: remove the gpt fallback and make it specific to endpoint
      model,
      temperature: 0.2,
      presence_penalty: 0,
      frequency_penalty: 0,
      max_tokens: 16,
    };

    /** @type {TAzureConfig | undefined} */
    const azureConfig = this.options?.req?.app?.locals?.[EModelEndpoint.azureOpenAI];

    const resetTitleOptions = !!(
      (this.azure && azureConfig) ||
      (azureConfig && this.options.endpoint === EModelEndpoint.azureOpenAI)
    );

    if (resetTitleOptions) {
      const { modelGroupMap, groupMap } = azureConfig;
      const {
        azureOptions,
        baseURL,
        headers = {},
        serverless,
      } = mapModelToAzureConfig({
        modelName: modelOptions.model,
        modelGroupMap,
        groupMap,
      });

      this.options.headers = resolveHeaders(headers);
      this.options.reverseProxyUrl = baseURL ?? null;
      this.langchainProxy = extractBaseURL(this.options.reverseProxyUrl);
      this.apiKey = azureOptions.azureOpenAIApiKey;

      const groupName = modelGroupMap[modelOptions.model].group;
      this.options.addParams = azureConfig.groupMap[groupName].addParams;
      this.options.dropParams = azureConfig.groupMap[groupName].dropParams;
      this.options.forcePrompt = azureConfig.groupMap[groupName].forcePrompt;
      this.azure = !serverless && azureOptions;
    }

    const titleChatCompletion = async () => {
      modelOptions.model = model;

      if (this.azure) {
        modelOptions.model = process.env.AZURE_OPENAI_DEFAULT_MODEL ?? modelOptions.model;
        this.azureEndpoint = genAzureChatCompletion(this.azure, modelOptions.model, this);
      }

      const instructionsPayload = [
        {
          role: this.options.titleMessageRole ?? 'system',
          content: `Please generate ${titleInstruction}

${convo}

||>Title:`,
        },
      ];

      const promptTokens = this.getTokenCountForMessage(instructionsPayload[0]);

      try {
        let useChatCompletion = true;

        if (this.options.reverseProxyUrl === CohereConstants.API_URL) {
          useChatCompletion = false;
        }

        title = (
          await this.sendPayload(instructionsPayload, { modelOptions, useChatCompletion })
        ).replaceAll('"', '');

        const completionTokens = this.getTokenCount(title);

        this.recordTokenUsage({ promptTokens, completionTokens, context: 'title' });
      } catch (e) {
        logger.error(
          '[OpenAIClient] There was an issue generating the title with the completion method',
          e,
        );
      }
    };

    function formatText(text) {
      // Remove non-word characters
      text = text.replace(/[^\w\s]/g, '');

      // Check if text has more than 5 words
      if (text.split(' ').length > 5) {
        // If so, truncate to the first 5 words
        text = text.split(' ').splice(0, 5).join(' ');
      }

      // Capitalize the first letter of each word
      text = text
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      return text;
    }

    if (this.options.titleMethod === 'completion') {
      await titleChatCompletion();
      logger.debug('[OpenAIClient] Convo Title: ' + title);
      return formatText(title);
    }

    try {
      this.abortController = new AbortController();
      const llm = this.initializeLLM({
        ...modelOptions,
        conversationId,
        context: 'title',
        tokenBuffer: 150,
      });

      title = await runTitleChain({ llm, text, convo, signal: this.abortController.signal });
    } catch (e) {
      if (e?.message?.toLowerCase()?.includes('abort')) {
        logger.debug('[OpenAIClient] Aborted title generation');
        return;
      }
      logger.error(
        '[OpenAIClient] There was an issue generating title with LangChain, trying completion method...',
        e,
      );

      await titleChatCompletion();
    }

    logger.debug('[OpenAIClient] Convo Title: ' + title);
    return title;
  }

  async summarizeMessages({ messagesToRefine, remainingContextTokens }) {
    logger.debug('[OpenAIClient] Summarizing messages...');
    let context = messagesToRefine;
    let prompt;

    // TODO: remove the gpt fallback and make it specific to endpoint
    const { OPENAI_SUMMARY_MODEL = 'gpt-3.5-turbo' } = process.env ?? {};
    let model = this.options.summaryModel ?? OPENAI_SUMMARY_MODEL;
    if (model === Constants.CURRENT_MODEL) {
      model = this.modelOptions.model;
    }

    const maxContextTokens =
      getModelMaxTokens(
        model,
        this.options.endpointType ?? this.options.endpoint,
        this.options.endpointTokenConfig,
      ) ?? 4095; // 1 less than maximum

    // 3 tokens for the assistant label, and 98 for the summarizer prompt (101)
    let promptBuffer = 101;

    /*
     * Note: token counting here is to block summarization if it exceeds the spend; complete
     * accuracy is not important. Actual spend will happen after successful summarization.
     */
    const excessTokenCount = context.reduce(
      (acc, message) => acc + message.tokenCount,
      promptBuffer,
    );

    if (excessTokenCount > maxContextTokens) {
      ({ context } = await this.getMessagesWithinTokenLimit(context, maxContextTokens));
    }

    if (context.length === 0) {
      logger.debug(
        '[OpenAIClient] Summary context is empty, using latest message within token limit',
      );

      promptBuffer = 32;
      const { text, ...latestMessage } = messagesToRefine[messagesToRefine.length - 1];
      const splitText = await tokenSplit({
        text,
        chunkSize: Math.floor((maxContextTokens - promptBuffer) / 3),
      });

      const newText = `${splitText[0]}\n...[truncated]...\n${splitText[splitText.length - 1]}`;
      prompt = CUT_OFF_PROMPT;

      context = [
        formatMessage({
          message: {
            ...latestMessage,
            text: newText,
          },
          userName: this.options?.name,
          assistantName: this.options?.chatGptLabel,
        }),
      ];
    }
    // TODO: We can accurately count the tokens here before handleChatModelStart
    // by recreating the summary prompt (single message) to avoid LangChain handling

    const initialPromptTokens = this.maxContextTokens - remainingContextTokens;
    logger.debug('[OpenAIClient] initialPromptTokens', initialPromptTokens);

    const llm = this.initializeLLM({
      model,
      temperature: 0.2,
      context: 'summary',
      tokenBuffer: initialPromptTokens,
    });

    try {
      const summaryMessage = await summaryBuffer({
        llm,
        debug: this.options.debug,
        prompt,
        context,
        formatOptions: {
          userName: this.options?.name,
          assistantName: this.options?.chatGptLabel ?? this.options?.modelLabel,
        },
        previous_summary: this.previous_summary?.summary,
        signal: this.abortController.signal,
      });

      const summaryTokenCount = this.getTokenCountForMessage(summaryMessage);

      if (this.options.debug) {
        logger.debug('[OpenAIClient] summaryTokenCount', summaryTokenCount);
        logger.debug(
          `[OpenAIClient] Summarization complete: remainingContextTokens: ${remainingContextTokens}, after refining: ${
            remainingContextTokens - summaryTokenCount
          }`,
        );
      }

      return { summaryMessage, summaryTokenCount };
    } catch (e) {
      if (e?.message?.toLowerCase()?.includes('abort')) {
        logger.debug('[OpenAIClient] Aborted summarization');
        const { run, runId } = this.runManager.getRunByConversationId(this.conversationId);
        if (run && run.error) {
          const { error } = run;
          this.runManager.removeRun(runId);
          throw new Error(error);
        }
      }
      logger.error('[OpenAIClient] Error summarizing messages', e);
      return {};
    }
  }

  async recordTokenUsage({ promptTokens, completionTokens, context = 'message' }) {
    await spendTokens(
      {
        context,
        model: this.modelOptions.model,
        conversationId: this.conversationId,
        user: this.user ?? this.options.req.user?.id,
        endpointTokenConfig: this.options.endpointTokenConfig,
      },
      { promptTokens, completionTokens },
    );
  }

  getTokenCountForResponse(response) {
    return this.getTokenCountForMessage({
      role: 'assistant',
      content: response.text,
    });
  }

  async chatCompletion({ payload, onProgress, abortController = null }) {
    let error = null;
    const errorCallback = (err) => (error = err);
    let intermediateReply = '';
    try {
      if (!abortController) {
        abortController = new AbortController();
      }

      let modelOptions = { ...this.modelOptions };

      if (typeof onProgress === 'function') {
        modelOptions.stream = true;
      }
      if (this.isChatCompletion) {
        modelOptions.messages = payload;
      } else {
        modelOptions.prompt = payload;
      }

      const baseURL = extractBaseURL(this.completionsUrl);
      logger.debug('[OpenAIClient] chatCompletion', { baseURL, modelOptions });
      const opts = {
        baseURL,
      };

      if (this.useOpenRouter) {
        opts.defaultHeaders = {
          'HTTP-Referer': 'https://librechat.ai',
          'X-Title': 'LibreChat',
        };
      }

      if (this.options.headers) {
        opts.defaultHeaders = { ...opts.defaultHeaders, ...this.options.headers };
      }

      if (this.options.proxy) {
        opts.httpAgent = new HttpsProxyAgent(this.options.proxy);
      }

      if (this.isVisionModel) {
        modelOptions.max_tokens = 4000;
      }

      /** @type {TAzureConfig | undefined} */
      const azureConfig = this.options?.req?.app?.locals?.[EModelEndpoint.azureOpenAI];

      if (
        (this.azure && this.isVisionModel && azureConfig) ||
        (azureConfig && this.isVisionModel && this.options.endpoint === EModelEndpoint.azureOpenAI)
      ) {
        const { modelGroupMap, groupMap } = azureConfig;
        const {
          azureOptions,
          baseURL,
          headers = {},
          serverless,
        } = mapModelToAzureConfig({
          modelName: modelOptions.model,
          modelGroupMap,
          groupMap,
        });
        opts.defaultHeaders = resolveHeaders(headers);
        this.langchainProxy = extractBaseURL(baseURL);
        this.apiKey = azureOptions.azureOpenAIApiKey;

        const groupName = modelGroupMap[modelOptions.model].group;
        this.options.addParams = azureConfig.groupMap[groupName].addParams;
        this.options.dropParams = azureConfig.groupMap[groupName].dropParams;
        // Note: `forcePrompt` not re-assigned as only chat models are vision models

        this.azure = !serverless && azureOptions;
        this.azureEndpoint =
          !serverless && genAzureChatCompletion(this.azure, modelOptions.model, this);
      }

      if (this.azure || this.options.azure) {
        /* Azure Bug, extremely short default `max_tokens` response */
        if (!modelOptions.max_tokens && modelOptions.model === 'gpt-4-vision-preview') {
          modelOptions.max_tokens = 4000;
        }

        /* Azure does not accept `model` in the body, so we need to remove it. */
        delete modelOptions.model;

        opts.baseURL = this.langchainProxy
          ? constructAzureURL({
            baseURL: this.langchainProxy,
            azureOptions: this.azure,
          })
          : this.azureEndpoint.split(/(?<!\/)\/(chat|completion)\//)[0];

        opts.defaultQuery = { 'api-version': this.azure.azureOpenAIApiVersion };
        opts.defaultHeaders = { ...opts.defaultHeaders, 'api-key': this.apiKey };
      }

      if (process.env.OPENAI_ORGANIZATION) {
        opts.organization = process.env.OPENAI_ORGANIZATION;
      }

      let chatCompletion;
      /** @type {OpenAI} */
      const openai = new OpenAI({
        fetch: this.fetch,
        apiKey: this.apiKey,
        ...opts,
      });

      /* Re-orders system message to the top of the messages payload, as not allowed anywhere else */
      if (modelOptions.messages && (opts.baseURL.includes('api.mistral.ai') || this.isOllama)) {
        const { messages } = modelOptions;

        const systemMessageIndex = messages.findIndex((msg) => msg.role === 'system');

        if (systemMessageIndex > 0) {
          const [systemMessage] = messages.splice(systemMessageIndex, 1);
          messages.unshift(systemMessage);
        }

        modelOptions.messages = messages;
      }

      /* If there is only one message and it's a system message, change the role to user */
      if (
        (opts.baseURL.includes('api.mistral.ai') || opts.baseURL.includes('api.perplexity.ai')) &&
        modelOptions.messages &&
        modelOptions.messages.length === 1 &&
        modelOptions.messages[0]?.role === 'system'
      ) {
        modelOptions.messages[0].role = 'user';
      }

      if (this.options.addParams && typeof this.options.addParams === 'object') {
        modelOptions = {
          ...modelOptions,
          ...this.options.addParams,
        };
        logger.debug('[OpenAIClient] chatCompletion: added params', {
          addParams: this.options.addParams,
          modelOptions,
        });
      }

      if (this.options.dropParams && Array.isArray(this.options.dropParams)) {
        this.options.dropParams.forEach((param) => {
          delete modelOptions[param];
        });
        logger.debug('[OpenAIClient] chatCompletion: dropped params', {
          dropParams: this.options.dropParams,
          modelOptions,
        });
      }

      if (this.message_file_map && this.isOllama) {
        const ollamaClient = new OllamaClient({ baseURL });
        return await ollamaClient.chatCompletion({
          payload: modelOptions,
          onProgress,
          abortController,
        });
      }

      let UnexpectedRoleError = false;


      const messages = modelOptions.messages;




let lastIndex = -1;
let lastUserMessageContent;
for (let i = messages.length - 1; i >= 0; i--) {
  const message = messages[i];
  if (message.role === 'user') {
    lastIndex = i;
    lastUserMessageContent = message.content;
    break;
  }
}

//Start PG Code

      let blockPromptInject = this.options.injectCheckbox
      let inject = 0
      let PiiBlock = false

//PG - Block Prompt Inject

      if (
        blockPromptInject == true
      ) {
        try {
          const injectResponse = await fetch(`${process.env.PG_BASE_URL}/injection`, {
            method: 'POST',
            headers: {
              'x-api-key': process.env.PGTOKEN, // Use your actual API key
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: `${lastUserMessageContent}`, detect: true }),
          });
          const injectData = await injectResponse.json();
          // Ensure the API response structure is as expected and adjust as necessary
          inject = injectData.checks[0].probability;
        } catch (error) {
          console.error('Error fetching factuality score:', error);
          inject = null; // Or handle the error as appropriate
        }
      }
//PG - Block PII
if (this.options.piiCheckbox === "Block") {
  try {
    PiiBlock = false;

    const completionResponse = await fetch(`${process.env.PG_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PGTOKEN}`, // Use your actual API key
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Neural-Chat-7B',  // Use your chosen model
        messages: [
          {
            role: 'user',
            content: `${lastUserMessageContent}`,  // User message content as input
          }
        ],
        max_tokens: 1,
        temperature: 1,
        top_p: 1,
        top_k: 50,
        input: {
          pii: 'block'  // Block PII as per your request
        }
      })
    });

    // Check if the status code is not 200 (success)
    if (!completionResponse.ok) {
      console.error(`Error: Received status ${completionResponse.status}`);
      
      // Handle 400 Bad Request error
      if (completionResponse.status === 400) {
        console.error('400 Bad Request error encountered.');
        PiiBlock = true;  // Set PiiBlock as true for 400 error
      } else {
        PiiBlock = false;  // Handle other types of errors
      }
      
    }

    // Handle successful response here (e.g., logging or processing)
    const data = await completionResponse.json();
    console.log(data);

  } catch (error) {
    console.error('An error occurred while processing the request:', error);
    PiiBlock = false;  // Set PiiBlock in case of any error
  }
}



        let includeInput = false

      if (modelOptions.stream) {
        if (this.options.max_tokens) {
          modelOptions.max_tokens = this.options.max_tokens;
        } else {
          modelOptions.max_tokens = 1000
        }
        const allowedPiiValues = ['Mask', 'Fake', 'Category', 'Random'];
        if (this.options.endpoint.includes("Chat") || this.options.endpoint.includes("Coding") ||("PredictionGuard")) {
         includeInput = allowedPiiValues.includes(this.options.piiCheckbox);
        if (this.options.endpoint.includes("OpenAI")) {
          includeInput = false
        }
        }

        // PG - Jank way to do PII with external endpoints (for example OPENAI or Claude)
        if (allowedPiiValues.includes(this.options.piiCheckbox) && includeInput === false) {
          try {
            PiiBlock = false;
            const replaceMethod = this.options.piiCheckbox.toLowerCase(); // Convert to lowercase if needed
        
            // Define a unique delimiter that is unlikely to appear in the content
            const delimiter = '__UNIQUE_DELIMITER__';
        
            // Combine all user messages into a single prompt, separated by the unique delimiter
            const combinedPrompt = payload
              .filter(message => message.role === 'user')
              .map(message => message.content)
              .join(delimiter);
        
            // Send the combined prompt to the PII API for replacement
            const completionResponse = await fetch(`${process.env.PG_BASE_URL}/PII`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.PGTOKEN}`, // Use your actual API token
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                prompt: combinedPrompt,
                replace: true,
                replace_method: replaceMethod
              }),
            });
        
            // Parse the JSON response
            const responseData = await completionResponse.json();
        
            // Extract the new_prompt from the response
            const newPrompt = responseData.checks[0].new_prompt;
        
            if (newPrompt) {
              // Split the new prompt back into individual messages using the unique delimiter
              const newMessages = newPrompt.split(delimiter);
        
              // Replace the content in the original payload with the new messages
              let newMessageIndex = 0;
              for (let i = 0; i < payload.length; i++) {
                if (payload[i].role === 'user' && newMessageIndex < newMessages.length) {
                  payload[i].content = newMessages[newMessageIndex++];
                }
              }
            }
        
            // Reformat the payload if needed (example: trimming or restructuring)
            // console.log('Updated Payload:', payload);
        
          } catch (error) {
            console.error('Error:', error);
          }
        } else {
          console.error('The selected PII method is not allowed.');
        }
        
  
        const stream = await openai.beta.chat.completions
        .stream({
          ...modelOptions,
          stream: true,
          ...(includeInput
            ? {
                input: {
                  // PG - PII options when using a Prediction Guard Endpoint
                  pii: 'replace',
                  pii_replace_method: this.options.piiCheckbox.toLowerCase(),
                },
              }
            : {}),
          ...(this.options.endpoint.includes("OpenAI")
            ? {} // Don't include truncation strategy for OpenAI
            : {
                truncation_strategy: {
                  type: 'auto',
                  last_messages: 4, // Keep the last 4 messages in case of token overflow
                },
              }),
        })
        .on('abort', () => {
          /* Do nothing here */
        })
        .on('error', (err) => {
          handleOpenAIErrors(err, errorCallback, 'stream');
        })
        .on('finalChatCompletion', (finalChatCompletion) => {
          const finalMessage = finalChatCompletion?.choices?.[0]?.message;
      
          if (finalMessage && finalMessage.role !== 'assistant') {
            finalChatCompletion.choices[0].message.role = 'assistant';
          }
      
          if (finalMessage && !finalMessage?.content?.trim()) {
            finalChatCompletion.choices[0].message.content = intermediateReply;
          }
        })
        .on('finalMessage', (message) => {
          if (message?.role !== 'assistant') {
            stream.messages.push({ role: 'assistant', content: intermediateReply });
            UnexpectedRoleError = true;
          }
        });
      
      

        const azureDelay = this.modelOptions.model?.includes('gpt-4') ? 30 : 17;
        // console.log(PiiBlock)
        //Block PII and Prompt Injection Message
        if (inject > 0.49) {
          intermediateReply = "⚠️ System Message: Prompt Injection Detected. Please rewrite prompt or turn off Prompt Injection Detection in the conversation settings ⚠️"
          return intermediateReply
        } else if (PiiBlock) {
          intermediateReply = "⚠️ System Message: Personal Identifiable Information Detected. Please rewrite prompt or turn off the Block PII in the conversation settings ⚠️"
          return intermediateReply
        }


        for await (const chunk of stream) {
          
          const token = chunk.choices[0]?.delta?.content || '';
          intermediateReply += token;
          onProgress(token);
          
          if (abortController.signal.aborted) {
            stream.controller.abort();
            break;
          }

          if (this.azure) {
            await sleep(azureDelay);
          }
        }

        if (!UnexpectedRoleError) {
          chatCompletion = await stream.finalChatCompletion().catch((err) => {
            handleOpenAIErrors(err, errorCallback, 'finalChatCompletion');
          });
        }
      }
      // regular completion
      else {
        chatCompletion = await openai.chat.completions
          .create({
            ...modelOptions,
          })
          .catch((err) => {
            handleOpenAIErrors(err, errorCallback, 'create');
          });
      }

      if (!chatCompletion && UnexpectedRoleError) {
        throw new Error(
          'OpenAI error: Invalid final message: OpenAI expects final message to include role=assistant',
        );
      } else if (!chatCompletion && error) {
        throw new Error(error);
      } else if (!chatCompletion) {
        throw new Error('Chat completion failed');
      }

      const { message, finish_reason } = chatCompletion.choices[0];
      if (chatCompletion) {
        this.metadata = { finish_reason };
      }

      logger.debug('[OpenAIClient] chatCompletion response', chatCompletion);

      if (!message?.content?.trim() && intermediateReply.length) {
        logger.debug(
          '[OpenAIClient] chatCompletion: using intermediateReply due to empty message.content',
          { intermediateReply },
        );
        return intermediateReply;
      }

      return message.content;
    } catch (err) {
      if (
        err?.message?.includes('abort') ||
        (err instanceof OpenAI.APIError && err?.message?.includes('abort'))
      ) {
        return intermediateReply;
      }
      if (
        err?.message?.includes(
          'OpenAI error: Invalid final message: OpenAI expects final message to include role=assistant',
        ) ||
        err?.message?.includes(
          'stream ended without producing a ChatCompletionMessage with role=assistant',
        ) ||
        err?.message?.includes('The server had an error processing your request') ||
        err?.message?.includes('missing finish_reason') ||
        err?.message?.includes('missing role') ||
        (err instanceof OpenAI.OpenAIError && err?.message?.includes('missing finish_reason'))
      ) {
        logger.error('[OpenAIClient] Known OpenAI error:', err);
        return intermediateReply;
      } else if (err instanceof OpenAI.APIError) {
        if (intermediateReply) {
          return intermediateReply;
        } else {
          throw err;
        }
      } else {
        logger.error('[OpenAIClient.chatCompletion] Unhandled error type', err, err.message);
        throw err;
      }
    }
  }
}

module.exports = OpenAIClient;
