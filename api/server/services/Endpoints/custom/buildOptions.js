const buildOptions = (endpoint, parsedBody, endpointType) => {
  const {
    chatGptLabel,
    promptPrefix,
    maxContextTokens,
    resendFiles,
    imageDetail,
    iconURL,
    greeting,
    spec,
    consistencyCheckbox,
    factualityCheckbox,
    toxicityCheckbox,
    piiCheckbox,
    injectCheckbox,
    factualityText,
    max_tokens,
    ...rest
  } = parsedBody;
  const endpointOption = {
    endpoint,
    endpointType,
    chatGptLabel,
    promptPrefix,
    resendFiles,
    imageDetail,
    iconURL,
    greeting,
    spec,
    maxContextTokens,
    consistencyCheckbox,
    factualityCheckbox,
    toxicityCheckbox,
    piiCheckbox,
    injectCheckbox,
    factualityText,
    max_tokens,
    modelOptions: {
      ...rest,
    },
  };

  return endpointOption;
};

module.exports = buildOptions;
