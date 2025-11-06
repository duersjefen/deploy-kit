/**
 * Parameter Input Component
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import type { CommandMetadata, CommandParameter } from '../../registry/command-registry.js';

interface ParameterInputProps {
  command: CommandMetadata;
  onSubmit: (parameters: Record<string, any>) => void;
  onBack: () => void;
}

export const ParameterInput: React.FC<ParameterInputProps> = ({
  command,
  onSubmit,
  onBack,
}) => {
  const [currentParamIndex, setCurrentParamIndex] = useState(0);
  const [values, setValues] = useState<Record<string, any>>({});
  const [currentInput, setCurrentInput] = useState('');

  const params = command.parameters;
  const currentParam = params[currentParamIndex];

  if (!currentParam) {
    // All parameters collected
    React.useEffect(() => {
      onSubmit(values);
    }, []);
    return null;
  }

  // Handle submission of current parameter
  const handleSubmit = () => {
    let value: any = currentInput;

    // Convert to appropriate type
    if (currentParam.type === 'number') {
      value = parseFloat(currentInput);
      if (isNaN(value)) {
        // Invalid number, show error
        return;
      }
    } else if (currentParam.type === 'boolean') {
      value = currentInput.toLowerCase() === 'true' || currentInput === '1';
    }

    // Use default if empty and not required
    if (!currentInput && currentParam.default !== undefined) {
      value = currentParam.default;
    }

    // Save value
    setValues(prev => ({ ...prev, [currentParam.name]: value }));
    setCurrentInput('');

    // Move to next parameter
    if (currentParamIndex < params.length - 1) {
      setCurrentParamIndex(currentParamIndex + 1);
    } else {
      // All done, submit
      onSubmit({ ...values, [currentParam.name]: value });
    }
  };

  // Handle enum selection
  const handleEnumSelect = (item: { value: string }) => {
    setValues(prev => ({ ...prev, [currentParam.name]: item.value }));

    if (currentParamIndex < params.length - 1) {
      setCurrentParamIndex(currentParamIndex + 1);
    } else {
      onSubmit({ ...values, [currentParam.name]: item.value });
    }
  };

  // Skip optional parameter
  const handleSkip = () => {
    if (currentParam.required) return;

    if (currentParamIndex < params.length - 1) {
      setCurrentParamIndex(currentParamIndex + 1);
    } else {
      onSubmit(values);
    }
  };

  return (
    <Box flexDirection="column">
      {/* Progress */}
      <Box>
        <Text dimColor>
          Parameter {currentParamIndex + 1} of {params.length}
        </Text>
      </Box>

      {/* Current Parameter */}
      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan">
          {currentParam.name}
          {currentParam.required && <Text color="red">*</Text>}
        </Text>
        <Text dimColor>{currentParam.description}</Text>
      </Box>

      {/* Input */}
      <Box marginTop={1} flexDirection="column">
        {currentParam.type === 'enum' && currentParam.options ? (
          // Enum selection
          <SelectInput
            items={currentParam.options.map(opt => ({
              label: opt,
              value: opt,
            }))}
            onSelect={handleEnumSelect}
          />
        ) : currentParam.type === 'boolean' ? (
          // Boolean selection
          <SelectInput
            items={[
              { label: 'Yes', value: 'true' },
              { label: 'No', value: 'false' },
            ]}
            onSelect={(item) => {
              setValues(prev => ({
                ...prev,
                [currentParam.name]: item.value === 'true',
              }));

              if (currentParamIndex < params.length - 1) {
                setCurrentParamIndex(currentParamIndex + 1);
              } else {
                onSubmit({
                  ...values,
                  [currentParam.name]: item.value === 'true',
                });
              }
            }}
          />
        ) : (
          // Text/Number input
          <Box>
            <Text color="cyan">
              {currentParam.type === 'number' ? '#' : '>'}{' '}
            </Text>
            <TextInput
              value={currentInput}
              onChange={setCurrentInput}
              onSubmit={handleSubmit}
              placeholder={currentParam.placeholder || currentParam.name}
            />
          </Box>
        )}
      </Box>

      {/* Default value hint */}
      {currentParam.default !== undefined && (
        <Box marginTop={1}>
          <Text dimColor>
            Default: {String(currentParam.default)}
            {!currentParam.required && ' (press Enter to use default)'}
          </Text>
        </Box>
      )}

      {/* Help */}
      <Box marginTop={2} borderStyle="round" padding={1}>
        <Text dimColor>
          {currentParam.type !== 'enum' && currentParam.type !== 'boolean' && (
            <>Press <Text bold>⏎ Enter</Text> to confirm | </>
          )}
          {!currentParam.required && (
            <>Press <Text bold>⇥ Tab</Text> to skip | </>
          )}
          Press <Text bold>⎋ ESC</Text> to cancel
        </Text>
      </Box>
    </Box>
  );
};
