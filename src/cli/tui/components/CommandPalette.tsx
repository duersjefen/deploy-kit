/**
 * Command Palette Component
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Fuse from 'fuse.js';
import {
  commandRegistry,
  getAllCommandNames,
  getCommandsByCategory,
  type CommandMetadata,
} from '../../registry/command-registry.js';
import type { CommandHistoryEntry } from '../../registry/command-history.js';

interface CommandPaletteProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCommandSelect: (command: CommandMetadata) => void;
  suggestions: string[];
  recentCommands: CommandHistoryEntry[];
  favorites: string[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  searchQuery,
  onSearchChange,
  onCommandSelect,
  suggestions,
  recentCommands,
  favorites,
}) => {
  // Prepare command items for fuzzy search
  const allCommands = getAllCommandNames().map(name => commandRegistry[name]);

  // Fuzzy search setup
  const fuse = new Fuse(allCommands, {
    keys: ['name', 'description', 'keywords'],
    threshold: 0.3,
  });

  // Get filtered commands
  const getFilteredCommands = () => {
    if (!searchQuery.trim()) {
      // Show suggestions, recent, and favorites when no search
      const suggestionCommands = suggestions
        .map(name => commandRegistry[name])
        .filter(Boolean);

      const recentCommandNames = [...new Set(
        recentCommands.map(c => c.commandName)
      )].slice(0, 5);

      const recentCommandsMetadata = recentCommandNames
        .map(name => commandRegistry[name])
        .filter(Boolean);

      const favoriteCommands = favorites
        .map(name => commandRegistry[name])
        .filter(Boolean);

      // Combine and deduplicate
      const combined = [
        ...favoriteCommands,
        ...suggestionCommands,
        ...recentCommandsMetadata,
        ...allCommands,
      ];

      const seen = new Set<string>();
      return combined.filter(cmd => {
        if (seen.has(cmd.name)) return false;
        seen.add(cmd.name);
        return true;
      }).slice(0, 10);
    }

    // Fuzzy search
    const results = fuse.search(searchQuery);
    return results.map(r => r.item).slice(0, 10);
  };

  const filteredCommands = getFilteredCommands();

  // Prepare items for SelectInput
  const items = filteredCommands.map(cmd => ({
    label: `${cmd.icon}  ${cmd.name}`,
    value: cmd.name,
  }));

  // Handle selection
  const handleSelect = (item: { label: string; value: string }) => {
    const command = commandRegistry[item.value];
    if (command) {
      onCommandSelect(command);
    }
  };

  return (
    <Box flexDirection="column">
      {/* Search Input */}
      <Box>
        <Text color="cyan">Search: </Text>
        <TextInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Type to search commands..."
        />
      </Box>

      {/* Command List */}
      <Box marginTop={1} flexDirection="column">
        {items.length > 0 ? (
          <>
            <Text dimColor>
              {searchQuery ? `Found ${items.length} commands` : 'Suggested commands:'}
            </Text>
            <Box marginTop={1}>
              <SelectInput items={items} onSelect={handleSelect} />
            </Box>
          </>
        ) : (
          <Text color="yellow">No commands found for "{searchQuery}"</Text>
        )}
      </Box>

      {/* Recent Commands */}
      {!searchQuery && recentCommands.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Recent:</Text>
          <Box marginLeft={2} flexDirection="column">
            {recentCommands.slice(0, 3).map((cmd, idx) => (
              <Text key={idx} dimColor>
                {cmd.success ? '✅' : '❌'} {cmd.commandName} (
                {new Date(cmd.timestamp).toLocaleTimeString()})
              </Text>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};
