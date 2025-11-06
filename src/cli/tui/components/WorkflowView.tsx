/**
 * Workflow View Component
 */

import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import type { WorkflowTemplate } from '../../registry/command-history.js';

interface WorkflowViewProps {
  workflows: WorkflowTemplate[];
  onWorkflowSelect: (workflowId: string) => void;
  onBack: () => void;
}

export const WorkflowView: React.FC<WorkflowViewProps> = ({
  workflows,
  onWorkflowSelect,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items = workflows.map(wf => ({
    label: `${wf.icon}  ${wf.name}`,
    value: wf.id,
  }));

  const handleSelect = (item: { label: string; value: string }) => {
    onWorkflowSelect(item.value);
  };

  const selectedWorkflow = workflows[selectedIndex];

  return (
    <Box flexDirection="column">
      {/* Workflow List */}
      <Box flexDirection="column">
        <Text bold>Available Workflows:</Text>
        <Box marginTop={1}>
          <SelectInput
            items={items}
            onSelect={handleSelect}
            onHighlight={(item) => {
              const index = workflows.findIndex(w => w.id === item.value);
              setSelectedIndex(index);
            }}
          />
        </Box>
      </Box>

      {/* Workflow Details */}
      {selectedWorkflow && (
        <Box marginTop={2} flexDirection="column">
          <Text bold color="cyan">
            {selectedWorkflow.icon}  {selectedWorkflow.name}
          </Text>
          <Box marginTop={1}>
            <Text dimColor>
              {selectedWorkflow.description}
            </Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text bold>Steps:</Text>
            <Box marginLeft={2} flexDirection="column">
              {selectedWorkflow.steps.map((step, idx) => (
                <Box key={idx} marginTop={idx > 0 ? 1 : 0}>
                  <Text>
                    <Text color="cyan">{idx + 1}.</Text> {step.commandName}
                    {Object.keys(step.args).length > 0 && (
                      <Text dimColor> {JSON.stringify(step.args)}</Text>
                    )}
                    {step.continueOnFail && (
                      <Text color="yellow"> (continue on fail)</Text>
                    )}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

// Fix: Add missing import
function useState<T>(initialValue: T): [T, (value: T) => void] {
  const [state, setState] = React.useState<T>(initialValue);
  return [state, setState];
}
