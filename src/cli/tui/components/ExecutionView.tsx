/**
 * Execution View Component
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { commandExecutor } from '../../registry/command-executor.js';
import { commandHistory } from '../../registry/command-history.js';
import type { ExecutionOutput } from '../../registry/command-executor.js';

interface ExecutionViewProps {
  commandName?: string;
  workflowId?: string | null;
  parameters: Record<string, any>;
}

export const ExecutionView: React.FC<ExecutionViewProps> = ({
  commandName,
  workflowId,
  parameters,
}) => {
  const [status, setStatus] = useState<'running' | 'completed' | 'failed'>('running');
  const [outputs, setOutputs] = useState<ExecutionOutput[]>([]);
  const [duration, setDuration] = useState(0);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    // Update duration every second
    const timer = setInterval(() => {
      setDuration(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

  useEffect(() => {
    if (!commandName) return;

    let cancelled = false;

    const execute = async () => {
      try {
        const result = await commandExecutor.execute(commandName, parameters, {
          onOutput: (output) => {
            if (!cancelled) {
              setOutputs(prev => [...prev, output]);
            }
          },
        });

        if (!cancelled) {
          setStatus('completed');
          commandHistory.addToHistory(result);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus('failed');
          setOutputs(prev => [
            ...prev,
            {
              commandId: 'error',
              type: 'error',
              content: (error as Error).message,
              timestamp: Date.now(),
            },
          ]);
        }
      }
    };

    execute();

    return () => {
      cancelled = true;
    };
  }, [commandName, parameters]);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running': return 'cyan';
      case 'completed': return 'green';
      case 'failed': return 'red';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'running': return <Spinner type="dots" />;
      case 'completed': return '✅';
      case 'failed': return '❌';
    }
  };

  return (
    <Box flexDirection="column">
      {/* Status Header */}
      <Box>
        <Text color={getStatusColor()}>
          {getStatusIcon()} {status === 'running' ? 'Executing' : status === 'completed' ? 'Completed' : 'Failed'}: {commandName}
        </Text>
      </Box>

      {/* Duration */}
      <Box marginTop={1}>
        <Text dimColor>Duration: {formatDuration(duration)}</Text>
      </Box>

      {/* Parameters */}
      {Object.keys(parameters).length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Parameters:</Text>
          <Box marginLeft={2}>
            <Text dimColor>{JSON.stringify(parameters, null, 2)}</Text>
          </Box>
        </Box>
      )}

      {/* Output Log */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Output:</Text>
        <Box
          marginTop={1}
          borderStyle="round"
          padding={1}
          flexDirection="column"
          minHeight={10}
        >
          {outputs.length > 0 ? (
            outputs.slice(-20).map((output, idx) => {
              const color =
                output.type === 'error'
                  ? 'red'
                  : output.type === 'success'
                    ? 'green'
                    : output.type === 'warning'
                      ? 'yellow'
                      : undefined;

              return (
                <Text key={idx} color={color}>
                  {output.content}
                </Text>
              );
            })
          ) : (
            <Text dimColor>Waiting for output...</Text>
          )}
        </Box>
      </Box>

      {/* Completion Message */}
      {status !== 'running' && (
        <Box marginTop={1} borderStyle="round" borderColor={getStatusColor()} padding={1}>
          <Text color={getStatusColor()}>
            {status === 'completed'
              ? `✅ Command completed successfully in ${formatDuration(duration)}`
              : `❌ Command failed after ${formatDuration(duration)}`}
          </Text>
        </Box>
      )}
    </Box>
  );
};
