const conversationPreset = {
  // endpoint: [azureOpenAI, openAI, bingAI, anthropic, chatGPTBrowser]
  endpoint: {
    type: String,
    default: null,
    required: true,
  },
  endpointType: {
    type: String,
  },
  // for azureOpenAI, openAI, chatGPTBrowser only
  model: {
    type: String,
    required: false,
  },
  // for azureOpenAI, openAI only
  chatGptLabel: {
    type: String,
    required: false,
  },
  // for google only
  modelLabel: {
    type: String,
    required: false,
  },
  promptPrefix: {
    type: String,
    required: false,
  },
  temperature: {
    type: Number,
    required: false,
  },
  top_p: {
    type: Number,
    required: false,
  },
  // for google only
  topP: {
    type: Number,
    required: false,
  },
  topK: {
    type: Number,
    required: false,
  },
  maxOutputTokens: {
    type: Number,
    required: false,
  },
  presence_penalty: {
    type: Number,
    required: false,
  },
  frequency_penalty: {
    type: Number,
    required: false,
  },
  // for bingai only
  jailbreak: {
    type: Boolean,
  },
  context: {
    type: String,
  },
  systemMessage: {
    type: String,
  },
  toneStyle: {
    type: String,
  },
  file_ids: { type: [{ type: String }], default: undefined },
  // deprecated
  resendImages: {
    type: Boolean,
  },
  // files
  resendFiles: {
    type: Boolean,
  },
  imageDetail: {
    type: String,
  },
  /* assistants */
  assistant_id: {
    type: String,
  },
  instructions: {
    type: String,
  },
  stop: { type: [{ type: String }], default: undefined },
  isArchived: {
    type: Boolean,
    default: false,
  },
  /* UI Components */
  iconURL: {
    type: String,
  },
  greeting: {
    type: String,
  },
  spec: {
    type: String,
  },
  tools: { type: [{ type: String }], default: undefined },
  maxContextTokens: {
    type: Number,
  },
  max_tokens: {
    type: Number,
  },
  /* PG CUSTOM */
  toxicityCheckbox: {
    type: Boolean,
  },
  consistencyCheckbox: {
    type: Boolean,
  },
  factualityCheckbox: {
    type: Boolean,
  },
  injectCheckbox: {
    type: Boolean,
  },
  factualityText: {
    type: String,
  },
  piiCheckbox: {
    type: String,
  },
  fullDocCheckbox: {
    type: Boolean,
  },
};

const agentOptions = {
  model: {
    type: String,
    required: false,
  },
  // for azureOpenAI, openAI only
  chatGptLabel: {
    type: String,
    required: false,
  },
  modelLabel: {
    type: String,
    required: false,
  },
  promptPrefix: {
    type: String,
    required: false,
  },
  temperature: {
    type: Number,
    required: false,
  },
  top_p: {
    type: Number,
    required: false,
  },
  // for google only
  topP: {
    type: Number,
    required: false,
  },
  topK: {
    type: Number,
    required: false,
  },
  maxOutputTokens: {
    type: Number,
    required: false,
  },
  presence_penalty: {
    type: Number,
    required: false,
  },
  frequency_penalty: {
    type: Number,
    required: false,
  },
  context: {
    type: String,
  },
  systemMessage: {
    type: String,
  },
  max_tokens: {
    type: Number,
  },
  /* PG CUSTOM */
  toxicityCheckbox: {
    type: Boolean,
  },
  consistencyCheckbox: {
    type: Boolean,
  },
  factualityCheckbox: {
    type: Boolean,
  },
  injectCheckbox: {
    type: Boolean,
  },
  piiCheckbox: {
    type: String,
  },
  factualityText: {
    type: String,
  },
  fullDocCheckbox: {
    type: Boolean,
  },
};

module.exports = {
  conversationPreset,
  agentOptions,
};
