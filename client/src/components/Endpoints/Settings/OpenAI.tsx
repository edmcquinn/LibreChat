import { useMemo } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {
  EModelEndpoint,
} from 'librechat-data-provider';
import type { TModelSelectProps, OnInputNumberChange } from '~/common';
import {
  Input,
  Label,
  Switch,
  Slider,
  InputNumber,
  SelectDropDown,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '~/components/ui';
import { cn, defaultTextProps, removeFocusOutlines, removeFocusRings } from '~/utils';
import { useLocalize, useDebouncedInput } from '~/hooks';

export default function Settings({ conversation, setOption, models, readonly }: TModelSelectProps) {
  const localize = useLocalize();
  const {
    endpoint,
    endpointType,
    model,
    modelLabel,
    chatGptLabel,
    promptPrefix,
    temperature,
    top_p: topP,
    frequency_penalty: freqP,
    presence_penalty: presP,
    resendFiles,
    imageDetail,
    maxContextTokens,
    max_tokens,
    toxicityCheckbox,
    factualityCheckbox,
    factualityText,
    injectCheckbox,
    piiCheckbox,
    fullDocCheckbox,
  } = conversation ?? {};

  const [setChatGptLabel, chatGptLabelValue] = useDebouncedInput<string | null | undefined>({
    setOption,
    optionKey: 'chatGptLabel',
    initialValue: modelLabel ?? chatGptLabel,
  });
  const [setPromptPrefix, promptPrefixValue] = useDebouncedInput<string | null | undefined>({
    setOption,
    optionKey: 'promptPrefix',
    initialValue: promptPrefix,
  });
  const [setTemperature, temperatureValue] = useDebouncedInput<number | null | undefined>({
    setOption,
    optionKey: 'temperature',
    initialValue: temperature,
  });
  const [setTopP, topPValue] = useDebouncedInput<number | null | undefined>({
    setOption,
    optionKey: 'top_p',
    initialValue: topP,
  });
  const [setFreqP, freqPValue] = useDebouncedInput<number | null | undefined>({
    setOption,
    optionKey: 'frequency_penalty',
    initialValue: freqP,
  });
  const [setPresP, presPValue] = useDebouncedInput<number | null | undefined>({
    setOption,
    optionKey: 'presence_penalty',
    initialValue: presP,
  });
  const [setMaxContextTokens, maxContextTokensValue] = useDebouncedInput<number | null | undefined>({
    setOption,
    optionKey: 'maxContextTokens',
    initialValue: maxContextTokens,
  });
  const setToxicity = setOption('toxicityCheckbox');
  const setFactuality = setOption('factualityCheckbox');
  const setInjection = setOption('injectCheckbox');
  const setFullDoc = setOption('fullDocCheckbox');
  const setPII = setOption('piiCheckbox');
  const piiOptions = [
    { value: '', label: 'None' }, // Default blank option
    { value: 'Mask', label: 'Mask' },
    { value: 'Fake', label: 'Fake' },
    { value: 'Category', label: 'Category' },
    { value: 'Random', label: 'Random' },
    { value: 'Block', label: 'Block' },
    // Add more options as needed
  ];
  const setFactualityText = setOption('factualityText');
  const [setMaxOutputTokens, maxOutputTokensValue] = useDebouncedInput<number | null | undefined>({
    setOption,
    optionKey: 'max_tokens',
    initialValue: max_tokens,
  });

  const optionEndpoint = useMemo(() => endpointType ?? endpoint, [endpoint, endpointType]);
  const isOpenAI = useMemo(
    () => optionEndpoint === EModelEndpoint.openAI || optionEndpoint === EModelEndpoint.azureOpenAI,
    [optionEndpoint],
  );

  if (!conversation) {
    return null;
  }

  const setModel = setOption('model');
  const setResendFiles = setOption('resendFiles');
  const setImageDetail = setOption('imageDetail');

  return (
    <TooltipProvider>
      {endpoint === 'PredictionGuard' || endpoint.includes("Models") ? (
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-5 sm:col-span-3 flex flex-col items-center justify-start gap-6">
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="model" className="text-left text-sm font-medium flex items-center">
                {localize('com_endpoint_model')}
              </Label>
              <SelectDropDown
                value={model ?? ''}
                setValue={setModel}
                availableValues={models}
                disabled={readonly}
                className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusRings)}
                containerClassName="flex w-full resize-none"
              />
            </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium flex items-center">
                {localize('com_endpoint_custom_name')}
                <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Set a custom name for this Chat</TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="chatGptLabel"
                disabled={readonly}
                value={(chatGptLabelValue as string) || ''}
                onChange={setChatGptLabel}
                placeholder={localize('com_endpoint_openai_custom_name_placeholder')}
                className={cn(
                  defaultTextProps,
                  'flex h-10 max-h-10 w-full resize-none px-3 py-2',
                  removeFocusOutlines,
                )}
              />
            </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="promptPrefix" className="text-left text-sm font-medium flex items-center">
                {localize('com_endpoint_prompt_prefix')}
                <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Provide a prefix for the prompt</TooltipContent>
                </Tooltip>
              </Label>
              <TextareaAutosize
                id="promptPrefix"
                disabled={readonly}
                value={(promptPrefixValue as string) || ''}
                onChange={setPromptPrefix}
                placeholder={localize('com_endpoint_openai_prompt_prefix_placeholder')}
                className={cn(
                  defaultTextProps,
                  'flex max-h-[138px] min-h-[100px] w-full resize-none px-3 py-2 ',
                )}
              />
            </div>
            <div className="grid w-full items-center gap-2">
      <Label htmlFor="pii-dropdown" className="text-left text-sm font-medium flex items-center">
        <small>PII Anonymization</small>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
          </TooltipTrigger>
          <TooltipContent>
Choose an option for handling PII -
Replace: This replaces detected PII with fake names or details.
Block: This blocks the prompt containing PII from reaching the LLM.
Random: This replaces the detected PII with random characters.
Category: This masks the PII with the entity type.
Mask: This simply replaces PII with asterisks (*)
          </TooltipContent>
        </Tooltip>
      </Label>
      <SelectDropDown
        id="pii-dropdown"
        value={piiCheckbox ?? ''}
        setValue={setPII}
        availableValues={piiOptions}
        disabled={readonly}
        className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusRings)}
        containerClassName="flex w-full resize-none"
        title="Select PII Anonymization Option"
      />
    </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="factualityText" className="text-left text-sm font-medium flex items-center">
                Factuality Context
                <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Provide factuality context</TooltipContent>
                </Tooltip>
              </Label>
              <TextareaAutosize
                id="factualityText"
                disabled={readonly}
                value={factualityText || ''}
                onChange={(e) => setFactualityText(e.target.value ?? null)}
                placeholder="Please provide Factuality Context for the relevance of the output to the input prompts."
                className={cn(
                  defaultTextProps,
                  'dark:bg-gray-700 dark:hover:bg-gray-700/60 dark:focus:bg-gray-700',
                  'flex max-h-[138px] min-h-[100px] w-full resize-none px-3 py-2 ',
                )}
              />
            </div>
          </div>
          <div className="col-span-5 sm:col-span-2 flex flex-col items-center justify-start gap-6">
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="max-output-tokens" className="text-left text-sm font-medium flex items-center">
                {localize('com_endpoint_max_output_tokens')}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Set the maximum number of output tokens. This controls the max output of the model to your question. This can cause truncation if it is set too low. The default is 1000</TooltipContent>
                </Tooltip>
              </Label>
              <InputNumber
                id="max-output-tokens"
                stringMode={false}
                disabled={readonly}
                value={maxOutputTokensValue as number}
                onChange={setMaxOutputTokens as OnInputNumberChange}
                placeholder={localize('com_nav_theme_system')}
                min={10}
                max={2000000}
                step={1000}
                controls={false}
                className={cn(
                  defaultTextProps,
                  cn(
                    'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                    'w-1/3',
                  ),
                )}
              />
            </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="temp-int" className="text-left text-sm font-medium flex items-center">
                {localize('com_endpoint_temperature')}
                <small className="opacity-40">
                  ({localize('com_endpoint_default_with_num', '1')})
                </small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Set the temperature value. This controls how creative the model is. The lower the number the more consistent the model will be, but it will be less creative.</TooltipContent>
                </Tooltip>
              </Label>
              <InputNumber
                id="temp-int"
                stringMode={false}
                disabled={readonly}
                value={temperatureValue as number}
                onChange={setTemperature as OnInputNumberChange}
                max={2}
                min={0}
                step={0.01}
                controls={false}
                className={cn(
                  defaultTextProps,
                  cn(
                    'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                  ),
                )}
              />
              <Slider
                disabled={readonly}
                value={[(temperatureValue as number) ?? 1]}
                onValueChange={(value) => setTemperature(value[0])}
                doubleClickHandler={() => setTemperature(1)}
                max={2}
                min={0}
                step={0.01}
                className="flex h-4 w-full"
              />
            </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="toxicity-checkbox" className="text-left text-sm font-medium flex items-center">
                <small>Toxicity</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Toggle toxicity check. This will show you the level of toxicity the message has. This setting is useful in an API setting where you want to prevent a user from seeing toxic content programmatically.</TooltipContent>
                </Tooltip>
              </Label>
              <Switch
                id="toxicity-checkbox"
                checked={toxicityCheckbox ?? false}
                onCheckedChange={(checked: boolean) => setToxicity(checked)}
                disabled={readonly}
                className="flex"
              />
            </div>

            <div className="grid w-full items-center gap-2">
              <Label htmlFor="inject-checkbox" className="text-left text-sm font-medium flex items-center">
                <small>Block Prompt Injections</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Toggle Prompt Injection Check to assess whether the last incoming prompt might be an injection attempt before it reaches the LLM.</TooltipContent>
                </Tooltip>
              </Label>
              <Switch
                id="inject-checkbox"
                checked={injectCheckbox ?? false}
                onCheckedChange={(checked: boolean) => setInjection(checked)}
                disabled={readonly}
                className="flex"
              />
            </div>

            <div className="grid w-full items-center gap-2">
              <Label htmlFor="factuality-checkbox" className="text-left text-sm font-medium flex items-center">
                <small>Factuality</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Toggle factuality check. It compares the relevance of the output of the model to the Factuality Context. You must also provide the Factuality Context.</TooltipContent>
                </Tooltip>
              </Label>
              <Switch
                id="factuality-checkbox"
                checked={factualityCheckbox ?? false}
                onCheckedChange={(checked: boolean) => setFactuality(checked)}
                disabled={readonly}
                className="flex"
              />
            </div>

            <div className="grid w-full items-center gap-2">
              <Label htmlFor="inject-checkbox" className="text-left text-sm font-medium flex items-center">
                <small>Send Full Document to Model</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Checking this button overrides the default file upload behavior. Instead of using RAG, the full document will be sent directly to the model. Note that if the document exceeds the model's context length, it will result in an error. This option is best suited for single small documents.</TooltipContent>
                </Tooltip>
              </Label>
              <Switch
                id="inject-checkbox"
                checked={fullDocCheckbox ?? false}
                onCheckedChange={(checked: boolean) => setFullDoc(checked)}
                disabled={readonly}
                className="flex"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-5 sm:col-span-3 flex flex-col items-center justify-start gap-6">
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="model" className="text-left text-sm font-medium flex items-center">
                {localize('com_endpoint_model')}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Choose a model from the list</TooltipContent>
                </Tooltip>
              </Label>
              <SelectDropDown
                value={model ?? ''}
                setValue={setModel}
                availableValues={models}
                disabled={readonly}
                className={cn(defaultTextProps, 'flex w-full resize-none', removeFocusRings)}
                containerClassName="flex w-full resize-none"
              />
            </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium flex items-center">
                {localize('com_endpoint_custom_name')}
                <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Set a custom name for this Chat</TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="chatGptLabel"
                disabled={readonly}
                value={(chatGptLabelValue as string) || ''}
                onChange={setChatGptLabel}
                placeholder={localize('com_endpoint_openai_custom_name_placeholder')}
                className={cn(
                  defaultTextProps,
                  'flex h-10 max-h-10 w-full resize-none px-3 py-2',
                  removeFocusOutlines,
                )}
              />
            </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="promptPrefix" className="text-left text-sm font-medium flex items-center">
                {localize('com_endpoint_prompt_prefix')}
                <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Provide a prefix for the prompt</TooltipContent>
                </Tooltip>
              </Label>
              <TextareaAutosize
                id="promptPrefix"
                disabled={readonly}
                value={(promptPrefixValue as string) || ''}
                onChange={setPromptPrefix}
                placeholder={localize('com_endpoint_openai_prompt_prefix_placeholder')}
                className={cn(
                  defaultTextProps,
                  'flex max-h-[138px] min-h-[100px] w-full resize-none px-3 py-2 ',
                )}
              />
            </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="factualityText" className="text-left text-sm font-medium flex items-center">
                Factuality Context
                <small className="opacity-40">({localize('com_endpoint_default_blank')})</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Provide factuality context</TooltipContent>
                </Tooltip>
              </Label>
              <TextareaAutosize
                id="factualityText"
                disabled={readonly}
                value={factualityText || ''}
                onChange={(e) => setFactualityText(e.target.value ?? null)}
                placeholder="Please provide Factuality Context for the relevance of the output to the input prompts."
                className={cn(
                  defaultTextProps,
                  'dark:bg-gray-700 dark:hover:bg-gray-700/60 dark:focus:bg-gray-700',
                  'flex max-h-[138px] min-h-[100px] w-full resize-none px-3 py-2 ',
                )}
              />
            </div>
          </div>
          <div className="col-span-5 sm:col-span-2 flex flex-col items-center justify-start gap-6">
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="max-output-tokens" className="text-left text-sm font-medium flex items-center">
                {localize('com_endpoint_max_output_tokens')}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Set the maximum number of output tokens. This controls the max output of the model to your question. This can cause truncation if it is set too low.</TooltipContent>
                </Tooltip>
              </Label>
              <InputNumber
                id="max-output-tokens"
                stringMode={false}
                disabled={readonly}
                value={maxOutputTokensValue as number}
                onChange={setMaxOutputTokens as OnInputNumberChange}
                placeholder={localize('com_nav_theme_system')}
                min={10}
                max={2000000}
                step={1000}
                controls={false}
                className={cn(
                  defaultTextProps,
                  cn(
                    'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                    'w-1/3',
                  ),
                )}
              />
            </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="temp-int" className="text-left text-sm font-medium flex items-center">
                {localize('com_endpoint_temperature')}
                <small className="opacity-40">
                  ({localize('com_endpoint_default_with_num', '1')})
                </small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Set the temperature value. This controls how creative the model is. The lower the number the more consistent the model will be, but it will be less creative.</TooltipContent>
                </Tooltip>
              </Label>
              <InputNumber
                id="temp-int"
                stringMode={false}
                disabled={readonly}
                value={temperatureValue as number}
                onChange={setTemperature as OnInputNumberChange}
                max={2}
                min={0}
                step={0.01}
                controls={false}
                className={cn(
                  defaultTextProps,
                  cn(
                    'reset-rc-number-input reset-rc-number-input-text-right h-auto w-12 border-0 group-hover/temp:border-gray-200',
                  ),
                )}
              />
              <Slider
                disabled={readonly}
                value={[(temperatureValue as number) ?? 1]}
                onValueChange={(value) => setTemperature(value[0])}
                doubleClickHandler={() => setTemperature(1)}
                max={2}
                min={0}
                step={0.01}
                className="flex h-4 w-full"
              />
            </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="toxicity-checkbox" className="text-left text-sm font-medium flex items-center">
                <small>Toxicity</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Toggle toxicity check. This will show you the level of toxicity the message has. This setting is useful in an API setting where you want to prevent a user from seeing toxic content programmatically.</TooltipContent>
                </Tooltip>
              </Label>
              <Switch
                id="toxicity-checkbox"
                checked={toxicityCheckbox ?? false}
                onCheckedChange={(checked: boolean) => setToxicity(checked)}
                disabled={readonly}
                className="flex"
              />
            </div>
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="factuality-checkbox" className="text-left text-sm font-medium flex items-center">
                <small>Factuality</small>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-2 cursor-pointer text-gray-500">ⓘ</span>
                  </TooltipTrigger>
                  <TooltipContent>Toggle factuality check. It compares the relevance of the output of the model to the Factuality Context. You must also provide the Factuality Context.</TooltipContent>
                </Tooltip>
              </Label>
              <Switch
                id="factuality-checkbox"
                checked={factualityCheckbox ?? false}
                onCheckedChange={(checked: boolean) => setFactuality(checked)}
                disabled={readonly}
                className="flex"
              />
            </div>
          </div>
        </div>
      )}
    </TooltipProvider>
  );
}