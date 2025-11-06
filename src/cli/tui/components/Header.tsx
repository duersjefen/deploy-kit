/**
 * Header Component
 */

import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';

interface HeaderProps {
  mode: string;
}

export const Header: React.FC<HeaderProps> = ({ mode }) => {
  const getModeTitle = () => {
    switch (mode) {
      case 'search': return 'Command Center';
      case 'detail': return 'Command Details';
      case 'parameters': return 'Configure Parameters';
      case 'executing': return 'Executing...';
      case 'workflows': return 'Workflow Templates';
      default: return 'Deploy-Kit';
    }
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">
          ╔════════════════════════════════════════════════════════════╗
        </Text>
      </Box>
      <Box>
        <Text bold color="cyan">
          {`║  🚀 Deploy-Kit ${getModeTitle().padEnd(44)} ║`}
        </Text>
      </Box>
      <Box>
        <Text bold color="cyan">
          ╚════════════════════════════════════════════════════════════╝
        </Text>
      </Box>
    </Box>
  );
};
