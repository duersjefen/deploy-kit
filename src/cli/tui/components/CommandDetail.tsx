/**
 * Command Detail Component
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { CommandMetadata } from '../../registry/command-registry.js';
import { commandHistory } from '../../registry/command-history.js';

interface CommandDetailProps {
  command: CommandMetadata;
  onExecute: () => void;
  onBack: () => void;
}

export const CommandDetail: React.FC<CommandDetailProps> = ({
  command,
  onExecute,
  onBack,
}) => {
  const stats = commandHistory.getCommandStats(command.name);
  const isFavorite = commandHistory.isFavorite(command.name);

  // Handle keyboard input
  React.useEffect(() => {
    const handleInput = (str: string, key: any) => {
      if (key.return) {
        onExecute();
      } else if (key.escape) {
        onBack();
      } else if (str === 'f') {
        // Toggle favorite
        if (isFavorite) {
          commandHistory.removeFavorite(command.name);
        } else {
          commandHistory.addFavorite(command.name);
        }
      }
    };

    process.stdin.on('keypress', handleInput);
    return () => {
      process.stdin.off('keypress', handleInput);
    };
  }, [isFavorite]);

  return (
    <Box flexDirection="column">
      {/* Command Header */}
      <Box>
        <Text bold color="cyan">
          {command.icon}  {command.name}
        </Text>
        {isFavorite && <Text color="yellow"> ⭐</Text>}
      </Box>

      {/* Description */}
      <Box marginTop={1} flexDirection="column">
        <Text>{command.description}</Text>
        <Box marginTop={1}>
          <Text dimColor>
            {command.longDescription}
          </Text>
        </Box>
      </Box>

      {/* Metadata */}
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text dimColor>Category: </Text>
          <Text color="cyan">{command.category}</Text>
        </Text>
        <Text>
          <Text dimColor>Duration: </Text>
          <Text>{command.estimatedDuration || 'varies'}</Text>
        </Text>
        <Text>
          <Text dimColor>Danger Level: </Text>
          <Text
            color={
              command.dangerLevel === 'safe'
                ? 'green'
                : command.dangerLevel === 'moderate'
                  ? 'yellow'
                  : 'red'
            }
          >
            {command.dangerLevel}
          </Text>
        </Text>
      </Box>

      {/* Parameters */}
      {command.parameters.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Parameters:</Text>
          <Box marginLeft={2} flexDirection="column">
            {command.parameters.map((param, idx) => (
              <Text key={idx}>
                <Text color="cyan">{param.name}</Text>
                {param.required && <Text color="red">*</Text>}
                <Text dimColor> - {param.description}</Text>
                {param.default !== undefined && (
                  <Text dimColor> (default: {String(param.default)})</Text>
                )}
              </Text>
            ))}
          </Box>
        </Box>
      )}

      {/* Examples */}
      {command.examples.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Examples:</Text>
          <Box marginLeft={2} flexDirection="column">
            {command.examples.map((ex, idx) => (
              <Box key={idx} flexDirection="column" marginTop={idx > 0 ? 1 : 0}>
                <Text color="gray">{ex.command}</Text>
                <Text dimColor>  → {ex.description}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Statistics */}
      {stats && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Usage Statistics:</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text>
              <Text dimColor>Executions: </Text>
              <Text>{stats.totalExecutions}</Text>
            </Text>
            <Text>
              <Text dimColor>Success Rate: </Text>
              <Text color="green">
                {stats.totalExecutions > 0
                  ? Math.round((stats.successCount / stats.totalExecutions) * 100)
                  : 0}
                %
              </Text>
            </Text>
            <Text>
              <Text dimColor>Avg Duration: </Text>
              <Text>{Math.round(stats.averageDuration / 1000)}s</Text>
            </Text>
          </Box>
        </Box>
      )}

      {/* Actions */}
      <Box marginTop={2} borderStyle="round" borderColor="cyan" padding={1}>
        <Text>
          Press <Text bold color="cyan">⏎ Enter</Text> to execute
          {command.parameters.length > 0 && ' (configure parameters)'}
          {' | '}
          Press <Text bold>F</Text> to {isFavorite ? 'unfavorite' : 'favorite'}
          {' | '}
          Press <Text bold>⎋ ESC</Text> to go back
        </Text>
      </Box>
    </Box>
  );
};
