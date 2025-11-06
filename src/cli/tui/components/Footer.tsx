/**
 * Footer Component
 */

import React from 'react';
import { Box, Text } from 'ink';

interface FooterProps {
  mode: string;
}

export const Footer: React.FC<FooterProps> = ({ mode }) => {
  const getHelp = () => {
    switch (mode) {
      case 'search':
        return '↑↓ Navigate  ⏎ Select  ⌃W Workflows  ⎋ Exit';
      case 'detail':
        return '⏎ Execute  ⎋ Back';
      case 'parameters':
        return '⏎ Submit  ⎋ Back';
      case 'executing':
        return 'Executing...';
      case 'workflows':
        return '↑↓ Navigate  ⏎ Execute  ⎋ Back';
      default:
        return '⎋ Exit';
    }
  };

  return (
    <Box marginTop={1}>
      <Text dimColor>{getHelp()}</Text>
    </Box>
  );
};
